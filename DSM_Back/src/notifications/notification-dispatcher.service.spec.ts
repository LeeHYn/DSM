import { TaskStatus } from '@prisma/client';
import type {
  BatchResponse,
  MulticastMessage,
  SendResponse,
} from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseMessagingProvider } from './firebase-messaging.provider';
import {
  NOTIFICATION_DELIVERY_STATUS,
  NOTIFICATION_SCHEDULE_STATUS,
} from './notification-schedule.constants';
import { NotificationDispatcherService } from './notification-dispatcher.service';

interface DelegateMock {
  findFirst: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
  findMany: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
  findUnique: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
  createMany: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
  updateMany: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
}

interface PrismaMock {
  $transaction: jest.Mock<
    Promise<unknown>,
    [(client: PrismaMock) => Promise<unknown>, Record<string, unknown>?]
  >;
  notificationDelivery: DelegateMock;
  notificationSchedule: DelegateMock;
  fcmToken: DelegateMock;
}

interface FirebaseMock {
  isEnabled: jest.Mock<boolean, []>;
  sendEachForMulticast: jest.Mock<
    Promise<BatchResponse>,
    [MulticastMessage, boolean?]
  >;
}

interface TestClaimedDelivery {
  id: string;
  scheduleId: string;
  fcmTokenId: string;
  tokenUpdatedAt: Date;
  attemptCount: number;
  claimId: string;
  fcmToken: {
    token: string;
    userId: string;
    updatedAt: Date;
    revokedAt: Date | null;
  };
  schedule: {
    id: string;
    taskId: string;
    userId: string;
    scheduledAt: Date;
    status: string;
    user: {
      notificationEnabled: boolean;
    };
    task: {
      userId: string;
      startAt: Date;
      status: TaskStatus;
      notificationEnabled: boolean;
      deletedAt: Date | null;
    };
  };
}

interface DispatcherInternals {
  recoverStaleDeliveryLeases(now: Date): Promise<void>;
  materializeDueSchedules(now: Date): Promise<void>;
  claimDueDeliveryBatch(now: Date): Promise<TestClaimedDelivery[]>;
  revalidateClaimedBatch(
    claimed: TestClaimedDelivery[],
    now: Date,
  ): Promise<TestClaimedDelivery[]>;
  persistSendResponse(
    delivery: TestClaimedDelivery,
    response: SendResponse,
    now: Date,
  ): Promise<void>;
  aggregateSchedules(scheduleIds: string[]): Promise<void>;
}

const now = new Date('2026-07-20T00:00:00.000Z');

const makeDelegate = (): DelegateMock => ({
  findFirst: jest.fn<Promise<unknown>, [Record<string, unknown>]>(),
  findMany: jest
    .fn<Promise<unknown>, [Record<string, unknown>]>()
    .mockResolvedValue([]),
  findUnique: jest.fn<Promise<unknown>, [Record<string, unknown>]>(),
  createMany: jest
    .fn<Promise<unknown>, [Record<string, unknown>]>()
    .mockResolvedValue({ count: 0 }),
  updateMany: jest
    .fn<Promise<unknown>, [Record<string, unknown>]>()
    .mockResolvedValue({ count: 0 }),
});

const makeClaimedDelivery = (
  overrides: Partial<TestClaimedDelivery> = {},
): TestClaimedDelivery => {
  const tokenUpdatedAt = new Date('2026-07-19T23:00:00.000Z');
  return {
    id: 'delivery-1',
    scheduleId: 'schedule-1',
    fcmTokenId: 'fcm-token-1',
    tokenUpdatedAt,
    attemptCount: 0,
    claimId: 'claim-1',
    fcmToken: {
      token: 'sensitive-device-token',
      userId: 'user-1',
      updatedAt: tokenUpdatedAt,
      revokedAt: null,
    },
    schedule: {
      id: 'schedule-1',
      taskId: 'task-1',
      userId: 'user-1',
      scheduledAt: new Date('2026-07-19T23:59:00.000Z'),
      status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
      user: { notificationEnabled: true },
      task: {
        userId: 'user-1',
        startAt: new Date('2026-07-19T23:59:00.000Z'),
        status: TaskStatus.PENDING,
        notificationEnabled: true,
        deletedAt: null,
      },
    },
    ...overrides,
  };
};

const makeFailure = (
  code: string,
  message = 'sensitive SDK detail',
  metadata: Record<string, unknown> = {},
) =>
  ({
    success: false,
    error: { code, message, ...metadata },
  }) as SendResponse;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const makeHarness = (enabled = true) => {
  const db: PrismaMock = {
    $transaction: jest.fn<
      Promise<unknown>,
      [(client: PrismaMock) => Promise<unknown>, Record<string, unknown>?]
    >(),
    notificationDelivery: makeDelegate(),
    notificationSchedule: makeDelegate(),
    fcmToken: makeDelegate(),
  };
  db.$transaction.mockImplementation(
    async (operation: (client: PrismaMock) => Promise<unknown>) =>
      operation(db),
  );

  const firebase: FirebaseMock = {
    isEnabled: jest.fn(() => enabled),
    sendEachForMulticast: jest.fn<
      Promise<BatchResponse>,
      [MulticastMessage, boolean?]
    >(),
  };
  const service = new NotificationDispatcherService(
    db as unknown as PrismaService,
    firebase as unknown as FirebaseMessagingProvider,
  );

  return {
    db,
    firebase,
    service,
    internals: service as unknown as DispatcherInternals,
  };
};

const isolateDispatchDbSteps = (
  internals: DispatcherInternals,
  claimed: TestClaimedDelivery[],
) => {
  jest.spyOn(internals, 'recoverStaleDeliveryLeases').mockResolvedValue();
  jest.spyOn(internals, 'materializeDueSchedules').mockResolvedValue();
  jest.spyOn(internals, 'claimDueDeliveryBatch').mockResolvedValue(claimed);
  jest.spyOn(internals, 'revalidateClaimedBatch').mockResolvedValue(claimed);
  const aggregateSchedules = jest
    .spyOn(internals, 'aggregateSchedules')
    .mockResolvedValue();
  return { aggregateSchedules };
};

describe('NotificationDispatcherService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('registers a stable non-overlapping Cron job', () => {
    const cronTarget = Object.getOwnPropertyDescriptor(
      NotificationDispatcherService.prototype,
      'dispatchDueNotifications',
    )?.value as object;
    const metadata = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      cronTarget,
    ) as Record<string, unknown>;

    expect(metadata.name).toBe('notification-dispatcher');
    expect(metadata.waitForCompletion).toBe(true);
  });

  it('no-ops before any database or Firebase work when dispatch is disabled', async () => {
    const { db, firebase, service } = makeHarness(false);

    await service.dispatchDueNotifications();

    expect(db.notificationDelivery.updateMany).not.toHaveBeenCalled();
    expect(db.notificationSchedule.findMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(firebase.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('terminalizes stale post-send leases as UNKNOWN and only retries pre-send leases', async () => {
    const { db, service } = makeHarness();

    await service.dispatchDueNotifications();

    const [postSendStale, preSendStale, orphanedPostSendPending] =
      db.notificationDelivery.updateMany.mock.calls.map(([input]) => input);
    expect(postSendStale).toEqual({
      where: {
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        processingStartedAt: {
          lt: expect.any(Date) as Date,
        },
        sendStartedAt: { not: null },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.UNKNOWN,
        failureReason: 'ambiguous-delivery-outcome',
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
    expect(preSendStale).toEqual({
      where: {
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        processingStartedAt: {
          lt: expect.any(Date) as Date,
        },
        sendStartedAt: null,
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.PENDING,
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
    expect(orphanedPostSendPending).toEqual({
      where: {
        status: NOTIFICATION_DELIVERY_STATUS.PENDING,
        sendStartedAt: { not: null },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.UNKNOWN,
        failureReason: 'ambiguous-delivery-outcome',
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
    expect(postSendStale.data).not.toHaveProperty('attemptCount');
    expect(
      db.notificationDelivery.updateMany.mock.calls.some(([input]) => {
        const where = input.where;
        const data = input.data;
        return (
          isRecord(where) &&
          where.sendStartedAt !== null &&
          isRecord(data) &&
          data.status === NOTIFICATION_DELIVERY_STATUS.PENDING
        );
      }),
    ).toBe(false);
    expect(firebaseSendCalls(service)).toBe(0);
  });

  it('single-winner claims a due schedule and materializes unique token snapshots', async () => {
    const { db, service } = makeHarness();
    const tokenOneUpdatedAt = new Date('2026-07-19T22:00:00.000Z');
    const tokenTwoUpdatedAt = new Date('2026-07-19T22:30:00.000Z');
    db.notificationSchedule.findMany.mockResolvedValue([{ id: 'schedule-1' }]);
    db.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });
    db.notificationSchedule.findUnique.mockResolvedValue({
      id: 'schedule-1',
      taskId: 'task-1',
      userId: 'user-1',
      scheduledAt: new Date('2026-07-19T23:59:00.000Z'),
      user: { notificationEnabled: true },
      task: {
        userId: 'user-1',
        startAt: new Date('2026-07-19T23:59:00.000Z'),
        status: TaskStatus.PENDING,
        notificationEnabled: true,
        deletedAt: null,
      },
    });
    db.fcmToken.findMany.mockResolvedValue([
      { id: 'token-1', updatedAt: tokenOneUpdatedAt },
      { id: 'token-1', updatedAt: tokenOneUpdatedAt },
      { id: 'token-2', updatedAt: tokenTwoUpdatedAt },
    ]);

    await service.dispatchDueNotifications();

    expect(db.notificationSchedule.updateMany.mock.calls[0][0]).toEqual({
      where: {
        id: 'schedule-1',
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        scheduledAt: { lte: expect.any(Date) as Date },
      },
      data: { status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING },
    });
    expect(db.notificationDelivery.createMany).toHaveBeenCalledWith({
      data: [
        {
          scheduleId: 'schedule-1',
          fcmTokenId: 'token-1',
          tokenUpdatedAt: tokenOneUpdatedAt,
          status: NOTIFICATION_DELIVERY_STATUS.PENDING,
        },
        {
          scheduleId: 'schedule-1',
          fcmTokenId: 'token-2',
          tokenUpdatedAt: tokenTwoUpdatedAt,
          status: NOTIFICATION_DELIVERY_STATUS.PENDING,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('does not materialize a schedule after losing the conditional claim', async () => {
    const { db, service } = makeHarness();
    db.notificationSchedule.findMany.mockResolvedValue([{ id: 'schedule-1' }]);
    db.notificationSchedule.updateMany.mockResolvedValue({ count: 0 });

    await service.dispatchDueNotifications();

    expect(db.notificationSchedule.findUnique).not.toHaveBeenCalled();
    expect(db.fcmToken.findMany).not.toHaveBeenCalled();
    expect(db.notificationDelivery.createMany).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'latest task state is invalid',
      userEnabled: true,
      taskStatus: TaskStatus.COMPLETED,
      tokens: [{ id: 'token-1', updatedAt: now }],
      expectedStatus: NOTIFICATION_SCHEDULE_STATUS.CANCELLED,
      expectedReason: null,
    },
    {
      name: 'the user has no active device',
      userEnabled: true,
      taskStatus: TaskStatus.PENDING,
      tokens: [],
      expectedStatus: NOTIFICATION_SCHEDULE_STATUS.FAILED,
      expectedReason: 'no-active-device',
    },
  ])(
    'safely terminalizes a due schedule when $name',
    async ({
      userEnabled,
      taskStatus,
      tokens,
      expectedStatus,
      expectedReason,
    }) => {
      const { db, service } = makeHarness();
      db.notificationSchedule.findMany.mockResolvedValue([
        { id: 'schedule-1' },
      ]);
      db.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });
      db.notificationSchedule.findUnique.mockResolvedValue({
        id: 'schedule-1',
        taskId: 'task-1',
        userId: 'user-1',
        scheduledAt: new Date('2026-07-19T23:59:00.000Z'),
        user: { notificationEnabled: userEnabled },
        task: {
          userId: 'user-1',
          startAt: new Date('2026-07-19T23:59:00.000Z'),
          status: taskStatus,
          notificationEnabled: true,
          deletedAt: null,
        },
      });
      db.fcmToken.findMany.mockResolvedValue(tokens);

      await service.dispatchDueNotifications();

      expect(db.notificationSchedule.updateMany).toHaveBeenLastCalledWith({
        where: {
          id: 'schedule-1',
          status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        },
        data: {
          status: expectedStatus,
          failureReason: expectedReason,
        },
      });
      expect(db.notificationDelivery.createMany).not.toHaveBeenCalled();
    },
  );

  it('cancels materialization when the schedule no longer matches latest task.startAt', async () => {
    const { db, service } = makeHarness();
    db.notificationSchedule.findMany.mockResolvedValue([{ id: 'schedule-1' }]);
    db.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });
    db.notificationSchedule.findUnique.mockResolvedValue({
      id: 'schedule-1',
      taskId: 'task-1',
      userId: 'user-1',
      scheduledAt: new Date('2026-07-19T23:59:00.000Z'),
      user: { notificationEnabled: true },
      task: {
        userId: 'user-1',
        startAt: new Date('2026-07-20T00:30:00.000Z'),
        status: TaskStatus.PENDING,
        notificationEnabled: true,
        deletedAt: null,
      },
    });

    await service.dispatchDueNotifications();

    expect(db.fcmToken.findMany).not.toHaveBeenCalled();
    expect(db.notificationSchedule.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: 'schedule-1',
        status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
      },
      data: {
        status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED,
        failureReason: null,
      },
    });
  });

  it('claims at most 500 deliveries from one schedule without incrementing attempts', async () => {
    const { db, internals } = makeHarness();
    const candidates = Array.from({ length: 501 }, (_, index) =>
      makeClaimedDelivery({
        id: `delivery-${index}`,
        fcmTokenId: `token-${index}`,
      }),
    );
    db.notificationDelivery.findFirst.mockResolvedValue({
      scheduleId: 'schedule-1',
    });
    db.notificationDelivery.findMany.mockResolvedValue(candidates);
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });

    const claimed = await internals.claimDueDeliveryBatch(now);

    expect(claimed).toHaveLength(500);
    const findManyInput = db.notificationDelivery.findMany.mock.calls[0][0];
    expect(findManyInput.take).toBe(500);
    expect(findManyInput.where).toEqual(
      expect.objectContaining({
        scheduleId: 'schedule-1',
        attemptCount: { lt: 3 },
      }),
    );
    expect(db.notificationDelivery.updateMany).toHaveBeenCalledTimes(500);
    for (const [input] of db.notificationDelivery.updateMany.mock.calls) {
      expect(input.data).toEqual({
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: expect.any(String) as string,
        processingStartedAt: now,
      });
      expect(input.data).not.toHaveProperty('attemptCount');
      expect(input.where).toEqual(
        expect.objectContaining({
          status: NOTIFICATION_DELIVERY_STATUS.PENDING,
          attemptCount: { lt: 3 },
          schedule: expect.any(Object) as object,
          fcmToken: expect.any(Object) as object,
        }),
      );
    }
  });

  it('does not claim or send an exhausted PENDING delivery', async () => {
    const { db, firebase, internals } = makeHarness();
    const exhausted = makeClaimedDelivery({ attemptCount: 3 });
    db.notificationDelivery.findFirst.mockResolvedValue({
      scheduleId: exhausted.scheduleId,
    });
    db.notificationDelivery.findMany.mockResolvedValue([exhausted]);
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });

    await expect(internals.claimDueDeliveryBatch(now)).resolves.toEqual([]);

    expect(db.notificationDelivery.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ attemptCount: { lt: 3 } }),
    );
    expect(db.notificationDelivery.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ attemptCount: { lt: 3 } }),
    );
    expect(db.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: exhausted.id,
        status: NOTIFICATION_DELIVERY_STATUS.PENDING,
        attemptCount: { gte: 3 },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.FAILED,
        failureReason: 'messaging/max-attempts-exceeded',
        claimId: null,
        processingStartedAt: null,
        sendStartedAt: null,
        nextAttemptAt: null,
      },
    });
    expect(firebase.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('cancels a token snapshot mismatch before it can be claimed', async () => {
    const { db, internals } = makeHarness();
    const candidate = makeClaimedDelivery({
      fcmToken: {
        token: 'sensitive-device-token',
        userId: 'user-1',
        updatedAt: new Date('2026-07-19T23:30:00.000Z'),
        revokedAt: null,
      },
    });
    db.notificationDelivery.findFirst.mockResolvedValue({
      scheduleId: 'schedule-1',
    });
    db.notificationDelivery.findMany.mockResolvedValue([candidate]);
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });

    await expect(internals.claimDueDeliveryBatch(now)).resolves.toEqual([]);
    expect(db.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: candidate.id,
        status: NOTIFICATION_DELIVERY_STATUS.PENDING,
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.CANCELLED,
        claimId: null,
        processingStartedAt: null,
        sendStartedAt: null,
        nextAttemptAt: null,
      },
    });
  });

  it('revalidates latest state and conditionally cancels a lost claim before send', async () => {
    const { db, internals } = makeHarness();
    const delivery = makeClaimedDelivery();
    db.notificationDelivery.findMany.mockResolvedValue([]);
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      internals.revalidateClaimedBatch([delivery], now),
    ).resolves.toEqual([]);
    const revalidationWhere = db.notificationDelivery.findMany.mock.calls[0][0]
      .where as {
      attemptCount: { lt: number };
      schedule: {
        is: {
          scheduledAt: { equals: Date; lte: Date };
          task: { is: { startAt: Date } };
        };
      };
    };
    expect(revalidationWhere.attemptCount).toEqual({ lt: 3 });
    expect(revalidationWhere.schedule.is.scheduledAt).toEqual({
      equals: delivery.schedule.scheduledAt,
      lte: now,
    });
    expect(revalidationWhere.schedule.is.task.is.startAt).toEqual(
      delivery.schedule.scheduledAt,
    );
    expect(db.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [delivery.id] },
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: delivery.claimId,
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.CANCELLED,
        claimId: null,
        processingStartedAt: null,
        sendStartedAt: null,
        nextAttemptAt: null,
      },
    });
  });

  it('does not call Firebase when the all-or-none send-start marker count mismatches', async () => {
    const { db, firebase, service, internals } = makeHarness();
    const deliveries = [
      makeClaimedDelivery({ id: 'delivery-1' }),
      makeClaimedDelivery({ id: 'delivery-2' }),
    ];
    const { aggregateSchedules } = isolateDispatchDbSteps(
      internals,
      deliveries,
    );
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });

    await service.dispatchDueNotifications();

    expect(db.notificationDelivery.updateMany).toHaveBeenCalledTimes(1);
    expect(db.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['delivery-1', 'delivery-2'] },
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: 'claim-1',
        sendStartedAt: null,
      },
      data: { sendStartedAt: expect.any(Date) as Date },
    });
    expect(firebase.sendEachForMulticast).not.toHaveBeenCalled();
    expect(aggregateSchedules).not.toHaveBeenCalled();
  });

  it('terminalizes an SDK throw after the send marker as UNKNOWN and aggregates', async () => {
    const { db, firebase, service, internals } = makeHarness();
    const delivery = makeClaimedDelivery();
    const { aggregateSchedules } = isolateDispatchDbSteps(internals, [
      delivery,
    ]);
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });
    firebase.sendEachForMulticast.mockRejectedValue(
      new Error('unknown SDK outcome'),
    );

    await service.dispatchDueNotifications();

    expect(db.notificationDelivery.updateMany).toHaveBeenCalledTimes(2);
    expect(db.notificationDelivery.updateMany.mock.calls[0][0]).toEqual({
      where: {
        id: { in: [delivery.id] },
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: delivery.claimId,
        sendStartedAt: null,
      },
      data: { sendStartedAt: expect.any(Date) as Date },
    });
    expect(db.notificationDelivery.updateMany.mock.calls[1][0]).toEqual({
      where: {
        id: { in: [delivery.id] },
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: delivery.claimId,
        sendStartedAt: { not: null },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.UNKNOWN,
        failureReason: 'ambiguous-delivery-outcome',
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
    expect(
      db.notificationDelivery.updateMany.mock.calls[1][0].data,
    ).not.toHaveProperty('attemptCount');
    expect(firebase.sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(aggregateSchedules).toHaveBeenCalledWith([delivery.scheduleId]);
  });

  it('persists each response immediately so later work cannot erase earlier results', async () => {
    const { db, firebase, service, internals } = makeHarness();
    const deliveries = [
      makeClaimedDelivery({ id: 'delivery-1' }),
      makeClaimedDelivery({ id: 'delivery-2' }),
    ];
    isolateDispatchDbSteps(internals, deliveries);
    firebase.sendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });
    db.notificationDelivery.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('later persistence failed'))
      .mockResolvedValueOnce({ count: 1 });

    await expect(service.dispatchDueNotifications()).rejects.toThrow(
      'later persistence failed',
    );
    expect(db.notificationDelivery.updateMany).toHaveBeenCalledTimes(4);
    expect(db.notificationDelivery.updateMany.mock.calls[1][0]).toEqual({
      where: {
        id: 'delivery-1',
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: 'claim-1',
        sendStartedAt: { not: null },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.SENT,
        sentAt: expect.any(Date) as Date,
        failureReason: null,
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
    expect(db.notificationDelivery.updateMany.mock.calls[3][0]).toEqual({
      where: {
        id: { in: ['delivery-2'] },
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: 'claim-1',
        sendStartedAt: { not: null },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.UNKNOWN,
        failureReason: 'ambiguous-delivery-outcome',
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
  });

  it('terminalizes deliveries missing SDK response rows as UNKNOWN', async () => {
    const { db, firebase, service, internals } = makeHarness();
    const deliveries = [
      makeClaimedDelivery({ id: 'delivery-1' }),
      makeClaimedDelivery({ id: 'delivery-2' }),
    ];
    const { aggregateSchedules } = isolateDispatchDbSteps(
      internals,
      deliveries,
    );
    firebase.sendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 0,
      responses: [],
    });
    db.notificationDelivery.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValue({ count: 2 });

    await service.dispatchDueNotifications();

    expect(db.notificationDelivery.updateMany).toHaveBeenCalledTimes(2);
    expect(db.notificationDelivery.updateMany.mock.calls[1][0]).toEqual({
      where: {
        id: { in: ['delivery-1', 'delivery-2'] },
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: 'claim-1',
        sendStartedAt: { not: null },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.UNKNOWN,
        failureReason: 'ambiguous-delivery-outcome',
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
    expect(aggregateSchedules).toHaveBeenCalledWith(['schedule-1']);
  });

  it('soft-revokes an invalid token only after a conditional failure write', async () => {
    const { db, internals } = makeHarness();
    const delivery = makeClaimedDelivery();
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });
    db.fcmToken.updateMany.mockResolvedValue({ count: 1 });

    await internals.persistSendResponse(
      delivery,
      makeFailure('messaging/registration-token-not-registered'),
      now,
    );

    expect(db.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: delivery.id,
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: delivery.claimId,
        sendStartedAt: { not: null },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.FAILED,
        attemptCount: { increment: 1 },
        nextAttemptAt: null,
        failureReason: 'messaging/registration-token-not-registered',
        claimId: null,
        processingStartedAt: null,
      },
    });
    expect(db.fcmToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: delivery.fcmTokenId,
        userId: delivery.schedule.userId,
        revokedAt: null,
        updatedAt: delivery.tokenUpdatedAt,
      },
      data: { revokedAt: now },
    });
  });

  it('retries transient failures with backoff and fails on the max attempt', async () => {
    const { db, internals } = makeHarness();
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });

    await internals.persistSendResponse(
      makeClaimedDelivery({ id: 'retry-delivery', attemptCount: 0 }),
      makeFailure('messaging/server-unavailable'),
      now,
    );
    await internals.persistSendResponse(
      makeClaimedDelivery({ id: 'max-delivery', attemptCount: 2 }),
      makeFailure('messaging/server-unavailable'),
      now,
    );

    expect(db.notificationDelivery.updateMany.mock.calls[0][0].data).toEqual({
      status: NOTIFICATION_DELIVERY_STATUS.PENDING,
      attemptCount: { increment: 1 },
      nextAttemptAt: new Date('2026-07-20T00:01:00.000Z'),
      failureReason: 'messaging/server-unavailable',
      claimId: null,
      processingStartedAt: null,
      sendStartedAt: null,
    });
    expect(db.notificationDelivery.updateMany.mock.calls[1][0].data).toEqual({
      status: NOTIFICATION_DELIVERY_STATUS.FAILED,
      attemptCount: { increment: 1 },
      nextAttemptAt: null,
      failureReason: 'messaging/server-unavailable',
      claimId: null,
      processingStartedAt: null,
    });
  });

  it.each([
    {
      name: 'an unallowlisted provider code',
      response: makeFailure('private/provider-secret', 'sensitive detail'),
    },
    {
      name: 'a failure without an explicit provider code',
      response: {
        success: false,
        error: new Error('sensitive detail'),
      } as SendResponse,
    },
  ])('terminalizes $name instead of retrying it', async ({ response }) => {
    const { db, internals } = makeHarness();
    const delivery = makeClaimedDelivery();
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });

    await internals.persistSendResponse(delivery, response, now);

    expect(db.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: delivery.id,
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: delivery.claimId,
        sendStartedAt: { not: null },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.FAILED,
        attemptCount: { increment: 1 },
        nextAttemptAt: null,
        failureReason: 'messaging/unknown-error',
        claimId: null,
        processingStartedAt: null,
      },
    });
    expect(
      db.notificationDelivery.updateMany.mock.calls[0][0].data,
    ).not.toHaveProperty('sendStartedAt');
  });

  it.each([
    {
      name: 'numeric Retry-After seconds',
      metadata: { retryAfter: 120 },
      expectedAt: new Date('2026-07-20T00:02:00.000Z'),
    },
    {
      name: 'numeric Retry-After seconds beyond the fallback cap',
      metadata: { retryAfter: 7200 },
      expectedAt: new Date('2026-07-20T02:00:00.000Z'),
    },
    {
      name: 'Retry-After date',
      metadata: { retryAfter: new Date('2026-07-20T00:03:00.000Z') },
      expectedAt: new Date('2026-07-20T00:03:00.000Z'),
    },
    {
      name: 'Retry-After date beyond the fallback cap',
      metadata: { retryAfter: new Date('2026-07-20T02:00:00.000Z') },
      expectedAt: new Date('2026-07-20T02:00:00.000Z'),
    },
    {
      name: 'Retry-After response header',
      metadata: { response: { headers: { 'retry-after': '240' } } },
      expectedAt: new Date('2026-07-20T00:04:00.000Z'),
    },
  ])(
    'prefers $name without persisting raw retry metadata',
    async ({ metadata, expectedAt }) => {
      const { db, internals } = makeHarness();
      db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });

      await internals.persistSendResponse(
        makeClaimedDelivery(),
        makeFailure(
          'messaging/server-unavailable',
          'sensitive SDK detail',
          metadata,
        ),
        now,
      );

      const data = db.notificationDelivery.updateMany.mock.calls[0][0]
        .data as Record<string, unknown>;
      expect(data.nextAttemptAt).toEqual(expectedAt);
      expect(data.failureReason).toBe('messaging/server-unavailable');
      expect(JSON.stringify(data)).not.toContain('retry-after');
      expect(JSON.stringify(data)).not.toContain('sensitive SDK detail');
    },
  );

  it.each([
    { retryAfter: 'not-a-date' },
    { retryAfter: new Date('2026-07-19T23:59:59.000Z') },
    { response: { headers: { 'retry-after': '-1' } } },
  ])(
    'falls back safely when Retry-After is invalid or past',
    async (metadata) => {
      const { db, internals } = makeHarness();
      db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });

      await internals.persistSendResponse(
        makeClaimedDelivery(),
        makeFailure(
          'messaging/server-unavailable',
          'sensitive SDK detail',
          metadata,
        ),
        now,
      );

      expect(db.notificationDelivery.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          nextAttemptAt: new Date('2026-07-20T00:01:00.000Z'),
          failureReason: 'messaging/server-unavailable',
        }),
      );
    },
  );

  it('terminalizes a known permanent failure after exactly one counted response', async () => {
    const { db, internals } = makeHarness();
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });

    await internals.persistSendResponse(
      makeClaimedDelivery(),
      makeFailure('messaging/sender-id-mismatch'),
      now,
    );

    expect(db.notificationDelivery.updateMany.mock.calls[0][0].data).toEqual({
      status: NOTIFICATION_DELIVERY_STATUS.FAILED,
      attemptCount: { increment: 1 },
      nextAttemptAt: null,
      failureReason: 'messaging/sender-id-mismatch',
      claimId: null,
      processingStartedAt: null,
    });
  });

  it('sends only an account-neutral immediate REMINDER_SYNC payload', async () => {
    const { db, firebase, service, internals } = makeHarness();
    const delivery = makeClaimedDelivery();
    isolateDispatchDbSteps(internals, [delivery]);
    firebase.sendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      responses: [makeFailure('private/provider-secret', 'token leaked')],
    });
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const consoleWarn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await service.dispatchDueNotifications();

    expect(firebase.sendEachForMulticast).toHaveBeenCalledWith({
      tokens: ['sensitive-device-token'],
      data: {
        type: 'REMINDER_SYNC',
        version: '1',
      },
      android: {
        ttl: 0,
        collapseKey: 'reminder-sync',
        priority: 'high',
      },
      apns: {
        headers: {
          'apns-expiration': '0',
          'apns-push-type': 'background',
          'apns-priority': '5',
          'apns-collapse-id': 'reminder-sync',
        },
        payload: {
          aps: {
            contentAvailable: true,
          },
        },
      },
    });
    const message = firebase.sendEachForMulticast.mock.calls[0][0];
    expect(message).not.toHaveProperty('notification');
    expect(Object.keys(message.data ?? {})).toEqual(['type', 'version']);
    const serializedPayload = JSON.stringify(message);
    expect(serializedPayload).not.toContain('user-1');
    expect(serializedPayload).not.toContain('task-1');
    expect(serializedPayload).not.toContain('schedule-1');
    expect(serializedPayload).not.toContain('"title"');
    expect(serializedPayload).not.toContain('"body"');
    expect(serializedPayload).not.toContain('task title');
    expect(serializedPayload).not.toContain('task description');
    const persistedData = db.notificationDelivery.updateMany.mock.calls
      .map(([input]) => input.data as Record<string, unknown>)
      .find((data) => data.failureReason !== undefined);
    expect(persistedData).toBeDefined();
    if (!persistedData) {
      throw new Error('Expected a persisted sanitized failure result');
    }
    expect(persistedData.failureReason).toBe('messaging/unknown-error');
    expect(JSON.stringify(persistedData)).not.toContain('token leaked');
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('heartbeats a slow active send and clears the timer after finalization', async () => {
    jest.useFakeTimers({ now });
    const { db, firebase, service, internals } = makeHarness();
    const delivery = makeClaimedDelivery();
    isolateDispatchDbSteps(internals, [delivery]);
    let resolveSend: (response: BatchResponse) => void = () => undefined;
    firebase.sendEachForMulticast.mockImplementation(
      () =>
        new Promise<BatchResponse>((resolve) => {
          resolveSend = resolve;
        }),
    );
    db.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });

    const dispatch = service.dispatchDueNotifications();
    await jest.advanceTimersByTimeAsync(0);
    expect(firebase.sendEachForMulticast).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(db.notificationDelivery.updateMany.mock.calls[1][0]).toEqual({
      where: {
        id: { in: [delivery.id] },
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: delivery.claimId,
        sendStartedAt: { not: null },
      },
      data: { processingStartedAt: new Date('2026-07-20T00:01:00.000Z') },
    });

    resolveSend({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });
    await dispatch;
    const callsAfterFinalization =
      db.notificationDelivery.updateMany.mock.calls.length;

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(db.notificationDelivery.updateMany).toHaveBeenCalledTimes(
      callsAfterFinalization,
    );
  });

  it('terminalizes a post-marker heartbeat failure as UNKNOWN instead of retry or success', async () => {
    jest.useFakeTimers({ now });
    const { db, firebase, service, internals } = makeHarness();
    const delivery = makeClaimedDelivery();
    const { aggregateSchedules } = isolateDispatchDbSteps(internals, [
      delivery,
    ]);
    let resolveSend: (response: BatchResponse) => void = () => undefined;
    firebase.sendEachForMulticast.mockImplementation(
      () =>
        new Promise<BatchResponse>((resolve) => {
          resolveSend = resolve;
        }),
    );
    db.notificationDelivery.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('heartbeat unavailable'))
      .mockResolvedValue({ count: 1 });

    const dispatch = service.dispatchDueNotifications();
    await jest.advanceTimersByTimeAsync(0);
    expect(firebase.sendEachForMulticast).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60_000);
    resolveSend({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });
    await dispatch;

    expect(db.notificationDelivery.updateMany).toHaveBeenCalledTimes(3);
    expect(db.notificationDelivery.updateMany.mock.calls[1][0]).toEqual({
      where: {
        id: { in: [delivery.id] },
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: delivery.claimId,
        sendStartedAt: { not: null },
      },
      data: { processingStartedAt: new Date('2026-07-20T00:01:00.000Z') },
    });
    expect(db.notificationDelivery.updateMany.mock.calls[2][0]).toEqual({
      where: {
        id: { in: [delivery.id] },
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: delivery.claimId,
        sendStartedAt: { not: null },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.UNKNOWN,
        failureReason: 'ambiguous-delivery-outcome',
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
    expect(
      db.notificationDelivery.updateMany.mock.calls.some(([input]) => {
        const data = input.data;
        return (
          isRecord(data) &&
          (data.status === NOTIFICATION_DELIVERY_STATUS.PENDING ||
            data.status === NOTIFICATION_DELIVERY_STATUS.SENT)
        );
      }),
    ).toBe(false);
    expect(aggregateSchedules).toHaveBeenCalledWith([delivery.scheduleId]);
  });

  it('aggregates partial terminal success to SENT but preserves cancellation guards', async () => {
    const { db, internals } = makeHarness();
    db.notificationDelivery.findMany.mockResolvedValue([
      { status: NOTIFICATION_DELIVERY_STATUS.SENT },
      { status: NOTIFICATION_DELIVERY_STATUS.FAILED },
      { status: NOTIFICATION_DELIVERY_STATUS.CANCELLED },
    ]);
    db.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });

    await internals.aggregateSchedules(['schedule-1']);

    expect(db.notificationSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'schedule-1',
        status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
      },
      data: {
        status: NOTIFICATION_SCHEDULE_STATUS.SENT,
        sentAt: expect.any(Date) as Date,
        failureReason: null,
      },
    });
  });

  it('keeps a schedule nonterminal until every delivery is terminal', async () => {
    const { db, internals } = makeHarness();
    db.notificationDelivery.findMany.mockResolvedValue([
      { status: NOTIFICATION_DELIVERY_STATUS.SENT },
      { status: NOTIFICATION_DELIVERY_STATUS.PENDING },
    ]);

    await internals.aggregateSchedules(['schedule-1']);

    expect(db.notificationSchedule.updateMany).not.toHaveBeenCalled();
  });

  it('aggregates an all-terminal batch without success to FAILED', async () => {
    const { db, internals } = makeHarness();
    db.notificationDelivery.findMany.mockResolvedValue([
      { status: NOTIFICATION_DELIVERY_STATUS.FAILED },
      { status: NOTIFICATION_DELIVERY_STATUS.CANCELLED },
      { status: NOTIFICATION_DELIVERY_STATUS.UNKNOWN },
    ]);
    db.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });

    await internals.aggregateSchedules(['schedule-1']);

    expect(db.notificationSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'schedule-1',
        status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
      },
      data: {
        status: NOTIFICATION_SCHEDULE_STATUS.FAILED,
        failureReason: 'all-deliveries-failed',
      },
    });
  });
});

function firebaseSendCalls(service: NotificationDispatcherService): number {
  const provider = (
    service as unknown as {
      firebase: { sendEachForMulticast: jest.Mock };
    }
  ).firebase;
  return provider.sendEachForMulticast.mock.calls.length;
}
