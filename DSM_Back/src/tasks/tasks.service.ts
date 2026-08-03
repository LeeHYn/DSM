import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Task, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScoresService } from '../scores/scores.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { TaskQueryDto } from './dto/task-query.dto';

const MAX_SERIALIZABLE_TRANSACTION_RETRIES = 2;
const NOTIFICATION_SCHEDULE_STATUS = {
  PENDING: 'PENDING',
  CANCELLED: 'CANCELLED',
} as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scores: ScoresService,
  ) {}

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    return this.runSerializableTransaction(async (client) => {
      if (dto.categoryId !== undefined) {
        await this.assertCategoryAssignable(userId, dto.categoryId, client);
      }

      const now = new Date();
      const startAt = new Date(dto.startAt);
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
          ...(this.isNotificationScheduleEligible(
            {
              notificationEnabled,
              status: TaskStatus.PENDING,
              deletedAt: null,
              startAt,
            },
            now,
          ) && {
            notificationSchedules: {
              create: {
                userId,
                scheduledAt: startAt,
                status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
              },
            },
          }),
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
      const existing = await this.findOneWithClient(userId, id, client);
      if (
        dto.categoryId !== undefined &&
        dto.categoryId !== existing.categoryId
      ) {
        await this.assertCategoryAssignable(userId, dto.categoryId, client);
      }

      const scheduleAffectingUpdate =
        dto.startAt !== undefined ||
        dto.notificationEnabled !== undefined ||
        dto.status !== undefined;
      const nextStartAt =
        dto.startAt !== undefined ? new Date(dto.startAt) : existing.startAt;
      const nextNotificationEnabled =
        dto.notificationEnabled ?? existing.notificationEnabled;
      const nextStatus = dto.status ?? existing.status;
      const now = new Date();
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
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          ...(dto.notificationEnabled !== undefined && {
            notificationEnabled: dto.notificationEnabled,
          }),
          ...(scheduleAffectingUpdate && {
            notificationSchedules: {
              updateMany: {
                where: { status: NOTIFICATION_SCHEDULE_STATUS.PENDING },
                data: { status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED },
              },
              ...(this.isNotificationScheduleEligible(
                {
                  notificationEnabled: nextNotificationEnabled,
                  status: nextStatus,
                  deletedAt: existing.deletedAt,
                  startAt: nextStartAt,
                },
                now,
              ) && {
                create: {
                  userId,
                  scheduledAt: nextStartAt,
                  status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
                },
              }),
            },
          }),
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
      await client.task.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          notificationSchedules: {
            updateMany: {
              where: { status: NOTIFICATION_SCHEDULE_STATUS.PENDING },
              data: { status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED },
            },
          },
        },
      });
      await this.scores.recompute(userId, task.startAt, client);
    });
  }

  async complete(userId: string, id: string): Promise<Task> {
    return this.runSerializableTransaction(async (client) => {
      await this.findOneWithClient(userId, id, client);
      const task = await client.task.update({
        where: { id },
        data: {
          status: TaskStatus.COMPLETED,
          completedAt: new Date(),
          notificationSchedules: {
            updateMany: {
              where: { status: NOTIFICATION_SCHEDULE_STATUS.PENDING },
              data: { status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED },
            },
          },
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

  private isNotificationScheduleEligible(
    task: Pick<
      Task,
      'notificationEnabled' | 'status' | 'deletedAt' | 'startAt'
    >,
    now: Date,
  ): boolean {
    return (
      task.notificationEnabled === true &&
      task.status === TaskStatus.PENDING &&
      task.deletedAt === null &&
      task.startAt > now
    );
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
