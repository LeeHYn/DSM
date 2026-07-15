import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  category: { findFirst: jest.fn() },
});

type ClientMock = ReturnType<typeof makeClientMock>;

const makeTransactionConflict = () =>
  new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });

const makePrismaMock = (transactionMock: ClientMock) => ({
  ...makeClientMock(),
  $transaction: jest.fn(
    (callback: (client: ClientMock) => Promise<unknown>) =>
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
      expect(transactionMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        MOCK_TASK.startAt,
        transactionMock,
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
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue(completedTask);

      const result = await service.complete('user-uuid-1', 'task-uuid-1');

      expect(result.status).toBe(TaskStatus.COMPLETED);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
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
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        completedTask.startAt,
        transactionMock,
      );
    });
  });
});
