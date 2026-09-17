import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type Task, TaskStatus } from '@prisma/client';
import crypto from 'node:crypto';
import {
  NOTIFICATION_DELIVERY_STATUS,
  NOTIFICATION_NONTERMINAL_STATUSES,
  NOTIFICATION_SCHEDULE_STATUS,
} from '../notifications/notification-schedule.constants';
import { PrismaService } from '../prisma/prisma.service';
import { ScoresService } from '../scores/scores.service';
import { RealtimeBusService } from '../realtime/realtime-bus.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { TaskQueryDto } from './dto/task-query.dto';
import {
  decideSyncOperation,
  hashSyncOperation,
  nextLegacySyncTime,
  parseSyncOperation,
  syncVersionForTask,
  type SyncTaskState,
} from './task-sync.policy';

type TaskCreateFields = Omit<CreateTaskDto, 'description' | 'categoryId'> & {
  description?: string | null;
  categoryId?: string | null;
};
type TaskUpdateFields = Omit<UpdateTaskDto, 'description' | 'categoryId'> & {
  description?: string | null;
  categoryId?: string | null;
};
export type SyncTaskProjection = Task & {
  syncUpdatedAt: string;
  syncMutationId: string;
};

const MAX_SERIALIZABLE_TRANSACTION_RETRIES = 2;
const MAX_TASKS_PER_UTC_DAY = 20;
const MAX_TASK_PAGE_SIZE = 100;

export type TaskSyncResult = {
  mutationId: string;
  outcome: 'applied' | 'superseded' | 'deleted';
  task: SyncTaskProjection;
  serverTime: string;
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scores: ScoresService,
    @Optional() private readonly realtime?: RealtimeBusService,
  ) {}

  issueClientMutationId(): { clientMutationId: string } {
    return { clientMutationId: crypto.randomUUID() };
  }

  async getSyncClock(
    userId: string,
  ): Promise<{ userId: string; serverTime: string; logicalTime: number }> {
    // A date/page-limited view misses accepted versions on other days and tombstones.
    const [row] = await this.prisma.$queryRaw<
      Array<{ logicalTime: Date | null }>
    >`
      SELECT MAX(COALESCE(s."updatedAt", t."updatedAt")) AS "logicalTime"
      FROM "Task" t
      LEFT JOIN "TaskSyncState" s ON s."taskId" = t."id"
      WHERE t."userId" = ${userId}
    `;
    if (!row) throw new Error('Task sync clock unavailable');
    return {
      userId,
      serverTime: new Date().toISOString(),
      logicalTime: Math.max(0, row.logicalTime?.getTime() ?? 0),
    };
  }

  async sync(userId: string, input: unknown): Promise<TaskSyncResult> {
    const operation = parseSyncOperation(input);
    const result = await this.runSerializableTransaction<TaskSyncResult>(
      async (client) => {
        const existing = await client.task.findUnique({
          where: { id: operation.taskId },
        });
        if (existing && existing.userId !== userId)
          throw new NotFoundException('Task not found');
        const state = existing
          ? await client.taskSyncState.findUnique({
              where: { taskId: existing.id },
            })
          : null;
        const decision = decideSyncOperation(
          operation,
          existing ? { ...existing, state } : null,
        );
        const hash = hashSyncOperation(operation);
        if (decision !== 'apply') {
          return {
            mutationId: operation.mutationId,
            outcome:
              decision === 'deleted'
                ? 'deleted'
                : decision === 'replay' && state?.mutationHash === hash
                  ? 'applied'
                  : 'superseded',
            task: this.projectSyncTask(existing!, state),
            serverTime: new Date().toISOString(),
          };
        }
        let task: Task;
        if (operation.kind === 'create') {
          task = await this.createWithClient(
            userId,
            { ...operation.task, clientMutationId: operation.taskId },
            new Date(operation.task.startAt),
            new Date(operation.task.endAt),
            client,
          );
        } else if (operation.kind === 'replace') {
          task = await this.updateWithClient(
            userId,
            existing!,
            operation.task,
            client,
          );
        } else {
          task = await this.removeWithClient(userId, existing!, client);
        }
        const version = {
          updatedAt: new Date(operation.updatedAt),
          mutationId: operation.mutationId,
          mutationHash: hash,
        };
        const createHash =
          operation.kind === 'create' ? hash : (state?.createHash ?? null);
        await client.taskSyncState.upsert({
          where: { taskId: operation.taskId },
          create: { taskId: operation.taskId, ...version, createHash },
          update: version,
        });
        return {
          mutationId: operation.mutationId,
          outcome: operation.kind === 'delete' ? 'deleted' : 'applied',
          task: this.projectSyncTask(task, { ...version, createHash }),
          serverTime: new Date().toISOString(),
        };
      },
      true,
    );
    await this.signalMutation(userId);
    return result;
  }

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    const startAt = this.parseTaskDate(dto.startAt, 'startAt');
    const endAt = this.parseTaskDate(dto.endAt, 'endAt');
    this.assertTaskInterval(startAt, endAt);

    try {
      const result = await this.runSerializableTransaction(async (client) => {
        const existing = await client.task.findUnique({
          where: { id: dto.clientMutationId },
        });
        if (existing) {
          return this.resolveCreateReplay(
            userId,
            dto,
            existing,
            startAt,
            endAt,
          );
        }

        return this.createWithClient(userId, dto, startAt, endAt, client);
      });
      await this.signalMutation(userId);
      return result;
    } catch (error) {
      if (!this.isCreateRaceConflict(error)) {
        throw error;
      }

      const existing = await this.prisma.task.findUnique({
        where: { id: dto.clientMutationId },
      });
      if (!existing) {
        throw error;
      }
      return this.resolveCreateReplay(userId, dto, existing, startAt, endAt);
    }
  }

  async findAll(userId: string, query: TaskQueryDto): Promise<Task[]> {
    const where: Prisma.TaskWhereInput = { userId, deletedAt: null };
    const requestedLimit = query.limit ?? MAX_TASK_PAGE_SIZE;
    const take = Number.isInteger(requestedLimit)
      ? Math.min(MAX_TASK_PAGE_SIZE, Math.max(1, requestedLimit))
      : MAX_TASK_PAGE_SIZE;

    if (query.date) {
      const day = new Date(query.date);
      day.setUTCHours(0, 0, 0, 0);
      const nextDay = new Date(day);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      where.startAt = { gte: day, lt: nextDay };
    }

    if (query.cursor) {
      const cursor = await this.prisma.task.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true },
      });
      if (!cursor) {
        throw new NotFoundException('Task cursor not found');
      }
    }

    return this.prisma.task.findMany({
      where,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      take,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
  }

  async findAllForSync(
    userId: string,
    query: TaskQueryDto,
  ): Promise<SyncTaskProjection[]> {
    const tasks = await this.findAll(userId, query);
    if (tasks.length === 0) return [];
    const states = await this.prisma.taskSyncState.findMany({
      where: { taskId: { in: tasks.map((task) => task.id) } },
      take: MAX_TASK_PAGE_SIZE,
    });
    const byId = new Map(states.map((state) => [state.taskId, state]));
    return tasks.map((task) =>
      this.projectSyncTask(task, byId.get(task.id) ?? null),
    );
  }

  async findOne(userId: string, id: string): Promise<Task> {
    return this.findOneWithClient(userId, id, this.prisma);
  }

  async update(userId: string, id: string, dto: UpdateTaskDto): Promise<Task> {
    const result = await this.runSerializableTransaction(async (client) => {
      const existing = await this.findOneWithClient(userId, id, client);
      const task = await this.updateWithClient(userId, existing, dto, client);
      await this.advanceLegacySyncState(id, client);
      return task;
    });
    await this.signalMutation(userId);
    return result;
  }

  private async updateWithClient(
    userId: string,
    existing: Task,
    dto: TaskUpdateFields,
    client: Prisma.TransactionClient,
  ): Promise<Task> {
    const now = new Date();
    const id = existing.id;
    const nextStartAt =
      dto.startAt !== undefined
        ? this.parseTaskDate(dto.startAt, 'startAt')
        : existing.startAt;
    const nextEndAt =
      dto.endAt !== undefined
        ? this.parseTaskDate(dto.endAt, 'endAt')
        : existing.endAt;
    this.assertTaskInterval(nextStartAt, nextEndAt);
    if (!this.isSameUtcDay(existing.startAt, nextStartAt)) {
      await this.assertDailyTaskCapacity(userId, nextStartAt, id, client);
    }
    if (dto.categoryId != null && dto.categoryId !== existing.categoryId) {
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
        ...(dto.startAt !== undefined && { startAt: nextStartAt }),
        ...(dto.endAt !== undefined && { endAt: nextEndAt }),
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
    await this.recomputeDays(userId, [existing.startAt, task.startAt], client);
    return task;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.runSerializableTransaction(async (client) => {
      const existing = await this.findOneWithClient(userId, id, client);
      await this.removeWithClient(userId, existing, client);
      await this.advanceLegacySyncState(id, client);
    });
    await this.signalMutation(userId);
  }

  private async removeWithClient(
    userId: string,
    existing: Task,
    client: Prisma.TransactionClient,
  ): Promise<Task> {
    await this.cancelNonterminalNotificationsForTask(existing.id, client);
    const task = await client.task.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await this.scores.recompute(userId, existing.startAt, client);
    return task;
  }

  async complete(userId: string, id: string): Promise<Task> {
    const result = await this.runSerializableTransaction(async (client) => {
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
      await this.advanceLegacySyncState(id, client);
      return task;
    });
    await this.signalMutation(userId);
    return result;
  }

  private async signalMutation(userId: string): Promise<void> {
    try {
      await this.realtime?.publishInvalidation({ kind: 'user', userId }, [
        'scores',
        'reminders',
      ]);
    } catch {
      // Committed mutations converge through the client's periodic REST refresh.
    }
  }

  private async createWithClient(
    userId: string,
    dto: TaskCreateFields,
    startAt: Date,
    endAt: Date,
    client: Prisma.TransactionClient,
  ): Promise<Task> {
    const now = new Date();
    await this.assertDailyTaskCapacity(userId, startAt, undefined, client);
    if (dto.categoryId != null) {
      await this.assertCategoryAssignable(userId, dto.categoryId, client);
    }

    const notificationEnabled = dto.notificationEnabled ?? true;
    const task = await client.task.create({
      data: {
        id: dto.clientMutationId,
        userId,
        title: dto.title,
        description: dto.description,
        startAt,
        endAt,
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
  }

  private async advanceLegacySyncState(
    taskId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const state = await client.taskSyncState.findUnique({ where: { taskId } });
    if (!state) return;
    const updatedAt = nextLegacySyncTime(state.updatedAt);
    const mutationId = crypto.randomUUID();
    const mutationHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify(['legacy', taskId, updatedAt.toISOString(), mutationId]),
      )
      .digest('hex');
    await client.taskSyncState.update({
      where: { taskId },
      data: { updatedAt, mutationId, mutationHash },
    });
  }

  private projectSyncTask(
    task: Task,
    state: SyncTaskState | null,
  ): SyncTaskProjection {
    const version = syncVersionForTask(task.updatedAt, state);
    return {
      ...task,
      syncUpdatedAt: new Date(version.updatedAt).toISOString(),
      syncMutationId: version.mutationId,
    };
  }

  /**
   * Runs DB-only mutation callbacks at Serializable isolation. A P2034
   * conflict reruns the entire callback at most twice (three total attempts).
   */
  private async runSerializableTransaction<T>(
    operation: (client: Prisma.TransactionClient) => Promise<T>,
    retryUniqueConflict = false,
  ): Promise<T> {
    for (let retry = 0; ; retry += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !(
            this.isRetryableTransactionConflict(error) ||
            (retryUniqueConflict && this.isSyncIdentityConflict(error))
          ) ||
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

  private isSyncIdentityConflict(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    )
      return false;
    const target = error.meta?.target;
    return (
      Array.isArray(target) &&
      target.length === 1 &&
      (target[0] === 'id' || target[0] === 'taskId')
    );
  }

  private isCreateRaceConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    );
  }

  private resolveCreateReplay(
    userId: string,
    dto: CreateTaskDto,
    task: Task,
    startAt: Date,
    endAt: Date,
  ): Task {
    const matches =
      task.userId === userId &&
      task.deletedAt === null &&
      task.title === dto.title &&
      task.description === (dto.description ?? null) &&
      task.startAt.getTime() === startAt.getTime() &&
      task.endAt.getTime() === endAt.getTime() &&
      task.difficulty === dto.difficulty &&
      task.categoryId === (dto.categoryId ?? null) &&
      task.notificationEnabled === (dto.notificationEnabled ?? true);

    if (!matches) {
      throw new ConflictException();
    }
    return task;
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

  private parseTaskDate(value: unknown, field: 'startAt' | 'endAt'): Date {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be an ISO 8601 date string`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be an ISO 8601 date string`);
    }
    return parsed;
  }

  private assertTaskInterval(startAt: Date, endAt: Date): void {
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException('endAt must be after startAt');
    }
  }

  private utcDayRange(reference: Date): { dayStart: Date; nextDay: Date } {
    const dayStart = new Date(reference);
    dayStart.setUTCHours(0, 0, 0, 0);
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
