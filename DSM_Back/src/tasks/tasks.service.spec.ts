import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Task, TaskDifficulty, TaskStatus } from '@prisma/client';
import crypto from 'node:crypto';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoresService } from '../scores/scores.service';
import { RealtimeBusService } from '../realtime/realtime-bus.service';
import {
  hashSyncOperation,
  parseSyncOperation,
  type SyncTaskOperation,
} from './task-sync.policy';

const CLIENT_MUTATION_ID = '0cfe1042-769f-4d19-88bc-7a0d710553ca';

describe('owner-wide sync clock checkpoint', () => {
  const raw = jest.fn();
  const service = new TasksService(
    { $queryRaw: raw } as unknown as PrismaService,
    {} as ScoresService,
  );
  beforeEach(() => raw.mockReset());

  it('returns zero logical floor for an owner without tasks and a current server clock', async () => {
    raw.mockResolvedValue([{ logicalTime: null }]);
    const before = Date.now();
    const result = await service.getSyncClock('clock-owner');
    expect(result.logicalTime).toBe(0);
    expect(Date.parse(result.serverTime)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(result.serverTime)).toBeLessThanOrEqual(Date.now());
    expect((raw.mock.calls as unknown[][])[0].slice(1)).toEqual([
      'clock-owner',
    ]);
    expect(result.userId).toBe('clock-owner');
  });

  it('preserves the full accepted future logical floor', async () => {
    const accepted = new Date(Date.now() + 240000);
    raw.mockResolvedValue([{ logicalTime: accepted }]);
    expect((await service.getSyncClock('clock-owner')).logicalTime).toBe(
      accepted.getTime(),
    );
  });

  it('never converts a database failure into an unsafe zero checkpoint', async () => {
    raw.mockRejectedValue(new Error('database unavailable'));
    await expect(service.getSyncClock('clock-owner')).rejects.toThrow();
  });
});
const SECOND_CLIENT_MUTATION_ID = 'b6bcc7b5-a5d1-4ddd-ae80-b9d6be5193cf';

type CreateTaskFixture = {
  clientMutationId: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  difficulty: TaskDifficulty;
  categoryId?: string;
  notificationEnabled?: boolean;
};

const makeCreateTaskDto = (
  overrides: Partial<CreateTaskFixture> = {},
): CreateTaskFixture => ({
  clientMutationId: CLIENT_MUTATION_ID,
  title: 'Morning run',
  startAt: '2026-06-03T06:00:00Z',
  endAt: '2026-06-03T07:00:00Z',
  difficulty: TaskDifficulty.MEDIUM,
  ...overrides,
});

const MOCK_TASK: Task = {
  id: 'task-uuid-1',
  title: 'Morning run',
  description: null,
  startAt: new Date('2026-06-03T06:00:00Z'),
  endAt: new Date('2026-06-03T07:00:00Z'),
  completedAt: null,
  difficulty: TaskDifficulty.MEDIUM,
  status: TaskStatus.PENDING,
  notificationEnabled: true,
  userId: 'user-uuid-1',
  categoryId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const makePersistedCreateTask = (
  dto: CreateTaskFixture,
  overrides: Partial<Task> = {},
): Task => ({
  ...MOCK_TASK,
  id: dto.clientMutationId,
  title: dto.title,
  description: dto.description ?? null,
  startAt: new Date(dto.startAt),
  endAt: new Date(dto.endAt),
  difficulty: dto.difficulty,
  notificationEnabled: dto.notificationEnabled ?? true,
  categoryId: dto.categoryId ?? null,
  ...overrides,
});

const CREATE_CONFLICT_CASES: Array<
  [string, Partial<CreateTaskFixture>, Partial<Task>]
> = [
  ['a changed title', { title: 'Evening run' }, {}],
  ['a changed description', { description: 'Intervals' }, {}],
  ['a changed start time', { startAt: '2026-06-03T06:30:00Z' }, {}],
  ['a changed end time', { endAt: '2026-06-03T07:30:00Z' }, {}],
  ['a changed difficulty', { difficulty: TaskDifficulty.HIGH }, {}],
  ['a changed category', { categoryId: 'category-2' }, {}],
  ['a changed notification setting', { notificationEnabled: false }, {}],
  ['a foreign owner', {}, { userId: 'user-uuid-2' }],
  ['a soft-deleted task', {}, { deletedAt: new Date('2026-06-04T00:00:00Z') }],
];

const makeClientMock = () => ({
  taskSyncState: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  task: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  category: { findFirst: jest.fn() },
  notificationSchedule: { updateMany: jest.fn() },
  notificationDelivery: { updateMany: jest.fn() },
});

type ClientMock = ReturnType<typeof makeClientMock>;

const makeTransactionConflict = () =>
  new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });

const makeUniqueConstraintConflict = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['id'] },
  });

const makePrismaMock = (transactionMock: ClientMock) => ({
  ...makeClientMock(),
  $transaction: jest.fn((callback: (client: ClientMock) => Promise<unknown>) =>
    callback(transactionMock),
  ),
});

describe('TasksService', () => {
  let service: TasksService;
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let transactionMock: ClientMock;
  let scoresMock: { recompute: jest.Mock };
  const signal = { publishInvalidation: jest.fn() };

  beforeEach(async () => {
    transactionMock = makeClientMock();
    transactionMock.task.count.mockResolvedValue(0);
    transactionMock.task.findUnique.mockResolvedValue(null);
    prismaMock = makePrismaMock(transactionMock);
    prismaMock.task.findUnique.mockResolvedValue(null);
    scoresMock = { recompute: jest.fn().mockResolvedValue(undefined) };
    signal.publishInvalidation.mockReset().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ScoresService, useValue: scoresMock },
        { provide: RealtimeBusService, useValue: signal },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  it.each(['create', 'update', 'remove', 'complete', 'sync'] as const)(
    'publishes %s invalidation only after transaction commit',
    async (kind) => {
      let commit!: (value: unknown) => void;
      prismaMock.$transaction.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            commit = resolve;
          }),
      );
      const operation =
        kind === 'create'
          ? service.create('owner', makeCreateTaskDto())
          : kind === 'update'
            ? service.update('owner', MOCK_TASK.id, { title: 'new' })
            : kind === 'remove'
              ? service.remove('owner', MOCK_TASK.id)
              : kind === 'complete'
                ? service.complete('owner', MOCK_TASK.id)
                : service.sync('owner', {
                    kind: 'delete',
                    taskId: CLIENT_MUTATION_ID,
                    mutationId: SECOND_CLIENT_MUTATION_ID,
                    updatedAt: new Date().toISOString(),
                  });
      expect(signal.publishInvalidation).not.toHaveBeenCalled();
      commit(MOCK_TASK);
      await operation;
      expect(signal.publishInvalidation).toHaveBeenCalledTimes(1);
      expect(signal.publishInvalidation).toHaveBeenCalledWith(
        { kind: 'user', userId: 'owner' },
        ['scores', 'reminders'],
      );
    },
  );

  it('never signals a rollback and preserves committed success if the bus fails', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('rollback'));
    await expect(service.complete('owner', MOCK_TASK.id)).rejects.toThrow(
      'rollback',
    );
    expect(signal.publishInvalidation).not.toHaveBeenCalled();
    prismaMock.$transaction.mockResolvedValueOnce(MOCK_TASK);
    signal.publishInvalidation.mockRejectedValueOnce(
      new Error('bus unavailable'),
    );
    await expect(service.complete('owner', MOCK_TASK.id)).resolves.toEqual(
      MOCK_TASK,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('offline sync', () => {
    const now = new Date('2026-06-02T12:00:00.000Z');
    const fields = {
      title: 'Morning run',
      description: null,
      startAt: '2026-06-03T06:00:00.000Z',
      endAt: '2026-06-03T07:00:00.000Z',
      difficulty: 'MEDIUM',
      status: 'PENDING',
      categoryId: null,
      notificationEnabled: true,
    };
    const op = (changes: Record<string, unknown> = {}): SyncTaskOperation =>
      parseSyncOperation(
        {
          kind: 'create',
          mutationId: CLIENT_MUTATION_ID,
          taskId: CLIENT_MUTATION_ID,
          updatedAt: now.toISOString(),
          task: fields,
          ...changes,
        },
        now,
      );
    const existing = (): Task => ({
      ...MOCK_TASK,
      id: CLIENT_MUTATION_ID,
      updatedAt: new Date('2026-06-01T00:00:00Z'),
    });
    const state = (operation: SyncTaskOperation) => ({
      taskId: CLIENT_MUTATION_ID,
      updatedAt: new Date(operation.updatedAt),
      mutationId: operation.mutationId,
      mutationHash: hashSyncOperation(operation),
      createHash:
        operation.kind === 'create' ? hashSyncOperation(operation) : null,
    });
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(now);
      transactionMock.task.create.mockResolvedValue(existing());
      transactionMock.task.update.mockImplementation(
        (args: { data: Partial<Task> }) =>
          Promise.resolve({ ...existing(), ...args.data }),
      );
    });

    it('creates and stores immutable sync metadata in the same scoring/scheduling transaction', async () => {
      const operation = op();
      await expect(
        service.sync(MOCK_TASK.userId, operation),
      ).resolves.toMatchObject({
        mutationId: CLIENT_MUTATION_ID,
        outcome: 'applied',
        task: { id: CLIENT_MUTATION_ID },
        serverTime: now.toISOString(),
      });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(transactionMock.taskSyncState.upsert).toHaveBeenCalledWith({
        where: { taskId: CLIENT_MUTATION_ID },
        create: state(operation),
        update: {
          updatedAt: now,
          mutationId: CLIENT_MUTATION_ID,
          mutationHash: hashSyncOperation(operation),
        },
      });
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        MOCK_TASK.userId,
        MOCK_TASK.startAt,
        transactionMock,
      );
      expect(transactionMock.task.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.task.create).not.toHaveBeenCalled();
    });
    it.each([false, true])(
      'reconciles lost create ACK after later edit/deletion %s without another write',
      async (deleted) => {
        const operation = op();
        const saved = {
          ...existing(),
          title: 'newer edit',
          deletedAt: deleted ? now : null,
        };
        transactionMock.task.findUnique.mockResolvedValue(saved);
        transactionMock.taskSyncState.findUnique.mockResolvedValue({
          ...state(operation),
          mutationId: SECOND_CLIENT_MUTATION_ID,
          mutationHash: 'new-hash',
        });
        const result = await service.sync(MOCK_TASK.userId, operation);
        expect(result.outcome).toBe(deleted ? 'deleted' : 'superseded');
        expect(result.task.title).toBe('newer edit');
        expect(transactionMock.task.create).not.toHaveBeenCalled();
        expect(transactionMock.task.update).not.toHaveBeenCalled();
        expect(transactionMock.taskSyncState.upsert).not.toHaveBeenCalled();
        expect(scoresMock.recompute).not.toHaveBeenCalled();
        expect(
          transactionMock.notificationSchedule.updateMany,
        ).not.toHaveBeenCalled();
      },
    );
    it('returns 409 for a changed create payload using the same ID', async () => {
      transactionMock.task.findUnique.mockResolvedValue(existing());
      transactionMock.taskSyncState.findUnique.mockResolvedValue(state(op()));
      await expect(
        service.sync(
          MOCK_TASK.userId,
          op({ task: { ...fields, title: 'changed' } }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(transactionMock.task.update).not.toHaveBeenCalled();
    });
    it.each(['create', 'replace', 'delete'])(
      'hides foreign owner %s before reading its sync metadata',
      async (kind) => {
        transactionMock.task.findUnique.mockResolvedValue({
          ...existing(),
          userId: 'foreign',
        });
        const operation: Record<string, unknown> = { ...op(), kind };
        if (kind === 'delete') delete operation.task;
        await expect(
          service.sync(MOCK_TASK.userId, operation),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(transactionMock.taskSyncState.findUnique).not.toHaveBeenCalled();
        expect(scoresMock.recompute).not.toHaveBeenCalled();
      },
    );
    it.each(['replace', 'delete'])(
      'never upserts a missing %s target',
      async (kind) => {
        const raw: Record<string, unknown> = { ...op(), kind };
        if (kind === 'delete') delete raw.task;
        await expect(
          service.sync(MOCK_TASK.userId, raw),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(transactionMock.task.create).not.toHaveBeenCalled();
      },
    );
    it('rejects malformed input before opening a transaction', async () => {
      await expect(
        service.sync(MOCK_TASK.userId, { ...op(), userId: 'forged' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
    it('suppresses stale replacement side effects and detects same-version payload reuse', async () => {
      const operation = op({ kind: 'replace' });
      transactionMock.task.findUnique.mockResolvedValue(existing());
      transactionMock.taskSyncState.findUnique.mockResolvedValue(
        state(operation),
      );
      await expect(
        service.sync(
          MOCK_TASK.userId,
          op({ kind: 'replace', updatedAt: '2026-06-02T11:59:59.999Z' }),
        ),
      ).resolves.toMatchObject({ outcome: 'superseded' });
      await expect(
        service.sync(
          MOCK_TASK.userId,
          op({ kind: 'replace', task: { ...fields, title: 'different' } }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(transactionMock.task.update).not.toHaveBeenCalled();
      expect(transactionMock.taskSyncState.upsert).not.toHaveBeenCalled();
    });
    it('applies a later UUID tie, clears nullable fields, and stamps completion on the server', async () => {
      const operation = op({
        kind: 'replace',
        mutationId: SECOND_CLIENT_MUTATION_ID,
        task: { ...fields, status: 'COMPLETED' },
      });
      transactionMock.task.findUnique.mockResolvedValue({
        ...existing(),
        categoryId: 'old-category',
        description: 'old',
      });
      transactionMock.taskSyncState.findUnique.mockResolvedValue(
        state(op({ kind: 'replace' })),
      );
      await expect(
        service.sync(MOCK_TASK.userId, operation),
      ).resolves.toMatchObject({
        outcome: 'applied',
        task: {
          status: 'COMPLETED',
          completedAt: now,
          categoryId: null,
          description: null,
        },
      });
      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).toHaveBeenCalledTimes(1);
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).toHaveBeenCalledTimes(1);
      expect(transactionMock.taskSyncState.upsert).toHaveBeenCalledTimes(1);
      expect(scoresMock.recompute).toHaveBeenCalledTimes(1);
    });
    it('deletes despite an older timestamp and never resurrects on later replacement', async () => {
      const deletion = {
        kind: 'delete',
        mutationId: SECOND_CLIENT_MUTATION_ID,
        taskId: CLIENT_MUTATION_ID,
        updatedAt: '2026-06-01T00:00:00.000Z',
      };
      transactionMock.task.findUnique.mockResolvedValue(existing());
      transactionMock.taskSyncState.findUnique.mockResolvedValue(
        state(op({ kind: 'replace' })),
      );
      await expect(
        service.sync(MOCK_TASK.userId, deletion),
      ).resolves.toMatchObject({
        outcome: 'deleted',
        task: { deletedAt: now },
      });
      expect(scoresMock.recompute).toHaveBeenCalledTimes(1);
      transactionMock.task.findUnique.mockResolvedValue({
        ...existing(),
        deletedAt: now,
      });
      await expect(
        service.sync(
          MOCK_TASK.userId,
          op({ kind: 'replace', updatedAt: '2026-06-02T12:01:00.000Z' }),
        ),
      ).resolves.toMatchObject({ outcome: 'deleted' });
      expect(transactionMock.task.update).toHaveBeenCalledTimes(1);
    });
    it('keeps capacity rejection atomic before sync state creation', async () => {
      transactionMock.task.count.mockResolvedValue(20);
      await expect(service.sync(MOCK_TASK.userId, op())).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(transactionMock.task.create).not.toHaveBeenCalled();
      expect(transactionMock.taskSyncState.upsert).not.toHaveBeenCalled();
    });
    it('retries the whole transaction after a serialization conflict', async () => {
      transactionMock.task.create
        .mockRejectedValueOnce(makeTransactionConflict())
        .mockResolvedValue(existing());
      await expect(service.sync(MOCK_TASK.userId, op())).resolves.toMatchObject(
        { outcome: 'applied' },
      );
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      expect(transactionMock.taskSyncState.upsert).toHaveBeenCalledTimes(1);
      expect(scoresMock.recompute).toHaveBeenCalledTimes(1);
    });
    it('returns the same successful ACK without repeating a matching replacement', async () => {
      const operation = op({
        kind: 'replace',
        task: { ...fields, status: 'COMPLETED' },
      });
      const completedAt = new Date('2026-06-02T11:00:00.000Z');
      transactionMock.task.findUnique.mockResolvedValue({
        ...existing(),
        status: TaskStatus.COMPLETED,
        completedAt,
      });
      transactionMock.taskSyncState.findUnique.mockResolvedValue(
        state(operation),
      );
      await expect(
        service.sync(MOCK_TASK.userId, operation),
      ).resolves.toMatchObject({
        outcome: 'applied',
        task: {
          completedAt,
          syncUpdatedAt: operation.updatedAt,
          syncMutationId: operation.mutationId,
        },
      });
      expect(transactionMock.task.update).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).not.toHaveBeenCalled();
    });
    it('recovers a concurrent create primary-key winner inside a new transaction', async () => {
      const operation = op();
      transactionMock.task.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue(existing());
      transactionMock.task.create.mockRejectedValueOnce(
        makeUniqueConstraintConflict(),
      );
      transactionMock.taskSyncState.findUnique.mockResolvedValue(
        state(operation),
      );
      await expect(
        service.sync(MOCK_TASK.userId, operation),
      ).resolves.toMatchObject({ outcome: 'applied' });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      expect(transactionMock.task.create).toHaveBeenCalledTimes(1);
      expect(scoresMock.recompute).not.toHaveBeenCalled();
      expect(prismaMock.task.findUnique).not.toHaveBeenCalled();
    });
    it('bounds sync transaction retries to three total attempts', async () => {
      const conflict = makeTransactionConflict();
      transactionMock.task.create.mockRejectedValue(conflict);
      await expect(service.sync(MOCK_TASK.userId, op())).rejects.toBe(conflict);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
      expect(transactionMock.taskSyncState.upsert).not.toHaveBeenCalled();
    });
    it('propagates sync metadata write failure through the mutation transaction', async () => {
      const failure = new Error('state persistence failed');
      transactionMock.taskSyncState.upsert.mockRejectedValue(failure);
      await expect(service.sync(MOCK_TASK.userId, op())).rejects.toBe(failure);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.taskSyncState.upsert).not.toHaveBeenCalled();
    });
    it('projects only the owned page metadata without changing legacy responses', async () => {
      const first = existing();
      const second = { ...existing(), id: SECOND_CLIENT_MUTATION_ID };
      prismaMock.task.findMany.mockResolvedValue([first, second]);
      const version = {
        ...state(op()),
        updatedAt: new Date('2026-06-02T11:58:00.000Z'),
      };
      prismaMock.taskSyncState.findMany.mockResolvedValue([version]);
      const result = await service.findAllForSync(MOCK_TASK.userId, {
        limit: 100,
      });
      expect(result[0]).toMatchObject({
        id: first.id,
        syncUpdatedAt: version.updatedAt.toISOString(),
        syncMutationId: CLIENT_MUTATION_ID,
      });
      expect(result[1]).toMatchObject({
        id: second.id,
        syncUpdatedAt: second.updatedAt.toISOString(),
        syncMutationId: '',
      });
      expect(prismaMock.taskSyncState.findMany).toHaveBeenCalledWith({
        where: { taskId: { in: [first.id, second.id] } },
        take: 100,
      });
      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        where: { userId: MOCK_TASK.userId, deletedAt: null },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: 100,
      });
      expect(first).not.toHaveProperty('syncUpdatedAt');
      await expect(service.findAll(MOCK_TASK.userId, {})).resolves.toEqual([
        first,
        second,
      ]);
    });
    it('skips sync metadata reads for an empty page', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      await expect(
        service.findAllForSync(MOCK_TASK.userId, {}),
      ).resolves.toEqual([]);
      expect(prismaMock.taskSyncState.findMany).not.toHaveBeenCalled();
    });
    it.each(['update', 'complete', 'remove'] as const)(
      'advances existing metadata for legacy %s without overwriting the create fingerprint',
      async (method) => {
        const saved = state(op());
        saved.updatedAt = new Date(now.getTime() + 1000);
        transactionMock.task.findFirst.mockResolvedValue(existing());
        transactionMock.taskSyncState.findUnique.mockResolvedValue(saved);
        if (method === 'update')
          await service.update(MOCK_TASK.userId, CLIENT_MUTATION_ID, {
            title: 'new title',
          });
        else await service[method](MOCK_TASK.userId, CLIENT_MUTATION_ID);
        const [args] = transactionMock.taskSyncState.update.mock.calls[0] as [
          {
            where: { taskId: string };
            data: {
              updatedAt: Date;
              mutationId: string;
              mutationHash: string;
              createHash?: string;
            };
          },
        ];
        expect(args.where.taskId).toBe(CLIENT_MUTATION_ID);
        expect(args.data.updatedAt.getTime()).toBe(now.getTime() + 1001);
        expect(args.data.mutationId).toMatch(/^[0-9a-f-]{36}$/);
        expect(args.data.mutationHash).toMatch(/^[0-9a-f]{64}$/);
        expect(args.data).not.toHaveProperty('createHash');
        expect(prismaMock.taskSyncState.update).not.toHaveBeenCalled();
      },
    );
    it('counts year 0099 tasks in year 0099 instead of 1999', async () => {
      await service.create(
        MOCK_TASK.userId,
        makeCreateTaskDto({
          startAt: '0099-01-02T12:00:00.000Z',
          endAt: '0099-01-02T13:00:00.000Z',
        }),
      );
      const [args] = transactionMock.task.count.mock.calls[0] as [
        { where: { startAt: { gte: Date; lt: Date } } },
      ];
      expect(args.where.startAt.gte.toISOString()).toBe(
        '0099-01-02T00:00:00.000Z',
      );
      expect(args.where.startAt.lt.toISOString()).toBe(
        '0099-01-03T00:00:00.000Z',
      );
    });
  });

  describe('issueClientMutationId', () => {
    it('returns a distinct UUIDv4 value for every issuance', () => {
      const randomUuidSpy = jest
        .spyOn(crypto, 'randomUUID')
        .mockReturnValueOnce(CLIENT_MUTATION_ID)
        .mockReturnValueOnce(SECOND_CLIENT_MUTATION_ID);
      const issuableService = service as unknown as {
        issueClientMutationId(): { clientMutationId: string };
      };
      const uuidV4Pattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      const first = issuableService.issueClientMutationId();
      const second = issuableService.issueClientMutationId();

      expect(first.clientMutationId).toBe(CLIENT_MUTATION_ID);
      expect(second.clientMutationId).toBe(SECOND_CLIENT_MUTATION_ID);
      expect(first.clientMutationId).toMatch(uuidV4Pattern);
      expect(second.clientMutationId).toMatch(uuidV4Pattern);
      expect(second.clientMutationId).not.toBe(first.clientMutationId);
      expect(randomUuidSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('create', () => {
    it('creates a task for the given user', async () => {
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);

      const result = await service.create('user-uuid-1', makeCreateTaskDto());

      expect(result).toEqual(MOCK_TASK);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(transactionMock.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            id: CLIENT_MUTATION_ID,
            userId: 'user-uuid-1',
          }),
        }),
      );
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        MOCK_TASK.startAt,
        transactionMock,
      );
      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.task.create).not.toHaveBeenCalled();
    });

    it.each([
      ['zero-length', '2026-06-03T06:00:00Z'],
      ['reversed', '2026-06-03T05:59:59Z'],
    ])(
      'rejects a %s interval before opening a transaction',
      async (_label, endAt) => {
        await expect(
          service.create('user-uuid-1', makeCreateTaskDto({ endAt })),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(prismaMock.$transaction).not.toHaveBeenCalled();
        expect(transactionMock.task.create).not.toHaveBeenCalled();
        expect(scoresMock.recompute).not.toHaveBeenCalled();
      },
    );

    it('returns a matching replay before capacity and category checks without repeating side effects', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
      const dto = makeCreateTaskDto({ categoryId: 'category-1' });
      const persistedTask = makePersistedCreateTask(dto);
      transactionMock.task.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(persistedTask);
      transactionMock.task.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(20);
      transactionMock.category.findFirst
        .mockResolvedValueOnce({
          id: 'category-1',
          userId: 'user-uuid-1',
          isDefault: false,
        })
        .mockResolvedValueOnce(null);
      transactionMock.task.create.mockResolvedValue(persistedTask);

      const created = await service.create('user-uuid-1', dto);
      const replayed = await service.create('user-uuid-1', dto);

      expect(created).toEqual(persistedTask);
      expect(replayed).toEqual(persistedTask);
      expect(transactionMock.task.findUnique).toHaveBeenCalledTimes(2);
      expect(transactionMock.task.findUnique).toHaveBeenNthCalledWith(1, {
        where: { id: CLIENT_MUTATION_ID },
      });
      expect(transactionMock.task.findUnique).toHaveBeenNthCalledWith(2, {
        where: { id: CLIENT_MUTATION_ID },
      });
      expect(transactionMock.task.count).toHaveBeenCalledTimes(1);
      expect(transactionMock.category.findFirst).toHaveBeenCalledTimes(1);
      expect(transactionMock.task.create).toHaveBeenCalledTimes(1);
      expect(transactionMock.task.create).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          id: CLIENT_MUTATION_ID,
          notificationSchedules: {
            create: {
              userId: 'user-uuid-1',
              scheduledAt: new Date('2026-06-03T06:00:00Z'),
              status: 'PENDING',
            },
          },
        }),
      });
      expect(scoresMock.recompute).toHaveBeenCalledTimes(1);
    });

    it.each(CREATE_CONFLICT_CASES)(
      'returns the same generic conflict for %s using the same mutation ID',
      async (_label, dtoOverrides, persistedOverrides) => {
        const dto = makeCreateTaskDto(dtoOverrides);
        transactionMock.task.findUnique.mockResolvedValue(
          makePersistedCreateTask(makeCreateTaskDto(), persistedOverrides),
        );
        transactionMock.task.count.mockResolvedValue(20);

        const action = service.create('user-uuid-1', dto);

        await expect(action).rejects.toBeInstanceOf(ConflictException);
        await expect(action).rejects.toMatchObject({
          message: 'Conflict',
          status: 409,
        });

        expect(transactionMock.task.count).not.toHaveBeenCalled();
        expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
        expect(transactionMock.task.create).not.toHaveBeenCalled();
        expect(scoresMock.recompute).not.toHaveBeenCalled();
      },
    );

    it('allows identical canonical payloads when mutation IDs differ', async () => {
      const firstDto = makeCreateTaskDto();
      const secondDto = makeCreateTaskDto({
        clientMutationId: SECOND_CLIENT_MUTATION_ID,
      });
      const firstTask = makePersistedCreateTask(firstDto);
      const secondTask = makePersistedCreateTask(secondDto);
      transactionMock.task.create
        .mockResolvedValueOnce(firstTask)
        .mockResolvedValueOnce(secondTask);

      await expect(service.create('user-uuid-1', firstDto)).resolves.toEqual(
        firstTask,
      );
      await expect(service.create('user-uuid-1', secondDto)).resolves.toEqual(
        secondTask,
      );

      expect(transactionMock.task.create).toHaveBeenCalledTimes(2);
      expect(transactionMock.task.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ id: CLIENT_MUTATION_ID }),
        }),
      );
      expect(transactionMock.task.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ id: SECOND_CLIENT_MUTATION_ID }),
        }),
      );
      expect(scoresMock.recompute).toHaveBeenCalledTimes(2);
    });

    it('allows the twentieth active task and uses the UTC half-open day predicate', async () => {
      transactionMock.task.count.mockResolvedValue(19);
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);

      await service.create('user-uuid-1', makeCreateTaskDto());

      expect(transactionMock.task.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          deletedAt: null,
          startAt: {
            gte: new Date('2026-06-03T00:00:00.000Z'),
            lt: new Date('2026-06-04T00:00:00.000Z'),
          },
        },
      });
      expect(transactionMock.task.create).toHaveBeenCalledTimes(1);
    });

    it('rejects the twenty-first active task before every side effect', async () => {
      transactionMock.task.count.mockResolvedValue(20);

      const action = service.create('user-uuid-1', makeCreateTaskDto());

      await expect(action).rejects.toBeInstanceOf(ConflictException);
      await expect(action).rejects.toMatchObject({
        message: 'Daily task limit reached',
        status: 409,
      });
      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(transactionMock.task.create).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('returns the capacity conflict before checking an invalid category', async () => {
      transactionMock.task.count.mockResolvedValue(20);
      transactionMock.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          'user-uuid-1',
          makeCreateTaskDto({ categoryId: 'missing-category' }),
        ),
      ).rejects.toMatchObject({
        message: 'Daily task limit reached',
        status: 409,
      });

      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(transactionMock.task.create).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('checks an invalid category only after capacity is available', async () => {
      transactionMock.task.count.mockResolvedValue(19);
      transactionMock.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          'user-uuid-1',
          makeCreateTaskDto({ categoryId: 'missing-category' }),
        ),
      ).rejects.toThrow(NotFoundException);

      expect(
        transactionMock.task.count.mock.invocationCallOrder[0],
      ).toBeLessThan(
        transactionMock.category.findFirst.mock.invocationCallOrder[0],
      );
      expect(transactionMock.task.create).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('creates one pending schedule for an enabled future task', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);

      await service.create('user-uuid-1', makeCreateTaskDto());

      expect(transactionMock.task.create).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          userId: 'user-uuid-1',
          notificationSchedules: {
            create: {
              userId: 'user-uuid-1',
              scheduledAt: new Date('2026-06-03T06:00:00Z'),
              status: 'PENDING',
            },
          },
        }),
      });
      expect(
        transactionMock.task.create.mock.invocationCallOrder[0],
      ).toBeLessThan(scoresMock.recompute.mock.invocationCallOrder[0]);
    });

    it.each([
      ['a past task', '2026-05-31T23:59:59Z', undefined],
      ['a task starting exactly now', '2026-06-01T00:00:00Z', undefined],
      ['a disabled future task', '2026-06-03T06:00:00Z', false],
    ])('does not schedule %s', async (_label, startAt, notificationEnabled) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
      transactionMock.task.create.mockResolvedValue({
        ...MOCK_TASK,
        startAt: new Date(startAt),
        notificationEnabled: notificationEnabled ?? true,
      });

      await service.create(
        'user-uuid-1',
        makeCreateTaskDto({ startAt, notificationEnabled }),
      );

      expect(transactionMock.task.create).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.not.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          notificationSchedules: expect.anything(),
        }),
      });
    });

    it.each([
      [
        'actor-owned',
        { id: 'category-1', userId: 'user-uuid-1', isDefault: false },
      ],
      ['default', { id: 'category-1', userId: null, isDefault: true }],
    ])('accepts an %s category', async (_label, category) => {
      transactionMock.category.findFirst.mockResolvedValue(category);
      transactionMock.task.create.mockResolvedValue({
        ...MOCK_TASK,
        categoryId: 'category-1',
      });

      await service.create(
        'user-uuid-1',
        makeCreateTaskDto({ categoryId: 'category-1' }),
      );

      expect(transactionMock.category.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'category-1',
          OR: [{ userId: 'user-uuid-1' }, { isDefault: true }],
        },
        select: { id: true },
      });
      expect(transactionMock.task.create).toHaveBeenCalledTimes(1);
    });

    it.each(['missing', 'foreign'])(
      'rejects a %s category before writing the task',
      async () => {
        transactionMock.category.findFirst.mockResolvedValue(null);

        await expect(
          service.create(
            'user-uuid-1',
            makeCreateTaskDto({ categoryId: 'unassignable-category' }),
          ),
        ).rejects.toThrow(NotFoundException);

        expect(transactionMock.task.create).not.toHaveBeenCalled();
        expect(scoresMock.recompute).not.toHaveBeenCalled();
      },
    );

    it('propagates score recompute failures from the transaction callback', async () => {
      const recomputeError = new Error('score recompute failed');
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);
      scoresMock.recompute.mockRejectedValue(recomputeError);

      await expect(
        service.create('user-uuid-1', makeCreateTaskDto()),
      ).rejects.toBe(recomputeError);
    });

    it('does not recompute scores when the task nested write fails', async () => {
      const writeError = new Error('task and schedule write failed');
      transactionMock.task.create.mockRejectedValue(writeError);

      await expect(
        service.create(
          'user-uuid-1',
          makeCreateTaskDto({
            startAt: '2099-06-03T06:00:00Z',
            endAt: '2099-06-03T07:00:00Z',
          }),
        ),
      ).rejects.toBe(writeError);

      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('converges a P2002 create race through a matching post-transaction ID lookup', async () => {
      const dto = makeCreateTaskDto();
      const persistedTask = makePersistedCreateTask(dto);
      transactionMock.task.create.mockRejectedValue(
        makeUniqueConstraintConflict(),
      );
      prismaMock.task.findUnique.mockResolvedValue(persistedTask);

      await expect(service.create('user-uuid-1', dto)).resolves.toEqual(
        persistedTask,
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(transactionMock.task.create).toHaveBeenCalledTimes(1);
      expect(scoresMock.recompute).not.toHaveBeenCalled();
      expect(prismaMock.task.findUnique).toHaveBeenCalledWith({
        where: { id: CLIENT_MUTATION_ID },
      });
      expect(prismaMock.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
        prismaMock.task.findUnique.mock.invocationCallOrder[0],
      );
    });
  });

  describe('serializable transaction retry', () => {
    it('retries the entire callback after P2034 and returns the successful result', async () => {
      const conflict = makeTransactionConflict();
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);
      prismaMock.$transaction
        .mockImplementationOnce(async (callback) => {
          await callback(transactionMock);
          throw conflict;
        })
        .mockImplementationOnce((callback) => callback(transactionMock));

      const result = await service.create('user-uuid-1', makeCreateTaskDto());

      expect(result).toEqual(MOCK_TASK);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      expect(prismaMock.$transaction).toHaveBeenNthCalledWith(
        1,
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(prismaMock.$transaction).toHaveBeenNthCalledWith(
        2,
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(transactionMock.task.create).toHaveBeenCalledTimes(2);
      expect(scoresMock.recompute).toHaveBeenCalledTimes(2);
    });

    it('propagates P2034 after the bounded retry limit', async () => {
      const conflict = makeTransactionConflict();
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);
      prismaMock.$transaction.mockImplementation(async (callback) => {
        await callback(transactionMock);
        throw conflict;
      });

      await expect(
        service.create('user-uuid-1', makeCreateTaskDto()),
      ).rejects.toBe(conflict);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
      expect(transactionMock.task.create).toHaveBeenCalledTimes(3);
      expect(scoresMock.recompute).toHaveBeenCalledTimes(3);
    });

    it('converges exhausted P2034 retries through a matching post-transaction ID lookup', async () => {
      const conflict = makeTransactionConflict();
      const dto = makeCreateTaskDto();
      const persistedTask = makePersistedCreateTask(dto);
      transactionMock.task.create.mockResolvedValue(persistedTask);
      prismaMock.$transaction.mockImplementation(async (callback) => {
        await callback(transactionMock);
        throw conflict;
      });
      prismaMock.task.findUnique.mockResolvedValue(persistedTask);

      await expect(service.create('user-uuid-1', dto)).resolves.toEqual(
        persistedTask,
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
      expect(transactionMock.task.create).toHaveBeenCalledTimes(3);
      expect(scoresMock.recompute).toHaveBeenCalledTimes(3);
      expect(prismaMock.task.findUnique).toHaveBeenCalledWith({
        where: { id: CLIENT_MUTATION_ID },
      });
      expect(prismaMock.$transaction.mock.invocationCallOrder[2]).toBeLessThan(
        prismaMock.task.findUnique.mock.invocationCallOrder[0],
      );
    });

    it('does not retry non-P2034 errors', async () => {
      const error = new Error('non-retryable transaction failure');
      transactionMock.task.create.mockResolvedValue(MOCK_TASK);
      prismaMock.$transaction.mockImplementationOnce(async (callback) => {
        await callback(transactionMock);
        throw error;
      });

      await expect(
        service.create('user-uuid-1', makeCreateTaskDto()),
      ).rejects.toBe(error);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(transactionMock.task.create).toHaveBeenCalledTimes(1);
      expect(scoresMock.recompute).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('returns a bounded all-history page when date is omitted', async () => {
      prismaMock.task.findMany.mockResolvedValue([MOCK_TASK]);

      const result = await service.findAll('user-uuid-1', {});

      expect(result).toEqual([MOCK_TASK]);
      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', deletedAt: null },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: 100,
      });
    });

    it.each([
      ['2026-06-03', '2026-06-03', '2026-06-04'],
      ['2026-06-03T12:34:56.789Z', '2026-06-03', '2026-06-04'],
      ['2026-06-03T21:34:56.789+09:00', '2026-06-03', '2026-06-04'],
      ['2026-06-04T00:30:00+09:00', '2026-06-03', '2026-06-04'],
      ['2026-06-02T23:30:00-03:00', '2026-06-03', '2026-06-04'],
      ['2026-06-03T23:59:59.999Z', '2026-06-03', '2026-06-04'],
      ['2026-06-04T00:00:00Z', '2026-06-04', '2026-06-05'],
      ['2026-12-31T12:00:00Z', '2026-12-31', '2027-01-01'],
      ['2028-02-29T12:00:00Z', '2028-02-29', '2028-03-01'],
      ['0099-12-31', '0099-12-31', '0100-01-01'],
    ])(
      'queries the complete UTC day of %s with an exclusive next midnight',
      async (date, dayStart, nextDay) => {
        prismaMock.task.findMany.mockResolvedValue([MOCK_TASK]);

        await service.findAll('user-uuid-1', { date });

        expect(prismaMock.task.findMany).toHaveBeenCalledWith({
          where: {
            userId: 'user-uuid-1',
            deletedAt: null,
            startAt: {
              gte: new Date(`${dayStart}T00:00:00.000Z`),
              lt: new Date(`${nextDay}T00:00:00.000Z`),
            },
          },
          orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
          take: 100,
        });
      },
    );

    it.each([
      [undefined, 100],
      [1, 1],
      [25, 25],
      [100, 100],
      [101, 100],
      [1_000_000, 100],
      [0, 1],
      [-1, 1],
      [NaN, 100],
      [Infinity, 100],
      [1.5, 100],
    ])('bounds a direct service limit of %s to %s', async (limit, expected) => {
      prismaMock.task.findMany.mockResolvedValue([]);

      await expect(service.findAll('user-uuid-1', { limit })).resolves.toEqual(
        [],
      );

      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', deletedAt: null },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: expected,
      });
      expect(prismaMock.task.findFirst).not.toHaveBeenCalled();
    });

    it('uses a native cursor with stable startAt and id ordering for equal-time tasks', async () => {
      const startAt = new Date('2026-06-03T06:00:00.000Z');
      prismaMock.task.findFirst.mockResolvedValue({
        id: CLIENT_MUTATION_ID,
        startAt,
      });
      const nextTask = { ...MOCK_TASK, id: SECOND_CLIENT_MUTATION_ID, startAt };
      prismaMock.task.findMany.mockResolvedValue([nextTask]);

      await expect(
        service.findAll('user-uuid-1', {
          cursor: CLIENT_MUTATION_ID,
          limit: 1,
        }),
      ).resolves.toEqual([nextTask]);

      expect(prismaMock.task.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          deletedAt: null,
          id: CLIENT_MUTATION_ID,
        },
        select: { id: true },
      });
      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          deletedAt: null,
        },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: 1,
        cursor: { id: CLIENT_MUTATION_ID },
        skip: 1,
      });
    });

    it('keeps the normalized date bounds on the cursor lookup and the next page', async () => {
      const startAt = new Date('2026-06-03T06:00:00.000Z');
      const dateRange = {
        gte: new Date('2026-06-03T00:00:00.000Z'),
        lt: new Date('2026-06-04T00:00:00.000Z'),
      };
      prismaMock.task.findFirst.mockResolvedValue({
        id: CLIENT_MUTATION_ID,
        startAt,
      });
      prismaMock.task.findMany.mockResolvedValue([]);

      await expect(
        service.findAll('user-uuid-1', {
          date: '2026-06-04T00:30:00+09:00',
          cursor: CLIENT_MUTATION_ID,
        }),
      ).resolves.toEqual([]);

      expect(prismaMock.task.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          deletedAt: null,
          startAt: dateRange,
          id: CLIENT_MUTATION_ID,
        },
        select: { id: true },
      });
      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          deletedAt: null,
          startAt: dateRange,
        },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: 100,
        cursor: { id: CLIENT_MUTATION_ID },
        skip: 1,
      });
    });

    it.each([
      ['missing', null],
      ['foreign', { ...MOCK_TASK, userId: 'other-user' }],
      ['deleted', { ...MOCK_TASK, deletedAt: new Date() }],
      [
        'another day',
        { ...MOCK_TASK, startAt: new Date('2026-06-04T00:00:00Z') },
      ],
    ])(
      'rejects a %s cursor through the scoped lookup before reading a page',
      async (_, cursor) => {
        prismaMock.task.findFirst.mockImplementation(
          ({ where }: { where: Prisma.TaskWhereInput }) => {
            expect(where).toEqual({
              id: CLIENT_MUTATION_ID,
              userId: 'user-uuid-1',
              deletedAt: null,
              startAt: {
                gte: new Date('2026-06-03T00:00:00Z'),
                lt: new Date('2026-06-04T00:00:00Z'),
              },
            });
            // These fixture rows are excluded by that Prisma lookup predicate.
            expect(
              cursor === null ||
                cursor.userId !== where.userId ||
                cursor.deletedAt !== null ||
                cursor.startAt >= new Date('2026-06-04T00:00:00Z'),
            ).toBe(true);
            return Promise.resolve(null);
          },
        );

        await expect(
          service.findAll('user-uuid-1', {
            date: '2026-06-03',
            cursor: CLIENT_MUTATION_ID,
          }),
        ).rejects.toThrow(NotFoundException);
        expect(prismaMock.task.findMany).not.toHaveBeenCalled();
      },
    );
  });

  describe('findOne', () => {
    it('returns task when found', async () => {
      prismaMock.task.findFirst.mockResolvedValue(MOCK_TASK);

      const result = await service.findOne('user-uuid-1', 'task-uuid-1');

      expect(result).toEqual(MOCK_TASK);
    });

    it('throws NotFoundException when task is missing', async () => {
      prismaMock.task.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('user-uuid-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates and returns the task', async () => {
      const updated = { ...MOCK_TASK, title: 'Evening run' };
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue(updated);

      const result = await service.update('user-uuid-1', 'task-uuid-1', {
        title: 'Evening run',
      });

      expect(result.title).toBe('Evening run');
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(scoresMock.recompute).toHaveBeenCalledTimes(1);
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        MOCK_TASK.startAt,
        transactionMock,
      );
      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.not.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          notificationSchedules: expect.anything(),
        }),
      });
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).not.toHaveBeenCalled();
      expect(transactionMock.task.count).not.toHaveBeenCalled();
    });

    it.each(['startAt', 'endAt'] as const)(
      'defensively rejects a null %s before writing',
      async (property) => {
        transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);

        await expect(
          service.update('user-uuid-1', 'task-uuid-1', {
            [property]: null,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(transactionMock.task.update).not.toHaveBeenCalled();
        expect(scoresMock.recompute).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['startAt reaches the existing end', { startAt: '2026-06-03T07:00:00Z' }],
      ['endAt reaches the existing start', { endAt: '2026-06-03T06:00:00Z' }],
      [
        'both dates are reversed',
        {
          startAt: '2026-06-03T08:00:00Z',
          endAt: '2026-06-03T07:00:00Z',
        },
      ],
    ])('rejects an invalid merged interval when %s', async (_label, dto) => {
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);

      await expect(
        service.update('user-uuid-1', 'task-uuid-1', dto),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transactionMock.task.update).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('loads the owned task before rejecting a move into a full UTC day', async () => {
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.count.mockResolvedValue(20);
      transactionMock.category.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-uuid-1', 'task-uuid-1', {
          startAt: '2026-06-04T00:00:00.000Z',
          endAt: '2026-06-04T01:00:00.000Z',
          categoryId: 'missing-category',
        }),
      ).rejects.toMatchObject({
        message: 'Daily task limit reached',
        status: 409,
      });

      expect(transactionMock.task.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          deletedAt: null,
          startAt: {
            gte: new Date('2026-06-04T00:00:00.000Z'),
            lt: new Date('2026-06-05T00:00:00.000Z'),
          },
          id: { not: 'task-uuid-1' },
        },
      });
      expect(
        transactionMock.task.findFirst.mock.invocationCallOrder[0],
      ).toBeLessThan(transactionMock.task.count.mock.invocationCallOrder[0]);
      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).not.toHaveBeenCalled();
      expect(transactionMock.task.update).not.toHaveBeenCalled();
      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('does not check capacity before reporting a missing owned task', async () => {
      transactionMock.task.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-uuid-1', 'missing-task', {
          startAt: '2026-06-04T00:00:00.000Z',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(transactionMock.task.count).not.toHaveBeenCalled();
      expect(transactionMock.task.update).not.toHaveBeenCalled();
    });

    it('skips capacity for a same-day move and preserves category 404 precedence', async () => {
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.category.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-uuid-1', 'task-uuid-1', {
          startAt: '2026-06-03T23:59:59.999Z',
          endAt: '2026-06-04T00:59:59.999Z',
          categoryId: 'missing-category',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(transactionMock.task.count).not.toHaveBeenCalled();
      expect(transactionMock.category.findFirst).toHaveBeenCalledTimes(1);
      expect(transactionMock.task.update).not.toHaveBeenCalled();
    });

    it('treats the next UTC midnight as a different capacity day', async () => {
      const endOfDayTask = {
        ...MOCK_TASK,
        startAt: new Date('2026-06-03T23:59:59.999Z'),
        endAt: new Date('2026-06-04T00:59:59.999Z'),
      };
      transactionMock.task.findFirst.mockResolvedValue(endOfDayTask);
      transactionMock.task.count.mockResolvedValue(19);
      transactionMock.task.update.mockResolvedValue({
        ...endOfDayTask,
        startAt: new Date('2026-06-04T00:00:00.000Z'),
      });

      await service.update('user-uuid-1', 'task-uuid-1', {
        startAt: '2026-06-04T00:00:00.000Z',
      });

      expect(transactionMock.task.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          deletedAt: null,
          startAt: {
            gte: new Date('2026-06-04T00:00:00.000Z'),
            lt: new Date('2026-06-05T00:00:00.000Z'),
          },
          id: { not: 'task-uuid-1' },
        },
      });
    });

    it('stamps completedAt when generic update enters COMPLETED', async () => {
      const now = new Date('2026-06-03T08:30:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue({
        ...MOCK_TASK,
        status: TaskStatus.COMPLETED,
        completedAt: now,
      });

      await service.update('user-uuid-1', 'task-uuid-1', {
        status: TaskStatus.COMPLETED,
      });

      expect(transactionMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: TaskStatus.COMPLETED,
            completedAt: now,
          }),
        }),
      );
    });

    it.each([TaskStatus.PENDING, TaskStatus.CANCELLED])(
      'clears completedAt when generic update leaves COMPLETED for %s',
      async (status) => {
        const completedTask = {
          ...MOCK_TASK,
          status: TaskStatus.COMPLETED,
          completedAt: new Date('2026-06-03T07:30:00.000Z'),
        };
        transactionMock.task.findFirst.mockResolvedValue(completedTask);
        transactionMock.task.update.mockResolvedValue({
          ...completedTask,
          status,
          completedAt: null,
        });

        await service.update('user-uuid-1', 'task-uuid-1', { status });

        expect(transactionMock.task.update).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: expect.objectContaining({ status, completedAt: null }),
          }),
        );
      },
    );

    it.each([
      ['an unrelated field', MOCK_TASK, { title: 'Evening run' }],
      [
        'the same completed status with a legacy null timestamp',
        { ...MOCK_TASK, status: TaskStatus.COMPLETED },
        { status: TaskStatus.COMPLETED },
      ],
    ])('preserves completedAt for %s', async (_label, existingTask, dto) => {
      transactionMock.task.findFirst.mockResolvedValue(existingTask);
      transactionMock.task.update.mockResolvedValue({
        ...existingTask,
        ...dto,
      });

      await service.update('user-uuid-1', 'task-uuid-1', dto);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const updateData = transactionMock.task.update.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty('completedAt');
    });

    it.each([
      [
        'start time',
        MOCK_TASK,
        {
          startAt: '2026-06-04T06:00:00Z',
          endAt: '2026-06-04T07:00:00Z',
        },
        new Date('2026-06-04T06:00:00Z'),
      ],
      [
        'notification enablement',
        { ...MOCK_TASK, notificationEnabled: false },
        { notificationEnabled: true },
        MOCK_TASK.startAt,
      ],
      [
        'status back to pending',
        { ...MOCK_TASK, status: TaskStatus.CANCELLED },
        { status: TaskStatus.PENDING },
        MOCK_TASK.startAt,
      ],
    ])(
      'cancels nonterminal notifications and creates the next pending schedule when %s actually changes',
      async (_label, existingTask, dto, scheduledAt) => {
        jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
        const updatedTask = {
          ...existingTask,
          ...dto,
          startAt:
            'startAt' in dto && dto.startAt
              ? new Date(dto.startAt)
              : existingTask.startAt,
          endAt:
            'endAt' in dto && dto.endAt
              ? new Date(dto.endAt)
              : existingTask.endAt,
        };
        transactionMock.task.findFirst.mockResolvedValue(existingTask);
        transactionMock.task.update.mockResolvedValue(updatedTask);

        await service.update('user-uuid-1', 'task-uuid-1', dto);

        expect(
          transactionMock.notificationSchedule.updateMany,
        ).toHaveBeenCalledWith({
          where: {
            taskId: 'task-uuid-1',
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          data: { status: 'CANCELLED' },
        });
        expect(
          transactionMock.notificationDelivery.updateMany,
        ).toHaveBeenCalledWith({
          where: {
            schedule: { taskId: 'task-uuid-1' },
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          data: {
            status: 'CANCELLED',
            claimId: null,
            processingStartedAt: null,
            nextAttemptAt: null,
          },
        });
        expect(transactionMock.task.update).toHaveBeenCalledWith({
          where: { id: 'task-uuid-1' },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            notificationSchedules: {
              create: {
                userId: 'user-uuid-1',
                scheduledAt,
                status: 'PENDING',
              },
            },
          }),
        });
        expect(
          transactionMock.notificationSchedule.updateMany.mock
            .invocationCallOrder[0],
        ).toBeLessThan(
          transactionMock.notificationDelivery.updateMany.mock
            .invocationCallOrder[0],
        );
        expect(
          transactionMock.notificationDelivery.updateMany.mock
            .invocationCallOrder[0],
        ).toBeLessThan(transactionMock.task.update.mock.invocationCallOrder[0]);
        expect(
          transactionMock.task.update.mock.invocationCallOrder[0],
        ).toBeLessThan(scoresMock.recompute.mock.invocationCallOrder[0]);
      },
    );

    it.each([
      ['notification disablement', { notificationEnabled: false }],
      ['cancellation', { status: TaskStatus.CANCELLED }],
    ])('cancels nonterminal notifications after %s', async (_label, dto) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue({ ...MOCK_TASK, ...dto });

      await service.update('user-uuid-1', 'task-uuid-1', dto);

      expect(
        transactionMock.notificationSchedule.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          taskId: 'task-uuid-1',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: { status: 'CANCELLED' },
      });
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          schedule: { taskId: 'task-uuid-1' },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          claimId: null,
          processingStartedAt: null,
          nextAttemptAt: null,
        },
      });
      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.not.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          notificationSchedules: expect.anything(),
        }),
      });
    });

    it.each([
      ['the same start time', { startAt: '2026-06-03T06:00:00Z' }],
      ['the same notification setting', { notificationEnabled: true }],
      ['the same status', { status: TaskStatus.PENDING }],
    ])('does not write schedules for %s', async (_label, dto) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue(MOCK_TASK);

      await service.update('user-uuid-1', 'task-uuid-1', dto);

      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.not.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          notificationSchedules: expect.anything(),
        }),
      });
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).not.toHaveBeenCalled();
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('cancels nonterminal notifications without creating a schedule when changed start time is not future', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-04T06:00:00Z'));
      const movedTask = {
        ...MOCK_TASK,
        startAt: new Date('2026-06-04T06:00:00Z'),
        endAt: new Date('2026-06-04T07:00:00Z'),
      };
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue(movedTask);

      await service.update('user-uuid-1', 'task-uuid-1', {
        startAt: '2026-06-04T06:00:00Z',
        endAt: '2026-06-04T07:00:00Z',
      });

      expect(
        transactionMock.notificationSchedule.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          taskId: 'task-uuid-1',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: { status: 'CANCELLED' },
      });
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          schedule: { taskId: 'task-uuid-1' },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          claimId: null,
          processingStartedAt: null,
          nextAttemptAt: null,
        },
      });
      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.not.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          notificationSchedules: expect.anything(),
        }),
      });
    });

    it('does not recompute scores when the task nested write fails', async () => {
      const writeError = new Error('task and schedule update failed');
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockRejectedValue(writeError);

      await expect(
        service.update('user-uuid-1', 'task-uuid-1', {
          notificationEnabled: false,
        }),
      ).rejects.toBe(writeError);

      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });

    it('does not reload an unchanged category', async () => {
      const categorizedTask = { ...MOCK_TASK, categoryId: 'category-1' };
      transactionMock.task.findFirst.mockResolvedValue(categorizedTask);
      transactionMock.task.update.mockResolvedValue(categorizedTask);

      await service.update('user-uuid-1', 'task-uuid-1', {
        categoryId: 'category-1',
      });

      expect(transactionMock.category.findFirst).not.toHaveBeenCalled();
      expect(transactionMock.task.update).toHaveBeenCalledTimes(1);
    });

    it.each([
      [
        'actor-owned',
        { id: 'category-2', userId: 'user-uuid-1', isDefault: false },
      ],
      ['default', { id: 'category-2', userId: null, isDefault: true }],
    ])('accepts a changed %s category', async (_label, category) => {
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.category.findFirst.mockResolvedValue(category);
      transactionMock.task.update.mockResolvedValue({
        ...MOCK_TASK,
        categoryId: 'category-2',
      });

      await service.update('user-uuid-1', 'task-uuid-1', {
        categoryId: 'category-2',
      });

      expect(transactionMock.category.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'category-2',
          OR: [{ userId: 'user-uuid-1' }, { isDefault: true }],
        },
        select: { id: true },
      });
      expect(transactionMock.task.update).toHaveBeenCalledTimes(1);
    });

    it.each(['missing', 'foreign'])(
      'rejects a changed %s category before writing the task',
      async () => {
        transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
        transactionMock.category.findFirst.mockResolvedValue(null);

        await expect(
          service.update('user-uuid-1', 'task-uuid-1', {
            categoryId: 'unassignable-category',
          }),
        ).rejects.toThrow(NotFoundException);

        expect(transactionMock.task.update).not.toHaveBeenCalled();
        expect(scoresMock.recompute).not.toHaveBeenCalled();
      },
    );

    it('recomputes each distinct UTC day with the transaction client', async () => {
      const movedTask = {
        ...MOCK_TASK,
        startAt: new Date('2026-06-04T06:00:00Z'),
        endAt: new Date('2026-06-04T07:00:00Z'),
      };
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue(movedTask);

      await service.update('user-uuid-1', 'task-uuid-1', {
        startAt: '2026-06-04T06:00:00Z',
        endAt: '2026-06-04T07:00:00Z',
      });

      expect(scoresMock.recompute).toHaveBeenNthCalledWith(
        1,
        'user-uuid-1',
        MOCK_TASK.startAt,
        transactionMock,
      );
      expect(scoresMock.recompute).toHaveBeenNthCalledWith(
        2,
        'user-uuid-1',
        movedTask.startAt,
        transactionMock,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes by setting deletedAt', async () => {
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue({
        ...MOCK_TASK,
        deletedAt: new Date(),
      });

      await service.remove('user-uuid-1', 'task-uuid-1');

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          taskId: 'task-uuid-1',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: { status: 'CANCELLED' },
      });
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          schedule: { taskId: 'task-uuid-1' },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          claimId: null,
          processingStartedAt: null,
          nextAttemptAt: null,
        },
      });
      expect(transactionMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            deletedAt: expect.any(Date),
          }),
        }),
      );
      expect(
        transactionMock.notificationSchedule.updateMany.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        transactionMock.notificationDelivery.updateMany.mock
          .invocationCallOrder[0],
      );
      expect(
        transactionMock.notificationDelivery.updateMany.mock
          .invocationCallOrder[0],
      ).toBeLessThan(transactionMock.task.update.mock.invocationCallOrder[0]);
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        MOCK_TASK.startAt,
        transactionMock,
      );
    });

    it('does not recompute scores when the task nested write fails', async () => {
      const writeError = new Error('task and schedule remove failed');
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockRejectedValue(writeError);

      await expect(service.remove('user-uuid-1', 'task-uuid-1')).rejects.toBe(
        writeError,
      );

      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('sets status COMPLETED and completedAt', async () => {
      const completedTask = {
        ...MOCK_TASK,
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      };
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockResolvedValue(completedTask);

      const result = await service.complete('user-uuid-1', 'task-uuid-1');

      expect(result.status).toBe(TaskStatus.COMPLETED);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(
        transactionMock.notificationSchedule.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          taskId: 'task-uuid-1',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: { status: 'CANCELLED' },
      });
      expect(
        transactionMock.notificationDelivery.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          schedule: { taskId: 'task-uuid-1' },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          claimId: null,
          processingStartedAt: null,
          nextAttemptAt: null,
        },
      });
      expect(transactionMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: TaskStatus.COMPLETED,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            completedAt: expect.any(Date),
          }),
        }),
      );
      expect(
        transactionMock.notificationSchedule.updateMany.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        transactionMock.notificationDelivery.updateMany.mock
          .invocationCallOrder[0],
      );
      expect(
        transactionMock.notificationDelivery.updateMany.mock
          .invocationCallOrder[0],
      ).toBeLessThan(transactionMock.task.update.mock.invocationCallOrder[0]);
      expect(scoresMock.recompute).toHaveBeenCalledWith(
        'user-uuid-1',
        completedTask.startAt,
        transactionMock,
      );
    });

    it('preserves the timestamp when an already completed task is completed again', async () => {
      const completedAt = new Date('2026-06-03T07:30:00.000Z');
      const completedTask = {
        ...MOCK_TASK,
        status: TaskStatus.COMPLETED,
        completedAt,
      };
      transactionMock.task.findFirst.mockResolvedValue(completedTask);
      transactionMock.task.update.mockResolvedValue(completedTask);

      await service.complete('user-uuid-1', 'task-uuid-1');

      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        data: {
          status: TaskStatus.COMPLETED,
          completedAt,
        },
      });
    });

    it('stamps a legacy completed task whose timestamp is null', async () => {
      const now = new Date('2026-06-03T08:30:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      const legacyTask = {
        ...MOCK_TASK,
        status: TaskStatus.COMPLETED,
        completedAt: null,
      };
      transactionMock.task.findFirst.mockResolvedValue(legacyTask);
      transactionMock.task.update.mockResolvedValue({
        ...legacyTask,
        completedAt: now,
      });

      await service.complete('user-uuid-1', 'task-uuid-1');

      expect(transactionMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        data: {
          status: TaskStatus.COMPLETED,
          completedAt: now,
        },
      });
    });

    it('does not recompute scores when the task nested write fails', async () => {
      const writeError = new Error('task and schedule completion failed');
      transactionMock.task.findFirst.mockResolvedValue(MOCK_TASK);
      transactionMock.task.update.mockRejectedValue(writeError);

      await expect(service.complete('user-uuid-1', 'task-uuid-1')).rejects.toBe(
        writeError,
      );

      expect(scoresMock.recompute).not.toHaveBeenCalled();
    });
  });
});
