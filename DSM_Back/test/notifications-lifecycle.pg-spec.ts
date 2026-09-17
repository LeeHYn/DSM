import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, TaskDifficulty } from '@prisma/client';
import type { MulticastMessage } from 'firebase-admin/messaging';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NotificationDispatcherService } from '../src/notifications/notification-dispatcher.service';
import { FirebaseMessagingProvider } from '../src/notifications/firebase-messaging.provider';

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

// Pause only the first two lock requests; every SQL statement still uses PG.
function registrationBarrier() {
  let arrivals = 0;
  let release!: () => void;
  let fail!: (error: Error) => void;
  const gate = new Promise<void>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  const timer = setTimeout(
    () => fail(new Error('Concurrent registration barrier timed out')),
    10_000,
  );
  void gate.catch(() => undefined);
  return {
    get arrivals() {
      return arrivals;
    },
    async arrive() {
      if (arrivals >= 2) return;
      arrivals++;
      if (arrivals === 2) {
        clearTimeout(timer);
        release();
      }
      await gate;
    },
    dispose() {
      clearTimeout(timer);
      release();
    },
  };
}

type DispatcherTestBridge = {
  materializeDueSchedules(now: Date): Promise<void>;
};

describePostgres('notification lifecycle PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let module: TestingModule;
  let service: NotificationsService;
  let dispatcher: NotificationDispatcherService;
  let barrier: ReturnType<typeof registrationBarrier> | undefined;
  let failAggregateId: string | undefined;
  const ownedUserIds = new Set<string>();
  const send = jest.fn((message: MulticastMessage) => {
    expect(message.data).toEqual({ type: 'REMINDER_SYNC', version: '1' });
    expect(message.notification).toBeUndefined();
    return Promise.resolve({
      successCount: message.tokens.length,
      failureCount: 0,
      responses: message.tokens.map(() => ({
        success: true,
        messageId: `synthetic-${randomUUID()}`,
      })),
    });
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl! });
    const observedPrisma = prisma.$extends({
      query: {
        async $allOperations({ operation, args, query }) {
          if (operation === '$queryRaw' && barrier) await barrier.arrive();
          return (await query(args)) as unknown;
        },
        notificationSchedule: {
          updateMany({ args, query }) {
            if (
              failAggregateId &&
              args.where?.id === failAggregateId &&
              (args.data.status === 'SENT' || args.data.status === 'FAILED')
            ) {
              failAggregateId = undefined;
              throw new Error('Synthetic aggregate persistence failure');
            }
            return query(args);
          },
        },
      },
    });
    module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        NotificationDispatcherService,
        { provide: PrismaService, useValue: observedPrisma },
        {
          provide: FirebaseMessagingProvider,
          useValue: { isEnabled: () => true, sendEachForMulticast: send },
        },
      ],
    }).compile();
    service = module.get(NotificationsService);
    dispatcher = module.get(NotificationDispatcherService);
    await prisma.$connect();
  });

  beforeEach(async () => {
    send.mockClear();
    // Dispatcher scans the queue globally. Refuse to run beside other fixtures.
    if ((await prisma.notificationSchedule.count()) !== 0) {
      throw new Error('Notification PG tests require an empty schedule queue');
    }
  });

  afterEach(async () => {
    barrier?.dispose();
    barrier = undefined;
    failAggregateId = undefined;
    jest.useRealTimers();
    if (prisma && ownedUserIds.size > 0) {
      await prisma.notificationDelivery.deleteMany({
        where: { schedule: { userId: { in: [...ownedUserIds] } } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [...ownedUserIds] } },
      });
      ownedUserIds.clear();
    }
  });

  afterAll(async () => {
    try {
      await module?.close();
    } finally {
      await prisma?.$disconnect();
    }
  });

  async function user() {
    const created = await prisma.user.create({
      data: { nickname: `all55-notify-${randomUUID()}` },
    });
    ownedUserIds.add(created.id);
    return created;
  }

  async function tokens(userId: string, count: number, generation?: Date) {
    const base = Date.now() - 60_000;
    const rows = Array.from({ length: count }, (_, index) => ({
      id: randomUUID(),
      userId,
      token: `all55-synthetic-${randomUUID()}`,
      platform: 'android',
      updatedAt: generation ?? new Date(base),
      lastSeenAt: new Date(base + index * 1000),
    }));
    await prisma.fcmToken.createMany({ data: rows });
    return rows;
  }

  async function schedule(userId: string) {
    const startAt = new Date(Date.now() - 1000);
    const task = await prisma.task.create({
      data: {
        userId,
        title: 'Synthetic reminder fixture',
        difficulty: TaskDifficulty.LOW,
        startAt,
        endAt: new Date(startAt.getTime() + 60_000),
      },
    });
    return prisma.notificationSchedule.create({
      data: { userId, taskId: task.id, scheduledAt: startAt },
    });
  }

  async function materialize() {
    await (
      dispatcher as unknown as DispatcherTestBridge
    ).materializeDueSchedules(new Date());
  }

  it('admits exactly one of two concurrent registrations at nine active tokens', async () => {
    const owner = await user();
    await tokens(owner.id, 9);
    const candidates = [randomUUID(), randomUUID()];
    barrier = registrationBarrier();
    const results = await Promise.allSettled(
      candidates.map((token) =>
        service.register(owner.id, { token, platform: 'android' }),
      ),
    );
    expect(barrier.arrivals).toBe(2);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failures = results.filter((result) => result.status === 'rejected');
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBeInstanceOf(ConflictException);
    expect(failures[0].reason).toMatchObject({ status: 409 });
    expect(
      await prisma.fcmToken.count({
        where: { userId: owner.id, revokedAt: null },
      }),
    ).toBe(10);
    expect(
      await prisma.fcmToken.count({ where: { token: { in: candidates } } }),
    ).toBe(1);
  }, 30_000);

  it('keeps a pending delivery valid through an active heartbeat at the cap', async () => {
    const owner = await user();
    const registered = await tokens(owner.id, 10);
    const reminder = await schedule(owner.id);
    await materialize();
    const token = registered[0];
    await service.register(owner.id, {
      token: token.token,
      platform: 'android',
      deviceId: 'updated-synthetic-device',
    });
    const heartbeat = await prisma.fcmToken.findUniqueOrThrow({
      where: { id: token.id },
    });
    expect(heartbeat.updatedAt).toEqual(token.updatedAt);
    expect(heartbeat.lastSeenAt.getTime()).toBeGreaterThan(
      token.lastSeenAt.getTime(),
    );
    expect(heartbeat.deviceId).toBe('updated-synthetic-device');
    await dispatcher.dispatchDueNotifications();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].tokens).toHaveLength(10);
    expect(
      await prisma.notificationDelivery.findUniqueOrThrow({
        where: {
          scheduleId_fcmTokenId: {
            scheduleId: reminder.id,
            fcmTokenId: token.id,
          },
        },
      }),
    ).toMatchObject({ status: 'SENT', tokenUpdatedAt: token.updatedAt });
  });

  it.each([0, 60_000])(
    'fences old deliveries after revoke/reactivation with generation %sms ahead',
    async (offset) => {
      const now = Date.now();
      jest.useFakeTimers({
        now,
        doNotFake: [
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'setImmediate',
          'clearImmediate',
          'nextTick',
          'hrtime',
          'performance',
          'queueMicrotask',
        ],
      });
      const owner = await user();
      const generation = new Date(now + offset);
      const [token] = await tokens(owner.id, 1, generation);
      const reminder = await schedule(owner.id);
      await materialize();
      await service.revoke(owner.id, { token: token.token });
      const revoked = await prisma.fcmToken.findUniqueOrThrow({
        where: { id: token.id },
      });
      expect(revoked.revokedAt).toEqual(new Date(now));
      expect(revoked.updatedAt).toEqual(generation);
      await service.register(owner.id, {
        token: token.token,
        platform: 'android',
      });
      const reactivated = await prisma.fcmToken.findUniqueOrThrow({
        where: { id: token.id },
      });
      expect(reactivated.updatedAt.getTime()).toBe(generation.getTime() + 1);
      expect(reactivated.revokedAt).toBeNull();
      await dispatcher.dispatchDueNotifications();
      expect(send).not.toHaveBeenCalled();
      expect(
        await prisma.notificationDelivery.findMany({
          where: { scheduleId: reminder.id },
        }),
      ).toEqual([expect.objectContaining({ status: 'CANCELLED' })]);
    },
  );

  it('rejects foreign registration and ignores foreign revoke without changing ownership', async () => {
    const owner = await user();
    const foreign = await user();
    const [token] = await tokens(owner.id, 1);
    await schedule(owner.id);
    await materialize();
    for (const revoked of [false, true]) {
      if (revoked) await service.revoke(owner.id, { token: token.token });
      const before = await prisma.fcmToken.findUniqueOrThrow({
        where: { id: token.id },
      });
      await expect(
        service.register(foreign.id, {
          token: token.token,
          platform: 'android',
        }),
      ).rejects.toMatchObject({ status: 409 });
      await service.revoke(foreign.id, { token: token.token });
      expect(
        await prisma.fcmToken.findUniqueOrThrow({ where: { id: token.id } }),
      ).toEqual(before);
    }
    expect(await prisma.fcmToken.count({ where: { userId: foreign.id } })).toBe(
      0,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('materializes only the ten most recently seen tokens of a legacy twenty-token account', async () => {
    const owner = await user();
    const registered = await tokens(owner.id, 20);
    const reminder = await schedule(owner.id);
    await materialize();
    await materialize();
    const deliveries = await prisma.notificationDelivery.findMany({
      where: { scheduleId: reminder.id },
    });
    expect(deliveries).toHaveLength(10);
    expect(deliveries.map((delivery) => delivery.fcmTokenId).sort()).toEqual(
      registered
        .slice(10)
        .map((token) => token.id)
        .sort(),
    );
    for (const delivery of deliveries) {
      expect(delivery.tokenUpdatedAt).toEqual(
        registered.find((token) => token.id === delivery.fcmTokenId)?.updatedAt,
      );
    }
    expect(
      await prisma.fcmToken.count({
        where: { userId: owner.id, revokedAt: null },
      }),
    ).toBe(20);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['SENT', 'CANCELLED'] as const)(
    'rediscovers a committed %s delivery after aggregation fails and the dispatcher restarts',
    async (terminalStatus) => {
      const owner = await user();
      const [token] = await tokens(owner.id, 1);
      const reminder = await schedule(owner.id);
      await materialize();
      if (terminalStatus === 'CANCELLED') {
        await service.revoke(owner.id, { token: token.token });
      }
      failAggregateId = reminder.id;
      await expect(dispatcher.dispatchDueNotifications()).rejects.toThrow(
        'Synthetic aggregate persistence failure',
      );
      expect(failAggregateId).toBeUndefined();
      const delivery = await prisma.notificationDelivery.findFirstOrThrow({
        where: { scheduleId: reminder.id },
      });
      expect(delivery.status).toBe(terminalStatus);
      expect(
        await prisma.notificationSchedule.findUniqueOrThrow({
          where: { id: reminder.id },
        }),
      ).toMatchObject({ status: 'PROCESSING' });
      const sendCount = send.mock.calls.length;
      // A fresh instance must discover the DB condition, not an in-memory list.
      const restarted = new NotificationDispatcherService(
        module.get<PrismaService>(PrismaService),
        module.get<FirebaseMessagingProvider>(FirebaseMessagingProvider),
      );
      await restarted.dispatchDueNotifications();
      const recovered = await prisma.notificationSchedule.findUniqueOrThrow({
        where: { id: reminder.id },
      });
      expect(recovered.status).toBe(
        terminalStatus === 'SENT' ? 'SENT' : 'FAILED',
      );
      expect(send).toHaveBeenCalledTimes(sendCount);
      expect(sendCount).toBe(terminalStatus === 'SENT' ? 1 : 0);
      expect(
        await prisma.notificationDelivery.findUniqueOrThrow({
          where: { id: delivery.id },
        }),
      ).toEqual(delivery);
    },
  );
});
