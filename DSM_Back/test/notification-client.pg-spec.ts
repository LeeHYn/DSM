import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient, TaskStatus } from '@prisma/client';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';

function requireDisposableDatabaseUrl(): string {
  const raw = process.env.ALL55_DATABASE_URL;
  if (process.env.ALL55_DISPOSABLE_DB_TEST !== '1' || !raw) {
    throw new Error('ALL55 disposable database marker and URL are required');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('ALL55 disposable database URL is invalid');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '55348' ||
    !/^\/all55_[a-zA-Z0-9_]+$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'ALL55 requires 127.0.0.1:55348/all55_* without URL query or fragment',
    );
  }
  return raw;
}

const enabled = process.env.ALL55_DISPOSABLE_DB_TEST === '1';
const databaseUrl = enabled ? requireDisposableDatabaseUrl() : undefined;
const describePostgres = enabled ? describe : describe.skip;

describePostgres('notification client PostgreSQL integration (F015)', () => {
  const ownedUserIds = new Set<string>();
  let prisma: PrismaClient;
  let service: NotificationsService;
  let now: Date;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl! });
    service = new NotificationsService(prisma as PrismaService);
    await prisma.$connect();
  });

  beforeEach(() => {
    now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    jest.useFakeTimers({
      now,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (prisma && ownedUserIds.size > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: [...ownedUserIds] } },
      });
      ownedUserIds.clear();
    }
  });

  afterAll(async () => prisma?.$disconnect());

  async function user() {
    const suffix = randomUUID();
    const created = await prisma.user.create({
      data: {
        email: `all55-notification-${suffix}@example.invalid`,
        nickname: `all55-notification-${suffix}`,
      },
    });
    ownedUserIds.add(created.id);
    return created;
  }

  async function reminder(
    userId: string,
    overrides: {
      offset?: number;
      status?: TaskStatus;
      scheduleStatus?: string;
      enabled?: boolean;
      deleted?: boolean;
      title?: string;
      scheduleOffset?: number;
    } = {},
  ) {
    const startAt = new Date(now.getTime() + (overrides.offset ?? -60_000));
    return prisma.task.create({
      data: {
        userId,
        title: overrides.title ?? 'Synthetic reminder',
        startAt,
        endAt: new Date(startAt.getTime() + 3_600_000),
        difficulty: 'LOW',
        status: overrides.status ?? 'PENDING',
        notificationEnabled: overrides.enabled ?? true,
        deletedAt: overrides.deleted ? now : null,
        notificationSchedules: {
          create: {
            userId,
            status: overrides.scheduleStatus ?? 'PENDING',
            scheduledAt: new Date(
              startAt.getTime() + (overrides.scheduleOffset ?? 0),
            ),
          },
        },
      },
      include: { notificationSchedules: true },
    });
  }

  it('persists false settings for only the authenticated user and returns 404 for missing users', async () => {
    const owner = await user();
    const other = await user();
    expect(await service.getSettings(owner.id)).toEqual({
      notificationEnabled: true,
    });
    expect(await service.setSettings(owner.id, false)).toEqual({
      notificationEnabled: false,
    });
    expect(await service.getSettings(owner.id)).toEqual({
      notificationEnabled: false,
    });
    expect(await service.getSettings(other.id)).toEqual({
      notificationEnabled: true,
    });
    const missing = randomUUID();
    await expect(service.getSettings(missing)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.setSettings(missing, true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.reminders(missing)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('filters foreign, disabled, completed, cancelled, deleted and moved schedule rows', async () => {
    const owner = await user();
    const other = await user();
    const valid = await reminder(owner.id);
    await reminder(other.id);
    await reminder(owner.id, { enabled: false });
    await reminder(owner.id, { status: 'COMPLETED' });
    await reminder(owner.id, { status: 'CANCELLED' });
    await reminder(owner.id, { deleted: true });
    await reminder(owner.id, { scheduleStatus: 'CANCELLED' });
    await reminder(owner.id, { scheduleOffset: -1 });
    const inconsistent = await reminder(other.id);
    await prisma.notificationSchedule.update({
      where: { id: inconsistent.notificationSchedules[0].id },
      data: { userId: owner.id },
    });
    expect(
      (await service.reminders(owner.id)).reminders.map((row) => row.taskId),
    ).toEqual([valid.id]);
    await service.setSettings(owner.id, false);
    expect((await service.reminders(owner.id)).reminders).toEqual([]);
    await service.setSettings(owner.id, true);
    expect((await service.reminders(owner.id)).reminders).toHaveLength(1);
  });

  it('uses lower-exclusive expiry and upper-inclusive server time across UTC midnight', async () => {
    const owner = await user();
    const expired = await reminder(owner.id, { offset: -300_000 });
    const inside = await reminder(owner.id, { offset: -299_999 });
    const current = await reminder(owner.id, { offset: 0 });
    await reminder(owner.id, { offset: 1 });
    const result = await service.reminders(owner.id);
    expect(result.serverTime).toBe(now.toISOString());
    expect(result.reminders.map((row) => row.taskId)).toEqual([
      inside.id,
      current.id,
    ]);
    expect(result.reminders[0].expiresAt).toBe(
      new Date(now.getTime() + 1).toISOString(),
    );
    expect(result.reminders[1].expiresAt).toBe(
      new Date(now.getTime() + 300_000).toISOString(),
    );
    await expect(
      service.reminders(owner.id, {
        cursor: expired.notificationSchedules[0].id,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('includes every dispatcher state except CANCELLED, independent of device ACK', async () => {
    const owner = await user();
    const expected: string[] = [];
    for (const status of ['PENDING', 'PROCESSING', 'SENT', 'FAILED']) {
      const task = await reminder(owner.id, { scheduleStatus: status });
      expected.push(task.notificationSchedules[0].id);
    }
    await reminder(owner.id, { scheduleStatus: 'CANCELLED' });
    expect(
      (await service.reminders(owner.id)).reminders.map((row) => row.id),
    ).toEqual(expected.sort());
  });

  it('truncates legacy titles at 200 Unicode characters without exposing other task fields', async () => {
    const owner = await user();
    await reminder(owner.id, { title: '😀'.repeat(201) });
    const result = await service.reminders(owner.id);
    expect(result.reminders[0].title).toBe('😀'.repeat(200));
    expect(Object.keys(result.reminders[0]).sort()).toEqual([
      'expiresAt',
      'id',
      'startAt',
      'taskId',
      'title',
    ]);
  });

  it('projects legacy whitespace prefixes and blank titles to nonempty captions', async () => {
    const owner = await user();
    await reminder(owner.id, { title: ' '.repeat(200) + '할 일' });
    await reminder(owner.id, { title: '\t'.repeat(201) });
    const result = await service.reminders(owner.id);
    expect(result.reminders.map((item) => item.title).sort()).toEqual([
      '일정 알림',
      '할 일',
    ]);
  });

  it('excludes sub-millisecond remnants that are expired in JSON time precision', async () => {
    const owner = await user();
    const expired = await reminder(owner.id, { offset: -300_000 });
    await prisma.$executeRaw`
      UPDATE "Task" SET "startAt" = "startAt" + INTERVAL '123 microseconds'
      WHERE id = ${expired.id} AND "userId" = ${owner.id}
    `;
    await prisma.$executeRaw`
      UPDATE "NotificationSchedule" SET "scheduledAt" = "scheduledAt" + INTERVAL '123 microseconds'
      WHERE "taskId" = ${expired.id} AND "userId" = ${owner.id}
    `;
    const valid = await reminder(owner.id);
    const result = await service.reminders(owner.id);
    expect(result.reminders.map((item) => item.taskId)).toEqual([valid.id]);
    expect(
      result.reminders.every((item) => item.expiresAt > result.serverTime),
    ).toBe(true);
  });

  it('pages 205 legacy due rows without duplicate or lost microsecond timestamps', async () => {
    const owner = await user();
    const ids = Array.from({ length: 205 }, () => randomUUID()).sort();
    const startAt = new Date(now.getTime() - 60_000);
    await prisma.task.createMany({
      data: ids.map((id) => ({
        id,
        userId: owner.id,
        title: 'Legacy due row',
        startAt,
        endAt: now,
        difficulty: 'LOW',
      })),
    });
    await prisma.notificationSchedule.createMany({
      data: ids.map((id) => ({
        id,
        taskId: id,
        userId: owner.id,
        scheduledAt: startAt,
      })),
    });
    // These two parameterized writes affect fixture-owned IDs only. Every row
    // shares a sub-ms timestamp, including the two page cursors.
    await prisma.$executeRaw`
      UPDATE "Task" SET "startAt" = "startAt" + INTERVAL '123 microseconds'
      WHERE "userId" = ${owner.id}
    `;
    await prisma.$executeRaw`
      UPDATE "NotificationSchedule"
      SET "scheduledAt" = "scheduledAt" + INTERVAL '123 microseconds'
      WHERE "userId" = ${owner.id}
    `;
    const first = await service.reminders(owner.id);
    const second = await service.reminders(owner.id, {
      cursor: first.nextCursor!,
    });
    const third = await service.reminders(owner.id, {
      cursor: second.nextCursor!,
    });
    expect([
      first.reminders.length,
      second.reminders.length,
      third.reminders.length,
    ]).toEqual([100, 100, 5]);
    expect(
      [...first.reminders, ...second.reminders, ...third.reminders].map(
        (row) => row.id,
      ),
    ).toEqual(ids);
    expect(third.nextCursor).toBeNull();
    expect(
      (await service.reminders(owner.id, { cursor: ids[204] })).reminders,
    ).toEqual([]);
  }, 30_000);

  it('validates cursors against the same current owner and eligibility window', async () => {
    const owner = await user();
    const other = await user();
    const foreign = await reminder(other.id);
    const stale = await reminder(owner.id, { scheduleOffset: 1 });
    const cancelled = await reminder(owner.id, { scheduleStatus: 'CANCELLED' });
    for (const task of [foreign, stale, cancelled]) {
      await expect(
        service.reminders(owner.id, {
          cursor: task.notificationSchedules[0].id,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    const valid = await reminder(owner.id);
    await service.setSettings(owner.id, false);
    await expect(
      service.reminders(owner.id, {
        cursor: valid.notificationSchedules[0].id,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
