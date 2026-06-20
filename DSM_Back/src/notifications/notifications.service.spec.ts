import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { NotificationMode, TaskDifficulty, TaskStatus } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { FcmAdminService } from './fcm-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_SCHEDULE_STATUS,
} from './notification-events';

const NOW = new Date('2026-06-20T03:00:00Z');

const MOCK_TASK = {
  id: 'task-uuid-1',
  title: 'Morning run',
  description: null,
  startAt: new Date('2026-06-20T06:00:00Z'),
  endAt: new Date('2026-06-20T07:00:00Z'),
  completedAt: null,
  difficulty: TaskDifficulty.MEDIUM,
  status: TaskStatus.PENDING,
  notificationEnabled: true,
  userId: 'user-uuid-1',
  categoryId: null,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
};

const MOCK_SCHEDULE = {
  id: 'schedule-uuid-1',
  taskId: 'task-uuid-1',
  userId: 'user-uuid-1',
  scheduledAt: MOCK_TASK.startAt,
  sentAt: null,
  status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
  failureReason: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const MOCK_SCHEDULE_USER = {
  notificationMode: NotificationMode.SOUND,
};

const ACTIVE_SCHEDULE_STATUSES = [
  NOTIFICATION_SCHEDULE_STATUS.PENDING,
  NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
];

const makePrismaMock = () => {
  const mock = {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
    },
    fcmToken: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    notificationSchedule: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  mock.$transaction.mockImplementation(
    async (
      operation:
        | ((client: typeof mock) => Promise<unknown>)
        | Array<Promise<unknown>>,
    ): Promise<unknown> => {
      if (typeof operation === 'function') {
        return operation(mock);
      }
      return Promise.all(operation);
    },
  );
  mock.notificationSchedule.updateMany.mockResolvedValue({ count: 0 });

  return mock;
};

const makeFcmMock = () => ({
  sendTaskReminder: jest.fn(),
});

const makeConfigMock = (values: Record<string, number | undefined> = {}) => ({
  get: jest.fn((key: string) => values[key]),
});

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prismaMock = makePrismaMock();
    prismaMock.user.findUnique.mockResolvedValue({
      notificationEnabled: true,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('registers a new FCM token for a user', async () => {
    prismaMock.fcmToken.upsert.mockResolvedValue({
      id: 'fcm-token-uuid-1',
      token: 'fcm-token-1',
      platform: 'ios',
      deviceId: 'device-1',
      userId: 'user-uuid-1',
      lastSeenAt: NOW,
      revokedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await service.registerToken('user-uuid-1', {
      token: 'fcm-token-1',
      platform: 'ios',
      deviceId: 'device-1',
    });

    expect(result.revokedAt).toBeNull();
    expect(prismaMock.fcmToken.upsert).toHaveBeenCalledWith({
      where: { token: 'fcm-token-1' },
      create: expect.objectContaining({
        token: 'fcm-token-1',
        platform: 'ios',
        deviceId: 'device-1',
        userId: 'user-uuid-1',
        revokedAt: null,
      }) as unknown,
      update: expect.objectContaining({
        userId: 'user-uuid-1',
        platform: 'ios',
        deviceId: 'device-1',
        revokedAt: null,
        lastSeenAt: expect.any(Date) as unknown,
      }) as unknown,
    });
  });

  it('reactivates an existing revoked FCM token', async () => {
    prismaMock.fcmToken.upsert.mockResolvedValue({
      id: 'fcm-token-uuid-1',
      token: 'fcm-token-1',
      platform: 'android',
      deviceId: 'device-2',
      userId: 'user-uuid-1',
      lastSeenAt: NOW,
      revokedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await service.registerToken('user-uuid-1', {
      token: 'fcm-token-1',
      platform: 'android',
      deviceId: 'device-2',
    });

    expect(result.userId).toBe('user-uuid-1');
    expect(result.revokedAt).toBeNull();
    expect(prismaMock.fcmToken.upsert).toHaveBeenCalledWith({
      where: { token: 'fcm-token-1' },
      create: expect.objectContaining({
        token: 'fcm-token-1',
        userId: 'user-uuid-1',
      }) as unknown,
      update: expect.objectContaining({
        userId: 'user-uuid-1',
        platform: 'android',
        deviceId: 'device-2',
        revokedAt: null,
        lastSeenAt: expect.any(Date) as unknown,
      }) as unknown,
    });
  });

  it('revokes an active FCM token owned by the user', async () => {
    prismaMock.fcmToken.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.revokeToken('user-uuid-1', {
      token: 'fcm-token-1',
    });

    expect(result).toEqual({ revokedCount: 1 });
    expect(prismaMock.fcmToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-uuid-1',
        revokedAt: null,
        token: 'fcm-token-1',
      },
      data: { revokedAt: expect.any(Date) as unknown },
    });
  });

  it('finds active tokens for a user only', async () => {
    prismaMock.fcmToken.findMany.mockResolvedValue([
      { token: 'active-token-1' },
      { token: 'active-token-2' },
    ]);

    const result = await service.findActiveTokens('user-uuid-1');

    expect(result).toEqual(['active-token-1', 'active-token-2']);
    expect(prismaMock.fcmToken.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-uuid-1', revokedAt: null },
      select: { token: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  });

  it('upserts a task notification schedule', async () => {
    prismaMock.notificationSchedule.findFirst.mockResolvedValue(MOCK_SCHEDULE);
    prismaMock.notificationSchedule.update.mockResolvedValue({
      ...MOCK_SCHEDULE,
      scheduledAt: new Date('2026-06-20T08:00:00Z'),
    });

    const result = await service.upsertTaskSchedule({
      ...MOCK_TASK,
      startAt: new Date('2026-06-20T08:00:00Z'),
    });

    expect(result.scheduledAt).toEqual(new Date('2026-06-20T08:00:00Z'));
    expect(prismaMock.notificationSchedule.update).toHaveBeenCalledWith({
      where: { id: 'schedule-uuid-1' },
      data: expect.objectContaining({
        scheduledAt: new Date('2026-06-20T08:00:00Z'),
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        sentAt: null,
        failureReason: null,
      }) as unknown,
    });
    expect(prismaMock.notificationSchedule.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-uuid-1',
        taskId: 'task-uuid-1',
        status: { in: ACTIVE_SCHEDULE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('updates an existing processing schedule instead of creating a duplicate active schedule', async () => {
    const processingSchedule = {
      ...MOCK_SCHEDULE,
      id: 'processing-schedule-uuid-1',
      status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
      failureReason: 'FCM unavailable',
    };
    prismaMock.notificationSchedule.findFirst.mockResolvedValue(
      processingSchedule,
    );
    prismaMock.notificationSchedule.update.mockResolvedValue({
      ...processingSchedule,
      scheduledAt: new Date('2026-06-20T09:00:00Z'),
      status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
      failureReason: null,
    });

    const result = await service.upsertTaskSchedule({
      ...MOCK_TASK,
      startAt: new Date('2026-06-20T09:00:00Z'),
    });

    expect(result.status).toBe(NOTIFICATION_SCHEDULE_STATUS.PENDING);
    expect(prismaMock.notificationSchedule.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-uuid-1',
        taskId: 'task-uuid-1',
        status: { in: ACTIVE_SCHEDULE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(prismaMock.notificationSchedule.update).toHaveBeenCalledWith({
      where: { id: 'processing-schedule-uuid-1' },
      data: expect.objectContaining({
        scheduledAt: new Date('2026-06-20T09:00:00Z'),
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        sentAt: null,
        failureReason: null,
      }) as unknown,
    });
    expect(prismaMock.notificationSchedule.create).not.toHaveBeenCalled();
  });

  it('re-reads and updates an active schedule in a fresh transaction after a create conflict', async () => {
    const conflictedSchedule = {
      ...MOCK_SCHEDULE,
      id: 'conflicted-schedule-uuid-1',
      status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
    };
    const createConflict = {
      code: 'P2002',
      clientVersion: '6.19.3',
    };
    const abortedTransactionSchedule = {
      ...prismaMock.notificationSchedule,
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValue(new Error('aborted transaction was reused')),
      create: jest.fn().mockRejectedValue(createConflict),
      update: jest.fn(),
    };
    const fallbackTransactionSchedule = {
      ...prismaMock.notificationSchedule,
      findFirst: jest.fn().mockResolvedValue(conflictedSchedule),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({
        ...conflictedSchedule,
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        failureReason: null,
      }),
    };
    const transactionEvents: string[] = [];
    prismaMock.$transaction
      .mockImplementationOnce(
        async (
          operation: (client: typeof prismaMock) => Promise<unknown>,
        ): Promise<unknown> => {
          transactionEvents.push('initial transaction started');
          try {
            return await operation({
              ...prismaMock,
              notificationSchedule: abortedTransactionSchedule,
            });
          } catch (error) {
            transactionEvents.push('initial transaction rejected');
            throw error;
          }
        },
      )
      .mockImplementationOnce(
        async (
          operation: (client: typeof prismaMock) => Promise<unknown>,
        ): Promise<unknown> => {
          transactionEvents.push('fallback transaction started');
          return await operation({
            ...prismaMock,
            notificationSchedule: fallbackTransactionSchedule,
          });
        },
      );

    const result = await service.upsertTaskSchedule(MOCK_TASK);

    expect(result.id).toBe('conflicted-schedule-uuid-1');
    expect(transactionEvents).toEqual([
      'initial transaction started',
      'initial transaction rejected',
      'fallback transaction started',
    ]);
    expect(abortedTransactionSchedule.findFirst).toHaveBeenCalledTimes(1);
    expect(abortedTransactionSchedule.update).not.toHaveBeenCalled();
    expect(fallbackTransactionSchedule.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-uuid-1',
        taskId: 'task-uuid-1',
        status: { in: ACTIVE_SCHEDULE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(fallbackTransactionSchedule.update).toHaveBeenCalledWith({
      where: { id: 'conflicted-schedule-uuid-1' },
      data: {
        scheduledAt: MOCK_TASK.startAt,
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        sentAt: null,
        failureReason: null,
      },
    });
  });

  it('rethrows the original create conflict when fallback cannot find an active schedule', async () => {
    const createConflict = {
      code: 'P2002',
      clientVersion: '6.19.3',
    };
    const abortedTransactionSchedule = {
      ...prismaMock.notificationSchedule,
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockRejectedValue(createConflict),
      update: jest.fn(),
    };
    const fallbackTransactionSchedule = {
      ...prismaMock.notificationSchedule,
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    };
    prismaMock.$transaction
      .mockImplementationOnce(
        async (
          operation: (client: typeof prismaMock) => Promise<unknown>,
        ): Promise<unknown> =>
          operation({
            ...prismaMock,
            notificationSchedule: abortedTransactionSchedule,
          }),
      )
      .mockImplementationOnce(
        async (
          operation: (client: typeof prismaMock) => Promise<unknown>,
        ): Promise<unknown> =>
          operation({
            ...prismaMock,
            notificationSchedule: fallbackTransactionSchedule,
          }),
      );

    await expect(service.upsertTaskSchedule(MOCK_TASK)).rejects.toBe(
      createConflict,
    );
    expect(fallbackTransactionSchedule.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-uuid-1',
        taskId: 'task-uuid-1',
        status: { in: ACTIVE_SCHEDULE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(fallbackTransactionSchedule.update).not.toHaveBeenCalled();
  });

  it('cancels task schedules when task notifications are disabled', async () => {
    prismaMock.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });

    await service.upsertTaskSchedule({
      ...MOCK_TASK,
      notificationEnabled: false,
    });

    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-uuid-1',
        taskId: 'task-uuid-1',
        status: { in: ACTIVE_SCHEDULE_STATUSES },
      },
      data: {
        status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED,
        failureReason: null,
      },
    });
  });

  it('cancels task schedules when the task is no longer pending', async () => {
    prismaMock.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.upsertTaskSchedule({
      ...MOCK_TASK,
      status: TaskStatus.COMPLETED,
    });

    expect(result).toBeNull();
    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-uuid-1',
        taskId: 'task-uuid-1',
        status: { in: ACTIVE_SCHEDULE_STATUSES },
      },
      data: {
        status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED,
        failureReason: null,
      },
    });
  });

  it('cancels task schedules when the user disabled notifications globally', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      notificationEnabled: false,
    });
    prismaMock.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.upsertTaskSchedule(MOCK_TASK);

    expect(result).toBeNull();
    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-uuid-1',
        taskId: 'task-uuid-1',
        status: { in: ACTIVE_SCHEDULE_STATUSES },
      },
      data: {
        status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED,
        failureReason: null,
      },
    });
  });

  it('creates a new pending schedule instead of reopening a sent schedule', async () => {
    prismaMock.notificationSchedule.findFirst.mockResolvedValue(null);
    prismaMock.notificationSchedule.create.mockResolvedValue(MOCK_SCHEDULE);

    await service.upsertTaskSchedule(MOCK_TASK);

    expect(prismaMock.notificationSchedule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-uuid-1',
        taskId: 'task-uuid-1',
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
      }) as unknown,
    });
    expect(prismaMock.notificationSchedule.update).not.toHaveBeenCalled();
  });

  it('cancels pending and processing schedules for a task', async () => {
    prismaMock.notificationSchedule.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.cancelTaskSchedule(
      'user-uuid-1',
      'task-uuid-1',
    );

    expect(result).toBe(2);
    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-uuid-1',
        taskId: 'task-uuid-1',
        status: { in: ACTIVE_SCHEDULE_STATUSES },
      },
      data: {
        status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED,
        failureReason: null,
      },
    });
  });
});

describe('NotificationSchedulerService', () => {
  let scheduler: NotificationSchedulerService;
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let fcmMock: ReturnType<typeof makeFcmMock>;
  let eventsMock: { emit: jest.Mock };
  let configMock: ReturnType<typeof makeConfigMock>;

  beforeEach(async () => {
    prismaMock = makePrismaMock();
    fcmMock = makeFcmMock();
    eventsMock = { emit: jest.fn() };
    configMock = makeConfigMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationSchedulerService,
        NotificationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FcmAdminService, useValue: fcmMock },
        { provide: EventEmitter2, useValue: eventsMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    scheduler = module.get<NotificationSchedulerService>(
      NotificationSchedulerService,
    );
  });

  it('recovers stale processing schedules before fetching due schedules', async () => {
    const timeoutSeconds = 120;
    configMock.get.mockImplementation((key: string) =>
      key === 'NOTIFICATION_PROCESSING_TIMEOUT_SECONDS'
        ? timeoutSeconds
        : undefined,
    );
    prismaMock.notificationSchedule.findMany.mockResolvedValue([]);

    await scheduler.processDueSchedules(NOW, 10);

    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        updatedAt: {
          lt: new Date(NOW.getTime() - timeoutSeconds * 1000),
        },
      },
      data: {
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        failureReason: 'RECOVERED_STALE_PROCESSING',
      },
    });
    expect(
      prismaMock.notificationSchedule.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      prismaMock.notificationSchedule.findMany.mock.invocationCallOrder[0],
    );
  });

  it('uses the configured due schedule batch size when take is omitted', async () => {
    configMock.get.mockImplementation((key: string) =>
      key === 'NOTIFICATION_DUE_BATCH_SIZE' ? 25 : undefined,
    );
    prismaMock.notificationSchedule.findMany.mockResolvedValue([]);

    await scheduler.processDueSchedules(NOW);

    expect(prismaMock.notificationSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
      }) as unknown,
    );
  });

  it('processes due schedules and marks successful sends as SENT', async () => {
    prismaMock.notificationSchedule.findMany.mockResolvedValue([
      { ...MOCK_SCHEDULE, task: MOCK_TASK, user: MOCK_SCHEDULE_USER },
    ]);
    prismaMock.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.fcmToken.findMany.mockResolvedValue([{ token: 'fcm-token-1' }]);
    fcmMock.sendTaskReminder.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
    });

    const result = await scheduler.processDueSchedules(NOW);

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(fcmMock.sendTaskReminder).toHaveBeenCalledWith(
      ['fcm-token-1'],
      MOCK_TASK,
      NotificationMode.SOUND,
    );
    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'schedule-uuid-1',
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        user: { notificationEnabled: true },
        task: {
          deletedAt: null,
          notificationEnabled: true,
          status: TaskStatus.PENDING,
        },
      },
      data: { status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING },
    });
    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenLastCalledWith(
      {
        where: {
          id: 'schedule-uuid-1',
          status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        },
        data: {
          status: NOTIFICATION_SCHEDULE_STATUS.SENT,
          sentAt: expect.any(Date) as unknown,
          failureReason: null,
        },
      },
    );
    expect(eventsMock.emit).toHaveBeenCalledWith(
      NOTIFICATION_EVENTS.DUE,
      expect.objectContaining({
        userId: 'user-uuid-1',
        taskId: 'task-uuid-1',
        scheduleId: 'schedule-uuid-1',
      }) as unknown,
    );
  });

  it('does not emit due events or count sent when SENT transition no longer applies', async () => {
    prismaMock.notificationSchedule.findMany.mockResolvedValue([
      { ...MOCK_SCHEDULE, task: MOCK_TASK, user: MOCK_SCHEDULE_USER },
    ]);
    prismaMock.notificationSchedule.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prismaMock.fcmToken.findMany.mockResolvedValue([{ token: 'fcm-token-1' }]);
    fcmMock.sendTaskReminder.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
    });

    const result = await scheduler.processDueSchedules(NOW);

    expect(result).toEqual({ processed: 1, sent: 0, failed: 0, skipped: 0 });
    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenLastCalledWith(
      {
        where: {
          id: 'schedule-uuid-1',
          status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        },
        data: {
          status: NOTIFICATION_SCHEDULE_STATUS.SENT,
          sentAt: expect.any(Date) as unknown,
          failureReason: null,
        },
      },
    );
    expect(prismaMock.notificationSchedule.update).not.toHaveBeenCalled();
    expect(eventsMock.emit).not.toHaveBeenCalledWith(
      NOTIFICATION_EVENTS.DUE,
      expect.anything(),
    );
  });

  it('marks resolved all-failed FCM sends as FAILED and revokes invalid tokens', async () => {
    prismaMock.notificationSchedule.findMany.mockResolvedValue([
      { ...MOCK_SCHEDULE, task: MOCK_TASK, user: MOCK_SCHEDULE_USER },
    ]);
    prismaMock.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.fcmToken.findMany.mockResolvedValue([{ token: 'fcm-token-1' }]);
    fcmMock.sendTaskReminder.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      invalidTokens: ['fcm-token-1'],
    });

    const result = await scheduler.processDueSchedules(NOW);

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1, skipped: 0 });
    expect(prismaMock.fcmToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-uuid-1',
        revokedAt: null,
        token: { in: ['fcm-token-1'] },
      },
      data: { revokedAt: expect.any(Date) as unknown },
    });
    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenLastCalledWith(
      {
        where: {
          id: 'schedule-uuid-1',
          status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        },
        data: {
          status: NOTIFICATION_SCHEDULE_STATUS.FAILED,
          failureReason: 'FCM_SEND_FAILED',
        },
      },
    );
    expect(eventsMock.emit).not.toHaveBeenCalledWith(
      NOTIFICATION_EVENTS.DUE,
      expect.anything(),
    );
  });

  it('does not overwrite schedules or count failed when FAILED transition no longer applies', async () => {
    prismaMock.notificationSchedule.findMany.mockResolvedValue([
      { ...MOCK_SCHEDULE, task: MOCK_TASK, user: MOCK_SCHEDULE_USER },
    ]);
    prismaMock.notificationSchedule.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prismaMock.fcmToken.findMany.mockResolvedValue([{ token: 'fcm-token-1' }]);
    fcmMock.sendTaskReminder.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      invalidTokens: [],
    });

    const result = await scheduler.processDueSchedules(NOW);

    expect(result).toEqual({ processed: 1, sent: 0, failed: 0, skipped: 0 });
    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenLastCalledWith(
      {
        where: {
          id: 'schedule-uuid-1',
          status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        },
        data: {
          status: NOTIFICATION_SCHEDULE_STATUS.FAILED,
          failureReason: 'FCM_SEND_FAILED',
        },
      },
    );
    expect(prismaMock.notificationSchedule.update).not.toHaveBeenCalled();
    expect(eventsMock.emit).not.toHaveBeenCalledWith(
      NOTIFICATION_EVENTS.DUE,
      expect.anything(),
    );
  });

  it('records partial FCM failures while marking a schedule SENT', async () => {
    prismaMock.notificationSchedule.findMany.mockResolvedValue([
      { ...MOCK_SCHEDULE, task: MOCK_TASK, user: MOCK_SCHEDULE_USER },
    ]);
    prismaMock.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.fcmToken.findMany.mockResolvedValue([
      { token: 'fcm-token-1' },
      { token: 'fcm-token-2' },
    ]);
    fcmMock.sendTaskReminder.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      invalidTokens: ['fcm-token-2'],
    });

    const result = await scheduler.processDueSchedules(NOW);

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenLastCalledWith(
      {
        where: {
          id: 'schedule-uuid-1',
          status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        },
        data: {
          status: NOTIFICATION_SCHEDULE_STATUS.SENT,
          sentAt: expect.any(Date) as unknown,
          failureReason: 'PARTIAL_FCM_FAILURE:1',
        },
      },
    );
  });

  it('marks due schedules as FAILED when FCM send fails', async () => {
    prismaMock.notificationSchedule.findMany.mockResolvedValue([
      { ...MOCK_SCHEDULE, task: MOCK_TASK, user: MOCK_SCHEDULE_USER },
    ]);
    prismaMock.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.fcmToken.findMany.mockResolvedValue([{ token: 'fcm-token-1' }]);
    fcmMock.sendTaskReminder.mockRejectedValue(new Error('FCM unavailable'));

    const result = await scheduler.processDueSchedules(NOW);

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1, skipped: 0 });
    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenLastCalledWith(
      {
        where: {
          id: 'schedule-uuid-1',
          status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        },
        data: {
          status: NOTIFICATION_SCHEDULE_STATUS.FAILED,
          failureReason: 'FCM unavailable',
        },
      },
    );
  });

  it('skips due schedules without active tokens by marking them FAILED', async () => {
    prismaMock.notificationSchedule.findMany.mockResolvedValue([
      { ...MOCK_SCHEDULE, task: MOCK_TASK, user: MOCK_SCHEDULE_USER },
    ]);
    prismaMock.notificationSchedule.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.fcmToken.findMany.mockResolvedValue([]);

    const result = await scheduler.processDueSchedules(NOW);

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1, skipped: 1 });
    expect(fcmMock.sendTaskReminder).not.toHaveBeenCalled();
    expect(prismaMock.notificationSchedule.updateMany).toHaveBeenLastCalledWith(
      {
        where: {
          id: 'schedule-uuid-1',
          status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        },
        data: {
          status: NOTIFICATION_SCHEDULE_STATUS.FAILED,
          failureReason: 'NO_ACTIVE_FCM_TOKEN',
        },
      },
    );
  });

  it('only fetches due PENDING schedules', async () => {
    prismaMock.notificationSchedule.findMany.mockResolvedValue([]);

    await scheduler.processDueSchedules(NOW);

    expect(prismaMock.notificationSchedule.findMany).toHaveBeenCalledWith({
      where: {
        scheduledAt: { lte: NOW },
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        user: { notificationEnabled: true },
        task: {
          deletedAt: null,
          notificationEnabled: true,
          status: TaskStatus.PENDING,
        },
      },
      include: {
        task: true,
        user: { select: { notificationMode: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    });
  });
});
