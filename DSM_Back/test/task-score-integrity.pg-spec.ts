import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { Prisma, PrismaClient as PrismaClientType } from '@prisma/client';

type DisposableDatabaseConfig = {
  emptyUrl: string;
  upgradeUrl: string;
  prefixSchemaPath: string;
};

function requireDisposableDatabaseConfig(): DisposableDatabaseConfig {
  if (process.env.F006_DISPOSABLE_DB_TEST !== '1') {
    throw new Error('F006 disposable database marker is required');
  }
  const emptyUrl = process.env.F006_EMPTY_DATABASE_URL;
  const upgradeUrl = process.env.F006_UPGRADE_DATABASE_URL;
  const prefixSchemaPath = process.env.F006_PREFIX_SCHEMA_PATH;
  if (!emptyUrl || !upgradeUrl || !prefixSchemaPath) {
    throw new Error('F006 disposable database configuration is incomplete');
  }
  if (!isAbsolute(prefixSchemaPath)) {
    throw new Error('F006 prefix schema path must be absolute');
  }
  const urls = [new URL(emptyUrl), new URL(upgradeUrl)];
  for (const url of urls) {
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error('F006 database protocol is invalid');
    }
    if (url.hostname !== '127.0.0.1') {
      throw new Error('F006 database host must be loopback');
    }
    if (!url.pathname.slice(1).startsWith('f006_task_score_integrity_')) {
      throw new Error('F006 database name is not task-owned');
    }
    if (url.pathname === '/dsm_test') {
      throw new Error('F006 refuses the common test database');
    }
  }
  if (!urls[0].port || !urls[1].port || urls[0].port === urls[1].port) {
    throw new Error('F006 databases require distinct explicit ports');
  }
  return { emptyUrl, upgradeUrl, prefixSchemaPath };
}

const config = requireDisposableDatabaseConfig();
process.env.DATABASE_URL = config.upgradeUrl;
const backendRoot = resolve(__dirname, '..');
const liveSchemaPath = join(backendRoot, 'prisma', 'schema.prisma');
const prismaCliPath = join(
  backendRoot,
  'node_modules',
  'prisma',
  'build',
  'index.js',
);
const migrationName = '20260830_enforce_task_score_integrity';
const migrationPath = join(
  backendRoot,
  'prisma',
  'migrations',
  migrationName,
  'migration.sql',
);
const atomicUrl = (() => {
  const url = new URL(config.upgradeUrl);
  url.pathname = '/f006_task_score_integrity_atomic';
  return url.toString();
})();

type PrismaRun = { status: number | null; stdout: string; stderr: string };

function runPrisma(
  args: string[],
  databaseUrl: string,
  input?: string,
): PrismaRun {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args], {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    input,
    shell: false,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function expectPrismaSuccess(result: PrismaRun): void {
  expect(result.status).toBe(0);
}

function executableStatements(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

type LedgerRow = {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

function ledger(client: PrismaClientType): Promise<LedgerRow[]> {
  return client.$queryRawUnsafe<LedgerRow[]>(
    'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at, migration_name',
  );
}

async function schemaSignature(client: PrismaClientType): Promise<unknown> {
  const columns = await client.$queryRawUnsafe<unknown[]>(
    `SELECT table_name, ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`,
  );
  const indexes = await client.$queryRawUnsafe<unknown[]>(
    `SELECT tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' ORDER BY tablename, indexname`,
  );
  const enums = await client.$queryRawUnsafe<unknown[]>(
    `SELECT type.typname, enum.enumlabel, enum.enumsortorder
       FROM pg_type AS type JOIN pg_enum AS enum ON enum.enumtypid = type.oid
       JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
      WHERE namespace.nspname = 'public' ORDER BY type.typname, enum.enumsortorder`,
  );
  return { columns, indexes, enums };
}

function day(offset: number): Date {
  return new Date(Date.UTC(2026, 0, 1 + offset));
}

function makeTasks(
  userId: string,
  scoreDay: Date,
  registered: number,
  completed: Array<'LOW' | 'MEDIUM' | 'HIGH'>,
  prefix: string,
): Prisma.TaskCreateManyInput[] {
  return Array.from({ length: registered }, (_, index) => {
    const startAt = new Date(scoreDay);
    startAt.setUTCHours(8, index % 60);
    const isCompleted = index < completed.length;
    return {
      id: `${prefix}-task-${index}`,
      userId,
      title: `${prefix}-${index}`,
      startAt,
      endAt: new Date(startAt.getTime() + 1_800_000),
      completedAt: isCompleted
        ? new Date(
            Date.UTC(
              scoreDay.getUTCFullYear(),
              scoreDay.getUTCMonth(),
              scoreDay.getUTCDate(),
              12,
            ),
          )
        : null,
      difficulty: isCompleted ? completed[index] : 'LOW',
      status: isCompleted ? 'COMPLETED' : 'PENDING',
      notificationEnabled: false,
    };
  });
}

async function createTasks(
  client: PrismaClientType,
  rows: Prisma.TaskCreateManyInput[],
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 400) {
    await client.task.createMany({ data: rows.slice(offset, offset + 400) });
  }
}

const dailyLiterals = [
  {
    registered: 3,
    completed: 1,
    difficulty: 'LOW',
    raw: 10,
    adjusted: 7,
    capped: 7,
    rate: '33.33',
  },
  {
    registered: 20,
    completed: 11,
    difficulty: 'LOW',
    raw: 110,
    adjusted: 77,
    capped: 77,
    rate: '55.00',
  },
  {
    registered: 20,
    completed: 12,
    difficulty: 'LOW',
    raw: 120,
    adjusted: 120,
    capped: 120,
    rate: '60.00',
  },
  {
    registered: 20,
    completed: 15,
    difficulty: 'LOW',
    raw: 150,
    adjusted: 150,
    capped: 150,
    rate: '75.00',
  },
  {
    registered: 20,
    completed: 16,
    difficulty: 'LOW',
    raw: 160,
    adjusted: 208,
    capped: 208,
    rate: '80.00',
  },
  {
    registered: 20,
    completed: 19,
    difficulty: 'LOW',
    raw: 190,
    adjusted: 247,
    capped: 247,
    rate: '95.00',
  },
  {
    registered: 20,
    completed: 20,
    difficulty: 'LOW',
    raw: 200,
    adjusted: 300,
    capped: 300,
    rate: '100.00',
  },
  {
    registered: 20,
    completed: 20,
    difficulty: 'HIGH',
    raw: 600,
    adjusted: 900,
    capped: 900,
    rate: '100.00',
  },
  {
    registered: 21,
    completed: 21,
    difficulty: 'HIGH',
    raw: 630,
    adjusted: 945,
    capped: 900,
    rate: '100.00',
  },
  {
    registered: 800,
    completed: 57,
    difficulty: 'LOW',
    raw: 570,
    adjusted: 399,
    capped: 399,
    rate: '7.13',
  },
] as const;

const tierLiterals = [
  { score: 999, tier: 'BRONZE' },
  { score: 1000, tier: 'SILVER' },
  { score: 2999, tier: 'SILVER' },
  { score: 3000, tier: 'GOLD' },
  { score: 6999, tier: 'GOLD' },
  { score: 7000, tier: 'PLATINUM' },
  { score: 14999, tier: 'PLATINUM' },
  { score: 15000, tier: 'DIAMOND' },
  { score: 29999, tier: 'DIAMOND' },
  { score: 30000, tier: 'MASTER' },
] as const;

function decompose(score: number): number[] {
  for (let a = Math.floor(score / 900); a >= 0; a -= 1) {
    const rest = score - a * 900;
    for (let b = Math.floor(rest / 50); b >= 0; b -= 1) {
      const tail = rest - b * 50;
      if (tail % 7 === 0) {
        return [
          ...Array<number>(a).fill(900),
          ...Array<number>(b).fill(50),
          ...Array<number>(tail / 7).fill(7),
        ];
      }
    }
  }
  throw new Error('Unrepresentable tier literal');
}

type SeedState = {
  fixedId: string;
  fixedCreatedAt: Date;
  missingUserId: string;
  staleUserId: string;
  noScoreUserId: string;
  rankingId: string;
  eligibilityUserId: string;
};

async function seedUpgrade(client: PrismaClientType): Promise<SeedState> {
  const rows: Prisma.TaskCreateManyInput[] = [];
  for (const [index, literal] of dailyLiterals.entries()) {
    const userId = `f006-daily-user-${index}`;
    await client.user.create({
      data: {
        id: userId,
        nickname: `f006-daily-${index}`,
        totalScore: 4444,
        tier: 'MASTER',
      },
    });
    rows.push(
      ...makeTasks(
        userId,
        day(index),
        literal.registered,
        Array<'LOW' | 'HIGH'>(literal.completed).fill(literal.difficulty),
        `f006-daily-${index}`,
      ),
    );
  }

  let tierDay = 40;
  for (const [index, literal] of tierLiterals.entries()) {
    const userId = `f006-tier-user-${index}`;
    await client.user.create({
      data: {
        id: userId,
        nickname: `f006-tier-${index}`,
        totalScore: 1,
        tier: 'BRONZE',
      },
    });
    for (const [partIndex, part] of decompose(literal.score).entries()) {
      const profile =
        part === 900
          ? { registered: 20, completed: Array<'HIGH'>(20).fill('HIGH') }
          : part === 50
            ? {
                registered: 3,
                completed: ['MEDIUM', 'HIGH'] as Array<'MEDIUM' | 'HIGH'>,
              }
            : { registered: 3, completed: ['LOW'] as Array<'LOW'> };
      rows.push(
        ...makeTasks(
          userId,
          day(tierDay),
          profile.registered,
          profile.completed,
          `f006-tier-${index}-${partIndex}`,
        ),
      );
      tierDay += 1;
    }
  }

  const eligibilityUserId = 'f006-eligibility-user';
  const eligibilityDay = day(20);
  await client.user.create({
    data: {
      id: eligibilityUserId,
      nickname: 'f006-eligibility',
      totalScore: 9,
      tier: 'MASTER',
    },
  });
  const eligibility = makeTasks(
    eligibilityUserId,
    eligibilityDay,
    5,
    ['MEDIUM', 'HIGH', 'HIGH', 'HIGH', 'HIGH'],
    'f006-eligibility',
  );
  eligibility[1].completedAt = new Date(eligibilityDay.getTime() - 1);
  eligibility[2].completedAt = new Date(eligibilityDay.getTime() + 86_400_000);
  eligibility[3].completedAt = new Date(eligibilityDay.getTime() + 129_600_000);
  eligibility[4].completedAt = null;
  rows.push(...eligibility);

  const staleUserId = 'f006-stale-user';
  const noScoreUserId = 'f006-no-score-user';
  await client.user.createMany({
    data: [
      {
        id: staleUserId,
        nickname: 'f006-stale',
        totalScore: 7777,
        tier: 'MASTER',
      },
      {
        id: noScoreUserId,
        nickname: 'f006-no-score',
        totalScore: 7777,
        tier: 'MASTER',
      },
    ],
  });
  rows.push({
    ...makeTasks(staleUserId, day(21), 1, ['HIGH'], 'f006-stale')[0],
    deletedAt: new Date(Date.UTC(2026, 0, 22)),
  });
  await createTasks(client, rows);

  const fixedId = 'f006-fixed-daily-score';
  const fixedCreatedAt = new Date(Date.UTC(2025, 0, 1));
  await client.dailyScore.createMany({
    data: [
      {
        id: fixedId,
        userId: 'f006-daily-user-0',
        scoreDate: day(0),
        registeredTaskCount: 99,
        completedTaskCount: 99,
        rawScore: 999,
        adjustedScore: 999,
        cappedScore: 900,
        achievementRate: 99,
        createdAt: fixedCreatedAt,
      },
      {
        id: 'f006-stale-daily-score',
        userId: staleUserId,
        scoreDate: day(21),
        registeredTaskCount: 8,
        completedTaskCount: 8,
        rawScore: 240,
        adjustedScore: 360,
        cappedScore: 360,
        achievementRate: 100,
        createdAt: fixedCreatedAt,
      },
    ],
  });
  const rankingId = 'f006-ranking-sentinel';
  await client.rankingSnapshot.create({
    data: {
      id: rankingId,
      userId: 'f006-daily-user-0',
      period: 'TOTAL',
      rank: 17,
      percentile: 42.5,
      score: 1234,
      snapshotAt: new Date(Date.UTC(2025, 5, 1)),
    },
  });
  return {
    fixedId,
    fixedCreatedAt,
    missingUserId: 'f006-daily-user-1',
    staleUserId,
    noScoreUserId,
    rankingId,
    eligibilityUserId,
  };
}

function normalizeScore(row: {
  id: string;
  userId: string;
  scoreDate: Date;
  registeredTaskCount: number;
  completedTaskCount: number;
  rawScore: number;
  adjustedScore: number;
  cappedScore: number;
  achievementRate: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
}): unknown {
  return {
    ...row,
    scoreDate: row.scoreDate.toISOString(),
    achievementRate: row.achievementRate.toString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

jest.setTimeout(300_000);

describe('F-006 task score integrity migration', () => {
  let PrismaClient: typeof import('@prisma/client').PrismaClient;
  let emptyClient: PrismaClientType;
  let upgradeClient: PrismaClientType;
  let atomicClient: PrismaClientType;
  let TaskDifficulty: typeof import('@prisma/client').TaskDifficulty;
  let computeDailyScore: typeof import('../src/scores/scores.policy').computeDailyScore;
  let tierForScore: typeof import('../src/scores/scores.policy').tierForScore;
  let PrismaService: typeof import('../src/prisma/prisma.service').PrismaService;
  let ScoresService: typeof import('../src/scores/scores.service').ScoresService;
  let TasksService: typeof import('../src/tasks/tasks.service').TasksService;
  let seed: SeedState;

  /* eslint-disable @typescript-eslint/no-require-imports -- Runtime imports intentionally follow the fail-closed environment guard. */
  beforeAll(async () => {
    const prisma = await import('@prisma/client');
    const policy =
      require('../src/scores/scores.policy') as typeof import('../src/scores/scores.policy');
    PrismaClient = prisma.PrismaClient;
    TaskDifficulty = prisma.TaskDifficulty;
    computeDailyScore = policy.computeDailyScore;
    tierForScore = policy.tierForScore;
    PrismaService = (
      require('../src/prisma/prisma.service') as typeof import('../src/prisma/prisma.service')
    ).PrismaService;
    ScoresService = (
      require('../src/scores/scores.service') as typeof import('../src/scores/scores.service')
    ).ScoresService;
    TasksService = (
      require('../src/tasks/tasks.service') as typeof import('../src/tasks/tasks.service')
    ).TasksService;
    emptyClient = new PrismaClient({ datasourceUrl: config.emptyUrl });
    upgradeClient = new PrismaClient({ datasourceUrl: config.upgradeUrl });
    atomicClient = new PrismaClient({ datasourceUrl: atomicUrl });
  });
  /* eslint-enable @typescript-eslint/no-require-imports */

  afterAll(async () => {
    await Promise.all([
      emptyClient?.$disconnect(),
      upgradeClient?.$disconnect(),
      atomicClient?.$disconnect(),
    ]);
  });

  it('owns one explicit Serializable transaction', () => {
    const statements = executableStatements(
      readFileSync(migrationPath, 'utf8'),
    );
    expect(statements[0]).toBe('BEGIN');
    expect(statements[1]).toBe('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it('deploys the complete six-migration chain on an empty database', async () => {
    expectPrismaSuccess(
      runPrisma(
        ['migrate', 'deploy', '--schema', liveSchemaPath],
        config.emptyUrl,
      ),
    );
    expectPrismaSuccess(
      runPrisma(
        ['migrate', 'status', '--schema', liveSchemaPath],
        config.emptyUrl,
      ),
    );
    const rows = await ledger(emptyClient);
    expect(rows).toHaveLength(6);
    expect(
      rows.every(
        (row) => row.finished_at !== null && row.rolled_back_at === null,
      ),
    ).toBe(true);
  });

  it('upgrades the pinned five-migration predecessor with dirty data', async () => {
    expectPrismaSuccess(
      runPrisma(
        ['migrate', 'deploy', '--schema', config.prefixSchemaPath],
        config.upgradeUrl,
      ),
    );
    expect(await ledger(upgradeClient)).toHaveLength(5);
    seed = await seedUpgrade(upgradeClient);
    expectPrismaSuccess(
      runPrisma(
        ['migrate', 'deploy', '--schema', liveSchemaPath],
        config.upgradeUrl,
      ),
    );
    expectPrismaSuccess(
      runPrisma(
        ['migrate', 'status', '--schema', liveSchemaPath],
        config.upgradeUrl,
      ),
    );
  });

  it('matches empty and upgraded schemas and migration checksums', async () => {
    const [emptyLedger, upgradeLedger, emptySchema, upgradeSchema] =
      await Promise.all([
        ledger(emptyClient),
        ledger(upgradeClient),
        schemaSignature(emptyClient),
        schemaSignature(upgradeClient),
      ]);
    expect(
      upgradeLedger.map(({ migration_name, checksum }) => ({
        migration_name,
        checksum,
      })),
    ).toEqual(
      emptyLedger.map(({ migration_name, checksum }) => ({
        migration_name,
        checksum,
      })),
    );
    expect(upgradeSchema).toEqual(emptySchema);
  });

  it('matches all daily literals and completion eligibility boundaries', async () => {
    for (const [index, literal] of dailyLiterals.entries()) {
      const score = await upgradeClient.dailyScore.findUniqueOrThrow({
        where: {
          userId_scoreDate: {
            userId: `f006-daily-user-${index}`,
            scoreDate: day(index),
          },
        },
      });
      const difficulties: import('@prisma/client').TaskDifficulty[] =
        Array.from(
          { length: literal.completed },
          () => TaskDifficulty[literal.difficulty],
        );
      expect(
        computeDailyScore({
          registeredTaskCount: literal.registered,
          completedDifficulties: difficulties,
        }),
      ).toEqual({
        registeredTaskCount: literal.registered,
        completedTaskCount: literal.completed,
        rawScore: literal.raw,
        adjustedScore: literal.adjusted,
        cappedScore: literal.capped,
        achievementRate: Number(literal.rate),
      });
      expect({
        registered: score.registeredTaskCount,
        completed: score.completedTaskCount,
        raw: score.rawScore,
        adjusted: score.adjustedScore,
        capped: score.cappedScore,
        rate: score.achievementRate.toFixed(2),
      }).toEqual({
        registered: literal.registered,
        completed: literal.completed,
        raw: literal.raw,
        adjusted: literal.adjusted,
        capped: literal.capped,
        rate: literal.rate,
      });
    }
    const eligibility = await upgradeClient.dailyScore.findUniqueOrThrow({
      where: {
        userId_scoreDate: {
          userId: seed.eligibilityUserId,
          scoreDate: day(20),
        },
      },
    });
    expect({
      registered: eligibility.registeredTaskCount,
      completed: eligibility.completedTaskCount,
      raw: eligibility.rawScore,
      adjusted: eligibility.adjustedScore,
      capped: eligibility.cappedScore,
      rate: eligibility.achievementRate.toFixed(2),
    }).toEqual({
      registered: 5,
      completed: 1,
      raw: 20,
      adjusted: 14,
      capped: 14,
      rate: '20.00',
    });
  });

  it('matches tier literals and repairs projection metadata without ranking writes', async () => {
    for (const [index, literal] of tierLiterals.entries()) {
      const user = await upgradeClient.user.findUniqueOrThrow({
        where: { id: `f006-tier-user-${index}` },
      });
      expect({ totalScore: user.totalScore, tier: user.tier }).toEqual({
        totalScore: literal.score,
        tier: literal.tier,
      });
      expect(tierForScore(literal.score)).toBe(literal.tier);
    }
    const fixed = await upgradeClient.dailyScore.findUniqueOrThrow({
      where: { id: seed.fixedId },
    });
    expect(fixed.createdAt).toEqual(seed.fixedCreatedAt);
    const missing = await upgradeClient.dailyScore.findUniqueOrThrow({
      where: {
        userId_scoreDate: { userId: seed.missingUserId, scoreDate: day(1) },
      },
    });
    expect(missing.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(missing.createdAt).toBeInstanceOf(Date);
    expect(missing.updatedAt).toBeInstanceOf(Date);
    const stale = await upgradeClient.dailyScore.findUniqueOrThrow({
      where: { id: 'f006-stale-daily-score' },
    });
    expect({
      registered: stale.registeredTaskCount,
      completed: stale.completedTaskCount,
      raw: stale.rawScore,
      adjusted: stale.adjustedScore,
      capped: stale.cappedScore,
      rate: stale.achievementRate.toFixed(2),
    }).toEqual({
      registered: 0,
      completed: 0,
      raw: 0,
      adjusted: 0,
      capped: 0,
      rate: '0.00',
    });
    const noScoreUser = await upgradeClient.user.findUniqueOrThrow({
      where: { id: seed.noScoreUserId },
    });
    expect({
      totalScore: noScoreUser.totalScore,
      tier: noScoreUser.tier,
    }).toEqual({
      totalScore: 0,
      tier: 'BRONZE',
    });
    expect(
      await upgradeClient.rankingSnapshot.findUnique({
        where: { id: seed.rankingId },
      }),
    ).toMatchObject({ id: seed.rankingId, rank: 17, score: 1234 });
  });

  it('rolls every projection back when the final user update fails', async () => {
    expectPrismaSuccess(
      runPrisma(
        ['migrate', 'deploy', '--schema', config.prefixSchemaPath],
        atomicUrl,
      ),
    );
    await atomicClient.user.create({
      data: {
        id: 'f006-atomic-user',
        nickname: 'f006-atomic',
        totalScore: 111,
        tier: 'GOLD',
      },
    });
    await createTasks(
      atomicClient,
      makeTasks('f006-atomic-user', day(0), 1, ['MEDIUM'], 'f006-atomic'),
    );
    await atomicClient.dailyScore.create({
      data: {
        id: 'f006-atomic-score',
        userId: 'f006-atomic-user',
        scoreDate: day(0),
        registeredTaskCount: 9,
        completedTaskCount: 9,
        rawScore: 270,
        adjustedScore: 405,
        cappedScore: 405,
        achievementRate: 100,
        createdAt: new Date(Date.UTC(2024, 0, 1)),
      },
    });
    const beforeUser = await atomicClient.user.findUniqueOrThrow({
      where: { id: 'f006-atomic-user' },
    });
    const beforeScore = normalizeScore(
      await atomicClient.dailyScore.findUniqueOrThrow({
        where: { id: 'f006-atomic-score' },
      }),
    );
    const triggerSql = `
      CREATE FUNCTION f006_reject_user_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'F006 forced failure'; END $$;
      CREATE TRIGGER f006_reject_user_update
      BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION f006_reject_user_update();`;
    expectPrismaSuccess(
      runPrisma(
        ['db', 'execute', '--stdin', '--schema', config.prefixSchemaPath],
        atomicUrl,
        triggerSql,
      ),
    );
    const failed = runPrisma(
      ['db', 'execute', '--file', migrationPath, '--schema', liveSchemaPath],
      atomicUrl,
    );
    expect(failed.status).not.toBe(0);
    expect(
      await atomicClient.user.findUniqueOrThrow({
        where: { id: 'f006-atomic-user' },
      }),
    ).toEqual(beforeUser);
    expect(
      normalizeScore(
        await atomicClient.dailyScore.findUniqueOrThrow({
          where: { id: 'f006-atomic-score' },
        }),
      ),
    ).toEqual(beforeScore);
  });

  it('is exactly-once and leaves projections unchanged on redeploy', async () => {
    const beforeScores = (
      await upgradeClient.dailyScore.findMany({
        orderBy: [{ userId: 'asc' }, { scoreDate: 'asc' }],
      })
    ).map(normalizeScore);
    const beforeUsers = await upgradeClient.user.findMany({
      orderBy: { id: 'asc' },
    });
    const result = runPrisma(
      ['migrate', 'deploy', '--schema', liveSchemaPath],
      config.upgradeUrl,
    );
    expectPrismaSuccess(result);
    expect(result.stdout).toContain('No pending migrations');
    expect(
      (await ledger(upgradeClient)).filter(
        (row) =>
          row.migration_name === migrationName && row.finished_at !== null,
      ),
    ).toHaveLength(1);
    expect(
      (
        await upgradeClient.dailyScore.findMany({
          orderBy: [{ userId: 'asc' }, { scoreDate: 'asc' }],
        })
      ).map(normalizeScore),
    ).toEqual(beforeScores);
    expect(
      await upgradeClient.user.findMany({ orderBy: { id: 'asc' } }),
    ).toEqual(beforeUsers);
  });

  it('allows one of two concurrent creates after nineteen active tasks', async () => {
    const userId = 'f006-concurrency-user';
    const scoreDay = day(25);
    await upgradeClient.user.create({
      data: { id: userId, nickname: 'f006-concurrency' },
    });
    await createTasks(
      upgradeClient,
      makeTasks(userId, scoreDay, 19, [], 'f006-concurrency-seed'),
    );
    const appPrisma = new PrismaService();
    const scores = new ScoresService(appPrisma);
    const tasks = new TasksService(appPrisma, scores);
    try {
      const mutationIds = {
        a: '00000000-0000-4000-8000-0000000000a1',
        b: '00000000-0000-4000-8000-0000000000b2',
      } as const;
      const create = (suffix: keyof typeof mutationIds) =>
        tasks.create(userId, {
          clientMutationId: mutationIds[suffix],
          title: `f006-concurrent-${suffix}`,
          startAt: new Date(scoreDay.getTime() + 64_800_000).toISOString(),
          endAt: new Date(scoreDay.getTime() + 68_400_000).toISOString(),
          difficulty: TaskDifficulty.LOW,
          notificationEnabled: false,
        });
      const results = await Promise.allSettled([create('a'), create('b')]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toMatchObject({
        message: 'Daily task limit reached',
        status: 409,
      });
      expect(
        await upgradeClient.task.count({
          where: {
            userId,
            deletedAt: null,
            startAt: { gte: scoreDay, lt: day(26) },
          },
        }),
      ).toBe(20);
    } finally {
      await appPrisma.$disconnect();
    }
  });

  it('deduplicates concurrent PostgreSQL create retries by client mutation ID', async () => {
    const userId = 'f083-idempotency-user';
    const clientMutationId = '08300000-0000-4000-8000-000000000001';
    const distinctMutationId = '08300000-0000-4000-8000-000000000002';
    const startAt = new Date(Date.now() + 7 * 86_400_000);
    startAt.setUTCMilliseconds(0);
    const endAt = new Date(startAt.getTime() + 3_600_000);
    const scoreDate = new Date(
      Date.UTC(
        startAt.getUTCFullYear(),
        startAt.getUTCMonth(),
        startAt.getUTCDate(),
      ),
    );
    const createInput = {
      clientMutationId,
      title: 'f083-idempotent-create',
      description: 'same canonical payload',
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      difficulty: TaskDifficulty.MEDIUM,
      notificationEnabled: true,
    };
    await upgradeClient.user.create({
      data: { id: userId, nickname: 'f083-idempotency' },
    });
    const appPrisma = new PrismaService();
    const scores = new ScoresService(appPrisma);
    const tasks = new TasksService(appPrisma, scores);
    try {
      const [first, replay] = await Promise.all([
        tasks.create(userId, createInput),
        tasks.create(userId, createInput),
      ]);

      expect(first.id).toBe(clientMutationId);
      expect(replay.id).toBe(clientMutationId);
      expect(
        await upgradeClient.task.count({
          where: {
            userId,
            title: createInput.title,
            deletedAt: null,
          },
        }),
      ).toBe(1);
      expect(
        await upgradeClient.dailyScore.findUniqueOrThrow({
          where: { userId_scoreDate: { userId, scoreDate } },
        }),
      ).toMatchObject({ registeredTaskCount: 1 });
      expect(
        await upgradeClient.notificationSchedule.count({
          where: { taskId: clientMutationId, userId },
        }),
      ).toBe(1);

      const distinct = await tasks.create(userId, {
        ...createInput,
        clientMutationId: distinctMutationId,
      });

      expect(distinct.id).toBe(distinctMutationId);
      expect(distinct.id).not.toBe(first.id);
      expect(
        await upgradeClient.task.count({
          where: {
            userId,
            title: createInput.title,
            deletedAt: null,
          },
        }),
      ).toBe(2);
      expect(
        await upgradeClient.dailyScore.findUniqueOrThrow({
          where: { userId_scoreDate: { userId, scoreDate } },
        }),
      ).toMatchObject({ registeredTaskCount: 2 });
      expect(
        await upgradeClient.notificationSchedule.count({
          where: {
            taskId: { in: [clientMutationId, distinctMutationId] },
            userId,
          },
        }),
      ).toBe(2);
    } finally {
      await appPrisma.$disconnect();
    }
  });
});
