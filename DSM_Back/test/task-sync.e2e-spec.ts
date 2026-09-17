import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, Task, TaskDifficulty, TaskStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app.bootstrap';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { ScoresService } from '../src/scores/scores.service';
import { TasksController } from '../src/tasks/tasks.controller';
import { TasksService } from '../src/tasks/tasks.service';
import {
  hashSyncOperation,
  type SyncTaskOperation,
} from '../src/tasks/task-sync.policy';

describe('Task sync route and input binding (HTTP)', () => {
  let app: INestApplication<App>;
  const userId = 'sync-http-user';
  const taskId = '00000000-0000-4000-8000-000000000001';
  const mutationId = '00000000-0000-4000-8000-000000000002';
  const logicalTime = '2026-01-01T00:00:00.000Z';
  const task: Task = {
    id: taskId,
    userId,
    title: 'Saved task',
    description: null,
    categoryId: null,
    startAt: new Date('2028-02-29T09:00:00.000Z'),
    endAt: new Date('2028-02-29T10:00:00.000Z'),
    completedAt: null,
    difficulty: TaskDifficulty.LOW,
    status: TaskStatus.PENDING,
    notificationEnabled: false,
    createdAt: new Date(logicalTime),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    deletedAt: null,
  };
  const db = {
    task: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    taskSyncState: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const transaction = jest.fn(
    (work: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      work(db as unknown as Prisma.TransactionClient),
  );
  const recompute = jest.fn();
  const clockQuery = jest.fn();
  const databaseMocks = [
    clockQuery,
    transaction,
    ...Object.values(db.task),
    ...Object.values(db.taskSyncState),
    recompute,
  ];

  function operation(): Extract<SyncTaskOperation, { task: unknown }> {
    return {
      kind: 'replace',
      taskId,
      mutationId,
      updatedAt: logicalTime,
      task: {
        title: task.title,
        description: null,
        categoryId: null,
        startAt: task.startAt.toISOString(),
        endAt: task.endAt.toISOString(),
        difficulty: 'LOW',
        status: 'PENDING',
        notificationEnabled: false,
      },
    };
  }

  function assertNoDatabaseCalls() {
    for (const mock of databaseMocks) expect(mock).not.toHaveBeenCalled();
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        TasksService,
        {
          provide: PrismaService,
          useValue: { ...db, $transaction: transaction, $queryRaw: clockQuery },
        },
        { provide: ScoresService, useValue: { recompute } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<{ user: { sub: string } }>().user =
            { sub: userId };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.task.findUnique.mockResolvedValue(task);
    db.task.findFirst.mockResolvedValue(task);
    db.task.findMany.mockResolvedValue([task]);
    db.taskSyncState.findUnique.mockResolvedValue(null);
    db.taskSyncState.findMany.mockResolvedValue([]);
  });

  afterAll(async () => app.close());

  it('serves the authenticated owner clock as a no-store static route', async () => {
    clockQuery.mockResolvedValue([{ logicalTime: new Date(logicalTime) }]);
    const response = await request(app.getHttpServer())
      .get('/tasks/sync/clock?userId=foreign-owner')
      .expect('Cache-Control', 'no-store')
      .expect(200);
    expect(response.body).toMatchObject({
      userId,
      logicalTime: Date.parse(logicalTime),
    });
    expect(
      Number.isFinite(
        Date.parse((response.body as { serverTime: string }).serverTime),
      ),
    ).toBe(true);
    expect((clockQuery.mock.calls as unknown[][])[0].slice(1)).toEqual([
      userId,
    ]);
    expect(db.task.findFirst).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns HTTP 200 with a superseded projection for a valid stale replacement', async () => {
    const response = await request(app.getHttpServer())
      .post('/tasks/sync')
      .send(operation())
      .expect(200);
    expect(response.body).toMatchObject({
      mutationId,
      outcome: 'superseded',
      task: {
        id: taskId,
        startAt: task.startAt.toISOString(),
        syncUpdatedAt: task.updatedAt.toISOString(),
        syncMutationId: '',
      },
    });
    const body = response.body as { serverTime: string };
    expect(new Date(body.serverTime).toISOString()).toBe(body.serverTime);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(db.task.create).not.toHaveBeenCalled();
    expect(db.task.update).not.toHaveBeenCalled();
    expect(recompute).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'preserves boolean %s and explicit nulls through the global pipe on an exact replay',
    async (notificationEnabled) => {
      const input = operation();
      input.task.notificationEnabled = notificationEnabled;
      db.taskSyncState.findUnique.mockResolvedValue({
        taskId,
        updatedAt: new Date(input.updatedAt),
        mutationId,
        mutationHash: hashSyncOperation(input),
        createHash: null,
      });
      const response = await request(app.getHttpServer())
        .post('/tasks/sync')
        .send(input)
        .expect(200);
      expect(response.body).toMatchObject({ outcome: 'applied', mutationId });
      expect(db.taskSyncState.upsert).not.toHaveBeenCalled();
      expect(recompute).not.toHaveBeenCalled();
    },
  );

  const invalidBodies: [string, () => unknown][] = [
    ['null', () => null],
    ['array', () => [operation()]],
    ['unknown root field', () => ({ ...operation(), userId: 'attacker' })],
    [
      'client hash field',
      () => ({ ...operation(), mutationHash: 'a'.repeat(64) }),
    ],
    [
      'unknown nested field',
      () => ({
        ...operation(),
        task: { ...operation().task, completedAt: logicalTime },
      }),
    ],
    [
      'string boolean',
      () => ({
        ...operation(),
        task: { ...operation().task, notificationEnabled: 'false' },
      }),
    ],
    [
      'missing milliseconds',
      () => ({ ...operation(), updatedAt: '2026-01-01T00:00:00Z' }),
    ],
    [
      'offset timestamp',
      () => ({ ...operation(), updatedAt: '2026-01-01T09:00:00.000+09:00' }),
    ],
    [
      'impossible timestamp',
      () => ({ ...operation(), updatedAt: '2026-02-30T00:00:00.000Z' }),
    ],
    [
      'year zero',
      () => ({ ...operation(), updatedAt: '0000-01-01T00:00:00.000Z' }),
    ],
    [
      'invalid nested date',
      () => ({
        ...operation(),
        task: { ...operation().task, startAt: '2028-02-30T09:00:00.000Z' },
      }),
    ],
    [
      'future logical clock',
      () => ({
        ...operation(),
        updatedAt: new Date(Date.now() + 600_000).toISOString(),
      }),
    ],
    ['malformed UUID', () => ({ ...operation(), taskId: 'sync' })],
    [
      'non-v4 UUID',
      () => ({
        ...operation(),
        mutationId: '00000000-0000-1000-8000-000000000002',
      }),
    ],
    ['create ID mismatch', () => ({ ...operation(), kind: 'create' })],
  ];

  it.each(invalidBodies)(
    'rejects %s before database access',
    async (_name, input) => {
      await request(app.getHttpServer())
        .post('/tasks/sync')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(input()))
        .expect(400);
      assertNoDatabaseCalls();
    },
  );

  it('rejects malformed JSON before database access', async () => {
    await request(app.getHttpServer())
      .post('/tasks/sync')
      .set('Content-Type', 'application/json')
      .send('{"kind":')
      .expect(400);
    assertNoDatabaseCalls();
  });

  it('maps same-key different payload hashes to HTTP 409 without mutations', async () => {
    const input = operation();
    db.taskSyncState.findUnique.mockResolvedValue({
      taskId,
      updatedAt: new Date(input.updatedAt),
      mutationId,
      mutationHash: hashSyncOperation(input),
      createHash: null,
    });
    input.task.title = 'Different payload';
    await request(app.getHttpServer())
      .post('/tasks/sync')
      .send(input)
      .expect(409);
    expect(db.task.update).not.toHaveBeenCalled();
    expect(db.taskSyncState.upsert).not.toHaveBeenCalled();
  });

  it('uses authenticated ownership and returns 404 for another owner task', async () => {
    db.task.findUnique.mockResolvedValue({ ...task, userId: 'other-user' });
    await request(app.getHttpServer())
      .post('/tasks/sync')
      .send(operation())
      .expect(404);
    expect(db.taskSyncState.findUnique).not.toHaveBeenCalled();
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it('binds GET sync before :id and applies authenticated date, numeric limit and cursor scope', async () => {
    const response = await request(app.getHttpServer())
      .get('/tasks/sync')
      .query({ date: '2028-02-29', limit: '2', cursor: mutationId })
      .expect(200);
    const where = {
      userId,
      deletedAt: null,
      startAt: {
        gte: new Date('2028-02-29T00:00:00.000Z'),
        lt: new Date('2028-03-01T00:00:00.000Z'),
      },
    };
    expect(db.task.findFirst).toHaveBeenCalledWith({
      where: { ...where, id: mutationId },
      select: { id: true },
    });
    expect(db.task.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      take: 2,
      cursor: { id: mutationId },
      skip: 1,
    });
    expect(db.taskSyncState.findMany).toHaveBeenCalledWith({
      where: { taskId: { in: [taskId] } },
      take: 100,
    });
    expect(response.body).toEqual([
      expect.objectContaining({ id: taskId, syncMutationId: '' }),
    ]);
  });

  it.each([
    { limit: '101' },
    { limit: 'true' },
    { cursor: 'bad' },
    { userId: 'other' },
  ])(
    'rejects invalid GET sync query %j before database access',
    async (query) => {
      await request(app.getHttpServer())
        .get('/tasks/sync')
        .query(query)
        .expect(400);
      assertNoDatabaseCalls();
    },
  );

  it('returns 404 for a cursor outside the authenticated visible list', async () => {
    db.task.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/tasks/sync')
      .query({ cursor: mutationId })
      .expect(404);
    expect(db.task.findMany).not.toHaveBeenCalled();
    expect(db.taskSyncState.findMany).not.toHaveBeenCalled();
  });

  it('preserves legacy list/detail JSON and the mutation ID route', async () => {
    const list = await request(app.getHttpServer()).get('/tasks').expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .expect(200);
    expect(list.body).toEqual([detail.body]);
    expect(detail.body).not.toHaveProperty('syncUpdatedAt');
    expect(db.taskSyncState.findMany).not.toHaveBeenCalled();
    expect(db.task.findFirst).toHaveBeenCalledWith({
      where: { id: taskId, userId, deletedAt: null },
    });
    const issued = await request(app.getHttpServer())
      .post('/tasks/client-mutation-ids')
      .expect(200);
    const body = issued.body as { clientMutationId: string };
    expect(body.clientMutationId).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  });

  it('keeps legacy POST create at 201 with its existing replay contract', async () => {
    const response = await request(app.getHttpServer())
      .post('/tasks')
      .send({
        clientMutationId: taskId,
        ...operation().task,
        status: undefined,
      })
      .expect(201);
    expect(response.body).toMatchObject({ id: taskId, title: task.title });
    expect(response.body).not.toHaveProperty('outcome');
    expect(db.taskSyncState.findUnique).not.toHaveBeenCalled();
  });
});
