import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, TaskDifficulty } from '@prisma/client';
import { CategoriesService } from '../src/categories/categories.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ScoresService } from '../src/scores/scores.service';
import { TasksService } from '../src/tasks/tasks.service';

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

// Release the first two real transactions together before either takes the lock.
// Retried transactions pass through without waiting for another participant.
function transactionBarrier() {
  let arrivals = 0;
  let release!: () => void;
  let reject!: (error: Error) => void;
  const gate = new Promise<void>((resolve, fail) => {
    release = resolve;
    reject = fail;
  });
  const timeout = setTimeout(
    () =>
      reject(new Error('Concurrent category transaction barrier timed out')),
    10_000,
  );
  void gate.catch(() => undefined);
  return {
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

describePostgres('list pagination PostgreSQL integration (F042/F080)', () => {
  const ownedUserIds = new Set<string>();
  const ownedDefaultIds = new Set<string>();
  let prisma: PrismaClient;
  let module: TestingModule;
  let tasks: TasksService;
  let categories: CategoriesService;
  let barrier: ReturnType<typeof transactionBarrier> | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl! });
    const observedPrisma = prisma.$extends({
      query: {
        async $allOperations({ operation, args, query }) {
          if (operation === '$queryRaw' && barrier) {
            await barrier.arrive();
          }
          const result: unknown = await query(args);
          return result;
        },
      },
    });
    module = await Test.createTestingModule({
      providers: [
        TasksService,
        CategoriesService,
        ScoresService,
        { provide: PrismaService, useValue: observedPrisma },
      ],
    }).compile();
    tasks = module.get(TasksService);
    categories = module.get(CategoriesService);
    await prisma.$connect();
  });

  afterEach(async () => {
    barrier?.dispose();
    barrier = undefined;
    if (prisma && ownedDefaultIds.size > 0) {
      await prisma.category.deleteMany({
        where: { id: { in: [...ownedDefaultIds] } },
      });
      ownedDefaultIds.clear();
    }
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
        email: `all55-list-${suffix}@example.invalid`,
        nickname: `all55-list-${suffix}`,
      },
    });
    ownedUserIds.add(user.id);
    return user;
  }

  async function createTasks(userId: string, count: number) {
    const ids: string[] = Array.from({ length: count }, () =>
      randomUUID(),
    ).sort();
    await prisma.task.createMany({
      data: ids.map((id) => ({
        id,
        userId,
        title: `all55-list-${id}`,
        startAt: new Date('2026-06-03T06:00:00Z'),
        endAt: new Date('2026-06-03T07:00:00Z'),
        difficulty: TaskDifficulty.LOW,
        notificationEnabled: false,
      })),
    });
    return ids;
  }

  async function createCategories(
    userId: string | null,
    count: number,
    isDefault = false,
  ) {
    const ids: string[] = Array.from({ length: count }, () =>
      randomUUID(),
    ).sort();
    await prisma.category.createMany({
      data: ids.map((id) => ({
        id,
        userId,
        name: `all55-list-${id}`,
        color: '#123456',
        isDefault,
        createdAt: new Date('2026-06-03T06:00:00Z'),
      })),
    });
    if (isDefault) ids.forEach((id) => ownedDefaultIds.add(id));
    return ids;
  }

  it('reads 205 legacy tasks as 100 + 100 + 5 across equal microsecond sort keys', async () => {
    const user = await createUser();
    const ids = await createTasks(user.id, 205);
    const timestamp = '2026-06-03T06:00:00.000123Z';
    expect(
      await prisma.$executeRaw`
      UPDATE "Task" SET "startAt" = ${timestamp}::timestamptz
      WHERE "userId" = ${user.id} AND id = ANY(${ids}::text[])
    `,
    ).toBe(205);
    const precision = await prisma.$queryRaw<Array<{ fraction: string }>>`
      SELECT to_char("startAt", 'US') AS fraction FROM "Task"
      WHERE id = ${ids[99]} AND "userId" = ${user.id}
    `;
    expect(precision).toEqual([{ fraction: '000123' }]);

    // An omitted limit and even a direct oversized limit must remain bounded.
    const first = await tasks.findAll(user.id, {});
    const capped = await tasks.findAll(user.id, { limit: 1000 });
    expect(capped.map((task) => task.id)).toEqual(first.map((task) => task.id));
    const second = await tasks.findAll(user.id, { cursor: first[99].id });
    const third = await tasks.findAll(user.id, { cursor: second[99].id });
    expect([first.length, second.length, third.length]).toEqual([100, 100, 5]);
    const actualIds = [...first, ...second, ...third].map((task) => task.id);
    expect(actualIds).toEqual(ids);
    expect(new Set(actualIds).size).toBe(205);
    expect(await tasks.findAll(user.id, { cursor: third[4].id })).toEqual([]);
    const datedSecond = await tasks.findAll(user.id, {
      date: '2026-06-04T00:30:00+09:00',
      cursor: first[99].id,
    });
    expect(datedSecond.map((task) => task.id)).toEqual(
      second.map((task) => task.id),
    );
  }, 30_000);

  it('rejects foreign, deleted, missing and out-of-date task cursors with 404', async () => {
    const user = await createUser();
    const other = await createUser();
    const [activeId, deletedId] = await createTasks(user.id, 2);
    const [foreignId] = await createTasks(other.id, 1);
    await prisma.task.update({
      where: { id: deletedId },
      data: { deletedAt: new Date() },
    });
    for (const cursor of [foreignId, deletedId, randomUUID()]) {
      await expect(tasks.findAll(user.id, { cursor })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
    await expect(
      tasks.findAll(user.id, { date: '2026-06-04', cursor: activeId }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await tasks.findAll(user.id, {})).map((task) => task.id)).toEqual([
      activeId,
    ]);
  });

  it('traverses 205 personal/default fixtures exactly once with DB timestamp precision', async () => {
    const user = await createUser();
    const existingDefaults = await prisma.category.findMany({
      where: { isDefault: true },
      select: { id: true },
    });
    const personalIds = await createCategories(user.id, 200);
    const defaultIds = await createCategories(null, 5, true);
    const fixtureIds = [...personalIds, ...defaultIds];
    const timestamp = '2026-06-03T06:00:00.000123Z';
    expect(
      await prisma.$executeRaw`
      UPDATE "Category" SET "createdAt" = ${timestamp}::timestamptz
      WHERE id = ANY(${fixtureIds}::text[])
    `,
    ).toBe(205);
    const precision = await prisma.$queryRaw<Array<{ fraction: string }>>`
      SELECT to_char("createdAt", 'US') AS fraction FROM "Category"
      WHERE id = ${personalIds[99]} AND "userId" = ${user.id}
    `;
    expect(precision).toEqual([{ fraction: '000123' }]);
    const expected = await prisma.category.findMany({
      where: { OR: [{ userId: user.id }, { isDefault: true }] },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(expected).toHaveLength(205 + existingDefaults.length);
    const actualIds: string[] = [];
    const pageSizes: number[] = [];
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      const page = await categories.findAll(user.id, { cursor });
      expect(page.length).toBeLessThanOrEqual(100);
      pageSizes.push(page.length);
      actualIds.push(...page.map((category) => category.id));
      if (page.length < 100) break;
      cursor = page[page.length - 1].id;
    }
    expect(actualIds).toEqual(expected.map((category) => category.id));
    expect(new Set(actualIds).size).toBe(expected.length);
    expect(actualIds.filter((id) => fixtureIds.includes(id))).toHaveLength(205);
    if (existingDefaults.length === 0) expect(pageSizes).toEqual([100, 100, 5]);
    expect(
      await categories.findAll(user.id, { cursor: actualIds.at(-1) }),
    ).toEqual([]);
    const afterDefault = await categories.findAll(user.id, {
      cursor: defaultIds[4],
      limit: 1000,
    });
    const defaultIndex = expected.findIndex((row) => row.id === defaultIds[4]);
    expect(afterDefault.map((row) => row.id)).toEqual(
      expected.slice(defaultIndex + 1, defaultIndex + 101).map((row) => row.id),
    );
  }, 30_000);

  it('rejects foreign and missing category cursors while allowing a global default', async () => {
    const user = await createUser();
    const other = await createUser();
    const [foreignId] = await createCategories(other.id, 1);
    const [defaultId] = await createCategories(null, 1, true);
    for (const cursor of [foreignId, randomUUID()]) {
      await expect(
        categories.findAll(user.id, { cursor }),
      ).rejects.toMatchObject({ status: 404 });
    }
    await expect(
      categories.findAll(user.id, { cursor: defaultId }),
    ).resolves.toBeInstanceOf(Array);
  });

  it('allows only one of two concurrent creates at 49 personal categories, excluding defaults', async () => {
    const user = await createUser();
    await createCategories(user.id, 49);
    // The owner-linked default also proves the cap filters isDefault explicitly.
    await createCategories(user.id, 1, true);
    await createCategories(null, 1, true);
    barrier = transactionBarrier();
    const results = await Promise.allSettled(
      [randomUUID(), randomUUID()].map((suffix) =>
        categories.create(user.id, {
          name: `all55-race-${suffix}`,
          color: '#654321',
        }),
      ),
    );
    expect(barrier.arrivals).toBeGreaterThanOrEqual(2);
    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBeInstanceOf(ConflictException);
    expect(failures[0].reason).toMatchObject({ status: 409 });
    expect(
      await prisma.category.count({
        where: { userId: user.id, isDefault: false },
      }),
    ).toBe(50);
    expect(
      await prisma.category.count({
        where: { userId: user.id, isDefault: true },
      }),
    ).toBe(1);
  }, 30_000);
});
