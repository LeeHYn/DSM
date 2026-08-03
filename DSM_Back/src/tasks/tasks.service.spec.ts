import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma, type Task, TaskDifficulty, TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoresService } from '../scores/scores.service';
import type { UpdateTaskDto } from './dto/update-task.dto';

const MOCK_TASK: Task = {
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
type TaskMutationCall = [{ data: { notificationSchedules?: unknown } }];

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

    it('nests one PENDING schedule for an enabled future task', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-03T05:00:00Z'));
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);

      await service.create('user-uuid-1', {
        title: 'Morning run',
        startAt: '2026-06-03T06:00:00Z',
        endAt: '2026-06-03T07:00:00Z',
        difficulty: TaskDifficulty.MEDIUM,
      });

      expect(transactionMock.task.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-uuid-1',
          title: 'Morning run',
          description: undefined,
          startAt: new Date('2026-06-03T06:00:00Z'),
          endAt: new Date('2026-06-03T07:00:00Z'),
          difficulty: TaskDifficulty.MEDIUM,
          categoryId: undefined,
          notificationEnabled: true,
          notificationSchedules: {
            create: {
              userId: 'user-uuid-1',
              scheduledAt: new Date('2026-06-03T06:00:00Z'),
              status: 'PENDING',
            },
          },
        },
      });
    });

    it.each([
      ['past', '2026-06-03T04:59:59Z', true],
      ['equal-now', '2026-06-03T05:00:00Z', true],
      ['disabled', '2026-06-03T06:00:00Z', false],
    ])(
      'omits schedules for a %s task',
      async (_label, startAt, notificationEnabled) => {
        jest.useFakeTimers().setSystemTime(new Date('2026-06-03T05:00:00Z'));
        transactionMock.task.create.mockResolvedValue({
          ...MOCK_TASK,
          startAt: new Date(startAt),
          notificationEnabled,
        });

        await service.create('user-uuid-1', {
          title: 'Morning run',
          startAt,
          endAt: '2026-06-03T07:00:00Z',
          difficulty: TaskDifficulty.MEDIUM,
          notificationEnabled,
        });

        const createArgs = (
          transactionMock.task.create.mock.calls as TaskMutationCall[]
        )[0][0];
        expect(createArgs.data.notificationSchedules).toBeUndefined();
      },
    );

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

    it.each<[string, typeof MOCK_TASK, UpdateTaskDto, Date]>([
      [
        'startAt',
        MOCK_TASK,
        { startAt: '2026-06-03T08:00:00Z' },
        new Date('2026-06-03T08:00:00Z'),
      ],
      [
        'notificationEnabled',
        { ...MOCK_TASK, notificationEnabled: false },
        { notificationEnabled: true },
        MOCK_TASK.startAt,
      ],
      [
        'status',
        { ...MOCK_TASK, status: TaskStatus.COMPLETED },
        { status: TaskStatus.PENDING },
        MOCK_TASK.startAt,
      ],
    ])(
      'cancels PENDING schedules and creates one when %s makes the task eligible',
      async (_field, existing, dto, nextStartAt) => {
        jest.useFakeTimers().setSystemTime(new Date('2026-06-03T05:00:00Z'));
        transactionMock.task.findFirst.mockResolvedValue(existing);
        transactionMock.task.update.mockResolvedValue({
          ...existing,
          ...dto,
          startAt: nextStartAt,
        });

        await service.update('user-uuid-1', 'task-uuid-1', dto);

        const updateArgs = (
          transactionMock.task.update.mock.calls as TaskMutationCall[]
        )[0][0];
        expect(updateArgs.data.notificationSchedules).toEqual({
          updateMany: {
            where: { status: 'PENDING' },
            data: { status: 'CANCELLED' },
          },
          create: {
            userId: 'user-uuid-1',
            scheduledAt: nextStartAt,
            status: 'PENDING',
          },
        });
      },
    );

    it.each<[string, UpdateTaskDto]>([
      ['startAt', { startAt: '2026-06-03T05:00:00Z' }],
      ['notificationEnabled', { notificationEnabled: false }],
      ['status', { status: TaskStatus.COMPLETED }],
    ])(
      'only cancels PENDING schedules when %s makes the task ineligible',
      async (_field, dto) => {
        jest.useFakeTimers().setSystemTime(new Date('2026-06-03T05:00:00Z'));
        transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
        transactionMock.task.update.mockResolvedValue({
          ...MOCK_TASK,
          ...dto,
          startAt:
            dto.startAt !== undefined
              ? new Date(dto.startAt)
              : MOCK_TASK.startAt,
        });

        await service.update('user-uuid-1', 'task-uuid-1', dto);

        const updateArgs = (
          transactionMock.task.update.mock.calls as TaskMutationCall[]
        )[0][0];
        expect(updateArgs.data.notificationSchedules).toEqual({
          updateMany: {
            where: { status: 'PENDING' },
            data: { status: 'CANCELLED' },
          },
        });
      },
    );

    it('uses the disabled post-update state when startAt also moves to the future', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-03T05:00:00Z'));
      const nextStartAt = new Date('2026-06-03T08:00:00Z');
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue({
        ...MOCK_TASK,
        startAt: nextStartAt,
        notificationEnabled: false,
      });

      await service.update('user-uuid-1', 'task-uuid-1', {
        startAt: nextStartAt.toISOString(),
        notificationEnabled: false,
      });

      const updateArgs = (
        transactionMock.task.update.mock.calls as TaskMutationCall[]
      )[0][0];
      expect(updateArgs.data.notificationSchedules).toEqual({
        updateMany: {
          where: { status: 'PENDING' },
          data: { status: 'CANCELLED' },
        },
      });
    });

    it('uses all schedule fields to create one eligible replacement at the new startAt', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-03T05:00:00Z'));
      const existing = {
        ...MOCK_TASK,
        startAt: new Date('2026-06-03T04:00:00Z'),
        notificationEnabled: false,
        status: TaskStatus.COMPLETED,
      };
      const nextStartAt = new Date('2026-06-03T08:00:00Z');
      transactionMock.task.findFirst.mockResolvedValue(existing);
      transactionMock.task.update.mockResolvedValue({
        ...existing,
        startAt: nextStartAt,
        notificationEnabled: true,
        status: TaskStatus.PENDING,
      });

      await service.update('user-uuid-1', 'task-uuid-1', {
        startAt: nextStartAt.toISOString(),
        notificationEnabled: true,
        status: TaskStatus.PENDING,
      });

      const updateArgs = (
        transactionMock.task.update.mock.calls as TaskMutationCall[]
      )[0][0];
      expect(updateArgs.data.notificationSchedules).toEqual({
        updateMany: {
          where: { status: 'PENDING' },
          data: { status: 'CANCELLED' },
        },
        create: {
          userId: 'user-uuid-1',
          scheduledAt: nextStartAt,
          status: 'PENDING',
        },
      });
    });

    it.each<[string, UpdateTaskDto, typeof MOCK_TASK]>([
      ['title', { title: 'Evening run' }, MOCK_TASK],
      ['description', { description: 'Easy pace' }, MOCK_TASK],
      ['difficulty', { difficulty: TaskDifficulty.HIGH }, MOCK_TASK],
      [
        'category',
        { categoryId: 'category-1' },
        { ...MOCK_TASK, categoryId: 'category-1' },
      ],
    ])(
      'omits notificationSchedules for a %s-only update',
      async (_field, dto, existing) => {
        transactionMock.task.findFirst.mockResolvedValue(existing);
        transactionMock.task.update.mockResolvedValue({ ...existing, ...dto });

        await service.update('user-uuid-1', 'task-uuid-1', dto);

        const updateArgs = (
          transactionMock.task.update.mock.calls as TaskMutationCall[]
        )[0][0];
        expect(updateArgs.data).not.toHaveProperty('notificationSchedules');
      },
    );

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
          data: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            deletedAt: expect.any(Date),
            notificationSchedules: {
              updateMany: {
                where: { status: 'PENDING' },
                data: { status: 'CANCELLED' },
              },
            },
          }),
        }),
      );
      expect(scoresMock.recompute).toHaveBeenCalledTimes(1);
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
            notificationSchedules: {
              updateMany: {
                where: { status: 'PENDING' },
                data: { status: 'CANCELLED' },
              },
            },
          }),
        }),
      );
      expect(scoresMock.recompute).toHaveBeenCalledTimes(1);
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        completedTask.startAt,
        transactionMock,
      );
    });

    it('does not recompute when the nested completion mutation is rejected', async () => {
      const mutationError = new Error('nested task mutation failed');
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockRejectedValue(mutationError);

      await expect(service.complete('user-uuid-1', 'task-uuid-1')).rejects.toBe(
        mutationError,
      );

      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        data: {
          status: TaskStatus.COMPLETED,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          completedAt: expect.any(Date),
          notificationSchedules: {
            updateMany: {
              where: { status: 'PENDING' },
              data: { status: 'CANCELLED' },
            },
          },
        },
      });
      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });
  });
});
