import { randomBytes, randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, TaskDifficulty } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ScoresService } from '../src/scores/scores.service';
import { TasksService } from '../src/tasks/tasks.service';
import type {
  SyncTaskFields,
  SyncTaskOperation,
} from '../src/tasks/task-sync.policy';

function requireDisposableDatabaseUrl(): string {
  const raw = process.env.ALL55_DATABASE_URL;
  if (process.env.ALL55_DISPOSABLE_DB_TEST !== '1' || !raw) {
    throw new Error('ALL55 disposable database marker and URL are required');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('ALL55 disposable database URL is invalid');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '55348' ||
    !/^\/all55_[a-zA-Z0-9_]+$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'ALL55 requires 127.0.0.1:55348/all55_* without URL query or fragment',
    );
  }
  return raw;
}

const enabled = process.env.ALL55_DISPOSABLE_DB_TEST === '1';
const databaseUrl = enabled ? requireDisposableDatabaseUrl() : undefined;
const describePostgres = enabled ? describe : describe.skip;
const DAY_MS = 86_400_000;
type CreateOperation = Extract<SyncTaskOperation, { task: SyncTaskFields }>;

function readBarrier(kind: 'identity' | 'capacity', key: string) {
  let arrivals = 0;
  let release!: () => void;
  let reject!: (error: Error) => void;
  const gate = new Promise<void>((resolve, fail) => {
    release = resolve;
    reject = fail;
  });
  const timeout = setTimeout(
    () => reject(new Error('Task sync concurrency barrier timed out')),
    10_000,
  );
  void gate.catch(() => undefined);
  return {
    kind,
    key,
    get arrivals() {
      return arrivals;
    },
    async arrive() {
      arrivals++;
      if (arrivals === 2) {
        clearTimeout(timeout);
        release();
      }
      await gate;
    },
    dispose() {
      clearTimeout(timeout);
      release();
    },
  };
}

describePostgres('task sync PostgreSQL integration (F076)', () => {
  const ownedUserIds = new Set<string>();
  const injectedFailure = new Error('Synthetic sync-state write failure');
  let prisma: PrismaClient;
  let module: TestingModule;
  let tasks: TasksService;
  let scores: ScoresService;
  let barrier: ReturnType<typeof readBarrier> | undefined;
  let failStateForTask: string | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl! });
    const observedPrisma = prisma.$extends({
      query: {
        task: {
          async findUnique({ args, query }) {
            const result = await query(args);
            const active = barrier;
            if (
              active?.kind === 'identity' &&
              active.key === args.where.id &&
              active.arrivals < 2 &&
              result === null
            ) {
              await active.arrive();
            }
            return result;
          },
          async count({ args, query }) {
            const result = await query(args);
            const active = barrier;
            if (
              active?.kind === 'capacity' &&
              active.key === args.where?.userId &&
              active.arrivals < 2 &&
              result === 19
            ) {
              await active.arrive();
            }
            return result;
          },
        },
        taskSyncState: {
          async upsert({ args, query }) {
            const result = await query(args);
            if (args.where.taskId === failStateForTask) {
              failStateForTask = undefined;
              throw injectedFailure;
            }
            return result;
          },
        },
      },
    });
    module = await Test.createTestingModule({
      providers: [
        TasksService,
        ScoresService,
        { provide: PrismaService, useValue: observedPrisma },
      ],
    }).compile();
    tasks = module.get(TasksService);
    scores = module.get(ScoresService);
    await prisma.$connect();
  });

  afterEach(async () => {
    jest.useRealTimers();
    barrier?.dispose();
    barrier = undefined;
    failStateForTask = undefined;
    if (prisma && ownedUserIds.size > 0) {
      const fixtureTasks = await prisma.task.findMany({
        where: { userId: { in: [...ownedUserIds] } },
        select: { id: true },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [...ownedUserIds] } },
      });
      ownedUserIds.clear();
      expect(
        await prisma.taskSyncState.count({
          where: { taskId: { in: fixtureTasks.map((task) => task.id) } },
        }),
      ).toBe(0);
    }
  });

  afterAll(async () => {
    try {
      await module?.close();
    } finally {
      await prisma?.$disconnect();
    }
  });

  async function createUser() {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `all55-sync-${suffix}@example.invalid`,
        nickname: `all55-sync-${suffix}`,
      },
    });
    ownedUserIds.add(user.id);
    return user;
  }

  function fields(overrides: Partial<SyncTaskFields> = {}): SyncTaskFields {
    const startAt = new Date(Date.now() + 2 * DAY_MS);
    startAt.setUTCHours(12, 0, 0, 0);
    return {
      title: 'Synthetic offline task',
      description: null,
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + 3_600_000).toISOString(),
      difficulty: 'HIGH',
      status: 'PENDING',
      categoryId: null,
      notificationEnabled: true,
      ...overrides,
    };
  }

  function createOperation(
    overrides: Partial<SyncTaskFields> = {},
  ): CreateOperation {
    const taskId = randomUUID();
    return {
      kind: 'create',
      taskId,
      mutationId: taskId,
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
      task: fields(overrides),
    };
  }

  function replacement(
    original: CreateOperation,
    overrides: Partial<SyncTaskFields> = {},
  ): CreateOperation {
    return {
      ...original,
      kind: 'replace',
      mutationId: randomUUID(),
      updatedAt: new Date(Date.parse(original.updatedAt) + 1000).toISOString(),
      task: { ...original.task, ...overrides },
    };
  }

  async function snapshot(userId: string, taskId: string) {
    return {
      task: await prisma.task.findUnique({ where: { id: taskId } }),
      state: await prisma.taskSyncState.findUnique({ where: { taskId } }),
      schedules: await prisma.notificationSchedule.findMany({
        where: { taskId },
        orderBy: { id: 'asc' },
      }),
      scores: await prisma.dailyScore.findMany({
        where: { userId },
        orderBy: { scoreDate: 'asc' },
      }),
      user: await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { totalScore: true, tier: true },
      }),
    };
  }

  async function createLegacyTasks(
    userId: string,
    count: number,
    taskFields = fields(),
  ) {
    const ids: string[] = Array.from({ length: count }, () =>
      randomUUID(),
    ).sort();
    await prisma.task.createMany({
      data: ids.map((id) => ({
        id,
        userId,
        title: `all55-legacy-${id}`,
        startAt: new Date(taskFields.startAt),
        endAt: new Date(taskFields.endAt),
        difficulty: TaskDifficulty.LOW,
        notificationEnabled: false,
      })),
    });
    return ids;
  }

  it('checkpoints all owner dates and tombstones without importing another account clock', async () => {
    const owner = await createUser();
    const other = await createUser();
    expect((await tasks.getSyncClock(owner.id)).logicalTime).toBe(0);
    const accepted = createOperation({ notificationEnabled: false });
    accepted.updatedAt = new Date(Date.now() + 240000).toISOString();
    await tasks.sync(owner.id, accepted);
    const foreign = createOperation({ notificationEnabled: false });
    foreign.updatedAt = new Date(Date.now() + 280000).toISOString();
    await tasks.sync(other.id, foreign);
    expect((await tasks.getSyncClock(owner.id)).logicalTime).toBe(
      Date.parse(accepted.updatedAt),
    );
    const removed = {
      kind: 'delete' as const,
      taskId: accepted.taskId,
      mutationId: randomUUID(),
      updatedAt: new Date(Date.parse(accepted.updatedAt) + 1000).toISOString(),
    };
    await tasks.sync(owner.id, removed);
    const checkpoint = await tasks.getSyncClock(owner.id);
    expect(checkpoint.logicalTime).toBe(Date.parse(removed.updatedAt));
    expect(Date.parse(checkpoint.serverTime)).toBeLessThan(
      checkpoint.logicalTime,
    );
  });

  it('uses legacy Task updatedAt when no sync state exists', async () => {
    const owner = await createUser();
    const ids = await createLegacyTasks(owner.id, 1);
    const legacy = await prisma.task.findUniqueOrThrow({
      where: { id: ids[0] },
    });
    expect(
      await prisma.taskSyncState.findUnique({ where: { taskId: ids[0] } }),
    ).toBeNull();
    expect((await tasks.getSyncClock(owner.id)).logicalTime).toBe(
      legacy.updatedAt.getTime(),
    );
  });

  it('preserves later edits when the original create ACK is lost and rejects changed create payloads', async () => {
    const user = await createUser();
    const category = await prisma.category.create({
      data: {
        userId: user.id,
        name: `all55-${randomUUID()}`,
        color: '#123456',
      },
    });
    const original = createOperation({
      categoryId: category.id,
      description: 'Original category and description',
    });
    const created = await tasks.sync(user.id, original);
    expect(created.outcome).toBe('applied');
    const first = await snapshot(user.id, original.taskId);
    expect(first.schedules).toHaveLength(1);
    expect(first.state?.createHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await tasks.sync(user.id, original)).outcome).toBe('applied');
    expect(await snapshot(user.id, original.taskId)).toEqual(first);

    const edit = replacement(original, {
      title: 'Saved after initial create',
      categoryId: null,
      description: null,
    });
    await tasks.sync(user.id, edit);
    const edited = await snapshot(user.id, original.taskId);
    const replay = await tasks.sync(user.id, original);
    expect(replay.outcome).toBe('superseded');
    expect(replay.task.title).toBe(edit.task.title);
    expect(replay.task.categoryId).toBeNull();
    expect(replay.task.description).toBeNull();
    expect(replay.task.syncUpdatedAt).toBe(edit.updatedAt);
    expect(edited.state?.createHash).toBe(first.state?.createHash);
    expect(await snapshot(user.id, original.taskId)).toEqual(edited);
    await expect(
      tasks.sync(user.id, {
        ...original,
        task: { ...original.task, title: 'Changed immutable create payload' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await snapshot(user.id, original.taskId)).toEqual(edited);
  });

  it('orders equal-time replacements by mutation UUID and rejects same-key changed hashes', async () => {
    const user = await createUser();
    const original = createOperation();
    await tasks.sync(user.id, original);
    const [lower, higher] = [randomUUID(), randomUUID()].sort();
    const low = {
      ...replacement(original, { title: 'lower' }),
      mutationId: lower,
    };
    const high = {
      ...low,
      mutationId: higher,
      task: { ...low.task, title: 'higher' },
    };
    expect((await tasks.sync(user.id, low)).outcome).toBe('applied');
    expect((await tasks.sync(user.id, high)).outcome).toBe('applied');
    const saved = await snapshot(user.id, original.taskId);
    expect((await tasks.sync(user.id, low)).outcome).toBe('superseded');
    expect((await tasks.sync(user.id, high)).outcome).toBe('applied');
    expect(
      (
        await tasks.sync(user.id, {
          ...low,
          updatedAt: original.updatedAt,
        })
      ).outcome,
    ).toBe('superseded');
    await expect(
      tasks.sync(user.id, {
        ...high,
        task: { ...high.task, description: 'different payload at same key' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await snapshot(user.id, original.taskId)).toEqual(saved);
  });

  it('hides another owner task for every operation and rejects foreign category assignment', async () => {
    const user = await createUser();
    const other = await createUser();
    const original = createOperation();
    await tasks.sync(other.id, original);
    const before = await snapshot(other.id, original.taskId);
    for (const operation of [
      original,
      replacement(original),
      {
        kind: 'delete',
        taskId: original.taskId,
        mutationId: randomUUID(),
        updatedAt: original.updatedAt,
      },
    ]) {
      await expect(tasks.sync(user.id, operation)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
    expect(await snapshot(other.id, original.taskId)).toEqual(before);
    const category = await prisma.category.create({
      data: {
        userId: other.id,
        name: `all55-${randomUUID()}`,
        color: '#123456',
      },
    });
    const invalid = createOperation({ categoryId: category.id });
    await expect(tasks.sync(user.id, invalid)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(
      await prisma.task.findUnique({ where: { id: invalid.taskId } }),
    ).toBeNull();
  });

  it('keeps deletion terminal across old create ACKs and all later replacements', async () => {
    const user = await createUser();
    const original = createOperation();
    await tasks.sync(user.id, original);
    const edit = replacement(original, { title: 'latest edit' });
    await tasks.sync(user.id, edit);
    const deletion: SyncTaskOperation = {
      kind: 'delete',
      taskId: original.taskId,
      mutationId: randomUUID(),
      updatedAt: new Date(Date.parse(original.updatedAt) - 1000).toISOString(),
    };
    expect((await tasks.sync(user.id, deletion)).outcome).toBe('deleted');
    const tombstone = await snapshot(user.id, original.taskId);
    expect(tombstone.task?.deletedAt).not.toBeNull();
    expect(tombstone.schedules.map((row) => row.status)).toEqual(['CANCELLED']);
    expect(tombstone.scores[0].registeredTaskCount).toBe(0);
    for (const operation of [
      deletion,
      original,
      edit,
      {
        ...replacement(edit, { title: 'must not resurrect' }),
        updatedAt: new Date().toISOString(),
      },
    ]) {
      const replay = await tasks.sync(user.id, operation);
      expect(replay.outcome).toBe('deleted');
      expect(replay.task.deletedAt).toEqual(tombstone.task?.deletedAt);
    }
    expect(await snapshot(user.id, original.taskId)).toEqual(tombstone);
    expect(await tasks.findAllForSync(user.id, {})).toEqual([]);
  });

  it('converges concurrent identical creates on one task, sync state and notification schedule', async () => {
    const user = await createUser();
    const original = createOperation();
    barrier = readBarrier('identity', original.taskId);
    const results = await Promise.allSettled([
      tasks.sync(user.id, original),
      tasks.sync(user.id, original),
    ]);
    expect(barrier.arrivals).toBe(2);
    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'fulfilled',
    ]);
    expect(
      results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value.task.id] : [],
      ),
    ).toEqual([original.taskId, original.taskId]);
    const saved = await snapshot(user.id, original.taskId);
    expect(saved.task?.id).toBe(original.taskId);
    expect(saved.state?.taskId).toBe(original.taskId);
    expect(saved.schedules).toHaveLength(1);
    expect(saved.scores).toHaveLength(1);
    expect(saved.scores[0].registeredTaskCount).toBe(1);
    expect(await prisma.task.count({ where: { userId: user.id } })).toBe(1);
  }, 30_000);

  it('allows only one concurrent create after 19 tasks on the same future UTC day', async () => {
    const user = await createUser();
    const first = createOperation();
    await createLegacyTasks(user.id, 19, first.task);
    const second = createOperation(first.task);
    barrier = readBarrier('capacity', user.id);
    const results = await Promise.allSettled([
      tasks.sync(user.id, first),
      tasks.sync(user.id, second),
    ]);
    expect(barrier.arrivals).toBe(2);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failed = results.filter((result) => result.status === 'rejected');
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(ConflictException);
    expect(failed[0].reason).toMatchObject({ status: 409 });
    expect(await prisma.task.count({ where: { userId: user.id } })).toBe(20);
    expect(
      await prisma.taskSyncState.count({
        where: { task: { userId: user.id } },
      }),
    ).toBe(1);
    expect(
      await prisma.notificationSchedule.count({ where: { userId: user.id } }),
    ).toBe(1);
    expect(
      (await scores.getDaily(user.id, first.task.startAt))?.registeredTaskCount,
    ).toBe(20);
  }, 30_000);

  it('advances sync versions after legacy PATCH and complete while retaining the original create hash', async () => {
    const user = await createUser();
    const original = createOperation();
    original.updatedAt = new Date(Date.now() + 240_000).toISOString();
    await tasks.sync(user.id, original);
    const initial = await prisma.taskSyncState.findUniqueOrThrow({
      where: { taskId: original.taskId },
    });
    await tasks.update(user.id, original.taskId, { title: 'Legacy PATCH' });
    const updated = await prisma.taskSyncState.findUniqueOrThrow({
      where: { taskId: original.taskId },
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      initial.updatedAt.getTime(),
    );
    expect(updated.mutationId).not.toBe(initial.mutationId);
    expect(updated.createHash).toBe(initial.createHash);
    await tasks.complete(user.id, original.taskId);
    const completed = await prisma.taskSyncState.findUniqueOrThrow({
      where: { taskId: original.taskId },
    });
    expect(completed.updatedAt.getTime()).toBeGreaterThan(
      updated.updatedAt.getTime(),
    );
    expect(completed.createHash).toBe(initial.createHash);
    const saved = await snapshot(user.id, original.taskId);
    expect((await tasks.sync(user.id, original)).task.status).toBe('COMPLETED');
    expect(
      (
        await tasks.sync(user.id, {
          ...replacement(original),
          updatedAt: original.updatedAt,
        })
      ).outcome,
    ).toBe('superseded');
    expect(await snapshot(user.id, original.taskId)).toEqual(saved);
  });

  it('stamps completion at server time and scores only that UTC day', async () => {
    const noon = new Date();
    noon.setUTCHours(12, 0, 0, 0);
    jest.useFakeTimers({
      now: noon,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    const user = await createUser();
    const startAt = new Date(noon.getTime() - 3_600_000).toISOString();
    const original = createOperation({ startAt, endAt: noon.toISOString() });
    await tasks.sync(user.id, original);
    const complete = replacement(original, { status: 'COMPLETED' });
    const result = await tasks.sync(user.id, complete);
    expect(result.task.completedAt).toEqual(noon);
    expect(result.serverTime).toBe(noon.toISOString());
    expect(result.task.completedAt?.toISOString()).not.toBe(complete.updatedAt);
    expect(await scores.getDaily(user.id, startAt)).toMatchObject({
      registeredTaskCount: 1,
      completedTaskCount: 1,
      rawScore: 30,
      cappedScore: 45,
    });
    expect(await scores.getSummary(user.id)).toMatchObject({ totalScore: 45 });
    const saved = await snapshot(user.id, original.taskId);
    expect((await tasks.sync(user.id, complete)).outcome).toBe('applied');
    expect(await snapshot(user.id, original.taskId)).toEqual(saved);
    const yesterday = createOperation({
      startAt: new Date(Date.parse(startAt) - DAY_MS).toISOString(),
      endAt: new Date(noon.getTime() - DAY_MS).toISOString(),
    });
    await tasks.sync(user.id, yesterday);
    await tasks.sync(user.id, replacement(yesterday, { status: 'COMPLETED' }));
    expect(
      await scores.getDaily(user.id, yesterday.task.startAt),
    ).toMatchObject({
      registeredTaskCount: 1,
      completedTaskCount: 0,
      rawScore: 0,
      cappedScore: 0,
    });
  });

  it.each(['create', 'replace'] as const)(
    'rolls back task, score, schedule and state after a %s state-write failure',
    async (kind) => {
      const user = await createUser();
      const original = createOperation();
      if (kind === 'replace') await tasks.sync(user.id, original);
      const operation =
        kind === 'create'
          ? original
          : replacement(original, {
              title: 'Move to another day',
              startAt: new Date(
                Date.parse(original.task.startAt) + DAY_MS,
              ).toISOString(),
              endAt: new Date(
                Date.parse(original.task.endAt) + DAY_MS,
              ).toISOString(),
            });
      const before = await snapshot(user.id, original.taskId);
      failStateForTask = original.taskId;
      await expect(tasks.sync(user.id, operation)).rejects.toBe(
        injectedFailure,
      );
      expect(failStateForTask).toBeUndefined();
      expect(await snapshot(user.id, original.taskId)).toEqual(before);
      expect((await tasks.sync(user.id, operation)).outcome).toBe('applied');
      const after = await snapshot(user.id, original.taskId);
      expect(after.state?.mutationId).toBe(operation.mutationId);
      expect(
        after.schedules.filter((row) => row.status === 'PENDING'),
      ).toHaveLength(1);
      expect(
        (await scores.getDaily(user.id, operation.task.startAt))
          ?.registeredTaskCount,
      ).toBe(1);
    },
  );

  it('projects typed sync metadata over real 100 + 100 + 5 pages without leaking deleted or foreign rows', async () => {
    const user = await createUser();
    const other = await createUser();
    const ids = await createLegacyTasks(user.id, 205);
    const [deletedId] = await createLegacyTasks(user.id, 1);
    const [foreignId] = await createLegacyTasks(other.id, 1);
    await prisma.task.update({
      where: { id: deletedId },
      data: { deletedAt: new Date() },
    });
    const logicalTime = new Date(Date.now() - 60_000);
    const mutationId = randomUUID();
    await prisma.taskSyncState.createMany({
      data: [ids[0], ids[100], deletedId, foreignId].map((taskId) => ({
        taskId,
        updatedAt: logicalTime,
        mutationId,
        mutationHash: randomBytes(32).toString('hex'),
        createHash: null,
      })),
    });
    const first = await tasks.findAllForSync(user.id, {});
    const second = await tasks.findAllForSync(user.id, {
      cursor: first[99].id,
    });
    const third = await tasks.findAllForSync(user.id, {
      cursor: second[99].id,
    });
    expect([first.length, second.length, third.length]).toEqual([100, 100, 5]);
    const all = [...first, ...second, ...third];
    expect(all.map((task) => task.id)).toEqual(ids);
    const date = first[0].startAt.toISOString().slice(0, 10);
    const dated = await tasks.findAllForSync(user.id, { date, limit: 1000 });
    expect(dated.map((task) => task.id)).toEqual(first.map((task) => task.id));
    for (const task of all) {
      expect(task.startAt).toBeInstanceOf(Date);
      expect(task.updatedAt).toBeInstanceOf(Date);
      const hasState = task.id === ids[0] || task.id === ids[100];
      expect(task.syncUpdatedAt).toBe(
        hasState ? logicalTime.toISOString() : task.updatedAt.toISOString(),
      );
      expect(task.syncMutationId).toBe(hasState ? mutationId : '');
    }
    await expect(
      tasks.findAllForSync(user.id, { cursor: foreignId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      tasks.findAllForSync(user.id, { cursor: deletedId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await tasks.findAllForSync(user.id, { cursor: third[4].id }),
    ).toEqual([]);
  }, 30_000);
});
