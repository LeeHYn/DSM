import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { SessionVerifierService } from '../auth/session-verifier.service';
import type { VerifiedAccessSession } from '../auth/session-verifier.service';
import { RealtimeBusService } from './realtime-bus.service';
import { RealtimeGateway } from './realtime.gateway';
import { createRealtimeId, parseServerEvent } from './realtime.policy';
import type { RealtimeBusEvent } from './realtime.policy';

class SocketPort extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  send = jest.fn((_message: string, callback: (error?: Error) => void) =>
    callback(),
  );
  close = jest.fn<void, [number?]>(() => {
    this.readyState = 2;
  });
  terminate = jest.fn(() => {
    this.readyState = 3;
    this.emit('close');
  });
  ping = jest.fn(() => {
    this.emit('pong');
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let server: EventEmitter;
  let signal: (event: RealtimeBusEvent) => void;
  let reset: () => void;
  let session: VerifiedAccessSession;
  const verifyAccess = jest.fn<Promise<VerifiedAccessSession>, [string]>();
  const isActive = jest.fn<Promise<boolean>, [string, string]>();
  const unsubscribe = jest.fn();
  const unreset = jest.fn();

  const auth = JSON.stringify({
    event: 'authenticate',
    data: { version: 1, accessToken: 'synthetic' },
  });
  function connect() {
    const socket = new SocketPort();
    gateway.handleConnection(socket);
    return socket;
  }
  async function authenticate(socket = connect()) {
    socket.emit('message', Buffer.from(auth), false);
    await jest.advanceTimersByTimeAsync(0);
    return socket;
  }
  function invalidate(userId?: string) {
    signal({
      version: 1,
      eventId: createRealtimeId(),
      type: 'invalidate',
      target: userId ? { kind: 'user', userId } : { kind: 'all' },
      scopes: ['scores'],
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-11T00:00:00Z'));
    jest.clearAllMocks();
    session = {
      sub: 'u1',
      sid: 's1',
      type: 'access',
      exp: Date.now() / 1000 + 900,
    };
    verifyAccess.mockResolvedValue(session);
    isActive.mockResolvedValue(true);
    gateway = new RealtimeGateway(
      { verifyAccess, isActive } as unknown as SessionVerifierService,
      {
        subscribe: (callback: typeof signal) => {
          signal = callback;
          return unsubscribe;
        },
        onReset: (callback: typeof reset) => {
          reset = callback;
          return unreset;
        },
      } as unknown as RealtimeBusService,
    );
    server = new EventEmitter();
    gateway.afterInit(server);
  });

  afterEach(() => {
    gateway.onModuleDestroy();
    jest.useRealTimers();
  });

  it('authenticates once and emits only a neutral reset', async () => {
    const socket = await authenticate();
    expect(verifyAccess).toHaveBeenCalledWith('synthetic');
    expect(parseServerEvent(socket.send.mock.calls[0][0])).toMatchObject({
      event: 'reset',
      data: { version: 1, seq: 0 },
    });
    expect(socket.send.mock.calls[0][0]).not.toContain('u1');
    socket.emit('message', Buffer.from(auth), false);
    expect(socket.close).toHaveBeenCalledWith(4001);
    expect(verifyAccess).toHaveBeenCalledTimes(1);
  });

  it.each([
    [Buffer.from(auth), true],
    [Buffer.from([0xc3, 0x28]), false],
    [Buffer.from('x'.repeat(4097)), false],
    [Buffer.from('{}'), false],
    [
      Buffer.from(auth.replace('"version":1', '"version":1,"extra":true')),
      false,
    ],
    [null, false],
  ])(
    'rejects invalid raw authentication frame %# before verification',
    (raw, binary) => {
      const socket = connect();
      socket.emit('message', raw, binary);
      expect(socket.close).toHaveBeenCalledWith(4001);
      expect(verifyAccess).not.toHaveBeenCalled();
    },
  );

  it('ignores preauth signals and expires the authentication deadline', async () => {
    const socket = connect();
    invalidate();
    reset();
    await jest.advanceTimersByTimeAsync(5000);
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledWith(4001);
    await jest.advanceTimersByTimeAsync(1000);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new UnauthorizedException('private'), 4001],
    [new ServiceUnavailableException('private'), 1013],
    [new Error('private'), 1013],
  ])('maps verification failure to safe close code %#', async (error, code) => {
    verifyAccess.mockRejectedValue(error);
    const socket = await authenticate();
    expect(socket.close).toHaveBeenCalledWith(code);
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('retains all 50 auth slots until underlying work settles after timeout', async () => {
    const pending = deferred<VerifiedAccessSession>();
    verifyAccess.mockReturnValue(pending.promise);
    const sockets = Array.from({ length: 50 }, () => connect());
    for (const socket of sockets)
      socket.emit('message', Buffer.from(auth), false);
    const rejected = connect();
    expect(rejected.terminate).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(6000);
    const stillRejected = connect();
    stillRejected.emit('message', Buffer.from(auth), false);
    expect(verifyAccess).toHaveBeenCalledTimes(50);
    pending.resolve(session);
    await jest.advanceTimersByTimeAsync(0);
    expect(sockets.every((socket) => socket.send.mock.calls.length === 0)).toBe(
      true,
    );
    verifyAccess.mockResolvedValue(session);
    const recovered = await authenticate();
    expect(recovered.send).toHaveBeenCalledTimes(1);
  });

  it('enforces session two and user four limits and releases disconnected slots', async () => {
    const first = await authenticate();
    await authenticate();
    const third = await authenticate();
    expect(third.close).toHaveBeenCalledWith(4008);
    verifyAccess.mockResolvedValue({ ...session, sid: 's2' });
    await authenticate();
    await authenticate();
    verifyAccess.mockResolvedValue({ ...session, sid: 's3' });
    const fifth = await authenticate();
    expect(fifth.close).toHaveBeenCalledWith(4008);
    first.emit('close');
    const accepted = await authenticate();
    expect(accepted.send).toHaveBeenCalledTimes(1);
  });

  it('rechecks auth capacity when previously admitted sockets send their first frame', async () => {
    const pending = deferred<VerifiedAccessSession>();
    verifyAccess.mockReturnValue(pending.promise);
    const old = Array.from({ length: 49 }, () => connect());
    for (const socket of old) socket.emit('message', Buffer.from(auth), false);
    for (const socket of old) socket.emit('close');
    const admitted = Array.from({ length: 49 }, () => connect());
    for (const socket of admitted)
      socket.emit('message', Buffer.from(auth), false);
    expect(verifyAccess).toHaveBeenCalledTimes(50);
    expect(admitted[1].close).toHaveBeenCalledWith(4008);
    pending.resolve(session);
    await jest.advanceTimersByTimeAsync(0);
  });

  it('closes precisely at token expiry and ignores late verification', async () => {
    verifyAccess.mockResolvedValue({ ...session, exp: Date.now() / 1000 + 2 });
    const socket = await authenticate();
    await jest.advanceTimersByTimeAsync(1999);
    expect(socket.close).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(socket.close).toHaveBeenCalledWith(4010);
    const pending = deferred<VerifiedAccessSession>();
    verifyAccess.mockReturnValue(pending.promise);
    const disconnected = connect();
    disconnected.emit('message', Buffer.from(auth), false);
    disconnected.emit('close');
    pending.resolve(session);
    await jest.advanceTimersByTimeAsync(0);
    expect(disconnected.send).not.toHaveBeenCalled();
  });

  it('coalesces scoped invalidations, checks membership and advances stream sequence', async () => {
    const own = await authenticate();
    verifyAccess.mockResolvedValue({ ...session, sub: 'u2', sid: 's2' });
    const other = await authenticate();
    invalidate('u1');
    invalidate('u1');
    await jest.advanceTimersByTimeAsync(1000);
    expect(own.send).toHaveBeenCalledTimes(2);
    expect(other.send).toHaveBeenCalledTimes(1);
    expect(isActive).toHaveBeenCalledWith('u1', 's1');
    expect(parseServerEvent(own.send.mock.calls[1][0])).toMatchObject({
      event: 'invalidate',
      data: { seq: 1, scopes: ['scores'] },
    });
    invalidate();
    await jest.advanceTimersByTimeAsync(1000);
    expect(own.send).toHaveBeenCalledTimes(3);
    expect(other.send).toHaveBeenCalledTimes(2);
  });

  it('resets stream after Redis recovery then flushes pending scopes next second', async () => {
    const socket = await authenticate();
    const initial = parseServerEvent(socket.send.mock.calls[0][0]);
    invalidate();
    reset();
    await jest.advanceTimersByTimeAsync(1000);
    const restored = parseServerEvent(socket.send.mock.calls[1][0]);
    expect(restored?.event).toBe('reset');
    expect(restored?.data.seq).toBe(0);
    expect(restored?.data.streamId).not.toBe(initial?.data.streamId);
    expect(socket.send).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1000);
    expect(parseServerEvent(socket.send.mock.calls[2][0])?.data.seq).toBe(1);
  });

  it('closes the known revoked target but retries an authentication with uncertain revocation ownership', async () => {
    const socket = await authenticate();
    const pending = deferred<VerifiedAccessSession>();
    verifyAccess.mockReturnValue(pending.promise);
    const authenticating = connect();
    authenticating.emit('message', Buffer.from(auth), false);
    signal({
      version: 1,
      eventId: createRealtimeId(),
      type: 'revoke',
      target: { kind: 'session', userId: 'u1', sessionId: 's1' },
    });
    expect(socket.close).toHaveBeenCalledWith(4003);
    pending.resolve({
      ...session,
      sub: 'unrelated-user',
      sid: 'unrelated-family',
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(authenticating.close).toHaveBeenCalledWith(1013);
    expect(authenticating.send).not.toHaveBeenCalled();
  });

  it('bounds checks at eight and retains slots after timeout until actual settlement', async () => {
    const sockets: SocketPort[] = [];
    for (let index = 0; index < 10; index++) {
      verifyAccess.mockResolvedValue({
        ...session,
        sub: `u${index}`,
        sid: `s${index}`,
      });
      sockets.push(await authenticate());
    }
    const pending = deferred<boolean>();
    isActive.mockReturnValue(pending.promise);
    invalidate();
    await jest.advanceTimersByTimeAsync(4000);
    expect(isActive).toHaveBeenCalledTimes(8);
    expect(
      sockets.filter((socket) => socket.close.mock.calls.length > 0),
    ).toHaveLength(8);
    pending.resolve(true);
    await jest.advanceTimersByTimeAsync(1000);
    expect(isActive).toHaveBeenCalledTimes(10);
  });

  it('periodically checks idle sessions and closes inactive families without publishing', async () => {
    const socket = await authenticate();
    isActive.mockResolvedValue(false);
    await jest.advanceTimersByTimeAsync(30000);
    expect(isActive).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledWith(4003);
    expect(socket.send).toHaveBeenCalledTimes(1);
  });

  it('closes slow consumers and send errors with bounded cleanup', async () => {
    const slow = await authenticate();
    slow.bufferedAmount = 65537;
    invalidate();
    await jest.advanceTimersByTimeAsync(1000);
    expect(slow.close).toHaveBeenCalledWith(4008);
    const broken = connect();
    broken.send.mockImplementation((_raw, callback) =>
      callback(new Error('private')),
    );
    await authenticate(broken);
    expect(broken.close).toHaveBeenCalledWith(1013);
    await jest.advanceTimersByTimeAsync(1000);
    expect(broken.terminate).toHaveBeenCalledTimes(1);
  });

  it('cleans sockets, shared interval, bus subscriptions and server listener on destruction', async () => {
    const socket = await authenticate();
    gateway.onModuleDestroy();
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    expect(socket.eventNames()).toEqual([]);
    expect(server.eventNames()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unreset).toHaveBeenCalledTimes(1);
    invalidate();
    reset();
    expect(socket.send).toHaveBeenCalledTimes(1);
  });

  it('caps all tracked connections at 1000 and checks all idle sessions each cycle', async () => {
    const sockets: SocketPort[] = [];
    for (let index = 0; index < 1000; index++) {
      verifyAccess.mockResolvedValue({
        ...session,
        sub: `user-${index}`,
        sid: `family-${index}`,
      });
      const socket = connect();
      socket.emit('message', Buffer.from(auth), false);
      await Promise.resolve();
      sockets.push(socket);
    }
    const excess = connect();
    expect(excess.close).toHaveBeenCalledWith(4008);
    expect(excess.terminate).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(30000);
    expect(isActive).toHaveBeenCalledTimes(1000);
    sockets[0].emit('close');
    expect(connect().terminate).not.toHaveBeenCalled();
  });

  it('closes a send whose callback never completes without queueing more frames', async () => {
    const socket = connect();
    socket.send.mockImplementation(() => undefined);
    await authenticate(socket);
    invalidate();
    await jest.advanceTimersByTimeAsync(2000);
    expect(socket.close).toHaveBeenCalledWith(1013);
    expect(socket.send).toHaveBeenCalledTimes(1);
  });

  it('does not emit after revocation wins an ongoing pre-publish check', async () => {
    const socket = await authenticate();
    const pending = deferred<boolean>();
    isActive.mockReturnValue(pending.promise);
    invalidate();
    await jest.advanceTimersByTimeAsync(1000);
    signal({
      version: 1,
      eventId: createRealtimeId(),
      type: 'revoke',
      target: { kind: 'user', userId: 'u1' },
    });
    pending.resolve(true);
    await jest.advanceTimersByTimeAsync(0);
    expect(socket.close).toHaveBeenCalledWith(4003);
    expect(socket.send).toHaveBeenCalledTimes(1);
  });

  it('reclaims half-open clients that stop responding to heartbeat', async () => {
    const socket = await authenticate();
    socket.ping.mockImplementation(() => undefined);
    await jest.advanceTimersByTimeAsync(30000);
    expect(socket.ping).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(30000);
    expect(socket.close).toHaveBeenCalledWith(1013);
    await jest.advanceTimersByTimeAsync(1000);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });
});
