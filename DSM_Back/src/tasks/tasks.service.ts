import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Task, TaskStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScoresService } from '../scores/scores.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { TaskQueryDto } from './dto/task-query.dto';
import { MAX_DAILY_TASKS, utcDayRange } from './tasks.policy';

const SERIALIZABLE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

const SERIALIZATION_FAILURE_CODE = 'P2034';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scores: ScoresService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    const startAt = new Date(dto.startAt);
    const task = await this.runSerializableTaskMutation(async (tx) => {
      await this.assertDailyTaskLimit(tx, userId, startAt);

      return tx.task.create({
        data: {
          userId,
          title: dto.title,
          description: dto.description,
          startAt,
          endAt: new Date(dto.endAt),
          difficulty: dto.difficulty,
          categoryId: dto.categoryId,
          notificationEnabled: dto.notificationEnabled ?? true,
        },
      });
    });
    await this.notifications.upsertTaskSchedule(task);
    await this.scores.recompute(userId, task.startAt);
    return task;
  }

  findAll(userId: string, query: TaskQueryDto): Promise<Task[]> {
    const where: Prisma.TaskWhereInput = { userId, deletedAt: null };

    if (query.date) {
      const { start, end } = utcDayRange(query.date);
      where.startAt = { gte: start, lt: end };
    }

    return this.prisma.task.findMany({
      where,
      orderBy: { startAt: 'asc' },
    });
  }

  async findOne(userId: string, id: string): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async update(userId: string, id: string, dto: UpdateTaskDto): Promise<Task> {
    const existing = await this.findOne(userId, id);
    const startAt =
      dto.startAt !== undefined ? new Date(dto.startAt) : undefined;
    const data = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(startAt !== undefined && { startAt }),
      ...(dto.endAt !== undefined && { endAt: new Date(dto.endAt) }),
      ...(dto.difficulty !== undefined && { difficulty: dto.difficulty }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
      ...(dto.notificationEnabled !== undefined && {
        notificationEnabled: dto.notificationEnabled,
      }),
    };

    const task =
      startAt !== undefined && !this.isSameUtcDay(existing.startAt, startAt)
        ? await this.runSerializableTaskMutation(async (tx) => {
            await this.assertDailyTaskLimit(tx, userId, startAt, id);
            return tx.task.update({ where: { id }, data });
          })
        : await this.prisma.task.update({ where: { id }, data });

    await this.notifications.upsertTaskSchedule(task);
    await this.recomputeDays(userId, [existing.startAt, task.startAt]);
    return task;
  }

  async remove(userId: string, id: string): Promise<void> {
    const task = await this.findOne(userId, id);
    await this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.notifications.cancelTaskSchedule(userId, task.id);
    await this.scores.recompute(userId, task.startAt);
  }

  async complete(userId: string, id: string): Promise<Task> {
    await this.findOne(userId, id);
    const task = await this.prisma.task.update({
      where: { id },
      data: { status: TaskStatus.COMPLETED, completedAt: new Date() },
    });
    await this.notifications.cancelTaskSchedule(userId, task.id);
    await this.scores.recompute(userId, task.startAt);
    return task;
  }

  /** Recompute each distinct UTC day touched by a mutation. */
  private async recomputeDays(userId: string, dates: Date[]): Promise<void> {
    const seen = new Set<string>();
    for (const date of dates) {
      const key = date.toISOString().slice(0, 10);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      await this.scores.recompute(userId, date);
    }
  }

  private async assertDailyTaskLimit(
    tx: Prisma.TransactionClient,
    userId: string,
    reference: Date,
    excludedTaskId?: string,
  ): Promise<void> {
    const { start, end } = utcDayRange(reference);
    const count = await tx.task.count({
      where: {
        userId,
        deletedAt: null,
        ...(excludedTaskId !== undefined && { id: { not: excludedTaskId } }),
        startAt: { gte: start, lt: end },
      },
    });

    if (count >= MAX_DAILY_TASKS) {
      throw new ConflictException('Daily task limit exceeded');
    }
  }

  private async runSerializableTaskMutation<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          operation,
          SERIALIZABLE_TRANSACTION_OPTIONS,
        );
      } catch (error) {
        if (!this.isSerializationFailure(error)) {
          throw error;
        }

        if (attempt === 2) {
          throw new ConflictException(
            'Daily task limit exceeded; please retry',
          );
        }
      }
    }

    throw new ConflictException('Daily task limit exceeded; please retry');
  }

  private isSerializationFailure(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === SERIALIZATION_FAILURE_CODE
    );
  }

  private isSameUtcDay(left: Date, right: Date): boolean {
    return (
      utcDayRange(left).start.getTime() === utcDayRange(right).start.getTime()
    );
  }
}
