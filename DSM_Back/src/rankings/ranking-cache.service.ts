import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RankingPeriod, Tier } from '@prisma/client';
import { createClient } from '@redis/client';
import { randomUUID } from 'node:crypto';
import { startOfUtcDay, weeklyRange } from './rankings.policy';
import type {
  LeaderboardEntry,
  MyRanking,
  RankingProjectionEntry,
} from './rankings.types';

const CACHE_PREFIX = 'dsm:rankings:v1';
const ACTIVE_TTL_SECONDS = 3 * 60;
const GENERATION_TTL_SECONDS = 10 * 60;
const RETIRED_GENERATION_TTL_SECONDS = 30;
const REDIS_RETRY_COOLDOWN_MS = 5_000;
const WARNING_THROTTLE_MS = 60_000;
const WRITE_CHUNK_SIZE = 500;

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const ACTIVATE_GENERATION_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0
`;

type RankingRedisClient = ReturnType<typeof createClient>;

export type RankingRefreshLockResult = 'acquired' | 'held' | 'unavailable';

@Injectable()
export class RankingCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RankingCacheService.name);
  private readonly redisUrl: string | undefined;
  private readonly client: RankingRedisClient | undefined;
  private connectPromise: Promise<void> | undefined;
  private retryAfter = 0;
  private lastWarningAt = 0;
  private shuttingDown = false;

  constructor(configService: ConfigService) {
    this.redisUrl = configService.get<string>('REDIS_URL');
    if (!this.redisUrl) {
      return;
    }

    this.client = createClient({
      url: this.redisUrl,
      disableOfflineQueue: true,
      commandsQueueMaxLength: 1_000,
      socket: {
        connectTimeout: 2_000,
        reconnectStrategy: (retries) =>
          retries >= 3 ? false : Math.min(100 * 2 ** retries, 1_000),
      },
    });
    this.client.on('error', () => this.warnUnavailable());
    this.client.on('ready', () => {
      this.retryAfter = 0;
    });
  }

  async onModuleInit(): Promise<void> {
    await this.readyClient();
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    if (this.client?.isOpen) {
      this.client.destroy();
    }
  }

  isConfigured(): boolean {
    return this.redisUrl !== undefined;
  }

  projectionIdentity(period: RankingPeriod, reference: Date): string {
    switch (period) {
      case RankingPeriod.TOTAL:
        return RankingPeriod.TOTAL;
      case RankingPeriod.DAILY:
        return `${RankingPeriod.DAILY}:${this.dateKey(
          startOfUtcDay(reference),
        )}`;
      case RankingPeriod.WEEKLY:
        return `${RankingPeriod.WEEKLY}:${this.dateKey(
          weeklyRange(reference).gte,
        )}`;
    }
  }

  async readMyRanking(
    userId: string,
    period: RankingPeriod,
    reference: Date,
  ): Promise<MyRanking | null> {
    const client = await this.readyClient();
    if (!client) {
      return null;
    }

    try {
      const generation = await this.activeGeneration(client, period, reference);
      if (!generation) {
        return null;
      }

      const raw = await client.hGet(
        this.entriesKey(period, reference, generation),
        userId,
      );
      const entry = this.parseEntry(raw, period);
      if (!entry || entry.userId !== userId) {
        return null;
      }

      return {
        period: entry.period,
        score: entry.score,
        rank: entry.rank,
        percentile: entry.percentile,
        totalUsers: entry.totalUsers,
      };
    } catch {
      this.warnUnavailable();
      return null;
    }
  }

  async readLeaderboard(
    period: RankingPeriod,
    limit: number,
    reference: Date,
  ): Promise<LeaderboardEntry[] | null> {
    const client = await this.readyClient();
    if (!client) {
      return null;
    }

    try {
      const generation = await this.activeGeneration(client, period, reference);
      if (!generation) {
        return null;
      }

      const leaderboardKey = this.leaderboardKey(period, reference, generation);
      const userIds = await client.lRange(leaderboardKey, 0, limit - 1);
      if (userIds.length === 0) {
        return [];
      }

      const rawEntries = await client.hmGet(
        this.entriesKey(period, reference, generation),
        userIds,
      );
      const entries: LeaderboardEntry[] = [];
      for (let index = 0; index < userIds.length; index += 1) {
        const entry = this.parseEntry(rawEntries[index], period);
        if (!entry || entry.userId !== userIds[index]) {
          return null;
        }
        entries.push({
          rank: entry.rank,
          userId: entry.userId,
          nickname: entry.nickname,
          tier: entry.tier,
          profileImageUrl: entry.profileImageUrl,
          score: entry.score,
        });
      }
      return entries;
    } catch {
      this.warnUnavailable();
      return null;
    }
  }

  async publishProjection(
    period: RankingPeriod,
    entries: RankingProjectionEntry[],
    reference: Date,
    lockOwner: string,
  ): Promise<boolean> {
    const client = await this.readyClient();
    if (!client || !this.validProjection(entries, period)) {
      return false;
    }

    const generation = randomUUID();
    const entriesKey = this.entriesKey(period, reference, generation);
    const leaderboardKey = this.leaderboardKey(period, reference, generation);
    const markerKey = this.markerKey(period, reference, generation);
    const activeKey = this.activeKey(period, reference);

    try {
      for (
        let offset = 0;
        offset < entries.length;
        offset += WRITE_CHUNK_SIZE
      ) {
        const chunk = entries.slice(offset, offset + WRITE_CHUNK_SIZE);
        const hash = Object.fromEntries(
          chunk.map((entry) => [entry.userId, JSON.stringify(entry)]),
        );
        const write = client.multi();
        write.hSet(entriesKey, hash);
        write.rPush(
          leaderboardKey,
          chunk.map((entry) => entry.userId),
        );
        write.expire(entriesKey, GENERATION_TTL_SECONDS);
        write.expire(leaderboardKey, GENERATION_TTL_SECONDS);
        await write.exec();
      }

      await client.set(
        markerKey,
        JSON.stringify({ entryCount: entries.length }),
        { EX: GENERATION_TTL_SECONDS },
      );

      const previousGeneration = await client.get(activeKey);
      const activated = await client.eval(ACTIVATE_GENERATION_SCRIPT, {
        keys: [this.lockKey(period, reference), activeKey],
        arguments: [lockOwner, generation, ACTIVE_TTL_SECONDS.toString(10)],
      });
      if (activated === 1) {
        await this.retireGeneration(
          client,
          period,
          reference,
          previousGeneration,
        );
        return true;
      }

      await client.del([entriesKey, leaderboardKey, markerKey]);
      return false;
    } catch {
      this.warnUnavailable();
      try {
        await client.del([entriesKey, leaderboardKey, markerKey]);
      } catch {
        // Generation keys expire naturally if cleanup cannot reach Redis.
      }
      return false;
    }
  }

  async acquireRefreshLock(
    period: RankingPeriod,
    reference: Date,
    owner: string,
    ttlMs: number,
  ): Promise<RankingRefreshLockResult> {
    const client = await this.readyClient();
    if (!client) {
      return 'unavailable';
    }

    try {
      const result = await client.set(this.lockKey(period, reference), owner, {
        NX: true,
        PX: ttlMs,
      });
      return result === 'OK' ? 'acquired' : 'held';
    } catch {
      this.warnUnavailable();
      return 'unavailable';
    }
  }

  async isProjectionFresh(
    period: RankingPeriod,
    reference: Date,
    maxAgeMs: number,
  ): Promise<boolean> {
    const client = await this.readyClient();
    if (!client) {
      return false;
    }

    try {
      const generation = await this.activeGeneration(client, period, reference);
      if (!generation) {
        return false;
      }

      const remainingMs = await client.pTTL(this.activeKey(period, reference));
      return (
        remainingMs > 0 && remainingMs >= ACTIVE_TTL_SECONDS * 1_000 - maxAgeMs
      );
    } catch {
      this.warnUnavailable();
      return false;
    }
  }

  async releaseRefreshLock(
    period: RankingPeriod,
    reference: Date,
    owner: string,
  ): Promise<void> {
    const client = await this.readyClient();
    if (!client) {
      return;
    }

    try {
      await client.eval(RELEASE_LOCK_SCRIPT, {
        keys: [this.lockKey(period, reference)],
        arguments: [owner],
      });
    } catch {
      this.warnUnavailable();
    }
  }

  private async activeGeneration(
    client: RankingRedisClient,
    period: RankingPeriod,
    reference: Date,
  ): Promise<string | null> {
    const generation = await client.get(this.activeKey(period, reference));
    if (!generation) {
      return null;
    }

    const complete = await client.exists(
      this.markerKey(period, reference, generation),
    );
    return complete === 1 ? generation : null;
  }

  private async retireGeneration(
    client: RankingRedisClient,
    period: RankingPeriod,
    reference: Date,
    generation: string | null,
  ): Promise<void> {
    if (!generation) {
      return;
    }

    try {
      const retirement = client.multi();
      retirement.expire(
        this.entriesKey(period, reference, generation),
        RETIRED_GENERATION_TTL_SECONDS,
      );
      retirement.expire(
        this.leaderboardKey(period, reference, generation),
        RETIRED_GENERATION_TTL_SECONDS,
      );
      retirement.expire(
        this.markerKey(period, reference, generation),
        RETIRED_GENERATION_TTL_SECONDS,
      );
      await retirement.exec();
    } catch {
      this.warnUnavailable();
    }
  }

  private async readyClient(): Promise<RankingRedisClient | null> {
    if (!this.client || this.shuttingDown) {
      return null;
    }
    if (this.client.isReady) {
      return this.client;
    }
    if (this.client.isOpen || Date.now() < this.retryAfter) {
      return null;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.connect().finally(() => {
        this.connectPromise = undefined;
      });
    }
    await this.connectPromise;
    return this.client.isReady ? this.client : null;
  }

  private async connect(): Promise<void> {
    try {
      await this.client?.connect();
      this.retryAfter = 0;
    } catch {
      this.retryAfter = Date.now() + REDIS_RETRY_COOLDOWN_MS;
      if (this.client?.isOpen) {
        this.client.destroy();
      }
      this.warnUnavailable();
    }
  }

  private validProjection(
    entries: RankingProjectionEntry[],
    period: RankingPeriod,
  ): boolean {
    const userIds = new Set<string>();
    for (const entry of entries) {
      if (
        entry.period !== period ||
        userIds.has(entry.userId) ||
        !this.isProjectionEntry(entry, period)
      ) {
        return false;
      }
      userIds.add(entry.userId);
    }
    return true;
  }

  private parseEntry(
    raw: string | null | undefined,
    period: RankingPeriod,
  ): RankingProjectionEntry | null {
    if (!raw) {
      return null;
    }

    try {
      const value = JSON.parse(raw) as unknown;
      return this.isProjectionEntry(value, period) ? value : null;
    } catch {
      return null;
    }
  }

  private isProjectionEntry(
    value: unknown,
    period: RankingPeriod,
  ): value is RankingProjectionEntry {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const entry = value as Record<string, unknown>;
    return (
      entry.period === period &&
      typeof entry.userId === 'string' &&
      entry.userId.length > 0 &&
      typeof entry.nickname === 'string' &&
      Object.values(Tier).includes(entry.tier as Tier) &&
      (entry.profileImageUrl === null ||
        typeof entry.profileImageUrl === 'string') &&
      Number.isSafeInteger(entry.score) &&
      Number.isSafeInteger(entry.rank) &&
      (entry.rank as number) >= 1 &&
      typeof entry.percentile === 'number' &&
      Number.isFinite(entry.percentile) &&
      entry.percentile >= 0 &&
      entry.percentile <= 100 &&
      Number.isSafeInteger(entry.totalUsers) &&
      (entry.totalUsers as number) >= (entry.rank as number)
    );
  }

  private activeKey(period: RankingPeriod, reference: Date): string {
    return `${this.baseKey(period, reference)}:active`;
  }

  private entriesKey(
    period: RankingPeriod,
    reference: Date,
    generation: string,
  ): string {
    return `${this.baseKey(period, reference)}:generation:${generation}:entries`;
  }

  private leaderboardKey(
    period: RankingPeriod,
    reference: Date,
    generation: string,
  ): string {
    return `${this.baseKey(period, reference)}:generation:${generation}:leaderboard`;
  }

  private markerKey(
    period: RankingPeriod,
    reference: Date,
    generation: string,
  ): string {
    return `${this.baseKey(period, reference)}:generation:${generation}:complete`;
  }

  private lockKey(period: RankingPeriod, reference: Date): string {
    return `${this.baseKey(period, reference)}:refresh-lock`;
  }

  private baseKey(period: RankingPeriod, reference: Date): string {
    const identity = this.projectionIdentity(period, reference);
    return `${CACHE_PREFIX}:{${identity}}`;
  }

  private dateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private warnUnavailable(): void {
    if (
      this.shuttingDown ||
      Date.now() - this.lastWarningAt < WARNING_THROTTLE_MS
    ) {
      return;
    }
    this.lastWarningAt = Date.now();
    this.logger.warn(
      'Ranking Redis cache is unavailable; database fallback may be used',
    );
  }
}
