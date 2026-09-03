import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, TaskDifficulty, TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoresService } from '../scores/scores.service';

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

const makeClientMock = () => ({
  task: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  category: { findFirst: jest.fn() },
  notificationSchedule: { updateMany: jest.fn() },
  notificationDelivery: { updateMany: jest.fn() },
});

type ClientMock = ReturnType<typeof makeClientMock>;

const makeTransactionConflict = () =>
  new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });

const makePrismaMock = (transactionMock: ClientMock) => ({
  ...makeClientMock(),
  $transaction: jest.fn((callback: (client: ClientMock) => Promise<unknown>) =>
    callback(transactionMock),
  ),
});

describe('TasksService', () => {
  let service: TasksService;
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let transactionMock: ClientMock;
  let scoresMock: { recompute: jest.Mock };

  beforeEach(async () => {
    transactionMock = makeClientMock();
    transactionMock.task.count.mockResolvedValue(0);
    prismaMock = makePrismaMock(transactionMock);
    scoresMock = { recompute: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ScoresService, useValue: scoresMock },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('create', () => {
    it('creates a task for the given user', async () => {
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);

      const result = await service.create('user-uuid-1', {
        title: 'Morning run',
        startAt: '2026-06-03T06:00:00Z',
        endAt: '2026-06-03T07:00:00Z',
        difficulty: TaskDifficulty.MEDIUM,
      });

      expect(result).toEqual(MOCK_TASK);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(transactionMock.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ userId: 'user-uuid-1' }),
        }),
      );
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        MOCK_TASK.startAt,
        transactionMock,
      );
      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.task.create).not.toHaveBeenCalled();
    });

    it('allows the twentieth active task and uses the UTC half-open day predicate', async () => {
      transactionMock.task.count.mockResolvedValue(19);
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);

      await service.create('user-uuid-1', {
        title: 'Morning run',
        startAt: '2026-06-03T06:00:00Z',
        endAt: '2026-06-03T07:00:00Z',
        difficulty: TaskDifficulty.MEDIUM,
      });

      expect(transactionMock.task.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          deletedAt: null,
          startAt: {
            gte: new Date('2026-06-03T00:00:00.000Z'),
            lt: new Date('2026-06-04T00:00:00.000Z'),
          },
        },
      });
      expect(transactionMock.task.create).toHaveBeenCalledTimes(1);
    });

    it('rejects the twenty-first active task before every side effect', async () => {
      transactionMock.task.count.mockResolvedValue(20);

      const action = service.create('user-uuid-1', {
        title: 'Morning run',
        startAt: '2026-06-03T06:00:00Z',
        endAt: '2026-06-03T07:00:00Z',
        difficulty: TaskDifficulty.MEDIUM,
      });

      await expect(action).rejects.toBeInstanceOf(ConflictException);
      await expect(action).rejects.toMatchObject({
        message: 'Daily task limit reached',
        status: 409,
      });
      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(transactionMock.task.create).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('returns the capacity conflict before checking an invalid category', async () => {
      transactionMock.task.count.mockResolvedValue(20);
      transactionMock.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-uuid-1', {
          title: 'Morning run',
          startAt: '2026-06-03T06:00:00Z',
          endAt: '2026-06-03T07:00:00Z',
          difficulty: TaskDifficulty.MEDIUM,
          categoryId: 'missing-category',
        }),
      ).rejects.toMatchObject({
        message: 'Daily task limit reached',
        status: 409,
      });

      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(transactionMock.task.create).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('checks an invalid category only after capacity is available', async () => {
      transactionMock.task.count.mockResolvedValue(19);
      transactionMock.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-uuid-1', {
          title: 'Morning run',
          startAt: '2026-06-03T06:00:00Z',
          endAt: '2026-06-03T07:00:00Z',
          difficulty: TaskDifficulty.MEDIUM,
          categoryId: 'missing-category',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(
        transactionMock.task.count.mock.invocationCallOrder[0],
      ).toBeLessThan(
        transactionMock.category.findFirst.mock.invocationCallOrder[0],
      );
      expect(transactionMock.task.create).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('creates one pending schedule for an enabled future task', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);

      await service.create('user-uuid-1', {
        title: 'Morning run',
        startAt: '2026-06-03T06:00:00Z',
        endAt: '2026-06-03T07:00:00Z',
        difficulty: TaskDifficulty.MEDIUM,
      });

      expect(transactionMock.task.create).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          userId: 'user-uuid-1',
          notificationSchedules: {
            create: {
              userId: 'user-uuid-1',
              scheduledAt: new Date('2026-06-03T06:00:00Z'),
              status: 'PENDING',
            },
          },
        }),
      });
      expect(
        transactionMock.task.create.mock.invocationCallOrder[0],
      ).toBeLessThan(scoresMock.recompute.mock.invocationCallOrder[0]);
    });

    it.each([
      ['a past task', '2026-05-31T23:59:59Z', undefined],
      ['a task starting exactly now', '2026-06-01T00:00:00Z', undefined],
      ['a disabled future task', '2026-06-03T06:00:00Z', false],
    ])('does not schedule %s', async (_label, startAt, notificationEnabled) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
      transactionMock.task.create.mockResolvedValue({
        ...MOCK_TASK,
        startAt: new Date(startAt),
        notificationEnabled: notificationEnabled ?? true,
      });

      await service.create('user-uuid-1', {
        title: 'Morning run',
        startAt,
        endAt: '2026-06-03T07:00:00Z',
        difficulty: TaskDifficulty.MEDIUM,
        notificationEnabled,
      });

      expect(transactionMock.task.create).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.not.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          notificationSchedules: expect.anything(),
        }),
      });
    });

    it.each([
      [
        'actor-owned',
        { id: 'category-1', userId: 'user-uuid-1', isDefault: false },
      ],
      ['default', { id: 'category-1', userId: null, isDefault: true }],
    ])('accepts an %s category', async (_label, category) => {
      transactionMock.category.findFirst.mockResolvedValue(category);
      transactionMock.task.create.mockResolvedValue({
        ...MOCK_TASK,
        categoryId: 'category-1',
      });

      await service.create('user-uuid-1', {
        title: 'Morning run',
        startAt: '2026-06-03T06:00:00Z',
        endAt: '2026-06-03T07:00:00Z',
        difficulty: TaskDifficulty.MEDIUM,
        categoryId: 'category-1',
      });

      expect(transactionMock.category.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'category-1',
          OR: [{ userId: 'user-uuid-1' }, { isDefault: true }],
        },
        select: { id: true },
      });
      expect(transactionMock.task.create).toHaveBeenCalledTimes(1);
    });

    it.each(['missing', 'foreign'])(
      'rejects a %s category before writing the task',
      async () => {
        transactionMock.category.findFirst.mockResolvedValue(null);

        await expect(
          service.create('user-uuid-1', {
            title: 'Morning run',
            startAt: '2026-06-03T06:00:00Z',
            endAt: '2026-06-03T07:00:00Z',
            difficulty: TaskDifficulty.MEDIUM,
            categoryId: 'unassignable-category',
          }),
        ).rejects.toThrow(NotFoundException);

        expect(transactionMock.task.create).not.toHaveBeenCalled();
        expect(scoresMock.recompute).not.toHaveBeenCalled();
      },
    );

    it('propagates score recompute failures from the transaction callback', async () => {
      const recomputeError = new Error('score recompute failed');
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);
      scoresMock.recompute.mockRejectedValue(recomputeError);

      await expect(
        service.create('user-uuid-1', {
          title: 'Morning run',
          startAt: '2026-06-03T06:00:00Z',
          endAt: '2026-06-03T07:00:00Z',
          difficulty: TaskDifficulty.MEDIUM,
        }),
      ).rejects.toBe(recomputeError);
    });

    it('does not recompute scores when the task nested write fails', async () => {
      const writeError = new Error('task and schedule write failed');
      transactionMock.task.create.mockRejectedValue(writeError);

      await expect(
        service.create('user-uuid-1', {
          title: 'Morning run',
          startAt: '2099-06-03T06:00:00Z',
          endAt: '2099-06-03T07:00:00Z',
          difficulty: TaskDifficulty.MEDIUM,
        }),
      ).rejects.toBe(writeError);

      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });
  });

  describe('serializable transaction retry', () => {
    it('retries the entire callback after P2034 and returns the successful result', async () => {
      const conflict = makeTransactionConflict();
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);
      prismaMock.$transaction
        .mockImplementationOnce(async (callback) => {
          await callback(transactionMock);
          throw conflict;
        })
        .mockImplementationOnce((callback) => callback(transactionMock));

      const result = await service.create('user-uuid-1', {
        title: 'Morning run',
        startAt: '2026-06-03T06:00:00Z',
        endAt: '2026-06-03T07:00:00Z',
        difficulty: TaskDifficulty.MEDIUM,
      });

      expect(result).toEqual(MOCK_TASK);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      expect(prismaMock.$transaction).toHaveBeenNthCalledWith(
        1,
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(prismaMock.$transaction).toHaveBeenNthCalledWith(
        2,
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(transactionMock.task.create).toHaveBeenCalledTimes(2);
      expect(scoresMock.recompute).toHaveBeenCalledTimes(2);
    });

    it('propagates P2034 after the bounded retry limit', async () => {
      const conflict = makeTransactionConflict();
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);
      prismaMock.$transaction.mockImplementation(async (callback) => {
        await callback(transactionMock);
        throw conflict;
      });

      await expect(
        service.create('user-uuid-1', {
          title: 'Morning run',
          startAt: '2026-06-03T06:00:00Z',
          endAt: '2026-06-03T07:00:00Z',
          difficulty: TaskDifficulty.MEDIUM,
        }),
      ).rejects.toBe(conflict);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
      expect(transactionMock.task.create).toHaveBeenCalledTimes(3);
      expect(scoresMock.recompute).toHaveBeenCalledTimes(3);
    });

    it('does not retry non-P2034 errors', async () => {
      const error = new Error('non-retryable transaction failure');
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);
      prismaMock.$transaction.mockImplementationOnce(async (callback) => {
        await callback(transactionMock);
        throw error;
      });

      await expect(
        service.create('user-uuid-1', {
          title: 'Morning run',
          startAt: '2026-06-03T06:00:00Z',
          endAt: '2026-06-03T07:00:00Z',
          difficulty: TaskDifficulty.MEDIUM,
        }),
      ).rejects.toBe(error);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(transactionMock.task.create).toHaveBeenCalledTimes(1);
      expect(scoresMock.recompute).toHaveBeenCalledTimes(1);
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

    it('filters by date when provided', async () => {
      prismaMock.task.findMany.mockResolvedValue([MOCK_TASK]);

      await service.findAll('user-uuid-1', { date: '2026-06-03' });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            startAt: expect.objectContaining({ gte: expect.any(Date) }),
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
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue(updated);

      const result = await service.update('user-uuid-1', 'task-uuid-1', {
        title: 'Evening run',
      });

      expect(result.title).toBe('Evening run');
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(scoresMock.recompute).toHaveBeenCalledTimes(1);
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        MOCK_TASK.startAt,
        transactionMock,
      );
      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.not.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          notificationSchedules: expect.anything(),
        }),
      });
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).not.toHaveBeenCalled();
      expect(transactionMock.task.count).not.toHaveBeenCalled();
    });

    it('loads the owned task before rejecting a move into a full UTC day', async () => {
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.count.mockResolvedValue(20);
      transactionMock.category.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-uuid-1', 'task-uuid-1', {
          startAt: '2026-06-04T00:00:00.000Z',
          categoryId: 'missing-category',
        }),
      ).rejects.toMatchObject({
        message: 'Daily task limit reached',
        status: 409,
      });

      expect(transactionMock.task.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          deletedAt: null,
          startAt: {
            gte: new Date('2026-06-04T00:00:00.000Z'),
            lt: new Date('2026-06-05T00:00:00.000Z'),
          },
          id: { not: 'task-uuid-1' },
        },
      });
      expect(
        transactionMock.task.findFirst.mock.invocationCallOrder[0],
      ).toBeLessThan(transactionMock.task.count.mock.invocationCallOrder[0]);
      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).not.toHaveBeenCalled();
      expect(transactionMock.task.update).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('does not check capacity before reporting a missing owned task', async () => {
      transactionMock.task.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-uuid-1', 'missing-task', {
          startAt: '2026-06-04T00:00:00.000Z',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(transactionMock.task.count).not.toHaveBeenCalled();
      expect(transactionMock.task.update).not.toHaveBeenCalled();
    });

    it('skips capacity for a same-day move and preserves category 404 precedence', async () => {
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.category.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-uuid-1', 'task-uuid-1', {
          startAt: '2026-06-03T23:59:59.999Z',
          categoryId: 'missing-category',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(transactionMock.task.count).not.toHaveBeenCalled();
      expect(transactionMock.category.findFirst).toHaveBeenCalledTimes(1);
      expect(transactionMock.task.update).not.toHaveBeenCalled();
    });

    it('treats the next UTC midnight as a different capacity day', async () => {
      const endOfDayTask = {
        ...MOCK_TASK,
        startAt: new Date('2026-06-03T23:59:59.999Z'),
      };
      transactionMock.task.findFirst.mockResolvedValue(endOfDayTask);
      transactionMock.task.count.mockResolvedValue(19);
      transactionMock.task.update.mockResolvedValue({
        ...endOfDayTask,
        startAt: new Date('2026-06-04T00:00:00.000Z'),
      });

      await service.update('user-uuid-1', 'task-uuid-1', {
        startAt: '2026-06-04T00:00:00.000Z',
      });

      expect(transactionMock.task.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          deletedAt: null,
          startAt: {
            gte: new Date('2026-06-04T00:00:00.000Z'),
            lt: new Date('2026-06-05T00:00:00.000Z'),
          },
          id: { not: 'task-uuid-1' },
        },
      });
    });

    it('stamps completedAt when generic update enters COMPLETED', async () => {
      const now = new Date('2026-06-03T08:30:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue({
        ...MOCK_TASK,
        status: TaskStatus.COMPLETED,
        completedAt: now,
      });

      await service.update('user-uuid-1', 'task-uuid-1', {
        status: TaskStatus.COMPLETED,
      });

      expect(transactionMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: TaskStatus.COMPLETED,
            completedAt: now,
          }),
        }),
      );
    });

    it.each([TaskStatus.PENDING, TaskStatus.CANCELLED])(
      'clears completedAt when generic update leaves COMPLETED for %s',
      async (status) => {
        const completedTask = {
          ...MOCK_TASK,
          status: TaskStatus.COMPLETED,
          completedAt: new Date('2026-06-03T07:30:00.000Z'),
        };
        transactionMock.task.findFirst.mockResolvedValue(completedTask);
        transactionMock.task.update.mockResolvedValue({
          ...completedTask,
          status,
          completedAt: null,
        });

        await service.update('user-uuid-1', 'task-uuid-1', { status });

        expect(transactionMock.task.update).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: expect.objectContaining({ status, completedAt: null }),
          }),
        );
      },
    );

    it.each([
      ['an unrelated field', MOCK_TASK, { title: 'Evening run' }],
      [
        'the same completed status with a legacy null timestamp',
        { ...MOCK_TASK, status: TaskStatus.COMPLETED },
        { status: TaskStatus.COMPLETED },
      ],
    ])('preserves completedAt for %s', async (_label, existingTask, dto) => {
      transactionMock.task.findFirst.mockResolvedValue(existingTask);
      transactionMock.task.update.mockResolvedValue({
        ...existingTask,
        ...dto,
      });

      await service.update('user-uuid-1', 'task-uuid-1', dto);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const updateData = transactionMock.task.update.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty('completedAt');
    });

    it.each([
      [
        'start time',
        MOCK_TASK,
        { startAt: '2026-06-04T06:00:00Z' },
        new Date('2026-06-04T06:00:00Z'),
      ],
      [
        'notification enablement',
        { ...MOCK_TASK, notificationEnabled: false },
        { notificationEnabled: true },
        MOCK_TASK.startAt,
      ],
      [
        'status back to pending',
        { ...MOCK_TASK, status: TaskStatus.CANCELLED },
        { status: TaskStatus.PENDING },
        MOCK_TASK.startAt,
      ],
    ])(
      'cancels nonterminal notifications and creates the next pending schedule when %s actually changes',
      async (_label, existingTask, dto, scheduledAt) => {
        jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
        const updatedTask = {
          ...existingTask,
          ...dto,
          startAt:
            'startAt' in dto && dto.startAt
              ? new Date(dto.startAt)
              : existingTask.startAt,
        };
        transactionMock.task.findFirst.mockResolvedValue(existingTask);
        transactionMock.task.update.mockResolvedValue(updatedTask);

        await service.update('user-uuid-1', 'task-uuid-1', dto);

        expect(
          transactionMock.notificationSchedule.updateMany,
        ).toHaveBeenCalledWith({
          where: {
            taskId: 'task-uuid-1',
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          data: { status: 'CANCELLED' },
        });
        expect(
          transactionMock.notificationDelivery.updateMany,
        ).toHaveBeenCalledWith({
          where: {
            schedule: { taskId: 'task-uuid-1' },
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          data: {
            status: 'CANCELLED',
            claimId: null,
            processingStartedAt: null,
            nextAttemptAt: null,
          },
        });
        expect(transactionMock.task.update).toHaveBeenCalledWith({
          where: { id: 'task-uuid-1' },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            notificationSchedules: {
              create: {
                userId: 'user-uuid-1',
                scheduledAt,
                status: 'PENDING',
              },
            },
          }),
        });
        expect(
          transactionMock.notificationSchedule.updateMany.mock
            .invocationCallOrder[0],
        ).toBeLessThan(
          transactionMock.notificationDelivery.updateMany.mock
            .invocationCallOrder[0],
        );
        expect(
          transactionMock.notificationDelivery.updateMany.mock
            .invocationCallOrder[0],
        ).toBeLessThan(transactionMock.task.update.mock.invocationCallOrder[0]);
        expect(
          transactionMock.task.update.mock.invocationCallOrder[0],
        ).toBeLessThan(scoresMock.recompute.mock.invocationCallOrder[0]);
      },
    );

    it.each([
      ['notification disablement', { notificationEnabled: false }],
      ['cancellation', { status: TaskStatus.CANCELLED }],
    ])('cancels nonterminal notifications after %s', async (_label, dto) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue({ ...MOCK_TASK, ...dto });

      await service.update('user-uuid-1', 'task-uuid-1', dto);

      expect(
        transactionMock.notificationSchedule.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          taskId: 'task-uuid-1',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: { status: 'CANCELLED' },
      });
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          schedule: { taskId: 'task-uuid-1' },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          claimId: null,
          processingStartedAt: null,
          nextAttemptAt: null,
        },
      });
      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.not.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          notificationSchedules: expect.anything(),
        }),
      });
    });

    it.each([
      ['the same start time', { startAt: '2026-06-03T06:00:00Z' }],
      ['the same notification setting', { notificationEnabled: true }],
      ['the same status', { status: TaskStatus.PENDING }],
    ])('does not write schedules for %s', async (_label, dto) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue(MOCK_TASK);

      await service.update('user-uuid-1', 'task-uuid-1', dto);

      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.not.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          notificationSchedules: expect.anything(),
        }),
      });
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('cancels nonterminal notifications without creating a schedule when changed start time is not future', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-04T06:00:00Z'));
      const movedTask = {
        ...MOCK_TASK,
        startAt: new Date('2026-06-04T06:00:00Z'),
      };
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue(movedTask);

      await service.update('user-uuid-1', 'task-uuid-1', {
        startAt: '2026-06-04T06:00:00Z',
      });

      expect(
        transactionMock.notificationSchedule.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          taskId: 'task-uuid-1',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: { status: 'CANCELLED' },
      });
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          schedule: { taskId: 'task-uuid-1' },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          claimId: null,
          processingStartedAt: null,
          nextAttemptAt: null,
        },
      });
      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.not.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          notificationSchedules: expect.anything(),
        }),
      });
    });

    it('does not recompute scores when the task nested write fails', async () => {
      const writeError = new Error('task and schedule update failed');
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockRejectedValue(writeError);

      await expect(
        service.update('user-uuid-1', 'task-uuid-1', {
          notificationEnabled: false,
        }),
      ).rejects.toBe(writeError);

      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('does not reload an unchanged category', async () => {
      const categorizedTask = { ...MOCK_TASK, categoryId: 'category-1' };
      transactionMock.task.findFirst.mockResolvedValue(categorizedTask);
      transactionMock.task.update.mockResolvedValue(categorizedTask);

      await service.update('user-uuid-1', 'task-uuid-1', {
        categoryId: 'category-1',
      });

      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(transactionMock.task.update).toHaveBeenCalledTimes(1);
    });

    it.each([
      [
        'actor-owned',
        { id: 'category-2', userId: 'user-uuid-1', isDefault: false },
      ],
      ['default', { id: 'category-2', userId: null, isDefault: true }],
    ])('accepts a changed %s category', async (_label, category) => {
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.category.findFirst.mockResolvedValue(category);
      transactionMock.task.update.mockResolvedValue({
        ...MOCK_TASK,
        categoryId: 'category-2',
      });

      await service.update('user-uuid-1', 'task-uuid-1', {
        categoryId: 'category-2',
      });

      expect(transactionMock.category.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'category-2',
          OR: [{ userId: 'user-uuid-1' }, { isDefault: true }],
        },
        select: { id: true },
      });
      expect(transactionMock.task.update).toHaveBeenCalledTimes(1);
    });

    it.each(['missing', 'foreign'])(
      'rejects a changed %s category before writing the task',
      async () => {
        transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
        transactionMock.category.findFirst.mockResolvedValue(null);

        await expect(
          service.update('user-uuid-1', 'task-uuid-1', {
            categoryId: 'unassignable-category',
          }),
        ).rejects.toThrow(NotFoundException);

        expect(transactionMock.task.update).not.toHaveBeenCalled();
        expect(scoresMock.recompute).not.toHaveBeenCalled();
      },
    );

    it('recomputes each distinct UTC day with the transaction client', async () => {
      const movedTask = {
        ...MOCK_TASK,
        startAt: new Date('2026-06-04T06:00:00Z'),
      };
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue(movedTask);

      await service.update('user-uuid-1', 'task-uuid-1', {
        startAt: '2026-06-04T06:00:00Z',
      });

      expect(scoresMock.recompute).toHaveBeenNthCalledWith(
        1,
        'user-uuid-1',
        MOCK_TASK.startAt,
        transactionMock,
      );
      expect(scoresMock.recompute).toHaveBeenNthCalledWith(
        2,
        'user-uuid-1',
        movedTask.startAt,
        transactionMock,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes by setting deletedAt', async () => {
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue({
        ...MOCK_TASK,
        deletedAt: new Date(),
      });

      await service.remove('user-uuid-1', 'task-uuid-1');

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          taskId: 'task-uuid-1',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: { status: 'CANCELLED' },
      });
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          schedule: { taskId: 'task-uuid-1' },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          claimId: null,
          processingStartedAt: null,
          nextAttemptAt: null,
        },
      });
      expect(transactionMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            deletedAt: expect.any(Date),
          }),
        }),
      );
      expect(
        transactionMock.notificationSchedule.updateMany.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        transactionMock.notificationDelivery.updateMany.mock
          .invocationCallOrder[0],
      );
      expect(
        transactionMock.notificationDelivery.updateMany.mock
          .invocationCallOrder[0],
      ).toBeLessThan(transactionMock.task.update.mock.invocationCallOrder[0]);
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        MOCK_TASK.startAt,
        transactionMock,
      );
    });

    it('does not recompute scores when the task nested write fails', async () => {
      const writeError = new Error('task and schedule remove failed');
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockRejectedValue(writeError);

      await expect(service.remove('user-uuid-1', 'task-uuid-1')).rejects.toBe(
        writeError,
      );

      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('sets status COMPLETED and completedAt', async () => {
      const completedTask = {
        ...MOCK_TASK,
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      };
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue(completedTask);

      const result = await service.complete('user-uuid-1', 'task-uuid-1');

      expect(result.status).toBe(TaskStatus.COMPLETED);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          taskId: 'task-uuid-1',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: { status: 'CANCELLED' },
      });
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          schedule: { taskId: 'task-uuid-1' },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          claimId: null,
          processingStartedAt: null,
          nextAttemptAt: null,
        },
      });
      expect(transactionMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: TaskStatus.COMPLETED,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            completedAt: expect.any(Date),
          }),
        }),
      );
      expect(
        transactionMock.notificationSchedule.updateMany.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        transactionMock.notificationDelivery.updateMany.mock
          .invocationCallOrder[0],
      );
      expect(
        transactionMock.notificationDelivery.updateMany.mock
          .invocationCallOrder[0],
      ).toBeLessThan(transactionMock.task.update.mock.invocationCallOrder[0]);
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        completedTask.startAt,
        transactionMock,
      );
    });

    it('preserves the timestamp when an already completed task is completed again', async () => {
      const completedAt = new Date('2026-06-03T07:30:00.000Z');
      const completedTask = {
        ...MOCK_TASK,
        status: TaskStatus.COMPLETED,
        completedAt,
      };
      transactionMock.task.findFirst.mockResolvedValue(completedTask);
      transactionMock.task.update.mockResolvedValue(completedTask);

      await service.complete('user-uuid-1', 'task-uuid-1');

      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        data: {
          status: TaskStatus.COMPLETED,
          completedAt,
        },
      });
    });

    it('stamps a legacy completed task whose timestamp is null', async () => {
      const now = new Date('2026-06-03T08:30:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      const legacyTask = {
        ...MOCK_TASK,
        status: TaskStatus.COMPLETED,
        completedAt: null,
      };
      transactionMock.task.findFirst.mockResolvedValue(legacyTask);
      transactionMock.task.update.mockResolvedValue({
        ...legacyTask,
        completedAt: now,
      });

      await service.complete('user-uuid-1', 'task-uuid-1');

      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        data: {
          status: TaskStatus.COMPLETED,
          completedAt: now,
        },
      });
    });

    it('does not recompute scores when the task nested write fails', async () => {
      const writeError = new Error('task and schedule completion failed');
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockRejectedValue(writeError);

      await expect(service.complete('user-uuid-1', 'task-uuid-1')).rejects.toBe(
        writeError,
      );

      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });
  });
});
