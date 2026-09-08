import { randomUUID } from 'node:crypto';
import { PrismaClient, TaskDifficulty, type Prisma } from '@prisma/client';

const CONSTRAINT_NAME = 'Task_active_interval_order_check';

function requireDisposableDatabaseUrl(): string {
  if (process.env.F007_F009_DISPOSABLE_DB_TEST !== '1') {
    throw new Error('F-007/F-009 disposable database marker is required');
  }
  const raw = process.env.TASK_TEMPORAL_DATABASE_URL;
  if (!raw) {
    throw new Error('F-007/F-009 disposable database URL is required');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('F-007/F-009 disposable database URL is invalid');
  }
  const databaseName = url.pathname.slice(1);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    !databaseName.startsWith('f007_f009_task_temporal_') ||
    databaseName === 'dsm_test'
  ) {
    throw new Error(
      'F-007/F-009 database must be a loopback task-owned database',
    );
  }
  return raw;
}

const enabled = process.env.F007_F009_DISPOSABLE_DB_TEST === '1';
const databaseUrl = enabled ? requireDisposableDatabaseUrl() : undefined;
const describePostgres = enabled ? describe : describe.skip;

type ConstraintRow = {
  validated: boolean;
  definition: string;
};

function makeTaskData(
  id: string,
  userId: string,
  startAt: Date,
  endAt: Date,
  deletedAt?: Date,
): Prisma.TaskUncheckedCreateInput {
  return {
    id,
    userId,
    title: 'Temporal integrity test',
    startAt,
    endAt,
    difficulty: TaskDifficulty.MEDIUM,
    ...(deletedAt ? { deletedAt } : {}),
  };
}

describePostgres('task temporal integrity PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl! });
    userId = `task-temporal-${randomUUID()}`;
    await prisma.user.create({
      data: {
        id: userId,
        nickname: userId,
        onboardingCompletedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it('installs the staged active interval constraint', async () => {
    const rows = await prisma.$queryRaw<ConstraintRow[]>`
      SELECT
        constraint_record.convalidated AS validated,
        pg_get_constraintdef(constraint_record.oid, true) AS definition
      FROM pg_constraint AS constraint_record
      JOIN pg_class AS relation
        ON relation.oid = constraint_record.conrelid
      JOIN pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'Task'
        AND constraint_record.conname = ${CONSTRAINT_NAME}
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ validated: false });
    expect(rows[0].definition).toContain('"endAt" > "startAt"');
    expect(rows[0].definition).toContain('"deletedAt" IS NOT NULL');
  });

  it('rejects invalid active creates and updates atomically', async () => {
    const startAt = new Date('2026-09-09T01:00:00.000Z');
    const endAt = new Date('2026-09-09T02:00:00.000Z');
    const validId = randomUUID();
    await prisma.task.create({
      data: makeTaskData(validId, userId, startAt, endAt),
    });

    for (const invalidEndAt of [startAt, new Date(startAt.getTime() - 1)]) {
      const invalidId = randomUUID();
      await expect(
        prisma.task.create({
          data: makeTaskData(invalidId, userId, startAt, invalidEndAt),
        }),
      ).rejects.toThrow();
      await expect(
        prisma.task.count({ where: { id: invalidId } }),
      ).resolves.toBe(0);
    }

    await expect(
      prisma.task.update({
        where: { id: validId },
        data: { endAt: startAt },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.task.findUnique({ where: { id: validId } }),
    ).resolves.toMatchObject({ startAt, endAt });
  });

  it('allows an invalid legacy interval to be soft-deleted', async () => {
    const startAt = new Date('2026-09-09T03:00:00.000Z');
    const id = randomUUID();

    const deleted = await prisma.task.create({
      data: makeTaskData(id, userId, startAt, startAt, new Date()),
    });

    expect(deleted.id).toBe(id);
    expect(deleted.deletedAt).toBeInstanceOf(Date);
  });
});
