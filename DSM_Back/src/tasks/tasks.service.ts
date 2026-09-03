import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Task, TaskStatus } from '@prisma/client';
import {
  NOTIFICATION_DELIVERY_STATUS,
  NOTIFICATION_NONTERMINAL_STATUSES,
  NOTIFICATION_SCHEDULE_STATUS,
} from '../notifications/notification-schedule.constants';
import { PrismaService } from '../prisma/prisma.service';
import { ScoresService } from '../scores/scores.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { TaskQueryDto } from './dto/task-query.dto';

const MAX_SERIALIZABLE_TRANSACTION_RETRIES = 2;
const MAX_TASKS_PER_UTC_DAY = 20;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scores: ScoresService,
  ) {}

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    return this.runSerializableTransaction(async (client) => {
      const now = new Date();
      const startAt = new Date(dto.startAt);
      await this.assertDailyTaskCapacity(userId, startAt, undefined, client);
      if (dto.categoryId !== undefined) {
        await this.assertCategoryAssignable(userId, dto.categoryId, client);
      }

      const notificationEnabled = dto.notificationEnabled ?? true;
      const task = await client.task.create({
        data: {
          userId,
          title: dto.title,
          description: dto.description,
          startAt,
          endAt: new Date(dto.endAt),
          difficulty: dto.difficulty,
          categoryId: dto.categoryId,
          notificationEnabled,
          ...(notificationEnabled && startAt.getTime() > now.getTime()
            ? {
                notificationSchedules: {
                  create: {
                    userId,
                    scheduledAt: startAt,
                    status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
                  },
                },
              }
            : {}),
        },
      });
      await this.scores.recompute(userId, task.startAt, client);
      return task;
    });
  }

  findAll(userId: string, query: TaskQueryDto): Promise<Task[]> {
    const where: Prisma.TaskWhereInput = { userId, deletedAt: null };

    if (query.date) {
      const day = new Date(query.date);
      const nextDay = new Date(day);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      where.startAt = { gte: day, lt: nextDay };
    }

    return this.prisma.task.findMany({
      where,
      orderBy: { startAt: 'asc' },
    });
  }

  async findOne(userId: string, id: string): Promise<Task> {
    return this.findOneWithClient(userId, id, this.prisma);
  }

  async update(userId: string, id: string, dto: UpdateTaskDto): Promise<Task> {
    return this.runSerializableTransaction(async (client) => {
      const now = new Date();
      const existing = await this.findOneWithClient(userId, id, client);
      const nextStartAt =
        dto.startAt !== undefined ? new Date(dto.startAt) : existing.startAt;
      if (!this.isSameUtcDay(existing.startAt, nextStartAt)) {
        await this.assertDailyTaskCapacity(userId, nextStartAt, id, client);
      }
      if (
        dto.categoryId !== undefined &&
        dto.categoryId !== existing.categoryId
      ) {
        await this.assertCategoryAssignable(userId, dto.categoryId, client);
      }

      const nextNotificationEnabled =
        dto.notificationEnabled ?? existing.notificationEnabled;
      const nextStatus = dto.status ?? existing.status;
      const scheduleRelevantChange =
        (dto.startAt !== undefined &&
          nextStartAt.getTime() !== existing.startAt.getTime()) ||
        (dto.notificationEnabled !== undefined &&
          dto.notificationEnabled !== existing.notificationEnabled) ||
        (dto.status !== undefined && dto.status !== existing.status);
      const shouldSchedule =
        nextNotificationEnabled &&
        nextStatus === TaskStatus.PENDING &&
        nextStartAt.getTime() > now.getTime();
      const completionData =
        dto.status === TaskStatus.COMPLETED &&
        existing.status !== TaskStatus.COMPLETED
          ? { completedAt: now }
          : dto.status !== undefined &&
              dto.status !== TaskStatus.COMPLETED &&
              existing.status === TaskStatus.COMPLETED
            ? { completedAt: null }
            : {};

      if (scheduleRelevantChange) {
        await this.cancelNonterminalNotificationsForTask(id, client);
      }

      const task = await client.task.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.startAt !== undefined && { startAt: new Date(dto.startAt) }),
          ...(dto.endAt !== undefined && { endAt: new Date(dto.endAt) }),
          ...(dto.difficulty !== undefined && { difficulty: dto.difficulty }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...completionData,
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          ...(dto.notificationEnabled !== undefined && {
            notificationEnabled: dto.notificationEnabled,
          }),
          ...(scheduleRelevantChange && shouldSchedule
            ? {
                notificationSchedules: {
                  create: {
                    userId,
                    scheduledAt: nextStartAt,
                    status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
                  },
                },
              }
            : {}),
        },
      });
      await this.recomputeDays(
        userId,
        [existing.startAt, task.startAt],
        client,
      );
      return task;
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.runSerializableTransaction(async (client) => {
      const task = await this.findOneWithClient(userId, id, client);
      await this.cancelNonterminalNotificationsForTask(id, client);
      await client.task.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });
      await this.scores.recompute(userId, task.startAt, client);
    });
  }

  async complete(userId: string, id: string): Promise<Task> {
    return this.runSerializableTransaction(async (client) => {
      const now = new Date();
      const existing = await this.findOneWithClient(userId, id, client);
      await this.cancelNonterminalNotificationsForTask(id, client);
      const task = await client.task.update({
        where: { id },
        data: {
          status: TaskStatus.COMPLETED,
          completedAt:
            existing.status === TaskStatus.COMPLETED &&
            existing.completedAt !== null
              ? existing.completedAt
              : now,
        },
      });
      await this.scores.recompute(userId, task.startAt, client);
      return task;
    });
  }

  /**
   * Runs DB-only mutation callbacks at Serializable isolation. A P2034
   * conflict reruns the entire callback at most twice (three total attempts).
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

  private async cancelNonterminalNotificationsForTask(
    taskId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    await client.notificationSchedule.updateMany({
      where: {
        taskId,
        status: { in: [...NOTIFICATION_NONTERMINAL_STATUSES] },
      },
      data: { status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED },
    });
    await client.notificationDelivery.updateMany({
      where: {
        schedule: { taskId },
        status: { in: [...NOTIFICATION_NONTERMINAL_STATUSES] },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.CANCELLED,
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
  }

  private utcDayRange(reference: Date): { dayStart: Date; nextDay: Date } {
    const dayStart = new Date(
      Date.UTC(
        reference.getUTCFullYear(),
        reference.getUTCMonth(),
        reference.getUTCDate(),
      ),
    );
    const nextDay = new Date(dayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return { dayStart, nextDay };
  }

  private isSameUtcDay(left: Date, right: Date): boolean {
    return (
      left.getUTCFullYear() === right.getUTCFullYear() &&
      left.getUTCMonth() === right.getUTCMonth() &&
      left.getUTCDate() === right.getUTCDate()
    );
  }

  private async assertDailyTaskCapacity(
    userId: string,
    startAt: Date,
    excludedTaskId: string | undefined,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const { dayStart, nextDay } = this.utcDayRange(startAt);
    const count = await client.task.count({
      where: {
        userId,
        deletedAt: null,
        startAt: { gte: dayStart, lt: nextDay },
        ...(excludedTaskId ? { id: { not: excludedTaskId } } : {}),
      },
    });

    if (count >= MAX_TASKS_PER_UTC_DAY) {
      throw new ConflictException('Daily task limit reached');
    }
  }

  /** Recompute each distinct UTC day touched by a mutation. */
  private async recomputeDays(
    userId: string,
    dates: Date[],
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const seen = new Set<string>();
    for (const date of dates) {
      const key = date.toISOString().slice(0, 10);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      await this.scores.recompute(userId, date, client);
    }
  }

  private async findOneWithClient(
    userId: string,
    id: string,
    client: Prisma.TransactionClient,
  ): Promise<Task> {
    const task = await client.task.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private async assertCategoryAssignable(
    userId: string,
    categoryId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const category = await client.category.findFirst({
      where: { id: categoryId, OR: [{ userId }, { isDefault: true }] },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }
}
