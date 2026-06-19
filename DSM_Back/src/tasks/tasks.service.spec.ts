import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TaskDifficulty, TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoresService } from '../scores/scores.service';
import { NotificationsService } from '../notifications/notifications.service';

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

const makePrismaMock = () => ({
  task: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
});

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
