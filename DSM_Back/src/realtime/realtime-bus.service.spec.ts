import { ConfigService } from '@nestjs/config';
import { createClient } from '@redis/client';
import { EventEmitter } from 'node:events';
import { RealtimeBusService } from './realtime-bus.service';
import { createRealtimeId } from './realtime.policy';
import type { RealtimeBusEvent } from './realtime.policy';

jest.mock('@redis/client', () => ({ createClient: jest.fn() }));

class RedisPort extends EventEmitter {
  isOpen = false;
  isReady = false;
  receive?: (message: string) => void;
  connect = jest.fn(() => {
    this.isOpen = true;
    this.isReady = true;
    return Promise.resolve(this);
  });
  subscribe = jest.fn(
    (_channel: string, callback: (message: string) => void) => {
      this.receive = callback;
      return Promise.resolve();
    },
  );
  publish = jest.fn<Promise<number>, [string, string]>().mockResolvedValue(1);
  destroy = jest.fn(() => {
    this.isOpen = false;
    this.isReady = false;
  });
}

function remoteEvent(): RealtimeBusEvent {
  return {
    version: 1,
    eventId: createRealtimeId(),
    type: 'invalidate',
    target: { kind: 'user', userId: 'user-1' },
    scopes: ['scores'],
  };
}

describe('RealtimeBusService', () => {
  let service: RealtimeBusService;
  let publisher: RedisPort;
  let subscriber: RedisPort;
  let ports: RedisPort[];

  async function start(configured = true) {
    service = new RealtimeBusService({
      get: () => (configured ? 'redis://synthetic.invalid:6379' : undefined),
    } as unknown as ConfigService);
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    ports = [];
    jest.mocked(createClient).mockImplementation(() => {
      const port = new RedisPort();
      ports.push(port);
      return port as unknown as ReturnType<typeof createClient>;
    });
  });

  afterEach(() => {
    service?.onModuleDestroy();
    jest.useRealTimers();
  });

  it('delivers locally without Redis configuration and supports unsubscribe', async () => {
    await start(false);
    const events: RealtimeBusEvent[] = [];
    const unsubscribe = service.subscribe((event) => events.push(event));
    await service.publishInvalidation({ kind: 'all' }, ['rankings']);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'invalidate',
      scopes: ['rankings'],
    });
    unsubscribe();
    await service.publishRevocation({ kind: 'user', userId: 'user-1' });
    expect(events).toHaveLength(1);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('uses two bounded connections and deduplicates its Redis echo', async () => {
    await start();
    [publisher, subscriber] = ports;
    const listener = jest.fn<void, [RealtimeBusEvent]>();
    service.subscribe(listener);
    await service.publishRevocation({
      kind: 'session',
      userId: 'u',
      sessionId: 's',
    });
    expect(ports).toHaveLength(2);
    for (const call of jest.mocked(createClient).mock.calls) {
      expect(call[0]).toMatchObject({
        disableOfflineQueue: true,
        commandsQueueMaxLength: 32,
        socket: { connectTimeout: 2000, reconnectStrategy: false },
      });
    }
    const [channel, raw] = publisher.publish.mock.calls[0];
    expect(subscriber.subscribe.mock.calls[0][0]).toBe(channel);
    subscriber.receive?.(raw);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({
      type: 'revoke',
      target: { kind: 'session', userId: 'u', sessionId: 's' },
    });
  });

  it('accepts out-of-order unique signals, drops malformed input and bounds dedup TTL', async () => {
    await start();
    subscriber = ports[1];
    const listener = jest.fn();
    service.subscribe(listener);
    const first = remoteEvent();
    const second = remoteEvent();
    for (const event of [second, first, second])
      subscriber.receive?.(JSON.stringify(event));
    for (const raw of [
      '{',
      'null',
      JSON.stringify({ ...first, token: 'private' }),
    ])
      subscriber.receive?.(raw);
    expect(listener).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(60000);
    subscriber.receive?.(JSON.stringify(first));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('evicts oldest dedup entries at 4096 without dropping new signals', async () => {
    await start();
    subscriber = ports[1];
    const listener = jest.fn();
    service.subscribe(listener);
    const first = JSON.stringify(remoteEvent());
    subscriber.receive?.(first);
    for (let index = 0; index < 4096; index++)
      subscriber.receive?.(JSON.stringify(remoteEvent()));
    subscriber.receive?.(first);
    expect(listener).toHaveBeenCalledTimes(4098);
  });

  it('isolates throwing listeners and rejects listener growth past eight', async () => {
    await start(false);
    service.subscribe(() => {
      throw new Error('private listener error');
    });
    const listener = jest.fn();
    const remove = service.subscribe(listener);
    for (let index = 0; index < 6; index++) service.subscribe(() => undefined);
    expect(() => service.subscribe(() => undefined)).toThrow(
      'Realtime listener limit',
    );
    await expect(
      service.publishInvalidation({ kind: 'all' }, ['scores']),
    ).resolves.toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    remove();
    expect(() => service.subscribe(() => undefined)).not.toThrow();
    for (let index = 0; index < 8; index++) service.onReset(() => undefined);
    expect(() => service.onReset(() => undefined)).toThrow(
      'Realtime listener limit',
    );
  });

  it('degrades immediately on Redis error and emits reset after restored subscription', async () => {
    await start();
    [publisher, subscriber] = ports;
    const reset = jest.fn();
    service.onReset(() => {
      throw new Error('private reset error');
    });
    const unsubscribe = service.onReset(reset);
    const listener = jest.fn();
    service.subscribe(listener);
    const staleReceive = subscriber.receive;
    subscriber.emit('error', new Error('private Redis URL'));
    await service.publishInvalidation({ kind: 'all' }, ['rankings']);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(publisher.destroy).toHaveBeenCalledTimes(1);
    expect(subscriber.destroy).toHaveBeenCalledTimes(1);
    staleReceive?.(JSON.stringify(remoteEvent()));
    expect(listener).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(5000);
    expect(ports).toHaveLength(4);
    expect(reset).toHaveBeenCalledTimes(1);
    unsubscribe();
    ports[3].emit('end');
    await jest.advanceTimersByTimeAsync(5000);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('never blocks startup on hung connect and destroys clients at deadline', async () => {
    jest.mocked(createClient).mockImplementation(() => {
      const port = new RedisPort();
      port.connect.mockImplementation(() => {
        port.isOpen = true;
        return new Promise(() => undefined);
      });
      ports.push(port);
      return port as unknown as ReturnType<typeof createClient>;
    });
    await start();
    const listener = jest.fn();
    service.subscribe(listener);
    await service.publishInvalidation({ kind: 'all' }, ['scores']);
    expect(listener).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2000);
    expect(ports.every((port) => port.destroy.mock.calls.length === 1)).toBe(
      true,
    );
    service.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(30000);
    expect(ports).toHaveLength(2);
  });

  it('caps publishing at 32 pending commands but delivers all local signals', async () => {
    await start();
    [publisher, subscriber] = ports;
    publisher.publish.mockImplementation(() => new Promise(() => undefined));
    const listener = jest.fn();
    service.subscribe(listener);
    const operations = Array.from({ length: 40 }, () =>
      service.publishInvalidation({ kind: 'all' }, ['scores']),
    );
    expect(listener).toHaveBeenCalledTimes(40);
    expect(publisher.publish).toHaveBeenCalledTimes(32);
    await jest.advanceTimersByTimeAsync(2000);
    await Promise.all(operations);
    expect(publisher.destroy).toHaveBeenCalledTimes(1);
    expect(subscriber.destroy).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(5000);
    await service.publishInvalidation({ kind: 'all' }, ['scores']);
    expect(ports[2].publish).toHaveBeenCalledTimes(1);
  });

  it('settles pending work on disposal and removes all clients, listeners and timers', async () => {
    await start();
    publisher = ports[0];
    publisher.publish.mockImplementation(() => new Promise(() => undefined));
    const listener = jest.fn();
    service.subscribe(listener);
    const pending = service.publishInvalidation({ kind: 'all' }, ['scores']);
    service.onModuleDestroy();
    await pending;
    await service.publishRevocation({ kind: 'user', userId: 'u' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    for (const port of ports) expect(port.eventNames()).toEqual([]);
  });

  it('drops invalid runtime publications before either delivery path', async () => {
    await start();
    const listener = jest.fn();
    service.subscribe(listener);
    await service.publishInvalidation({ kind: 'user', userId: '' }, ['scores']);
    await service.publishInvalidation({ kind: 'all' }, []);
    await service.publishRevocation({
      kind: 'session',
      userId: 'u',
      sessionId: '',
    });
    expect(listener).not.toHaveBeenCalled();
    expect(ports[0].publish).not.toHaveBeenCalled();
  });

  it.each(['hang', 'reject'])(
    'keeps local delivery when subscription %s and later restores once',
    async (failure) => {
      const publisher = new RedisPort();
      const subscriber = new RedisPort();
      subscriber.subscribe.mockImplementation(() =>
        failure === 'hang'
          ? new Promise(() => undefined)
          : Promise.reject(new Error('private subscribe failure')),
      );
      jest
        .mocked(createClient)
        .mockReturnValueOnce(
          publisher as unknown as ReturnType<typeof createClient>,
        )
        .mockReturnValueOnce(
          subscriber as unknown as ReturnType<typeof createClient>,
        );
      await start();
      const listener = jest.fn();
      const reset = jest.fn();
      service.subscribe(listener);
      service.onReset(reset);
      await service.publishInvalidation({ kind: 'all' }, ['scores']);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(publisher.publish).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(failure === 'hang' ? 2000 : 0);
      expect(publisher.destroy).toHaveBeenCalledTimes(1);
      expect(subscriber.destroy).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(5000);
      expect(reset).toHaveBeenCalledTimes(1);
    },
  );

  it('handles connection rejection without duplicate retry timers or initialization', async () => {
    const failed = new RedisPort();
    failed.connect.mockRejectedValue(new Error('private connection failure'));
    jest
      .mocked(createClient)
      .mockReturnValueOnce(
        failed as unknown as ReturnType<typeof createClient>,
      );
    await start();
    expect(jest.getTimerCount()).toBe(1);
    service.onModuleInit();
    expect(createClient).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(5000);
    expect(createClient).toHaveBeenCalledTimes(4);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not restore a connection that resolves after disposal', async () => {
    const slow = new RedisPort();
    let resolveConnect!: (port: RedisPort) => void;
    slow.connect.mockImplementation(() => {
      slow.isOpen = true;
      return new Promise((resolve) => {
        resolveConnect = resolve;
      });
    });
    jest
      .mocked(createClient)
      .mockReturnValueOnce(slow as unknown as ReturnType<typeof createClient>);
    await start();
    const reset = jest.fn();
    service.onReset(reset);
    service.onModuleDestroy();
    resolveConnect(slow);
    await jest.advanceTimersByTimeAsync(10000);
    expect(slow.subscribe).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('absorbs publish rejection and listener mutation without changing another delivery', async () => {
    await start();
    ports[0].publish.mockRejectedValue(new Error('private publish failure'));
    service.subscribe((event) => {
      if (event.type === 'invalidate') event.scopes.push('rankings');
    });
    const invalidAsyncListener = (() =>
      Promise.reject(new Error('private async listener'))) as () => void;
    service.subscribe(invalidAsyncListener);
    const listener = jest.fn<void, [RealtimeBusEvent]>();
    service.subscribe(listener);
    await expect(
      service.publishInvalidation({ kind: 'all' }, ['scores']),
    ).resolves.toBeUndefined();
    expect(listener.mock.calls[0][0]).toMatchObject({ scopes: ['scores'] });
    expect(ports[0].destroy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
  });
});
