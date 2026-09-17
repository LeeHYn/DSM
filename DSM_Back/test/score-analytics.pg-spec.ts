import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Prisma,
  PrismaClient,
  TaskDifficulty,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ScoresService } from '../src/scores/scores.service';

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

describePostgres('score analytics PostgreSQL integration (F077/F078)', () => {
  const ownedUserIds = new Set<string>();
  const ownedDefaultIds = new Set<string>();
  let prisma: PrismaClient;
  let module: TestingModule;
  let service: ScoresService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl! });
    module = await Test.createTestingModule({
      providers: [ScoresService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ScoresService);
    await prisma.$connect();
  });

  afterEach(async () => {
    if (prisma && ownedDefaultIds.size > 0) {
      await prisma.category.deleteMany({
        where: { id: { in: [...ownedDefaultIds] } },
      });
      ownedDefaultIds.clear();
    }
    // No notification schedules, deliveries or tokens are created by this suite.
    if (prisma && ownedUserIds.size > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: [...ownedUserIds] } },
      });
      ownedUserIds.clear();
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
        email: `all55-analytics-${suffix}@example.invalid`,
        nickname: `all55-analytics-${suffix}`,
      },
    });
    ownedUserIds.add(user.id);
    return user;
  }

  async function createCategory(
    userId: string | null,
    isDefault = false,
    color = '#654321',
  ) {
    const category = await prisma.category.create({
      data: {
        userId,
        isDefault,
        name: `all55-category-${randomUUID()}`,
        color: isDefault ? '#123456' : color,
      },
    });
    if (isDefault) ownedDefaultIds.add(category.id);
    return category;
  }

  function taskData(
    userId: string,
    start: string,
    overrides: Partial<Prisma.TaskCreateManyInput> = {},
  ): Prisma.TaskCreateManyInput {
    const startAt = new Date(start);
    return {
      id: randomUUID(),
      userId,
      title: `all55-analytics-${randomUUID()}`,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      completedAt: startAt,
      difficulty: TaskDifficulty.LOW,
      status: TaskStatus.COMPLETED,
      notificationEnabled: false,
      ...overrides,
    };
  }

  it('separates own/default/null buckets and hides other-user rows and foreign category metadata', async () => {
    const user = await createUser();
    const other = await createUser();
    const own = await createCategory(user.id);
    const defaultCategory = await createCategory(null, true);
    const foreign = await createCategory(other.id, false, '#abcdef');
    await createCategory(user.id); // Unused categories do not create a bucket.
    const start = '2028-02-29T12:00:00Z';
    await prisma.task.createMany({
      data: [
        taskData(user.id, start, { categoryId: own.id }),
        taskData(user.id, start, {
          categoryId: own.id,
          status: TaskStatus.PENDING,
          difficulty: TaskDifficulty.HIGH,
        }),
        taskData(user.id, start, {
          categoryId: defaultCategory.id,
          difficulty: TaskDifficulty.MEDIUM,
        }),
        taskData(user.id, start, { difficulty: TaskDifficulty.HIGH }),
        // Legacy invalid cross-owner linkage must collapse into unclassified.
        taskData(user.id, start, { categoryId: foreign.id }),
        taskData(user.id, start, {
          categoryId: own.id,
          difficulty: TaskDifficulty.HIGH,
          deletedAt: new Date(start),
        }),
        ...[own.id, defaultCategory.id, foreign.id, null].map((categoryId) =>
          taskData(other.id, start, {
            categoryId,
            difficulty: TaskDifficulty.HIGH,
          }),
        ),
      ],
    });

    const result = await service.getCategoryStatistics(
      user.id,
      '2028-02-29',
      '2028-02-29',
    );
    expect(result).toMatchObject({
      userId: user.id,
      from: '2028-02-29',
      to: '2028-02-29',
    });
    expect(result.categories).toHaveLength(3);
    const byId = new Map(result.categories.map((row) => [row.categoryId, row]));
    expect(byId.get(own.id)).toEqual({
      categoryId: own.id,
      name: own.name,
      color: own.color,
      registeredTaskCount: 2,
      completedTaskCount: 1,
      achievementRate: 50,
      rawScore: 10,
    });
    expect(byId.get(defaultCategory.id)).toEqual({
      categoryId: defaultCategory.id,
      name: defaultCategory.name,
      color: defaultCategory.color,
      registeredTaskCount: 1,
      completedTaskCount: 1,
      achievementRate: 100,
      rawScore: 20,
    });
    expect(byId.get(null)).toEqual({
      categoryId: null,
      name: '미분류',
      color: '#888888',
      registeredTaskCount: 2,
      completedTaskCount: 2,
      achievementRate: 100,
      rawScore: 40,
    });
    expect(result.categories.at(-1)?.categoryId).toBeNull();
    expect(JSON.stringify(result)).not.toContain(foreign.id);
    expect(JSON.stringify(result)).not.toContain(foreign.name);
    expect(JSON.stringify(result)).not.toContain(foreign.color);
    expect(JSON.stringify(result)).not.toContain(other.id);
  });

  it('counts only COMPLETED tasks completed on their starting UTC day', async () => {
    const user = await createUser();
    const start = '2028-02-29T12:00:00Z';
    await prisma.task.createMany({
      data: [
        taskData(user.id, '2028-02-29T00:00:00Z'),
        taskData(user.id, '2028-02-29T23:30:00Z', {
          completedAt: new Date('2028-03-01T08:45:00+09:00'),
          difficulty: TaskDifficulty.HIGH,
        }),
        taskData(user.id, start, {
          completedAt: new Date('2028-02-29T23:59:59.999Z'),
          difficulty: TaskDifficulty.MEDIUM,
        }),
        taskData(user.id, start, { status: TaskStatus.PENDING }),
        taskData(user.id, start, { status: TaskStatus.CANCELLED }),
        taskData(user.id, start, { completedAt: null }),
        taskData(user.id, start, {
          completedAt: new Date('2028-03-01T00:00:00Z'),
        }),
        taskData(user.id, start, {
          completedAt: new Date('2028-02-28T23:59:59.999Z'),
        }),
        taskData(user.id, start, { deletedAt: new Date(start) }),
      ],
    });
    const result = await service.getCategoryStatistics(
      user.id,
      '2028-02-29',
      '2028-02-29',
    );
    expect(result.categories).toEqual([
      {
        categoryId: null,
        name: '미분류',
        color: '#888888',
        registeredTaskCount: 8,
        completedTaskCount: 3,
        achievementRate: 37.5,
        rawScore: 60,
      },
    ]);
  });

  it('includes the first instant and last requested UTC day but excludes the next midnight', async () => {
    const user = await createUser();
    await prisma.task.createMany({
      data: [
        taskData(user.id, '2028-02-27T23:59:59.999Z', {
          difficulty: TaskDifficulty.HIGH,
        }),
        taskData(user.id, '2028-02-28T00:00:00Z'),
        taskData(user.id, '2028-02-29T23:59:59.999Z', {
          difficulty: TaskDifficulty.HIGH,
        }),
        taskData(user.id, '2028-03-01T00:00:00Z', {
          difficulty: TaskDifficulty.MEDIUM,
        }),
      ],
    });
    const result = await service.getCategoryStatistics(
      user.id,
      '2028-02-28',
      '2028-02-29',
    );
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]).toMatchObject({
      registeredTaskCount: 2,
      completedTaskCount: 2,
      achievementRate: 100,
      rawScore: 40,
    });
    const nextDay = await service.getCategoryStatistics(
      user.id,
      '2028-03-01',
      '2028-03-01',
    );
    expect(nextDay.categories[0]).toMatchObject({
      registeredTaskCount: 1,
      completedTaskCount: 1,
      rawScore: 20,
    });
  });

  it('returns uncapped category raw scores for legacy task volume', async () => {
    const user = await createUser();
    const category = await createCategory(user.id);
    await prisma.task.createMany({
      data: Array.from({ length: 40 }, () =>
        taskData(user.id, '2028-02-29T12:00:00Z', {
          categoryId: category.id,
          difficulty: TaskDifficulty.HIGH,
        }),
      ),
    });
    const result = await service.getCategoryStatistics(
      user.id,
      '2028-02-29',
      '2028-02-29',
    );
    expect(result.categories[0]).toMatchObject({
      categoryId: category.id,
      registeredTaskCount: 40,
      completedTaskCount: 40,
      achievementRate: 100,
      rawScore: 1200,
    });
  });

  it('reads stored Decimal rates and zero-fills leap day without leaking another owner or out-of-range dates', async () => {
    const user = await createUser();
    const other = await createUser();
    await prisma.dailyScore.createMany({
      data: [
        {
          userId: user.id,
          scoreDate: new Date('2028-02-28T00:00:00Z'),
          registeredTaskCount: 3,
          completedTaskCount: 1,
          achievementRate: new Prisma.Decimal('33.33'),
          cappedScore: 10,
        },
        {
          userId: user.id,
          scoreDate: new Date('2028-03-01T00:00:00Z'),
          registeredTaskCount: 3,
          completedTaskCount: 2,
          achievementRate: new Prisma.Decimal('66.67'),
          cappedScore: 50,
        },
        ...['2028-02-27', '2028-03-02'].map((date) => ({
          userId: user.id,
          scoreDate: new Date(`${date}T00:00:00Z`),
          registeredTaskCount: 9,
          completedTaskCount: 9,
          achievementRate: new Prisma.Decimal('100'),
          cappedScore: 900,
        })),
        {
          userId: other.id,
          scoreDate: new Date('2028-02-29T00:00:00Z'),
          registeredTaskCount: 9,
          completedTaskCount: 9,
          achievementRate: new Prisma.Decimal('100'),
          cappedScore: 900,
        },
      ],
    });
    const stored = await prisma.dailyScore.findUniqueOrThrow({
      where: {
        userId_scoreDate: {
          userId: user.id,
          scoreDate: new Date('2028-02-28T00:00:00Z'),
        },
      },
    });
    expect(Prisma.Decimal.isDecimal(stored.achievementRate)).toBe(true);
    const result = await service.getCalendar(
      user.id,
      '2028-02-28',
      '2028-03-01',
    );
    expect(result).toEqual({
      userId: user.id,
      from: '2028-02-28',
      to: '2028-03-01',
      days: [
        {
          date: '2028-02-28',
          registeredTaskCount: 3,
          completedTaskCount: 1,
          achievementRate: 33.33,
          cappedScore: 10,
        },
        {
          date: '2028-02-29',
          registeredTaskCount: 0,
          completedTaskCount: 0,
          achievementRate: 0,
          cappedScore: 0,
        },
        {
          date: '2028-03-01',
          registeredTaskCount: 3,
          completedTaskCount: 2,
          achievementRate: 66.67,
          cappedScore: 50,
        },
      ],
    });
    expect(
      result.days.every((day) => typeof day.achievementRate === 'number'),
    ).toBe(true);
  });

  it('returns 42 ordered zero days and no category buckets for an empty owner', async () => {
    const user = await createUser();
    const calendar = await service.getCalendar(
      user.id,
      '2028-02-01',
      '2028-03-13',
    );
    expect(calendar.days).toHaveLength(42);
    expect(calendar.days[0].date).toBe('2028-02-01');
    expect(calendar.days[41].date).toBe('2028-03-13');
    expect(new Set(calendar.days.map((day) => day.date)).size).toBe(42);
    expect(
      calendar.days.every(
        (day) =>
          day.registeredTaskCount === 0 &&
          day.completedTaskCount === 0 &&
          day.achievementRate === 0 &&
          day.cappedScore === 0,
      ),
    ).toBe(true);
    expect(
      await service.getCategoryStatistics(user.id, '2028-02-01', '2028-03-13'),
    ).toEqual({
      userId: user.id,
      from: '2028-02-01',
      to: '2028-03-13',
      categories: [],
    });
  });
});
