import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

export type RedisAdapterClients = {
  pubClient: RedisClientType;
  subClient: RedisClientType;
};

const REDIS_CONNECT_TIMEOUT_MS = 1500;
const REDIS_COMMAND_TIMEOUT_MS = REDIS_CONNECT_TIMEOUT_MS;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redisUrl: string | null;
  private cacheClient: RedisClientType | null = null;
  private cacheClientConnect: Promise<RedisClientType> | null = null;
  private adapterClients: RedisAdapterClients | null = null;
  private adapterClientsConnect: Promise<RedisAdapterClients | null> | null =
    null;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL')?.trim();
    this.redisUrl = redisUrl && redisUrl.length > 0 ? redisUrl : null;
  }

  isEnabled(): boolean {
    return this.redisUrl !== null;
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const client = await this.getCacheClient();
      const value = await this.runCacheCommand(client, 'read', key, () =>
        client.get(key),
      );
      if (value === null) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      this.logCacheError('read', key, error);
      return null;
    }
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      const client = await this.getCacheClient();
      await this.runCacheCommand(client, 'write', key, () =>
        client.set(key, JSON.stringify(value), {
          expiration: { type: 'EX', value: ttlSeconds },
        }),
      );
    } catch (error) {
      this.logCacheError('write', key, error);
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      const client = await this.getCacheClient();
      const iterator = client.scanIterator({
        MATCH: `${prefix}*`,
        COUNT: 100,
      });

      while (true) {
        const { value: keys, done } = await this.runCacheCommand(
          client,
          'scan',
          prefix,
          () => iterator.next(),
        );
        if (done) {
          break;
        }
        if (keys.length > 0) {
          await this.runCacheCommand(client, 'delete', prefix, () =>
            client.del(keys),
          );
        }
      }
    } catch (error) {
      this.logCacheError('delete', prefix, error);
    }
  }

  async createAdapterClients(): Promise<RedisAdapterClients | null> {
    if (!this.isEnabled()) {
      return null;
    }
    if (this.adapterClients) {
      return this.adapterClients;
    }
    if (this.adapterClientsConnect) {
      return this.adapterClientsConnect;
    }

    this.adapterClientsConnect = this.createAndConnectAdapterClients().finally(
      () => {
        this.adapterClientsConnect = null;
      },
    );

    return this.adapterClientsConnect;
  }

  private async createAndConnectAdapterClients(): Promise<RedisAdapterClients | null> {
    let pubClient: RedisClientType | null = null;
    let subClient: RedisClientType | null = null;

    try {
      pubClient = this.createRedisClient();
      pubClient.on('error', (error) =>
        this.logger.warn(
          `Redis adapter pub client error: ${this.errorMessage(error)}`,
        ),
      );

      subClient = pubClient.duplicate();
      subClient.on('error', (error) =>
        this.logger.warn(
          `Redis adapter sub client error: ${this.errorMessage(error)}`,
        ),
      );

      await this.connectWithTimeout(pubClient, 'Redis adapter pub client');
      await this.connectWithTimeout(subClient, 'Redis adapter sub client');

      this.adapterClients = { pubClient, subClient };
      return this.adapterClients;
    } catch (error) {
      this.logger.warn(
        `Redis adapter clients unavailable: ${this.errorMessage(error)}`,
      );
      this.destroyClient(pubClient);
      this.destroyClient(subClient);
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.closeClient(this.cacheClient, 'Redis cache client'),
      this.closeClient(
        this.adapterClients?.pubClient ?? null,
        'Redis adapter pub client',
      ),
      this.closeClient(
        this.adapterClients?.subClient ?? null,
        'Redis adapter sub client',
      ),
    ]);

    this.cacheClient = null;
    this.cacheClientConnect = null;
    this.adapterClients = null;
    this.adapterClientsConnect = null;
  }

  private async getCacheClient(): Promise<RedisClientType> {
    if (this.cacheClientConnect) {
      return this.cacheClientConnect;
    }

    const client = this.createRedisClient();
    client.on('error', (error) =>
      this.logger.warn(`Redis cache client error: ${this.errorMessage(error)}`),
    );

    this.cacheClient = client;
    this.cacheClientConnect = this.connectWithTimeout(
      client,
      'Redis cache client',
    ).then(() => client);

    try {
      return await this.cacheClientConnect;
    } catch (error) {
      this.destroyClient(client);
      this.cacheClient = null;
      this.cacheClientConnect = null;
      throw error;
    }
  }

  private createRedisClient(): RedisClientType {
    const options = {
      url: this.redisUrl ?? undefined,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        reconnectStrategy: false as const,
      },
    };

    return createClient(options);
  }

  private async connectWithTimeout(
    client: RedisClientType,
    label: string,
  ): Promise<void> {
    await this.withTimeout(
      client.connect(),
      `${label} connect`,
      REDIS_CONNECT_TIMEOUT_MS,
    );
  }

  private async runCacheCommand<T>(
    client: RedisClientType,
    action: string,
    key: string,
    command: () => Promise<T>,
  ): Promise<T> {
    try {
      return await this.withTimeout(
        command(),
        `Redis cache ${action} command for ${key}`,
        REDIS_COMMAND_TIMEOUT_MS,
      );
    } catch (error) {
      this.resetCacheClient(client);
      throw error;
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    label: string,
    timeoutMs: number,
  ): Promise<T> {
    let timeout: NodeJS.Timeout | null = null;

    try {
      await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
      return await promise;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private async closeClient(
    client: RedisClientType | null,
    label: string,
  ): Promise<void> {
    if (!client) {
      return;
    }

    try {
      await this.withTimeout(
        client.quit(),
        `${label} quit`,
        REDIS_CONNECT_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn(`${label} shutdown failed: ${this.errorMessage(error)}`);
      this.destroyClient(client);
    }
  }

  private resetCacheClient(client: RedisClientType): void {
    if (this.cacheClient === client) {
      this.cacheClient = null;
      this.cacheClientConnect = null;
    }

    this.destroyClient(client);
  }

  private destroyClient(client: RedisClientType | null): void {
    try {
      client?.destroy();
    } catch (error) {
      this.logger.warn(
        `Redis client cleanup failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private logCacheError(action: string, key: string, error: unknown): void {
    this.logger.warn(
      `Redis cache ${action} failed for ${key}: ${this.errorMessage(error)}`,
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
