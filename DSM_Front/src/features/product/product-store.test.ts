import { ApiError } from '../../lib/api/api-error';
import { ProductStore } from './product-store';
import type { ProductApi } from './product-api';
import type { Period, Task, TaskInput } from './product-contracts';
import { OfflineTaskStorage } from './task-offline-storage';
import { OfflineTaskSync, type TaskSyncApi } from './task-sync';

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
  const api: jest.Mocked<ProductApi> = {
    tasks: jest.fn(async (_date: string) => [task]),
    categories: jest.fn(async () => []),
    score: jest.fn(async (_date: string) => null),
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
    leaderboard: jest.fn(async (_period: Period) => []),
    issueClientMutationId: jest.fn(async () => mutationIdA),
    create: jest.fn(
      async (_input: TaskInput, _clientMutationId: string) => task,
    ),
    update: jest.fn(async (_id: string, _input: TaskInput) => task),
    complete: jest.fn(async (_id: string) => ({ ...task, status: 'COMPLETED' as const })),
    undo: jest.fn(async (_id: string) => task),
    remove: jest.fn(async (_id: string) => {}),
  };
  return { api, store: new ProductStore(api, 'u', '2026-09-04') };
}

describe('realtime metric invalidation', () => {
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  test('loads only selected score/summary and current ranking/leaderboard and coalesces bursts', async () => {
    const { store, api } = setup();
    const first = deferred<Awaited<ReturnType<ProductApi['score']>>>();
    api.score.mockReturnValueOnce(first.promise);
    const operation = store.applyRealtime(['scores']); await flush();
    for (let i = 0; i < 100; i++) expect(store.applyRealtime(['scores', 'rankings'])).toBe(operation);
    expect(api.score).toHaveBeenCalledTimes(1);
    first.resolve(null); await operation;
    expect(api.score.mock.calls).toEqual([['2026-09-04'], ['2026-09-04']]);
    expect(api.summary).toHaveBeenCalledTimes(2);
    expect(api.ranking.mock.calls).toEqual([['DAILY']]);
    expect(api.leaderboard.mock.calls).toEqual([['DAILY']]);
    expect(api.tasks).not.toHaveBeenCalled(); expect(api.categories).not.toHaveBeenCalled();
    expect(store.getSnapshot().summary.data?.totalScore).toBe(123);
  });
  test('keeps manual refresh newer than a delayed realtime result', async () => {
    const { store, api } = setup();
    const old = deferred<Awaited<ReturnType<ProductApi['summary']>>>(); api.summary.mockReturnValueOnce(old.promise);
    const signal = store.applyRealtime(['scores']); await flush();
    api.summary.mockResolvedValueOnce({ totalScore: 999, tier: 'BRONZE' }); await store.refresh();
    old.resolve({ totalScore: 1, tier: 'BRONZE' }); await signal;
    expect(store.getSnapshot().summary.data?.totalScore).toBe(999);
  });
  test('discards queued old scopes across date and period changes and fences delayed responses', async () => {
    const { store, api } = setup();
    const score = deferred<Awaited<ReturnType<ProductApi['score']>>>();
    const ranking = deferred<Awaited<ReturnType<ProductApi['ranking']>>>();
    api.score.mockReturnValueOnce(score.promise); api.ranking.mockReturnValueOnce(ranking.promise);
    const operation = store.applyRealtime(['scores', 'rankings']); await flush(); store.applyRealtime(['scores', 'rankings']);
    await store.setDate('2026-09-05'); await store.setPeriod('WEEKLY');
    score.resolve({ userId: 'u', scoreDate: '2026-09-04T00:00:00Z', cappedScore: 10, achievementRate: 10 });
    ranking.resolve({ period: 'DAILY', score: 11, rank: 1, percentile: 100, totalUsers: 1 }); await operation;
    expect(api.score).toHaveBeenCalledTimes(2); expect(api.ranking).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().score.data).toBeNull(); expect(store.getSnapshot().ranking.data?.period).toBe('WEEKLY');
    await store.applyRealtime(['scores', 'rankings']);
    expect(api.score).toHaveBeenLastCalledWith('2026-09-05'); expect(api.ranking).toHaveBeenLastCalledWith('WEEKLY');
  });
  test('does nothing offline or disposed and cannot publish old results after reactivation', async () => {
    const { store, api } = setup(); const old = deferred<Awaited<ReturnType<ProductApi['summary']>>>();
    store.setOnline(false); await store.applyRealtime(['scores', 'rankings']); expect(api.summary).not.toHaveBeenCalled();
    store.setOnline(true); api.summary.mockReturnValueOnce(old.promise);
    const operation = store.applyRealtime(['scores']); await flush(); store.applyRealtime(['rankings']);
    store.dispose(); await store.applyRealtime(['scores']); store.activate();
    old.resolve({ totalScore: 1, tier: 'BRONZE' }); await operation;
    expect(store.getSnapshot().summary.data).toBeNull(); expect(api.ranking).not.toHaveBeenCalled();
    await store.applyRealtime(['scores']); expect(store.getSnapshot().summary.data?.totalScore).toBe(123);
  });
  test('preserves cached metrics with a safe error and waits for a later signal after failure', async () => {
    const { store, api } = setup(); await store.applyRealtime(['scores']);
    const failure = deferred<Awaited<ReturnType<ProductApi['summary']>>>(); api.summary.mockReturnValueOnce(failure.promise);
    const operation = store.applyRealtime(['scores']); await flush();
    for (let i = 0; i < 30; i++) store.applyRealtime(['scores']);
    failure.reject(new ApiError('network', 'private network details')); await operation; await flush();
    expect(api.summary).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().summary).toMatchObject({ status: 'error', data: { totalScore: 123 } });
    expect(store.getSnapshot().summary.error).not.toContain('private');
    await store.applyRealtime(['scores']); expect(store.getSnapshot().summary.status).toBe('ready');
  });
  test('defers metric signals through mutation and lets the mutation refresh finish', async () => {
    const { store, api } = setup(); await store.loadHome();
    const pending = deferred<Task>(); api.complete.mockReturnValueOnce(pending.promise);
    const mutation = store.toggle('t'); await store.applyRealtime(['rankings']);
    expect(api.ranking).not.toHaveBeenCalled();
    pending.resolve({ ...task, status: 'COMPLETED' }); expect(await mutation).toBe(true); await flush();
    expect(store.getSnapshot().ranking.status).toBe('ready'); expect(store.getSnapshot().tasks.data?.[0].id).toBe('t');
  });
  test('still reloads requested ranking on UTC day rollover', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-09-04T23:59:59Z'));
      const { store, api } = setup(); await store.applyRealtime(['rankings']);
      jest.setSystemTime(new Date('2026-09-05T00:00:00Z'));
      await store.applyRealtime(['rankings']);
      expect(api.ranking).toHaveBeenCalledTimes(2); expect(store.getSnapshot().ranking.status).toBe('ready');
    } finally { jest.useRealTimers(); }
  });
});

describe('durable offline workspace integration', () => {
  const stores: ProductStore[] = [];
  afterEach(() => stores.splice(0).forEach(store => store.dispose()));
  function local() {
    const { api } = setup();
    const values = new Map<string, string>();
    const backing = {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
      removeItem: jest.fn(async (key: string) => { values.delete(key); }),
    };
    const storage = new OfflineTaskStorage(backing, 'u');
    const remote: jest.Mocked<TaskSyncApi> = { userId: 'u',
      list: jest.fn(async (_date: string) => ({ tasks: [] as Task[], logicalTime: 0 })),
      apply: jest.fn(async operation => ({ mutationId: operation.mutationId,
        outcome: operation.kind === 'delete' ? 'deleted' as const : 'applied' as const,
        task: { ...task, ...operation.task, id: operation.taskId },
        logicalTime: Date.parse(operation.updatedAt), serverTime: new Date().toISOString() })),
    };
    let sequence = 0;
    const factory = () => ({ storage, engine: new OfflineTaskSync(storage, remote, {
      uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    }) });
    const store = new ProductStore(api, 'u', '2026-09-04', factory);
    stores.push(store);
    store.setOnline(false);
    store.activate();
    return { store, api, storage, remote, backing, factory };
  }
  test('persists create/edit/complete/delete offline without HTTP and restores after reconnecting effects', async () => {
    const { store, api, remote, storage } = local();
    await store.loadHome();
    expect(await store.create(createInput)).toBe(true);
    const id = store.getSnapshot().tasks.data![0].id;
    expect(await store.update(id, { ...createInput, title: 'edited' })).toBe(true);
    expect(await store.toggle(id)).toBe(true);
    expect(store.getSnapshot().tasks.data![0]).toMatchObject({ title: 'edited', status: 'COMPLETED' });
    expect(store.getSnapshot().sync.pendingCount).toBe(3);
    store.dispose(); store.activate();
    await store.loadHome();
    expect(store.getSnapshot().tasks.data![0].title).toBe('edited');
    expect(await store.remove(id)).toBe(true);
    expect(store.getSnapshot().tasks.data).toEqual([]);
    expect(storage.getSnapshot()?.outbox).toHaveLength(4);
    expect(remote.apply).not.toHaveBeenCalled();
    for (const method of Object.values(api)) expect(method).not.toHaveBeenCalled();
  });
  test('does not publish success or a task when the durable write fails', async () => {
    const { store, backing } = local();
    await store.loadHome();
    backing.setItem.mockRejectedValueOnce(new Error('private disk error'));
    expect(await store.create(createInput)).toBe(false);
    expect(store.getSnapshot().tasks.data).toEqual([]);
    expect(store.getSnapshot().mutationError).toBeTruthy();
    expect(store.getSnapshot().mutationError).not.toContain('private');
  });
  test('shows cached categories and date-scoped pending tasks after reopening', async () => {
    const { store, storage } = local();
    await storage.open();
    await storage.update(draft => { draft.categories = [{ id: 'c', name: 'cached', color: '#fff', isDefault: false, userId: 'u' }]; });
    await store.loadHome();
    await store.create(createInput);
    expect(store.getSnapshot().categories.data?.[0].name).toBe('cached');
    await store.setDate('2026-09-05');
    expect(store.getSnapshot().tasks.data).toEqual([]);
    await store.setDate('2026-09-04');
    expect(store.getSnapshot().tasks.data).toHaveLength(1);
  });
  test('recovery sends the persisted operation and refreshes server-derived scores', async () => {
    const { store, remote, api } = local();
    await store.loadHome(); await store.create(createInput);
    const applied = deferred<void>();
    remote.apply.mockImplementationOnce(async operation => {
      applied.resolve();
      return { mutationId: operation.mutationId, outcome: 'applied',
        task: { ...task, ...operation.task, id: operation.taskId },
        logicalTime: Date.parse(operation.updatedAt), serverTime: new Date().toISOString() };
    });
    store.setOnline(true);
    await applied.promise;
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(store.getSnapshot().sync.pendingCount).toBe(0);
    expect(api.summary).toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
  });
  test.each(['network', 'write'] as const)('preserves a category %s error alongside its cached data', async kind => {
    const { store, api, backing } = local();
    api.categories.mockResolvedValue([{ id: 'c', name: 'cached', color: '#fff', isDefault: false, userId: 'u' }]);
    store.setOnline(true);
    await store.loadHome();
    if (kind === 'network') api.categories.mockRejectedValue(new ApiError('network', 'private'));
    else backing.setItem.mockRejectedValue(new Error('private disk'));
    await store.loadHome();
    expect(store.getSnapshot().categories.status).toBe('error');
    expect(store.getSnapshot().categories.error).toBeTruthy();
    expect(store.getSnapshot().categories.error).not.toContain('private');
    expect(store.getSnapshot().categories.data?.[0].name).toBe('cached');
  });
  test('can explicitly cancel a definitively blocked local task without losing another pending task', async () => {
    const { store, storage } = local();
    await store.loadHome(); await store.create(createInput);
    const id = store.getSnapshot().tasks.data![0].id;
    await storage.update(draft => { draft.outbox[0].blocked = 'HTTP_404'; });
    await store.update(id, { ...createInput, title: 'corrected' });
    await store.create({ ...createInput, title: 'keep me' });
    expect(store.blockedTasks()).toEqual([{ taskId: id, title: 'corrected' }]);
    expect(await store.discardBlocked(id)).toBe(true);
    expect(store.getSnapshot().tasks.data?.map(item => item.title)).toEqual(['keep me']);
    expect(storage.getSnapshot()?.outbox).toHaveLength(1);
    expect(await store.discardBlocked(store.getSnapshot().tasks.data![0].id)).toBe(false);
  });
});
test('loads independent resources and keeps a partial failure visible', async () => {
  const { api, store } = setup();
  api.summary.mockRejectedValueOnce(new ApiError('network', 'private'));
  await store.loadHome();
  expect(store.getSnapshot().tasks.data).toEqual([task]);
  expect(store.getSnapshot().score.status).toBe('ready');
  expect(store.getSnapshot().summary.status).toBe('error');
  expect(store.getSnapshot().summary.error).not.toContain('private');
});

test.each([
  ['TASK_DAILY_LIMIT', 409, '하루 일과 등록 한도에 도달했습니다.'],
  ['CATEGORY_NAME_CONFLICT', 409, '같은 이름의 카테고리가 있습니다. 다른 이름을 입력해 주세요.'],
  ['INVALID_TIME_RANGE', 400, '종료 일시는 시작 일시보다 뒤여야 합니다.'],
  ['VALIDATION_FAILED', 400, '입력값과 날짜를 확인해 주세요.'],
])('shows safe feedback for server code %s', async (code, status, expected) => {
  const { api, store } = setup();
  api.create.mockRejectedValue(new ApiError('http', 'private backend detail', { code, status }));
  await store.create(createInput);
  expect(store.getSnapshot().mutationError).toBe(expected);
});

const resourceKeys = ['tasks', 'categories', 'score', 'summary', 'ranking', 'leaderboard'] as const;
const recoverableErrors = [
  new ApiError('network', 'private-network'),
  new ApiError('timeout', 'private-timeout'),
  new ApiError('http', 'private-server', { status: 500 }),
  new ApiError('http', 'private-server', { status: 502 }),
  new ApiError('http', 'private-server', { status: 503 }),
  new ApiError('http', 'private-server', { status: 599 }),
];

test.each(recoverableErrors)('preserves same-scope data on $kind/$status refresh failure', async (error) => {
  const { api, store } = setup();
  api.categories.mockResolvedValue([{ id: 'c', name: 'work', color: '#fff', isDefault: false, userId: 'u' }]);
  api.score.mockResolvedValue({ userId: 'u', scoreDate: '2026-09-04T00:00:00Z', cappedScore: 100, achievementRate: 50 });
  api.leaderboard.mockResolvedValue([{ userId: 'u', nickname: 'name', score: 100, rank: 1, tier: 'BRONZE', profileImageUrl: null }]);
  await store.refresh();
  const previous = store.getSnapshot();
  for (const key of resourceKeys) api[key].mockRejectedValue(error);

  await store.refresh();
  await store.refresh();

  for (const key of resourceKeys) {
    expect(store.getSnapshot()[key]).toEqual({
      status: 'error',
      data: previous[key].data,
      error: expect.any(String),
    });
    expect(store.getSnapshot()[key].error).not.toContain('private');
  }
  api.tasks.mockResolvedValueOnce([{ ...task, title: 'recovered' }]);
  await store.loadHome();
  expect(store.getSnapshot().tasks).toMatchObject({ status: 'ready', data: [{ title: 'recovered' }], error: null });
});

test.each(recoverableErrors)('keeps an initial $kind/$status failure empty', async (error) => {
  const { api, store } = setup();
  for (const key of resourceKeys) api[key].mockRejectedValue(error);
  await store.refresh();
  for (const key of resourceKeys) {
    expect(store.getSnapshot()[key]).toEqual({ status: 'error', data: null, error: expect.any(String) });
  }
});

test.each([
  ['protocol', new ApiError('protocol', 'private')],
  ['unauthorized', new ApiError('unauthorized', 'private', { status: 401 })],
  ['HTTP 400', new ApiError('http', 'private', { status: 400 })],
  ['HTTP 499', new ApiError('http', 'private', { status: 499 })],
  ['HTTP 600', new ApiError('http', 'private', { status: 600 })],
  ['unknown', new Error('private')],
])('discards prior data on a non-recoverable %s error', async (_label, error) => {
  const { api, store } = setup();
  await store.refresh();
  for (const key of resourceKeys) api[key].mockRejectedValue(error);
  await store.refresh();
  for (const key of resourceKeys) {
    expect(store.getSnapshot()[key]).toEqual({ status: 'error', data: null, error: expect.any(String) });
  }
});

test('discards old data when a successful response fails its owner check', async () => {
  const { api, store } = setup();
  await store.loadHome();
  api.tasks.mockResolvedValueOnce([{ ...task, userId: 'other' }]);
  api.categories.mockResolvedValueOnce([{ id: 'c', name: 'other', color: '#fff', userId: 'other', isDefault: false }]);
  api.score.mockResolvedValueOnce({ userId: 'other', scoreDate: '2026-09-04T00:00:00Z', cappedScore: 100, achievementRate: 50 });
  await store.loadHome();
  for (const key of ['tasks', 'categories', 'score'] as const) {
    expect(store.getSnapshot()[key]).toEqual({ status: 'error', data: null, error: expect.any(String) });
  }
});

test('does not carry date or period data into a failed different scope', async () => {
  const { api, store } = setup();
  await store.refresh();
  api.tasks.mockRejectedValueOnce(new ApiError('http', 'unavailable', { status: 503 }));
  api.score.mockRejectedValueOnce(new ApiError('network', 'unavailable'));
  await store.setDate('2026-09-05');
  expect(store.getSnapshot().tasks.data).toBeNull();
  expect(store.getSnapshot().score.data).toBeNull();
  api.ranking.mockRejectedValueOnce(new ApiError('http', 'unavailable', { status: 502 }));
  api.leaderboard.mockRejectedValueOnce(new ApiError('timeout', 'unavailable'));
  await store.setPeriod('WEEKLY');
  expect(store.getSnapshot().ranking.data).toBeNull();
  expect(store.getSnapshot().leaderboard.data).toBeNull();
});

test('treats reselecting the same date and period as same-scope refresh', async () => {
  const { api, store } = setup();
  await store.refresh();
  const previous = store.getSnapshot();
  api.tasks.mockRejectedValueOnce(new ApiError('network', 'unavailable'));
  await store.setDate('2026-09-04');
  expect(store.getSnapshot().tasks.data).toEqual([task]);
  api.ranking.mockRejectedValueOnce(new ApiError('http', 'unavailable', { status: 503 }));
  await store.setPeriod('DAILY');
  expect(store.getSnapshot().ranking.data).toEqual(previous.ranking.data);
});

test('refuses to complete a cancelled task without starting a mutation', async () => {
  const { api, store } = setup();
  const cancelled: Task = { ...task, status: 'CANCELLED' };
  api.tasks.mockResolvedValueOnce([cancelled]);
  await store.loadHome();
  const before = store.getSnapshot();
  expect(await store.toggle('t')).toBe(false);
  expect(api.complete).not.toHaveBeenCalled();
  expect(api.undo).not.toHaveBeenCalled();
  expect(store.getSnapshot()).toBe(before);
});

describe('UTC today tracking', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-04T23:59:59.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  test.each(['refresh', 'loadHome'] as const)('%s advances the followed day at UTC midnight', async (load) => {
    const { api, store } = setup();
    await store.refresh();
    jest.setSystemTime(new Date('2026-09-05T00:00:00.000Z'));
    api.tasks.mockRejectedValueOnce(new ApiError('http', 'unavailable', { status: 503 }));
    api.score.mockRejectedValueOnce(new ApiError('network', 'unavailable'));
    await store[load]();
    expect(store.getSnapshot().date).toBe('2026-09-05');
    expect(api.tasks).toHaveBeenLastCalledWith('2026-09-05');
    expect(api.score).toHaveBeenLastCalledWith('2026-09-05');
    expect(store.getSnapshot().tasks.data).toBeNull();
    expect(store.getSnapshot().score.data).toBeNull();
  });

  test('keeps an explicitly selected historical date and resumes following after today selection', async () => {
    const { api, store } = setup();
    api.tasks.mockResolvedValue([]);
    await store.setDate('2026-09-03');
    jest.setSystemTime(new Date('2026-09-05T00:00:00.000Z'));
    await store.refresh();
    expect(store.getSnapshot().date).toBe('2026-09-03');
    expect(api.tasks).toHaveBeenLastCalledWith('2026-09-03');
    await store.setDate('2026-09-05');
    jest.setSystemTime(new Date('2026-09-06T00:00:00.000Z'));
    await store.refresh();
    expect(store.getSnapshot().date).toBe('2026-09-06');
    expect(api.tasks).toHaveBeenLastCalledWith('2026-09-06');
  });

  test('pins a historical constructor date and follows the default constructor day', async () => {
    const { api } = setup();
    api.tasks.mockResolvedValue([]);
    const historical = new ProductStore(api, 'u', '2026-09-03');
    const today = new ProductStore(api, 'u');
    jest.setSystemTime(new Date('2026-09-05T00:00:00.000Z'));
    await historical.refresh();
    await today.refresh();
    expect(historical.getSnapshot().date).toBe('2026-09-03');
    expect(today.getSnapshot().date).toBe('2026-09-05');
  });

  test.each(['resolve', 'reject'] as const)('ignores an old day task response that later %s', async (outcome) => {
    const { api, store } = setup();
    await store.loadHome();
    const old = deferred<Task[]>();
    const oldScore = deferred<Awaited<ReturnType<ProductApi['score']>>>();
    api.tasks.mockReturnValueOnce(old.promise);
    api.score.mockReturnValueOnce(oldScore.promise);
    const previous = store.loadHome();
    jest.setSystemTime(new Date('2026-09-05T00:00:00.000Z'));
    const currentTask = { ...task, id: 'today', startAt: '2026-09-05T09:00:00Z', endAt: '2026-09-05T10:00:00Z' };
    const currentScore = { userId: 'u', scoreDate: '2026-09-05T00:00:00Z', cappedScore: 100, achievementRate: 50 };
    api.tasks.mockResolvedValueOnce([currentTask]);
    api.score.mockResolvedValueOnce(currentScore);
    await store.refresh();
    if (outcome === 'resolve') {
      old.resolve([task]);
      oldScore.resolve({ ...currentScore, scoreDate: '2026-09-04T00:00:00Z' });
    } else {
      old.reject(new ApiError('http', 'unavailable', { status: 503 }));
      oldScore.reject(new ApiError('http', 'unavailable', { status: 503 }));
    }
    await previous;
    expect(store.getSnapshot().date).toBe('2026-09-05');
    expect(store.getSnapshot().tasks).toEqual({ status: 'ready', data: [currentTask], error: null });
    expect(store.getSnapshot().score).toEqual({ status: 'ready', data: currentScore, error: null });
  });

  test('home loading clears and fences yesterday ranking before its old response settles', async () => {
    const { api, store } = setup();
    await store.refresh();
    const oldRanking = deferred<Awaited<ReturnType<ProductApi['ranking']>>>();
    const oldLeaders = deferred<Awaited<ReturnType<ProductApi['leaderboard']>>>();
    api.ranking.mockReturnValueOnce(oldRanking.promise);
    api.leaderboard.mockReturnValueOnce(oldLeaders.promise);
    const pending = store.loadRanking();
    jest.setSystemTime(new Date('2026-09-05T00:00:00.000Z'));
    api.tasks.mockResolvedValueOnce([]);
    await store.loadHome();
    expect(store.getSnapshot().ranking.data).toBeNull();
    expect(store.getSnapshot().leaderboard.data).toBeNull();
    oldRanking.resolve({ period: 'DAILY', score: 10, rank: 1, percentile: 100, totalUsers: 1 });
    oldLeaders.resolve([]);
    await pending;
    expect(store.getSnapshot().ranking).toEqual({ status: 'idle', data: null, error: null });
    expect(store.getSnapshot().leaderboard).toEqual({ status: 'idle', data: null, error: null });
  });

  test('refreshes ranking day scope even when the selected task date is historical', async () => {
    const { api, store } = setup();
    api.tasks.mockResolvedValue([]);
    await store.setDate('2026-09-03');
    await store.loadRanking();
    const old = deferred<Awaited<ReturnType<ProductApi['ranking']>>>();
    api.ranking.mockReturnValueOnce(old.promise);
    const previous = store.loadRanking();
    jest.setSystemTime(new Date('2026-09-05T00:00:00.000Z'));
    api.ranking.mockRejectedValueOnce(new ApiError('http', 'unavailable', { status: 503 }));
    api.leaderboard.mockRejectedValueOnce(new ApiError('timeout', 'unavailable'));
    await store.refresh();
    old.resolve({ period: 'DAILY', score: 10, rank: 1, percentile: 100, totalUsers: 1 });
    await previous;
    expect(store.getSnapshot().date).toBe('2026-09-03');
    expect(store.getSnapshot().ranking).toEqual({ status: 'error', data: null, error: expect.any(String) });
    expect(store.getSnapshot().leaderboard.data).toBeNull();
  });

  test('does not change the task date during mutation and follows the day on the next refresh', async () => {
    const { api, store } = setup();
    await store.loadHome();
    const pending = deferred<Task>();
    api.complete.mockReturnValueOnce(pending.promise);
    const mutation = store.toggle('t');
    jest.setSystemTime(new Date('2026-09-05T00:00:00.000Z'));
    await store.refresh();
    await store.loadHome();
    await store.setDate('2026-09-03');
    expect(store.getSnapshot().date).toBe('2026-09-04');
    pending.resolve({ ...task, status: 'COMPLETED' });
    await mutation;
    api.tasks.mockResolvedValueOnce([]);
    await store.refresh();
    expect(store.getSnapshot().date).toBe('2026-09-05');
    expect(store.getSnapshot().tasks.data).toEqual([]);
  });
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
