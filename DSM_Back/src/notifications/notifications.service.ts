import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type FcmToken } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import type { RevokeFcmTokenDto } from './dto/revoke-fcm-token.dto';

const MAX_SERIALIZABLE_TRANSACTION_RETRIES = 2;
export const MAX_ACTIVE_FCM_TOKENS = 10;
const MAX_REMINDER_PAGE_SIZE = 100;

export type NotificationSettings = { notificationEnabled: boolean };
export type ReminderQuery = { limit?: number; cursor?: string };
export type DueReminder = {
  id: string;
  taskId: string;
  title: string;
  startAt: string;
  expiresAt: string;
};
export type ReminderPage = {
  serverTime: string;
  reminders: DueReminder[];
  nextCursor: string | null;
};
type ReminderRow = {
  userExists: boolean;
  cursorValid: boolean;
  id: string | null;
  taskId: string | null;
  title: string | null;
  startAt: Date | null;
  expiresAt: Date | null;
};

export type RegisteredFcmToken = Pick<
  FcmToken,
  'id' | 'platform' | 'deviceId' | 'lastSeenAt' | 'revokedAt'
>;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string): Promise<NotificationSettings> {
    const settings = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationEnabled: true },
    });
    if (!settings) throw new NotFoundException('User not found');
    return settings;
  }

  async setSettings(
    userId: string,
    notificationEnabled: boolean,
  ): Promise<NotificationSettings> {
    if (typeof notificationEnabled !== 'boolean') {
      throw new BadRequestException('notificationEnabled must be a boolean');
    }
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { notificationEnabled },
        select: { notificationEnabled: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }

  async reminders(
    userId: string,
    query: ReminderQuery = {},
  ): Promise<ReminderPage> {
    const limit =
      query.limit === undefined ? MAX_REMINDER_PAGE_SIZE : query.limit;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_REMINDER_PAGE_SIZE
    ) {
      throw new BadRequestException('limit must be an integer from 1 to 100');
    }
    const now = new Date();
    // Owner, cursor and rows share one statement snapshot. The cursor tuple
    // stays inside PostgreSQL so timestamptz microseconds are never truncated.
    const rows = await this.prisma.$queryRaw<ReminderRow[]>`
      WITH inputs AS (
        SELECT ${userId}::text AS user_id,
          ${query.cursor ?? null}::text AS cursor_id,
          ${now}::timestamptz AS now_at
      ), owner AS (
        SELECT u.id, u."notificationEnabled"
        FROM "User" u JOIN inputs i ON u.id = i.user_id
      ), eligible AS NOT MATERIALIZED (
        SELECT n.id, n."taskId", LEFT(BTRIM(t.title), 200) AS title,
          n."scheduledAt" AS "startAt",
          n."scheduledAt" + INTERVAL '5 minutes' AS "expiresAt"
        FROM "NotificationSchedule" n
        JOIN owner o ON n."userId" = o.id
        JOIN "Task" t ON t.id = n."taskId" AND t."userId" = o.id
        CROSS JOIN inputs i
        WHERE o."notificationEnabled" = true
          AND t."notificationEnabled" = true
          AND t.status = 'PENDING'
          AND t."deletedAt" IS NULL
          AND n.status <> 'CANCELLED'
          AND n."scheduledAt" = t."startAt"
          AND n."scheduledAt" > i.now_at - INTERVAL '5 minutes'
          AND date_trunc('milliseconds', n."scheduledAt") > i.now_at - INTERVAL '5 minutes'
          AND n."scheduledAt" <= i.now_at
      ), cursor_row AS (
        SELECT id, "startAt" FROM eligible WHERE id =
          (SELECT cursor_id FROM inputs)
      ), page AS (
        SELECT e.* FROM eligible e CROSS JOIN inputs i
        WHERE i.cursor_id IS NULL OR EXISTS (
          SELECT 1 FROM cursor_row c
          WHERE (e."startAt", e.id) > (c."startAt", c.id)
        )
        ORDER BY e."startAt" ASC, e.id ASC LIMIT ${limit + 1}
      )
      SELECT EXISTS (SELECT 1 FROM owner) AS "userExists",
        (i.cursor_id IS NULL OR EXISTS (SELECT 1 FROM cursor_row))
          AS "cursorValid",
        p.id, p."taskId", p.title, p."startAt", p."expiresAt"
      FROM inputs i LEFT JOIN page p ON true
      ORDER BY p."startAt" ASC, p.id ASC
    `;
    if (!rows[0]?.userExists) throw new NotFoundException('User not found');
    if (!rows[0].cursorValid) {
      throw new NotFoundException('Reminder cursor not found');
    }
    const reminders = rows
      .filter((row) => row.id !== null)
      .slice(0, limit)
      .map(
        (row): DueReminder => ({
          id: row.id!,
          taskId: row.taskId!,
          title: row.title!.trim() || '일정 알림',
          startAt: row.startAt!.toISOString(),
          expiresAt: row.expiresAt!.toISOString(),
        }),
      );
    return {
      serverTime: now.toISOString(),
      reminders,
      nextCursor: rows.length > limit ? reminders[limit - 1].id : null,
    };
  }

  register(
    userId: string,
    dto: RegisterFcmTokenDto,
  ): Promise<RegisteredFcmToken> {
    const deviceId = dto.deviceId ?? null;

    return this.runSerializableTransaction(async (client) => {
      await this.lockUser(client, userId);
      const now = new Date();
      const existing = await client.fcmToken.findUnique({
        where: { token: dto.token },
        select: { userId: true, revokedAt: true, updatedAt: true },
      });

      if (existing && existing.userId !== userId) {
        throw new ConflictException(
          'FCM token is already registered to another user',
        );
      }

      const isActive = existing?.revokedAt === null;
      if (!isActive) {
        const activeCount = await client.fcmToken.count({
          where: { userId, revokedAt: null },
        });
        if (activeCount >= MAX_ACTIVE_FCM_TOKENS) {
          throw new ConflictException('Active FCM token limit reached');
        }
      }
      // updatedAt identifies the registration generation used by deliveries.
      const updatedAt = existing
        ? isActive
          ? existing.updatedAt
          : new Date(Math.max(now.getTime(), existing.updatedAt.getTime() + 1))
        : now;

      return client.fcmToken.upsert({
        where: { token: dto.token },
        create: {
          token: dto.token,
          userId,
          platform: dto.platform,
          deviceId,
          lastSeenAt: now,
          revokedAt: null,
          updatedAt,
        },
        update: {
          platform: dto.platform,
          deviceId,
          lastSeenAt: now,
          revokedAt: null,
          updatedAt,
        },
        select: {
          id: true,
          platform: true,
          deviceId: true,
          lastSeenAt: true,
          revokedAt: true,
        },
      });
    });
  }

  async revoke(userId: string, dto: RevokeFcmTokenDto): Promise<void> {
    await this.runSerializableTransaction(async (client) => {
      await this.lockUser(client, userId);
      const existing = await client.fcmToken.findUnique({
        where: { token: dto.token },
        select: { userId: true, revokedAt: true, updatedAt: true },
      });
      if (
        !existing ||
        existing.userId !== userId ||
        existing.revokedAt !== null
      ) {
        return;
      }
      await client.fcmToken.updateMany({
        where: { token: dto.token, userId, revokedAt: null },
        data: { revokedAt: new Date(), updatedAt: existing.updatedAt },
      });
    });
  }

  private async lockUser(
    client: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await client.$queryRaw`
      SELECT 1 FROM "User" WHERE id = ${userId} FOR UPDATE
    `;
  }

  /**
   * Runs DB-only mutations at Serializable isolation. A P2034 conflict reruns
   * the complete callback at most twice (three total attempts).
   */
  private async runSerializableTransaction<T>(
    operation: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let retry = 0; ; retry += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !this.isRetryableTransactionConflict(error) ||
          retry >= MAX_SERIALIZABLE_TRANSACTION_RETRIES
        ) {
          throw error;
        }
      }
    }
  }

  private isRetryableTransactionConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }
}
