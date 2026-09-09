import { ApiError } from '../../lib/api/api-error';
import { ProductStore } from './product-store';
import type { ProductApi } from './product-api';
import type { Task, TaskInput } from './product-contracts';

const mutationIdA = '10000000-0000-4000-8000-000000000001';
const mutationIdB = '20000000-0000-4000-8000-000000000002';

const task: Task = {
  id: 't',
  userId: 'u',
  title: 'server',
  description: null,
  startAt: '2026-09-04T09:00:00Z',
  endAt: '2026-09-04T10:00:00Z',
  difficulty: 'LOW',
  status: 'PENDING',
  categoryId: null,
  completedAt: null,
  notificationEnabled: false,
};
const createInput: TaskInput = {
  title: 'new',
  startAt: task.startAt,
  endAt: task.endAt,
  difficulty: 'LOW',
  notificationEnabled: false,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { resolve, reject, promise };
}
function setup() {
  const api = {
    tasks: jest.fn(async () => [task]),
    categories: jest.fn(async () => []),
    score: jest.fn(async () => null),
    summary: jest.fn(async () => ({
      totalScore: 123,
      tier: 'BRONZE' as const,
    })),
    ranking: jest.fn(async (period) => ({
      period,
      score: 0,
      rank: 1,
      percentile: 100,
      totalUsers: 1,
    })),
    leaderboard: jest.fn(async () => []),
    issueClientMutationId: jest.fn(async () => mutationIdA),
    create: jest.fn(
      async (_input: TaskInput, _clientMutationId: string) => task,
    ),
    update: jest.fn(async () => task),
    complete: jest.fn(async () => ({ ...task, status: 'COMPLETED' as const })),
    undo: jest.fn(async () => task),
    remove: jest.fn(async () => {}),
  } satisfies ProductApi;
  return { api, store: new ProductStore(api, 'u', '2026-09-04') };
}
test('loads independent resources and keeps a partial failure visible', async () => {
  const { api, store } = setup();
  api.summary.mockRejectedValueOnce(new ApiError('network', 'private'));
  await store.loadHome();
  expect(store.getSnapshot().tasks.data).toEqual([task]);
  expect(store.getSnapshot().score.status).toBe('ready');
  expect(store.getSnapshot().summary.status).toBe('error');
  expect(store.getSnapshot().summary.error).not.toContain('private');
});
test('ignores stale date results and refuses another user data', async () => {
  const { api, store } = setup();
  const first = deferred<Task[]>();
  api.tasks.mockReturnValueOnce(first.promise);
  const old = store.loadHome();
  api.tasks.mockResolvedValueOnce([]);
  await store.setDate('2026-09-05');
  first.resolve([task]);
  await old;
  expect(store.getSnapshot().tasks.data).toEqual([]);
  api.tasks.mockResolvedValueOnce([{ ...task, userId: 'other' }]);
  await store.loadHome();
  expect(store.getSnapshot().tasks.status).toBe('error');
});
test('optimistic toggle rolls back on failure and rejects duplicate mutation', async () => {
  const { api, store } = setup();
  await store.loadHome();
  const pending = deferred<Task & { status: 'COMPLETED' }>();
  api.complete.mockReturnValueOnce(pending.promise);
  const operation = store.toggle('t');
  expect(store.getSnapshot().tasks.data?.[0].status).toBe('COMPLETED');
  expect(await store.toggle('t')).toBe(false);
  pending.reject(new ApiError('http', 'private', { status: 409 }));
  expect(await operation).toBe(false);
  expect(store.getSnapshot().tasks.data?.[0].status).toBe('PENDING');
  expect(api.complete).toHaveBeenCalledTimes(1);
});
test('successful mutation refreshes server scores and rank; dispose ignores pending work', async () => {
  const { api, store } = setup();
  await store.loadHome();
  expect(await store.remove('t')).toBe(true);
  expect(api.summary).toHaveBeenCalledTimes(2);
  expect(api.ranking).toHaveBeenCalled();
  const pending = deferred<Task[]>();
  api.tasks.mockReturnValueOnce(pending.promise);
  const old = store.loadHome();
  store.dispose();
  const snapshot = store.getSnapshot();
  pending.resolve([task]);
  await old;
  expect(store.getSnapshot()).toBe(snapshot);
  expect(await store.toggle('t')).toBe(false);
});

test.each(['network', 'timeout', 'protocol'] as const)(
  'a %s failure during mutation ID preflight does not create or reconcile',
  async (kind) => {
    const { api, store } = setup();
    await store.loadHome();
    api.issueClientMutationId.mockRejectedValueOnce(
      new ApiError(kind, 'private'),
    );

    expect(await store.create(createInput)).toBe(false);

    expect(api.issueClientMutationId).toHaveBeenCalledTimes(1);
    expect(api.create).not.toHaveBeenCalled();
    expect(api.tasks).toHaveBeenCalledTimes(1);
    expect(api.categories).toHaveBeenCalledTimes(1);
    expect(api.score).toHaveBeenCalledTimes(1);
    expect(api.summary).toHaveBeenCalledTimes(1);
    expect(api.ranking).not.toHaveBeenCalled();
    expect(api.leaderboard).not.toHaveBeenCalled();
  },
);

test('holds create single-flight while mutation ID preflight is pending', async () => {
  const { api, store } = setup();
  const preflight = deferred<string>();
  api.issueClientMutationId.mockReturnValueOnce(preflight.promise);

  const first = store.create(createInput);
  expect(await store.create(createInput)).toBe(false);
  expect(api.issueClientMutationId).toHaveBeenCalledTimes(1);
  expect(api.create).not.toHaveBeenCalled();

  preflight.resolve(mutationIdA);
  expect(await first).toBe(true);
  expect(api.create).toHaveBeenCalledTimes(1);
});

test('keeps create single-flight while the Task POST is pending', async () => {
  const { api, store } = setup();
  const post = deferred<Task>();
  const postStarted = deferred<void>();
  api.create.mockImplementationOnce(() => {
    postStarted.resolve(undefined);
    return post.promise;
  });

  const first = store.create(createInput);
  await postStarted.promise;
  expect(await store.create(createInput)).toBe(false);
  expect(api.issueClientMutationId).toHaveBeenCalledTimes(1);
  expect(api.create).toHaveBeenCalledTimes(1);

  post.resolve(task);
  expect(await first).toBe(true);
});

test('ambiguous Task create reuses its mutation ID on a canonical manual retry', async () => {
  const { api, store } = setup();
  await store.loadHome();
  api.create.mockRejectedValueOnce(new ApiError('timeout', 'private'));

  expect(await store.create(createInput)).toBe(false);
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(api.tasks).toHaveBeenCalledTimes(2);
  expect(store.getSnapshot().mutationError).toContain('확인');

  const equivalentInput: TaskInput = {
    notificationEnabled: false,
    categoryId: undefined,
    difficulty: 'LOW',
    endAt: task.endAt,
    startAt: task.startAt,
    description: undefined,
    title: 'new',
  };
  expect(await store.create(equivalentInput)).toBe(true);
  expect(api.issueClientMutationId).toHaveBeenCalledTimes(1);
  expect(api.create).toHaveBeenCalledTimes(2);
  expect(api.create.mock.calls.map((call) => call[1])).toEqual([
    mutationIdA,
    mutationIdA,
  ]);
});

test.each([
  ['HTTP response', new ApiError('http', 'private', { status: 409 })],
  [
    'unauthorized response',
    new ApiError('unauthorized', 'private', { status: 401 }),
  ],
  ['non-ambiguous client failure', new Error('private')],
])('a definite %s releases its mutation ID before retry', async (_label, error) => {
  const { api, store } = setup();
  api.issueClientMutationId
    .mockResolvedValueOnce(mutationIdA)
    .mockResolvedValueOnce(mutationIdB);
  api.create.mockRejectedValueOnce(error);

  expect(await store.create(createInput)).toBe(false);
  expect(await store.create(createInput)).toBe(true);

  expect(api.issueClientMutationId).toHaveBeenCalledTimes(2);
  expect(api.create.mock.calls.map((call) => call[1])).toEqual([
    mutationIdA,
    mutationIdB,
  ]);
});

test('update, toggle, and remove keep ambiguous reconciliation semantics', async () => {
  const { api, store } = setup();
  await store.loadHome();
  api.update.mockRejectedValueOnce(new ApiError('network', 'update'));
  api.complete.mockRejectedValueOnce(new ApiError('timeout', 'toggle'));
  api.remove.mockRejectedValueOnce(new ApiError('protocol', 'remove'));

  expect(await store.update('t', createInput)).toBe(false);
  expect(await store.toggle('t')).toBe(false);
  expect(await store.remove('t')).toBe(false);

  expect(api.issueClientMutationId).not.toHaveBeenCalled();
  expect(api.tasks).toHaveBeenCalledTimes(4);
  expect(api.ranking).toHaveBeenCalledTimes(3);
  expect(store.getSnapshot().mutationError).toContain('확인');
});

test('a successful create releases its mutation ID for the next create', async () => {
  const { api, store } = setup();
  api.issueClientMutationId
    .mockResolvedValueOnce(mutationIdA)
    .mockResolvedValueOnce(mutationIdB);

  expect(await store.create(createInput)).toBe(true);
  expect(await store.create(createInput)).toBe(true);

  expect(api.issueClientMutationId).toHaveBeenCalledTimes(2);
  expect(api.create.mock.calls.map((call) => call[1])).toEqual([
    mutationIdA,
    mutationIdB,
  ]);
});

test('changed input gets a new ID while restoring unresolved input reuses its ID', async () => {
  const { api, store } = setup();
  const changedInput = { ...createInput, title: 'changed' };
  api.issueClientMutationId
    .mockResolvedValueOnce(mutationIdA)
    .mockResolvedValueOnce(mutationIdB);
  api.create
    .mockRejectedValueOnce(new ApiError('timeout', 'first'))
    .mockRejectedValueOnce(new ApiError('network', 'second'));

  expect(await store.create(createInput)).toBe(false);
  expect(await store.create(changedInput)).toBe(false);
  expect(await store.create({ ...createInput })).toBe(true);

  expect(api.issueClientMutationId).toHaveBeenCalledTimes(2);
  expect(api.create.mock.calls.map((call) => call[1])).toEqual([
    mutationIdA,
    mutationIdB,
    mutationIdA,
  ]);
});

test('a lifetime change during mutation ID preflight prevents the Task POST', async () => {
  const { api, store } = setup();
  const preflight = deferred<string>();
  api.issueClientMutationId.mockReturnValueOnce(preflight.promise);
  const operation = store.create(createInput);

  store.dispose();
  store.activate();
  preflight.resolve(mutationIdA);

  expect(await operation).toBe(false);
  expect(api.issueClientMutationId).toHaveBeenCalledTimes(1);
  expect(api.create).not.toHaveBeenCalled();
  expect(api.tasks).not.toHaveBeenCalled();
});

test('dispose clears a retained create mutation ID', async () => {
  const { api, store } = setup();
  api.issueClientMutationId
    .mockResolvedValueOnce(mutationIdA)
    .mockResolvedValueOnce(mutationIdB);
  api.create.mockRejectedValueOnce(new ApiError('timeout', 'private'));

  expect(await store.create(createInput)).toBe(false);
  store.dispose();
  store.activate();
  expect(await store.create(createInput)).toBe(true);

  expect(api.issueClientMutationId).toHaveBeenCalledTimes(2);
  expect(api.create.mock.calls.map((call) => call[1])).toEqual([
    mutationIdA,
    mutationIdB,
  ]);
});

test('a failed mutation during refresh leaves usable data, not a cancelled loading state', async () => {
  const { api, store } = setup();
  await store.loadHome();
  const get = deferred<Task[]>();
  api.tasks.mockReturnValueOnce(get.promise);
  const refresh = store.loadHome();
  api.complete.mockRejectedValueOnce(
    new ApiError('http', 'conflict', { status: 409 }),
  );
  await store.toggle('t');
  get.resolve([task]);
  await refresh;
  expect(store.getSnapshot().tasks.status).toBe('ready');
  expect(store.getSnapshot().tasks.data?.[0].status).toBe('PENDING');
});

test('ignores old ranking period responses after switching periods', async () => {
  const { api, store } = setup();
  const old = deferred<Awaited<ReturnType<ProductApi['ranking']>>>();
  api.ranking.mockReturnValueOnce(old.promise);
  const first = store.loadRanking();
  await store.setPeriod('WEEKLY');
  old.resolve({
    period: 'DAILY',
    score: 99,
    rank: 1,
    percentile: 1,
    totalUsers: 100,
  });
  await first;
  expect(store.getSnapshot().ranking.data?.period).toBe('WEEKLY');
});
