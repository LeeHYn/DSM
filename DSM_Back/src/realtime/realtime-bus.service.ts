import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@redis/client';
import { createRealtimeId, parseRealtimeBusEvent } from './realtime.policy';
import type {
  InvalidationTarget,
  RealtimeBusEvent,
  RealtimeScope,
  RevocationTarget,
} from './realtime.policy';

const CHANNEL = 'dsm:realtime:v1';
const DEADLINE_MS = 2000;
const RETRY_MS = 5000;
const MAX_PENDING = 32;
const MAX_LISTENERS = 8;
const DEDUP_CAP = 4096;
const DEDUP_TTL_MS = 60000;
type RedisClient = ReturnType<typeof createClient>;
type Connection = {
  publisher: RedisClient;
  subscriber: RedisClient;
  active: boolean;
  stopped: boolean;
  pending: number;
  cancel: Set<() => void>;
};

@Injectable()
export class RealtimeBusService implements OnModuleInit, OnModuleDestroy {
  private readonly url: string | undefined;
  private readonly listeners = new Set<(event: RealtimeBusEvent) => void>();
  private readonly resetListeners = new Set<() => void>();
  private readonly seen = new Map<string, number>();
  private connection: Connection | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private started = false;
  private disposed = false;

  constructor(config: ConfigService) {
    this.url = config.get<string>('REDIS_URL');
  }

  onModuleInit(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.startConnection();
  }

  onModuleDestroy(): void {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    if (this.connection) this.stopConnection(this.connection);
    this.listeners.clear();
    this.resetListeners.clear();
    this.seen.clear();
  }

  subscribe(callback: (event: RealtimeBusEvent) => void): () => void {
    return this.addListener(this.listeners, callback);
  }

  onReset(callback: () => void): () => void {
    return this.addListener(this.resetListeners, callback);
  }

  async publishInvalidation(
    target: InvalidationTarget,
    scopes: RealtimeScope[],
  ): Promise<void> {
    await this.publish({
      version: 1,
      eventId: createRealtimeId(),
      type: 'invalidate',
      target,
      scopes,
    });
  }

  async publishRevocation(target: RevocationTarget): Promise<void> {
    await this.publish({
      version: 1,
      eventId: createRealtimeId(),
      type: 'revoke',
      target,
    });
  }

  private async publish(input: RealtimeBusEvent): Promise<void> {
    if (this.disposed) return;
    const event = parseRealtimeBusEvent(input);
    if (!event) return;
    const serialized = JSON.stringify(event);
    this.deliver(event);
    const connection = this.connection;
    if (
      !connection?.active ||
      !connection.publisher.isReady ||
      connection.pending >= MAX_PENDING
    ) {
      return;
    }
    connection.pending++;
    try {
      await this.bounded(connection, () =>
        connection.publisher.publish(CHANNEL, serialized),
      );
    } finally {
      connection.pending--;
    }
  }

  private startConnection(): void {
    if (this.disposed || !this.url || this.connection) return;
    const clients: RedisClient[] = [];
    try {
      for (let index = 0; index < 2; index++) {
        clients.push(
          createClient({
            url: this.url,
            disableOfflineQueue: true,
            commandsQueueMaxLength: MAX_PENDING,
            socket: { connectTimeout: DEADLINE_MS, reconnectStrategy: false },
          }),
        );
      }
      const connection: Connection = {
        publisher: clients[0],
        subscriber: clients[1],
        active: false,
        stopped: false,
        pending: 0,
        cancel: new Set(),
      };
      this.connection = connection;
      for (const client of clients) {
        for (const event of ['error', 'end', 'reconnecting']) {
          client.on(event, () => this.stopConnection(connection));
        }
      }
      void this.connect(connection);
    } catch {
      for (const client of clients) this.destroy(client);
      this.scheduleRetry();
    }
  }

  private async connect(connection: Connection): Promise<void> {
    const connected = await Promise.all([
      this.bounded(connection, () => connection.publisher.connect()),
      this.bounded(connection, () => connection.subscriber.connect()),
    ]);
    if (connected.some((value) => !value) || connection.stopped) return;
    const subscribed = await this.bounded(connection, () =>
      connection.subscriber.subscribe(CHANNEL, (raw) => {
        if (!connection.active || connection.stopped || this.disposed) return;
        const event = parseRealtimeBusEvent(raw);
        if (event) this.deliver(event);
      }),
    );
    if (!subscribed || connection.stopped) return;
    if (!connection.publisher.isReady || !connection.subscriber.isReady) {
      this.stopConnection(connection);
      return;
    }
    connection.active = true;
    // Pub/Sub has no replay. Every restored subscription requests REST convergence.
    for (const listener of this.resetListeners) this.invoke(listener);
  }

  private bounded(
    connection: Connection,
    operation: () => Promise<unknown>,
  ): Promise<boolean> {
    if (connection.stopped || this.disposed) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        connection.cancel.delete(cancel);
        resolve(success);
      };
      const cancel = () => finish(false);
      const timer = setTimeout(
        () => this.stopConnection(connection),
        DEADLINE_MS,
      );
      timer.unref();
      connection.cancel.add(cancel);
      try {
        void operation().then(
          () => finish(!connection.stopped && !this.disposed),
          () => this.stopConnection(connection),
        );
      } catch {
        this.stopConnection(connection);
      }
    });
  }

  private stopConnection(connection: Connection): void {
    if (connection.stopped) return;
    connection.stopped = true;
    connection.active = false;
    if (this.connection === connection) this.connection = undefined;
    // A Promise deadline alone does not cancel Redis work. Destroy the owned
    // sockets first; node-redis flushes its queue with DisconnectsClientError.
    this.destroy(connection.publisher);
    this.destroy(connection.subscriber);
    for (const cancel of connection.cancel) cancel();
    connection.cancel.clear();
    this.scheduleRetry();
  }

  private destroy(client: RedisClient): void {
    try {
      if (client.isOpen) client.destroy();
    } catch {
      // No raw Redis errors or connection URLs leave this boundary.
    } finally {
      client.removeAllListeners();
    }
  }

  private scheduleRetry(): void {
    if (this.disposed || !this.url || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.startConnection();
    }, RETRY_MS);
    this.retryTimer.unref();
  }

  private deliver(event: RealtimeBusEvent): void {
    const now = Date.now();
    for (const [id, expiresAt] of this.seen) {
      if (expiresAt > now) break;
      this.seen.delete(id);
    }
    if (this.seen.has(event.eventId)) return;
    if (this.seen.size >= DEDUP_CAP) {
      const oldest = this.seen.keys().next();
      if (!oldest.done) this.seen.delete(oldest.value);
    }
    this.seen.set(event.eventId, now + DEDUP_TTL_MS);
    Object.freeze(event.target);
    if (event.type === 'invalidate') Object.freeze(event.scopes);
    Object.freeze(event);
    for (const listener of this.listeners) this.invoke(() => listener(event));
  }

  private addListener<T>(listeners: Set<T>, callback: T): () => void {
    if (this.disposed) return () => undefined;
    if (typeof callback !== 'function' || listeners.size >= MAX_LISTENERS) {
      throw new Error('Realtime listener limit');
    }
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }

  private invoke(callback: () => void): void {
    try {
      const result: unknown = callback();
      if (result instanceof Promise) void result.catch(() => undefined);
    } catch {
      // One internal subscriber cannot prevent other subscribers from converging.
    }
  }
}
