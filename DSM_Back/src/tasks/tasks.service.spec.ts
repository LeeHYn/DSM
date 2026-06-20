import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, TaskDifficulty, TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoresService } from '../scores/scores.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MAX_DAILY_TASKS } from './tasks.policy';

const MOCK_TASK = {
  id: 'task-uuid-1',
  title: 'Morning run',
  description: null,
  startAt: new Date('2026-06-03T06:00:00Z'),
  endAt: new Date('2026-06-03T07:00:00Z'),
  completedAt: null,
  difficulty: TaskDifficulty.MEDIUM,
  status: TaskStatus.PENDING,
  notificationEnabled: true,
  userId: 'user-uuid-1',
  categoryId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const makePrismaMock = () => {
  const prismaMock = {
    task: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  prismaMock.$transaction.mockImplementation(
    async (callback: (tx: typeof prismaMock) => Promise<unknown>) =>
      callback(prismaMock),
  );

  return prismaMock;
};

const serializableTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

const createP2034Error = () => ({ code: 'P2034' });

describe('TasksService', () => {
  let service: TasksService;
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let scoresMock: { recompute: jest.Mock };
  let notificationsMock: {
    upsertTaskSchedule: jest.Mock;
    cancelTaskSchedule: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = makePrismaMock();
    prismaMock.task.count.mockResolvedValue(0);
    scoresMock = { recompute: jest.fn().mockResolvedValue(undefined) };
    notificationsMock = {
      upsertTaskSchedule: jest.fn().mockResolvedValue(undefined),
      cancelTaskSchedule: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ScoresService, useValue: scoresMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  describe('create', () => {
    it('creates a task for the given user', async () => {
      prismaMock.task.create.mockResolvedValue(MOCK_TASK);

      const result = await service.create('user-uuid-1', {
        title: 'Morning run',
        startAt: '2026-06-03T06:00:00Z',
        endAt: '2026-06-03T07:00:00Z',
        difficulty: TaskDifficulty.MEDIUM,
      });

      expect(result).toEqual(MOCK_TASK);
      expect(prismaMock.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ userId: 'user-uuid-1' }),
        }),
      );
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        MOCK_TASK.startAt,
      );
      expect(notificationsMock.upsertTaskSchedule).toHaveBeenCalledWith(
        MOCK_TASK,
      );
    });

    it('checks the daily limit and creates inside a Serializable transaction', async () => {
      prismaMock.task.create.mockResolvedValue(MOCK_TASK);

      await service.create('user-uuid-1', {
        title: 'Morning run',
        startAt: '2026-06-03T06:00:00Z',
        endAt: '2026-06-03T07:00:00Z',
        difficulty: TaskDifficulty.MEDIUM,
      });

      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        serializableTransactionOptions,
      );
      expect(prismaMock.task.count.mock.invocationCallOrder[0]).toBeLessThan(
        prismaMock.task.create.mock.invocationCallOrder[0],
      );
    });

    it('retries a create once after a Prisma serialization failure', async () => {
      prismaMock.$transaction
        .mockRejectedValueOnce(createP2034Error())
        .mockImplementationOnce(
          async (callback: (tx: typeof prismaMock) => Promise<unknown>) =>
            callback(prismaMock),
        );
      prismaMock.task.create.mockResolvedValue(MOCK_TASK);

      const result = await service.create('user-uuid-1', {
        title: 'Morning run',
        startAt: '2026-06-03T06:00:00Z',
        endAt: '2026-06-03T07:00:00Z',
        difficulty: TaskDifficulty.MEDIUM,
      });

      expect(result).toEqual(MOCK_TASK);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      expect(notificationsMock.upsertTaskSchedule).toHaveBeenCalledTimes(1);
      expect(scoresMock.recompute).toHaveBeenCalledTimes(1);
    });

    it('throws a clear conflict when create serialization fails twice', async () => {
      prismaMock.$transaction.mockRejectedValue(createP2034Error());

      await expect(
        service.create('user-uuid-1', {
          title: 'Morning run',
          startAt: '2026-06-03T06:00:00Z',
          endAt: '2026-06-03T07:00:00Z',
          difficulty: TaskDifficulty.MEDIUM,
        }),
      ).rejects.toThrow(
        new ConflictException('Daily task limit exceeded; please retry'),
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      expect(notificationsMock.upsertTaskSchedule).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('throws a conflict when the UTC day already has 20 active tasks', async () => {
      prismaMock.task.count.mockResolvedValue(MAX_DAILY_TASKS);

      await expect(
        service.create('user-uuid-1', {
          title: 'Late task',
          startAt: '2026-06-03T23:30:00-02:00',
          endAt: '2026-06-04T02:30:00Z',
          difficulty: TaskDifficulty.MEDIUM,
        }),
      ).rejects.toThrow(new ConflictException('Daily task limit exceeded'));

      expect(prismaMock.task.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          deletedAt: null,
          startAt: {
            gte: new Date('2026-06-04T00:00:00.000Z'),
            lt: new Date('2026-06-05T00:00:00.000Z'),
          },
        },
      });
      const countMock = prismaMock.task.count as jest.MockedFunction<
        (args: { where: Record<string, unknown> }) => Promise<number>
      >;
      const countArgs = countMock.mock.calls[0]?.[0];
      expect(countArgs?.where).not.toHaveProperty('status');
      expect(prismaMock.task.create).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
      expect(notificationsMock.upsertTaskSchedule).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns tasks ordered by startAt', async () => {
      prismaMock.task.findMany.mockResolvedValue([MOCK_TASK]);

      const result = await service.findAll('user-uuid-1', {});

      expect(result).toEqual([MOCK_TASK]);
      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { startAt: 'asc' } }),
      );
    });

    it('filters by UTC day range when a date is provided', async () => {
      prismaMock.task.findMany.mockResolvedValue([MOCK_TASK]);

      await service.findAll('user-uuid-1', {
        date: '2026-06-03T23:30:00-02:00',
      });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            startAt: {
              gte: new Date('2026-06-04T00:00:00.000Z'),
              lt: new Date('2026-06-05T00:00:00.000Z'),
            },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns task when found', async () => {
      prismaMock.task.findFirst.mockResolvedValue(MOCK_TASK);

      const result = await service.findOne('user-uuid-1', 'task-uuid-1');

      expect(result).toEqual(MOCK_TASK);
    });

    it('throws NotFoundException when task is missing', async () => {
      prismaMock.task.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('user-uuid-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates and returns the task', async () => {
      const updated = { ...MOCK_TASK, title: 'Evening run' };
      prismaMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      prismaMock.task.update.mockResolvedValue(updated);

      const result = await service.update('user-uuid-1', 'task-uuid-1', {
        title: 'Evening run',
      });

      expect(result.title).toBe('Evening run');
      expect(notificationsMock.upsertTaskSchedule).toHaveBeenCalledWith(
        updated,
      );
    });

    it('passes a non-pending status to notification scheduling for cancellation', async () => {
      const updated = { ...MOCK_TASK, status: TaskStatus.CANCELLED };
      prismaMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      prismaMock.task.update.mockResolvedValue(updated);

      await service.update('user-uuid-1', 'task-uuid-1', {
        status: TaskStatus.CANCELLED,
      });

      expect(notificationsMock.upsertTaskSchedule).toHaveBeenCalledWith(
        updated,
      );
    });

    it('checks the daily limit and updates inside a Serializable transaction when startAt moves days', async () => {
      const updated = {
        ...MOCK_TASK,
        startAt: new Date('2026-06-04T09:00:00.000Z'),
      };
      prismaMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      prismaMock.task.update.mockResolvedValue(updated);

      await service.update('user-uuid-1', 'task-uuid-1', {
        startAt: '2026-06-04T09:00:00.000Z',
      });

      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        serializableTransactionOptions,
      );
      expect(prismaMock.task.count.mock.invocationCallOrder[0]).toBeLessThan(
        prismaMock.task.update.mock.invocationCallOrder[0],
      );
    });

    it('throws a conflict when moving startAt to a full UTC day', async () => {
      prismaMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      prismaMock.task.count.mockResolvedValue(MAX_DAILY_TASKS);

      await expect(
        service.update('user-uuid-1', 'task-uuid-1', {
          startAt: '2026-06-04T09:00:00.000Z',
        }),
      ).rejects.toThrow(new ConflictException('Daily task limit exceeded'));

      expect(prismaMock.task.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          deletedAt: null,
          id: { not: 'task-uuid-1' },
          startAt: {
            gte: new Date('2026-06-04T00:00:00.000Z'),
            lt: new Date('2026-06-05T00:00:00.000Z'),
          },
        },
      });
      expect(prismaMock.task.update).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
      expect(notificationsMock.upsertTaskSchedule).not.toHaveBeenCalled();
    });

    it('does not check the daily limit when startAt stays in the same UTC day', async () => {
      const updated = {
        ...MOCK_TASK,
        startAt: new Date('2026-06-03T23:30:00.000Z'),
      };
      prismaMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      prismaMock.task.count.mockResolvedValue(MAX_DAILY_TASKS);
      prismaMock.task.update.mockResolvedValue(updated);

      await service.update('user-uuid-1', 'task-uuid-1', {
        startAt: '2026-06-03T23:30:00.000Z',
      });

      expect(prismaMock.task.count).not.toHaveBeenCalled();
      expect(notificationsMock.upsertTaskSchedule).toHaveBeenCalledWith(
        updated,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes by setting deletedAt', async () => {
      prismaMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      prismaMock.task.update.mockResolvedValue({
        ...MOCK_TASK,
        deletedAt: new Date(),
      });

      await service.remove('user-uuid-1', 'task-uuid-1');

      expect(notificationsMock.cancelTaskSchedule).toHaveBeenCalledWith(
        'user-uuid-1',
        'task-uuid-1',
      );
      expect(prismaMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('complete', () => {
    it('sets status COMPLETED and completedAt', async () => {
      const completedTask = {
        ...MOCK_TASK,
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      };
      prismaMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      prismaMock.task.update.mockResolvedValue(completedTask);

      const result = await service.complete('user-uuid-1', 'task-uuid-1');

      expect(result.status).toBe(TaskStatus.COMPLETED);
      expect(prismaMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: TaskStatus.COMPLETED,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            completedAt: expect.any(Date),
          }),
        }),
      );
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        completedTask.startAt,
      );
      expect(notificationsMock.cancelTaskSchedule).toHaveBeenCalledWith(
        'user-uuid-1',
        'task-uuid-1',
      );
    });
  });
});
