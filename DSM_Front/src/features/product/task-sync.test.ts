import { createAuthenticatedClient } from '../../lib/api/authenticated-client';
import { createHttpClient } from '../../lib/api/http-client';
import { ApiError } from '../../lib/api/api-error';
import { OfflineTaskStorage, type StringStorage, type TaskSyncFields, type TaskSyncOperation } from './task-offline-storage';
import { createTaskSyncApi, OfflineTaskSync, type TaskSyncApi } from './task-sync';
import type { Task } from './product-contracts';

const day = '2026-09-11';
const nextDay = '2026-09-12';
const now = `${day}T10:00:00.000Z`;
const id = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fields = (title = '할 일'): TaskSyncFields => ({
  title, description: null, startAt: now, endAt: `${day}T11:00:00.000Z`,
  difficulty: 'LOW', status: 'PENDING', categoryId: null, notificationEnabled: false,
});
const task = (n = 1): Task => ({ ...fields(), id: id(n), userId: 'owner', completedAt: null });
const op = (n = 1): TaskSyncOperation => ({ mutationId: id(n), taskId: id(n), updatedAt: now, kind: 'create', task: fields() });
const projection = (n = 1) => ({ ...task(n), syncUpdatedAt: now, syncMutationId: id(n) });
function http(responses: Array<{ value: unknown; status?: number }>) {
  const fetchImpl = jest.fn(async (_url: string, _init?: RequestInit) => {
    const response = responses.shift()!;
    return { ok: (response.status ?? 200) < 400, status: response.status ?? 200,
      text: async () => JSON.stringify(response.value) } as Response;
  });
  const client = createAuthenticatedClient(createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl }), {
    getAccessToken: () => 'synthetic-access', refreshAccessToken: jest.fn(), onUnauthorized: jest.fn(),
  });
  return { api: createTaskSyncApi(client, 'owner'), fetchImpl };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const engines: OfflineTaskSync[] = [];
function fixture(owner = 'owner') {
  const values = new Map<string, string>();
  const backing = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { values.delete(key); }),
  } satisfies StringStorage;
  const api: jest.Mocked<TaskSyncApi> = {
    userId: owner,
    list: jest.fn<ReturnType<TaskSyncApi['list']>, Parameters<TaskSyncApi['list']>>(async () => ({ tasks: [], logicalTime: Date.parse(now) })),
    apply: jest.fn(async operation => ({ mutationId: operation.mutationId,
      outcome: operation.kind === 'delete' ? 'deleted' as const : 'applied' as const,
      task: { ...task(), ...operation.task, id: operation.taskId, userId: owner },
      logicalTime: Date.parse(operation.updatedAt), serverTime: now })),
  };
  let sequence = 0;
  const uuid = jest.fn(() => id(++sequence));
  const storage = new OfflineTaskStorage(backing, owner);
  const engine = new OfflineTaskSync(storage, api, { uuid, now: () => new Date(now) });
  engines.push(engine);
  return { values, backing, storage, api, uuid, engine };
}
const flush = () => jest.advanceTimersByTimeAsync(0);
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { engines.splice(0).forEach(engine => engine.dispose()); jest.useRealTimers(); });

test('POST uses the exact operation and validates owned version metadata', async () => {
  const result = { mutationId: id(), outcome: 'applied', task: projection(), serverTime: now };
  const { api, fetchImpl } = http([{ value: result }]);
  expect(await api.apply(op())).toEqual({ mutationId: id(), outcome: 'applied', task: task(), logicalTime: Date.parse(now), serverTime: now });
  expect(fetchImpl).toHaveBeenCalledWith('https://api.example.invalid/tasks/sync', expect.objectContaining({ method: 'POST', body: JSON.stringify(op()) }));
});

test('GET walks full pages, strips metadata, and observes the maximum logical version', async () => {
  const first = Array.from({ length: 100 }, (_, i) => projection(i + 1));
  const later = { ...projection(101), syncUpdatedAt: `${day}T10:00:00.001Z`, syncMutationId: '' };
  const { api, fetchImpl } = http([{ value: first }, { value: [later] }]);
  const result = await api.list(day);
  expect(result.tasks).toHaveLength(101);
  expect(result.logicalTime).toBe(Date.parse(later.syncUpdatedAt));
  expect(fetchImpl.mock.calls[0][0]).toBe(`https://api.example.invalid/tasks/sync?date=${day}&limit=100`);
  expect(fetchImpl.mock.calls[1][0]).toBe(`https://api.example.invalid/tasks/sync?date=${day}&limit=100&cursor=${id(100)}`);
});

test.each([
  { userId: 'other' }, { id: id(2) }, { syncUpdatedAt: '2026-02-30T10:00:00.000Z' },
  { syncUpdatedAt: '2026-09-11T10:00:00Z' }, { syncMutationId: 'invalid' },
  { syncMutationId: id(2) }, { syncUpdatedAt: `${day}T10:00:00.001Z` },
])('rejects malformed/foreign/inconsistent apply task %p', async change => {
  const { api } = http([{ value: { mutationId: id(), outcome: 'applied', task: { ...projection(), ...change }, serverTime: now } }]);
  await expect(api.apply(op())).rejects.toMatchObject({ kind: 'protocol' });
});

test.each([{ mutationId: id(2) }, { outcome: 'unknown' }, { serverTime: 'invalid' }])('rejects malformed apply envelope %p', async change => {
  const { api } = http([{ value: { mutationId: id(), outcome: 'applied', task: projection(), serverTime: now, ...change } }]);
  await expect(api.apply(op())).rejects.toMatchObject({ kind: 'protocol' });
});

test('accepts superseded and terminal deleted responses', async () => {
  const later = `${day}T10:00:00.001Z`;
  const { api } = http(['superseded', 'deleted'].map(outcome => ({ value: {
    mutationId: id(), outcome, task: { ...projection(), syncUpdatedAt: later, syncMutationId: id(3) }, serverTime: now,
  } })));
  expect((await api.apply(op())).outcome).toBe('superseded');
  expect((await api.apply(op())).outcome).toBe('deleted');
});

test.each([
  [projection(), projection()], [{ ...projection(), userId: 'other' }],
  [{ ...projection(), startAt: `${nextDay}T10:00:00.000Z` }],
  Array.from({ length: 101 }, (_, i) => projection(i + 1)),
])('rejects invalid list pages', async value => {
  await expect(http([{ value }]).api.list(day)).rejects.toMatchObject({ kind: 'protocol' });
});

test('rejects duplicate IDs across pages and never returns partial lists on later HTTP failure', async () => {
  const page = Array.from({ length: 100 }, (_, i) => projection(i + 1));
  await expect(http([{ value: page }, { value: [projection()] }]).api.list(day)).rejects.toMatchObject({ kind: 'protocol' });
  await expect(http([{ value: page }, { value: {}, status: 503 }]).api.list(day)).rejects.toMatchObject({ status: 503 });
});

test('invalid calendar date fails before HTTP', async () => {
  const { api, fetchImpl } = http([]);
  await expect(api.list('2026-02-30')).rejects.toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('persists local create before success/notification and exposes only an overlay', async () => {
  const { engine, storage, backing } = fixture();
  await engine.open();
  const listener = jest.fn(); engine.subscribe(listener);
  const write = deferred<void>(); const started = deferred<void>();
  backing.setItem.mockImplementationOnce(async () => { started.resolve(); await write.promise; });
  const input = fields();
  const creating = engine.create(input);
  input.title = 'caller mutation';
  await started.promise;
  expect(engine.tasks(day)).toEqual([]);
  expect(listener).not.toHaveBeenCalled();
  write.resolve();
  expect(await creating).toBe(true);
  expect(engine.tasks(day)[0].title).toBe('할 일');
  expect(storage.getSnapshot()?.cachedDates).toEqual({});
  expect(engine.getSnapshot().pendingCount).toBe(1);
});

test('offline create/edit/move/delete intents stay ordered and use increasing logical times', async () => {
  const { engine, storage } = fixture();
  await engine.create(fields());
  await engine.replace(id(), { ...fields('수정'), startAt: `${nextDay}T10:00:00.000Z`, endAt: `${nextDay}T11:00:00.000Z` });
  expect(engine.tasks(day)).toEqual([]);
  expect(engine.tasks(nextDay)[0].title).toBe('수정');
  await engine.remove(id());
  expect(engine.tasks(nextDay)).toEqual([]);
  const outbox = storage.getSnapshot()!.outbox;
  expect(outbox.map(row => row.operation.kind)).toEqual(['create', 'replace', 'delete']);
  expect(outbox.map(row => Date.parse(row.operation.updatedAt))).toEqual([Date.parse(now), Date.parse(now) + 1, Date.parse(now) + 2]);
});

test('write failure returns false without success state or a network request', async () => {
  const { engine, backing, api } = fixture();
  await engine.open(); engine.setOnline(true); await flush();
  backing.setItem.mockRejectedValueOnce(new Error('synthetic private detail'));
  expect(await engine.create(fields())).toBe(false);
  expect(engine.tasks(day)).toEqual([]);
  expect(engine.getSnapshot().error).not.toContain('private');
  expect(api.apply).not.toHaveBeenCalled();
});

test('lost ACK survives restart and replays the exact immutable operation', async () => {
  const { engine, storage, backing, api, uuid } = fixture();
  await engine.create(fields());
  const original = storage.getSnapshot()!.outbox[0].operation;
  api.apply.mockRejectedValueOnce(new ApiError('network', 'synthetic'));
  engine.setOnline(true); await flush(); engine.dispose();
  const restartedStorage = new OfflineTaskStorage(backing, 'owner');
  const restarted = new OfflineTaskSync(restartedStorage, api, { uuid, now: () => new Date(now) });
  engines.push(restarted);
  await restarted.open(); restarted.setOnline(true); await flush();
  expect(api.apply).toHaveBeenNthCalledWith(1, original);
  expect(api.apply).toHaveBeenNthCalledWith(2, original);
  expect(restarted.getSnapshot().pendingCount).toBe(0);
  expect(restarted.tasks(day)).toHaveLength(1);
});

test('an edit queued during create ACK uses the committed task and remains pending offline', async () => {
  const { engine, storage, api } = fixture();
  await engine.create(fields());
  const response = deferred<Awaited<ReturnType<TaskSyncApi['apply']>>>();
  api.apply.mockImplementationOnce(() => response.promise);
  engine.setOnline(true); await flush();
  const editing = engine.replace(id(), fields('newer'));
  engine.setOnline(false);
  response.resolve({ mutationId: id(), outcome: 'applied', task: task(), logicalTime: Date.parse(now), serverTime: now });
  expect(await editing).toBe(true);
  await flush();
  expect(storage.getSnapshot()?.outbox).toHaveLength(1);
  expect(storage.getSnapshot()?.cachedDates[day][0].title).toBe('할 일');
  expect(engine.tasks(day)[0].title).toBe('newer');
  expect(api.apply).toHaveBeenCalledTimes(1);
});

test('permanent rejection blocks later same-task intents while unrelated work progresses', async () => {
  const { engine, storage, api } = fixture();
  await engine.create(fields()); await engine.replace(id(), fields('later'));
  await engine.create(fields('unrelated'));
  api.apply.mockRejectedValueOnce(new ApiError('http', 'synthetic private detail', { status: 409 }));
  engine.setOnline(true); await flush();
  expect(api.apply.mock.calls.map(call => call[0].mutationId)).toEqual([id(1), id(3)]);
  expect(storage.getSnapshot()?.outbox).toHaveLength(2);
  expect(storage.getSnapshot()?.outbox[0].blocked).toBeTruthy();
  expect(engine.getSnapshot().error).toBeTruthy();
  expect(JSON.stringify(storage.getSnapshot()?.outbox)).not.toContain('private');
  expect(await engine.retryBlocked(id())).toBe(true); await flush();
  expect(api.apply.mock.calls.map(call => call[0].mutationId)).toEqual([id(1), id(3), id(1), id(2)]);
  expect(engine.getSnapshot().pendingCount).toBe(0);
});

test('retries transient failures with bounded exponential delay and clears timer on dispose', async () => {
  const { engine, api } = fixture();
  await engine.create(fields());
  api.apply.mockRejectedValue(new ApiError('http', 'synthetic', { status: 503 }));
  engine.setOnline(true); await flush();
  for (const delay of [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]) {
    const count = api.apply.mock.calls.length;
    await jest.advanceTimersByTimeAsync(delay - 1);
    expect(api.apply).toHaveBeenCalledTimes(count);
    await jest.advanceTimersByTimeAsync(1);
    expect(api.apply).toHaveBeenCalledTimes(count + 1);
  }
  engine.dispose();
  const count = api.apply.mock.calls.length;
  await jest.advanceTimersByTimeAsync(120000);
  expect(api.apply).toHaveBeenCalledTimes(count);
});

test('repeated online signals cannot run overlapping sends', async () => {
  const { engine, api } = fixture();
  await engine.create(fields()); await engine.create(fields('second'));
  const pending = deferred<Awaited<ReturnType<TaskSyncApi['apply']>>>();
  api.apply.mockImplementationOnce(() => pending.promise);
  engine.setOnline(true); engine.setOnline(true); await engine.open(); await flush();
  expect(api.apply).toHaveBeenCalledTimes(1);
  pending.resolve({ mutationId: id(), outcome: 'applied', task: task(), logicalTime: Date.parse(now), serverTime: now });
  await flush(); expect(api.apply).toHaveBeenCalledTimes(2);
});

test('failed ACK persistence retains the operation for a later idempotent retry', async () => {
  const { engine, storage, api, backing } = fixture();
  await engine.create(fields());
  backing.setItem.mockRejectedValueOnce(new Error('write failure'));
  engine.setOnline(true); await flush();
  expect(storage.getSnapshot()?.outbox).toHaveLength(1);
  expect(storage.getSnapshot()?.cachedDates).toEqual({});
  expect(api.apply).toHaveBeenCalledTimes(1);
  engine.setOnline(false); engine.setOnline(true); await flush();
  expect(api.apply).toHaveBeenCalledTimes(2);
  expect(engine.getSnapshot().pendingCount).toBe(0);
});

test('refresh preserves cached data and outbox on read failure, and pending overlay on success', async () => {
  const { engine, api, storage } = fixture();
  await storage.update(draft => { draft.cachedDates[day] = [task(5)]; });
  await engine.create(fields('pending'));
  api.list.mockRejectedValueOnce(new ApiError('network', 'synthetic'));
  engine.setOnline(true); api.apply.mockRejectedValue(new ApiError('network', 'synthetic'));
  expect(await engine.refresh(day)).toBe(false);
  expect(storage.getSnapshot()?.cachedDates[day]).toEqual([task(5)]);
  api.list.mockResolvedValueOnce({ tasks: [task(6)], logicalTime: Date.parse(now) + 500 });
  expect(await engine.refresh(day)).toBe(true);
  expect(engine.tasks(day).map(row => row.id).sort()).toEqual([id(), id(6)].sort());
  expect(storage.getSnapshot()?.lastLogicalTime).toBe(Date.parse(now) + 500);
});

test('refresh waits for an in-flight ACK before replacing canonical data', async () => {
  const { engine, api } = fixture();
  await engine.create(fields());
  const pending = deferred<Awaited<ReturnType<TaskSyncApi['apply']>>>();
  api.apply.mockImplementationOnce(() => pending.promise);
  engine.setOnline(true); await flush();
  api.list.mockResolvedValueOnce({ tasks: [task()], logicalTime: Date.parse(now) });
  const refresh = engine.refresh(day); await flush();
  expect(api.list).not.toHaveBeenCalled();
  pending.resolve({ mutationId: id(), outcome: 'applied', task: task(), logicalTime: Date.parse(now), serverTime: now });
  expect(await refresh).toBe(true);
  expect(engine.tasks(day)).toEqual([task()]);
});

test('dispose suppresses late publications and ACK persistence, retaining intents for replay', async () => {
  const { engine, api, storage } = fixture();
  await engine.create(fields()); await engine.create(fields('second'));
  const pending = deferred<Awaited<ReturnType<TaskSyncApi['apply']>>>();
  api.apply.mockImplementationOnce(() => pending.promise);
  engine.setOnline(true); await flush();
  const listener = jest.fn(); engine.subscribe(listener); engine.dispose();
  pending.resolve({ mutationId: id(), outcome: 'applied', task: task(), logicalTime: Date.parse(now), serverTime: now });
  await flush();
  expect(listener).not.toHaveBeenCalled();
  expect(api.apply).toHaveBeenCalledTimes(1);
  expect(storage.getSnapshot()?.outbox).toHaveLength(2);
  expect(storage.getSnapshot()?.cachedDates).toEqual({});
  expect(await engine.create(fields())).toBe(false);
});

test('refuses a storage/API owner mismatch and never sends', async () => {
  const { storage, api, uuid } = fixture();
  const otherApi = { ...api, userId: 'other' };
  const engine = new OfflineTaskSync(storage, otherApi, { uuid }); engines.push(engine);
  expect(await engine.open()).toBe(false);
  engine.setOnline(true); await flush();
  expect(await engine.create(fields())).toBe(false);
  expect(api.apply).not.toHaveBeenCalled();
});

test('create rejects nonpending status and replace/delete require a visible task', async () => {
  const { engine } = fixture();
  expect(await engine.create({ ...fields(), status: 'COMPLETED' })).toBe(false);
  expect(await engine.replace(id(), fields())).toBe(false);
  expect(await engine.remove(id())).toBe(false);
  expect(engine.getSnapshot().pendingCount).toBe(0);
});

test('refresh of a moved task removes its old cached location', async () => {
  const { engine, storage, api } = fixture();
  const old = { ...task(), startAt: `${nextDay}T10:00:00.000Z`, endAt: `${nextDay}T11:00:00.000Z` };
  await storage.update(draft => { draft.cachedDates[day] = []; draft.cachedDates[nextDay] = [old]; });
  api.list.mockResolvedValueOnce({ tasks: [task()], logicalTime: Date.parse(now) });
  engine.setOnline(true);
  expect(await engine.refresh(day)).toBe(true);
  expect(engine.tasks(day)).toEqual([task()]);
  expect(engine.tasks(nextDay)).toEqual([]);
  expect(storage.getSnapshot()?.cachedDates[nextDay]).toEqual([]);
});

test('UUID collision with a cached task cannot replace it with a new create overlay', async () => {
  const { engine, storage } = fixture();
  await storage.update(draft => { draft.cachedDates[day] = [task()]; });
  expect(await engine.create(fields('collision'))).toBe(false);
  expect(engine.tasks(day)).toEqual([task()]);
});

test('bounds list pagination to 100 full pages', async () => {
  const responses = Array.from({ length: 100 }, (_pageValue, page) => ({ value:
    Array.from({ length: 100 }, (_rowValue, row) => projection(page * 100 + row + 1)) }));
  const { api, fetchImpl } = http(responses);
  await expect(api.list(day)).rejects.toMatchObject({ kind: 'protocol' });
  expect(fetchImpl).toHaveBeenCalledTimes(100);
});

test('failed refresh persistence retains pending intents and the complete previous cache', async () => {
  const { engine, storage, backing, api } = fixture();
  await storage.update(draft => { draft.cachedDates[day] = [task(5)]; });
  await engine.create(fields('pending'));
  api.apply.mockRejectedValue(new ApiError('network', 'synthetic'));
  engine.setOnline(true); await flush();
  api.list.mockResolvedValueOnce({ tasks: [task(6)], logicalTime: Date.parse(now) });
  backing.setItem.mockRejectedValueOnce(new Error('failure'));
  expect(await engine.refresh(day)).toBe(false);
  expect(storage.getSnapshot()?.cachedDates[day]).toEqual([task(5)]);
  expect(storage.getSnapshot()?.outbox).toHaveLength(1);
});

test('ACK at the 42 date limit evicts the oldest other empty date and completes', async () => {
  const { engine, storage, api } = fixture();
  await storage.update(draft => {
    for (let i = 0; i < 42; i++) draft.cachedDates[new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10)] = [];
  });
  await engine.create(fields()); engine.setOnline(true); await flush();
  expect(api.apply).toHaveBeenCalledTimes(1);
  expect(storage.getSnapshot()?.outbox).toHaveLength(0);
  expect(Object.keys(storage.getSnapshot()!.cachedDates)).toHaveLength(42);
  expect(storage.getSnapshot()?.cachedDates['2026-01-01']).toBeUndefined();
  expect(storage.getSnapshot()?.cachedDates[day]).toEqual([task()]);
  expect(engine.getSnapshot().error).toBeNull();
});

test('year zero operations fail before HTTP or local persistence', async () => {
  const { api, fetchImpl } = http([]);
  await expect(api.apply({ ...op(), updatedAt: '0000-09-11T10:00:00.000Z' })).rejects.toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
  const { engine, backing } = fixture();
  expect(await engine.create({ ...fields(), startAt: '0000-09-11T10:00:00.000Z' })).toBe(false);
  expect(backing.setItem).not.toHaveBeenCalled();
});

test('401 stops further sends without blocking or discarding the durable operation', async () => {
  const { engine, storage, api } = fixture();
  await engine.create(fields()); await engine.create(fields('other'));
  api.apply.mockRejectedValueOnce(new ApiError('unauthorized', 'synthetic'));
  engine.setOnline(true); await flush(); await jest.advanceTimersByTimeAsync(60000);
  expect(api.apply).toHaveBeenCalledTimes(1);
  expect(storage.getSnapshot()?.outbox).toHaveLength(2);
  expect(storage.getSnapshot()?.outbox[0].blocked).toBeUndefined();
});

test('late refresh after disposal cannot persist or notify', async () => {
  const { engine, storage, api } = fixture();
  await engine.open(); engine.setOnline(true); await flush();
  const response = deferred<Awaited<ReturnType<TaskSyncApi['list']>>>();
  api.list.mockImplementationOnce(() => response.promise);
  const refresh = engine.refresh(day); await flush(); engine.dispose();
  response.resolve({ tasks: [task()], logicalTime: Date.parse(now) });
  expect(await refresh).toBe(false);
  expect(storage.getSnapshot()?.cachedDates).toEqual({});
});

test('drains create, edit, delete in order and terminal ACK removes all cached locations', async () => {
  const { engine, storage, api } = fixture();
  await engine.create(fields());
  await engine.replace(id(), fields('edited'));
  await engine.remove(id());
  engine.setOnline(true); await flush();
  expect(api.apply.mock.calls.map(call => call[0].kind)).toEqual(['create', 'replace', 'delete']);
  expect(storage.getSnapshot()?.outbox).toEqual([]);
  expect(engine.tasks(day)).toEqual([]);
  expect(Object.values(storage.getSnapshot()!.cachedDates).flat()).toEqual([]);
});

test('a disposed engine late ACK leaves a replacement engine newer persisted state untouched', async () => {
  const { engine, storage, api, backing, uuid } = fixture();
  await engine.create(fields());
  const oldResponse = deferred<Awaited<ReturnType<TaskSyncApi['apply']>>>();
  api.apply.mockImplementationOnce(() => oldResponse.promise);
  engine.setOnline(true); await flush(); engine.dispose();
  const replacement = new OfflineTaskSync(storage, api, { uuid, now: () => new Date(now) });
  engines.push(replacement);
  await replacement.open();
  await replacement.replace(id(), fields('newer accepted value'));
  replacement.setOnline(true); await flush();
  expect(replacement.tasks(day)[0].title).toBe('newer accepted value');
  expect(storage.getSnapshot()?.outbox).toEqual([]);
  const before = storage.getSnapshot();
  const writes = backing.setItem.mock.calls.length;
  oldResponse.resolve({ mutationId: id(), outcome: 'applied', task: task(), logicalTime: Date.parse(now), serverTime: now });
  await flush();
  expect(storage.getSnapshot()).toEqual(before);
  expect(backing.setItem).toHaveBeenCalledTimes(writes);
  expect(replacement.tasks(day)[0].title).toBe('newer accepted value');
});

test('rechecks disposal when the ACK callback was waiting behind another storage writer', async () => {
  const { engine, storage, api, backing } = fixture();
  await engine.create(fields());
  const response = deferred<Awaited<ReturnType<TaskSyncApi['apply']>>>();
  api.apply.mockImplementationOnce(() => response.promise);
  engine.setOnline(true); await flush();
  const gate = deferred<void>(); const started = deferred<void>();
  backing.setItem.mockImplementationOnce(async () => { started.resolve(); await gate.promise; });
  const firstWrite = storage.update(draft => { draft.lastLogicalTime += 1; });
  await started.promise;
  response.resolve({ mutationId: id(), outcome: 'applied', task: task(), logicalTime: Date.parse(now), serverTime: now });
  await flush();
  engine.dispose(); gate.resolve(); await firstWrite; await flush();
  expect(storage.getSnapshot()?.outbox).toHaveLength(1);
  expect(storage.getSnapshot()?.cachedDates).toEqual({});
  expect(backing.setItem).toHaveBeenCalledTimes(2);
});

test('a disposed engine late permanent error cannot mark durable work blocked', async () => {
  const { engine, storage, api, backing } = fixture();
  await engine.create(fields());
  const response = deferred<Awaited<ReturnType<TaskSyncApi['apply']>>>();
  api.apply.mockImplementationOnce(() => response.promise);
  engine.setOnline(true); await flush(); engine.dispose();
  response.reject(new ApiError('http', 'synthetic', { status: 409 }));
  await flush();
  expect(storage.getSnapshot()?.outbox[0].blocked).toBeUndefined();
  expect(backing.setItem).toHaveBeenCalledTimes(1);
});

test('evicts old server cache at 1000 tasks without altering a blocked pending operation', async () => {
  const { engine, storage } = fixture();
  const blocked = { operation: op(7), blocked: 'HTTP_409' };
  await storage.update(draft => {
    draft.cachedDates['2026-01-01'] = Array.from({ length: 1000 }, (_, i) => task(i + 10));
    draft.outbox = [blocked];
  });
  await engine.create(fields()); engine.setOnline(true); await flush();
  expect(storage.getSnapshot()?.cachedDates['2026-01-01']).toBeUndefined();
  expect(storage.getSnapshot()?.cachedDates[day]).toEqual([task()]);
  expect(storage.getSnapshot()?.outbox).toEqual([blocked]);
  expect(engine.tasks(day).map(row => row.id)).toContain(id(7));
});

test('refresh evicts old server cache for UTF8 space while preserving the refreshed date and pending originals', async () => {
  const { engine, storage, api } = fixture();
  const pending = { operation: op(7), blocked: 'HTTP_409' };
  await storage.update(draft => {
    draft.cachedDates[nextDay] = [{ ...task(9), description: '가'.repeat(200000) }];
    draft.outbox = [pending];
  });
  const refreshed = { ...task(), description: '가'.repeat(200000) };
  api.list.mockResolvedValueOnce({ tasks: [refreshed], logicalTime: Date.parse(now) });
  engine.setOnline(true);
  expect(await engine.refresh(day)).toBe(true);
  expect(storage.getSnapshot()?.cachedDates[nextDay]).toBeUndefined();
  expect(storage.getSnapshot()?.cachedDates[day]).toEqual([refreshed]);
  expect(storage.getSnapshot()?.outbox).toEqual([pending]);
});

test('preserves the old envelope if the protected refreshed date alone exceeds the task limit', async () => {
  const { engine, storage, api } = fixture();
  await storage.update(draft => {
    draft.cachedDates[nextDay] = [task(9)];
    draft.outbox = [{ operation: op(7), blocked: 'HTTP_409' }];
  });
  const before = storage.getSnapshot();
  api.list.mockResolvedValueOnce({ tasks: Array.from({ length: 1001 }, (_, i) => task(i + 1)), logicalTime: Date.parse(now) });
  engine.setOnline(true);
  expect(await engine.refresh(day)).toBe(false);
  expect(storage.getSnapshot()).toEqual(before);
});

test('failed persistence after cache eviction preserves all previous dates and pending intents', async () => {
  const { engine, storage, api, backing } = fixture();
  await storage.update(draft => {
    for (let i = 0; i < 42; i++) draft.cachedDates[new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10)] = [];
    draft.outbox = [{ operation: op(7), blocked: 'HTTP_409' }];
  });
  const before = storage.getSnapshot();
  api.list.mockResolvedValueOnce({ tasks: [task()], logicalTime: Date.parse(now) });
  backing.setItem.mockRejectedValueOnce(new Error('write failed'));
  engine.setOnline(true);
  expect(await engine.refresh(day)).toBe(false);
  expect(storage.getSnapshot()).toEqual(before);
});

test('explicitly discards a blocked task and its later edits while preserving server cache and unrelated intents', async () => {
  const { engine, storage } = fixture();
  const blocked = { operation: { ...op(7), kind: 'replace' as const, taskId: id(5) }, blocked: 'HTTP_400' };
  const later = { operation: { ...op(8), kind: 'replace' as const, taskId: id(5), task: fields('edited after rejection') } };
  const other = { operation: op(9) };
  await storage.update(draft => { draft.cachedDates[day] = [task(5)]; draft.outbox = [blocked, other, later]; });
  await engine.open();
  expect(engine.blockedTasks()).toEqual([{ taskId: id(5), title: 'edited after rejection' }]);
  expect(await engine.discardBlocked(id(5))).toBe(true);
  expect(storage.getSnapshot()?.outbox).toEqual([other]);
  expect(storage.getSnapshot()?.cachedDates[day]).toEqual([task(5)]);
  expect(engine.tasks(day).find(row => row.id === id(5))).toEqual(task(5));
  expect(engine.blockedTasks()).toEqual([]);
});

test('discarded blocked create does not reappear after restart', async () => {
  const { engine, storage, backing, api, uuid } = fixture();
  await storage.update(draft => {
    draft.outbox = [{ operation: op(), blocked: 'HTTP_400' },
      { operation: { ...op(2), kind: 'replace', taskId: id(), task: fields('corrected category') } }];
  });
  await engine.open();
  expect(await engine.discardBlocked(id())).toBe(true);
  const restarted = new OfflineTaskSync(new OfflineTaskStorage(backing, 'owner'), api, { uuid });
  engines.push(restarted); await restarted.open();
  expect(restarted.tasks(day)).toEqual([]);
  expect(restarted.getSnapshot().pendingCount).toBe(0);
});

test('cannot discard an unblocked or in-flight ambiguous operation', async () => {
  const { engine, storage, api } = fixture();
  await engine.create(fields());
  expect(await engine.discardBlocked(id())).toBe(false);
  const pending = deferred<Awaited<ReturnType<TaskSyncApi['apply']>>>();
  api.apply.mockImplementationOnce(() => pending.promise);
  engine.setOnline(true); await flush();
  expect(await engine.discardBlocked(id())).toBe(false);
  expect(storage.getSnapshot()?.outbox).toHaveLength(1);
  engine.setOnline(false);
  pending.reject(new ApiError('network', 'ambiguous')); await flush();
  expect(await engine.discardBlocked(id())).toBe(false);
  expect(storage.getSnapshot()?.outbox).toHaveLength(1);
});

test('discard failure and disposal retain the entire blocked task group', async () => {
  const { engine, storage, backing } = fixture();
  await storage.update(draft => { draft.outbox = [{ operation: op(), blocked: 'HTTP_409' }]; });
  const before = storage.getSnapshot();
  backing.setItem.mockRejectedValueOnce(new Error('write failed'));
  expect(await engine.discardBlocked(id())).toBe(false);
  expect(storage.getSnapshot()).toEqual(before);
  engine.dispose();
  expect(await engine.discardBlocked(id())).toBe(false);
  expect(storage.getSnapshot()).toEqual(before);
});

test('discard is serialized behind remote work and rechecks a concurrently retried head', async () => {
  const { engine, storage, api } = fixture();
  await storage.update(draft => { draft.outbox = [{ operation: op(), blocked: 'HTTP_400' }, { operation: op(2) }]; });
  const remote = deferred<Awaited<ReturnType<TaskSyncApi['apply']>>>();
  api.apply.mockImplementationOnce(() => remote.promise);
  engine.setOnline(true); await flush();
  const discard = engine.discardBlocked(id()); await flush();
  engine.setOnline(false);
  expect(await engine.retryBlocked(id())).toBe(true);
  remote.resolve({ mutationId: id(2), outcome: 'applied', task: task(2), logicalTime: Date.parse(now), serverTime: now });
  expect(await discard).toBe(false);
  expect(storage.getSnapshot()?.outbox.map(row => row.operation.mutationId)).toEqual([id()]);
});

test('terminal deleted ACK removes every later same-task intent atomically and cannot resurrect after restart', async () => {
  const { engine, storage, backing, api, uuid } = fixture();
  await engine.create(fields()); await engine.replace(id(), fields('later edit')); await engine.create(fields('unrelated'));
  const response = deferred<Awaited<ReturnType<TaskSyncApi['apply']>>>();
  api.apply.mockImplementationOnce(() => response.promise);
  engine.setOnline(true); await flush(); engine.setOnline(false);
  response.resolve({ mutationId: id(), outcome: 'deleted', task: task(), logicalTime: Date.parse(now), serverTime: now });
  await flush();
  expect(storage.getSnapshot()?.outbox.map(row => row.operation.mutationId)).toEqual([id(3)]);
  expect(engine.tasks(day).map(row => row.id)).toEqual([id(3)]);
  const restarted = new OfflineTaskSync(new OfflineTaskStorage(backing, 'owner'), api, { uuid });
  engines.push(restarted); await restarted.open();
  expect(restarted.tasks(day).map(row => row.id)).toEqual([id(3)]);
});

test('failed terminal ACK persistence does not partially drop related pending edits', async () => {
  const { engine, storage, api, backing } = fixture();
  await engine.create(fields()); await engine.replace(id(), fields('later edit'));
  const before = storage.getSnapshot();
  api.apply.mockResolvedValueOnce({ mutationId: id(), outcome: 'deleted', task: task(), logicalTime: Date.parse(now), serverTime: now });
  backing.setItem.mockRejectedValueOnce(new Error('write failed'));
  engine.setOnline(true); await flush();
  expect(storage.getSnapshot()).toEqual(before);
});

test('local create prunes nearly full server cache and preserves every existing pending original', async () => {
  const { engine, storage, backing, api } = fixture();
  const pending = { operation: op(7), blocked: 'HTTP_409' };
  await storage.update(draft => {
    draft.cachedDates[nextDay] = [{ ...task(9), description: '' }];
    draft.outbox = [pending];
    const size = Buffer.byteLength(JSON.stringify({ ...draft, revision: draft.revision + 1 }), 'utf8');
    draft.cachedDates[nextDay][0].description = 'a'.repeat(1024 * 1024 - size - 10);
  });
  expect(await engine.create(fields())).toBe(true);
  expect(storage.getSnapshot()?.cachedDates[nextDay]).toBeUndefined();
  expect(storage.getSnapshot()?.outbox[0]).toEqual(pending);
  expect(storage.getSnapshot()?.outbox).toHaveLength(2);
  expect(api.apply).not.toHaveBeenCalled();
  expect((await new OfflineTaskStorage(backing, 'owner').open()).outbox).toEqual(storage.getSnapshot()?.outbox);
});

test('local enqueue at 200 pending intents fails without dropping cache or original pending operations', async () => {
  const { engine, storage } = fixture();
  await storage.update(draft => {
    draft.cachedDates[nextDay] = [{ ...task(900), description: '' }];
    draft.outbox = Array.from({ length: 200 }, (_, i) => ({ operation: op(i + 10) }));
    const size = Buffer.byteLength(JSON.stringify({ ...draft, revision: draft.revision + 1 }), 'utf8');
    draft.cachedDates[nextDay][0].description = 'a'.repeat(1024 * 1024 - size - 10);
  });
  const before = storage.getSnapshot();
  expect(await engine.create(fields())).toBe(false);
  expect(storage.getSnapshot()).toEqual(before);
  expect(engine.getSnapshot().error).toContain('한도');
});

test.each(['replace', 'delete'] as const)('local %s preserves the affected task date while pruning other server cache', async kind => {
  const { engine, storage } = fixture();
  await storage.update(draft => {
    draft.cachedDates[day] = [task(5)];
    draft.cachedDates[nextDay] = [{ ...task(9), description: '' }];
    const size = Buffer.byteLength(JSON.stringify({ ...draft, revision: draft.revision + 1 }), 'utf8');
    draft.cachedDates[nextDay][0].description = 'a'.repeat(1024 * 1024 - size - 10);
  });
  expect(await (kind === 'replace' ? engine.replace(id(5), fields('local edit')) : engine.remove(id(5)))).toBe(true);
  expect(storage.getSnapshot()?.cachedDates[day]).toEqual([task(5)]);
  expect(storage.getSnapshot()?.cachedDates[nextDay]).toBeUndefined();
  expect(storage.getSnapshot()?.outbox[0].operation.kind).toBe(kind);
});

test('clock reads the authenticated owner-wide checkpoint without date or pagination', async () => {
  const checkpoint = { userId: 'owner', serverTime: now, logicalTime: Date.parse(now) + 240_000 };
  const { api, fetchImpl } = http([{ value: checkpoint }]);
  expect(await api.clock!()).toEqual(checkpoint);
  expect(fetchImpl).toHaveBeenCalledWith('https://api.example.invalid/tasks/sync/clock',
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer synthetic-access' }) }));
});

test.each([
  null, [], {}, { serverTime: now }, { logicalTime: 0 },
  { userId: 'owner', serverTime: now, logicalTime: 0, extra: true },
  { userId: 'owner', serverTime: now, logicalTime: '0' }, { userId: 'owner', serverTime: now, logicalTime: -1 },
  { userId: 'owner', serverTime: now, logicalTime: 0.5 }, { userId: 'owner', serverTime: now, logicalTime: 253402300800000 },
  { userId: 'owner', serverTime: '0000-01-01T00:00:00.000Z', logicalTime: 0 },
  { userId: 'owner', serverTime: '2026-02-30T00:00:00.000Z', logicalTime: 0 },
  { userId: 'owner', serverTime: '2026-09-11T10:00:00+00:00', logicalTime: 0 },
])('rejects malformed or extended clock checkpoint %p', async value => {
  await expect(http([{ value }]).api.clock!()).rejects.toMatchObject({ kind: 'protocol' });
});

test.each([0, 253402300799999])('accepts clock logicalTime boundary %p', async logicalTime => {
  expect(await http([{ value: { userId: 'owner', serverTime: now, logicalTime } }]).api.clock!())
    .toEqual({ userId: 'owner', serverTime: now, logicalTime });
});

test('future wall clock rejection recovers after explicit discard and survives restart', async () => {
  const { storage, api, backing, uuid } = fixture();
  let deviceTime = Date.parse(now) + 3_600_000;
  const engine = new OfflineTaskSync(storage, api, { uuid, now: () => new Date(deviceTime) });
  engines.push(engine);
  let acceptedTime = 0;
  api.clock = jest.fn(async () => ({ userId: 'owner', serverTime: now, logicalTime: acceptedTime }));
  api.apply.mockImplementation(async operation => {
    // Independent server boundary: client operations more than five minutes ahead are rejected.
    const timestamp = Date.parse(operation.updatedAt);
    if (timestamp > Date.parse(now) + 300_000) throw new ApiError('http', 'future', { status: 400 });
    acceptedTime = Math.max(acceptedTime, timestamp);
    return { mutationId: operation.mutationId, outcome: 'applied',
      task: { ...task(), ...operation.task, id: operation.taskId }, logicalTime: acceptedTime, serverTime: now };
  });
  expect(await engine.create(fields('future mistake'))).toBe(true);
  expect(api.clock).not.toHaveBeenCalled();
  const original = storage.getSnapshot()!.outbox[0].operation;
  deviceTime = Date.parse(now);
  engine.setOnline(true); await flush();
  expect(storage.getSnapshot()?.outbox).toEqual([{ operation: original, blocked: 'HTTP_400' }]);
  expect(await engine.discardBlocked(original.taskId)).toBe(true);
  expect(storage.getSnapshot()?.lastLogicalTime).toBe(Date.parse(now));
  expect(api.clock).toHaveBeenCalledTimes(1);
  engine.dispose();
  const restored = new OfflineTaskStorage(backing, 'owner');
  const restarted = new OfflineTaskSync(restored, api, { uuid, now: () => new Date(now) });
  engines.push(restarted);
  await restarted.open(); restarted.setOnline(true); await flush();
  expect(await restarted.create(fields('normal after restart'))).toBe(true);
  await flush();
  expect(restored.getSnapshot()?.outbox).toEqual([]);
  expect(acceptedTime).toBe(Date.parse(now) + 1);
  expect(api.clock).toHaveBeenCalledTimes(1);
});

test('owner-wide accepted future versions survive repair even when the refreshed date is empty', async () => {
  const { engine, storage, api } = fixture();
  await storage.update(draft => { draft.lastLogicalTime = Date.parse(now) + 3_600_000; });
  const acceptedOnOtherDateOrTombstone = Date.parse(now) + 240_000;
  api.clock = jest.fn(async () => ({ userId: 'owner', serverTime: now, logicalTime: acceptedOnOtherDateOrTombstone }));
  api.list.mockResolvedValue({ tasks: [], logicalTime: 0 });
  engine.setOnline(true);
  expect(await engine.refresh(day)).toBe(true);
  expect(storage.getSnapshot()?.lastLogicalTime).toBe(acceptedOnOtherDateOrTombstone);
  expect(await engine.create(fields())).toBe(true); await flush();
  expect(Date.parse(api.apply.mock.calls[0][0].updatedAt)).toBe(acceptedOnOtherDateOrTombstone + 1);
  expect(api.clock).toHaveBeenCalledTimes(1);
});

test('checkpoint cannot rewrite a future pending or lost-ACK operation to make new work admissible', async () => {
  const { engine, storage, api } = fixture();
  const original = { ...op(7), updatedAt: new Date(Date.parse(now) + 3_600_000).toISOString() };
  await storage.update(draft => { draft.outbox = [{ operation: original }]; draft.lastLogicalTime = Date.parse(original.updatedAt); });
  api.clock = jest.fn(async () => ({ userId: 'owner', serverTime: now, logicalTime: 0 }));
  api.apply.mockRejectedValue(new ApiError('network', 'lost ACK'));
  engine.setOnline(true); await flush();
  expect(await engine.create(fields('must not inherit poison'))).toBe(false);
  expect(storage.getSnapshot()?.outbox).toEqual([{ operation: original }]);
  expect(storage.getSnapshot()?.lastLogicalTime).toBe(Date.parse(original.updatedAt));
  expect(api.apply).toHaveBeenCalledWith(original);
  expect(engine.getSnapshot().error).toBeTruthy();
});

test('enqueue waits for checkpoint persistence and subsequent enqueue uses the repaired floor', async () => {
  const { engine, storage, api, backing } = fixture();
  await storage.update(draft => { draft.lastLogicalTime = Date.parse(now) + 3_600_000; });
  const checkpoint = deferred<{ userId: string; serverTime: string; logicalTime: number }>();
  api.clock = jest.fn(() => checkpoint.promise);
  const write = deferred<void>(); const writing = deferred<void>();
  backing.setItem.mockImplementationOnce(async () => { writing.resolve(); await write.promise; });
  engine.setOnline(true); await flush();
  const first = engine.create(fields('first'));
  const second = engine.create(fields('second'));
  await flush();
  expect(api.clock).toHaveBeenCalledTimes(1);
  expect(storage.getSnapshot()?.outbox).toEqual([]);
  checkpoint.resolve({ userId: 'owner', serverTime: now, logicalTime: Date.parse(now) + 240_000 });
  await writing.promise;
  expect(storage.getSnapshot()?.outbox).toEqual([]);
  expect(api.apply).not.toHaveBeenCalled();
  write.resolve();
  expect(await first).toBe(true); expect(await second).toBe(true); await flush();
  expect(api.apply.mock.calls.map(call => Date.parse(call[0].updatedAt)))
    .toEqual([Date.parse(now) + 240_001, Date.parse(now) + 240_002]);
  expect(api.clock).toHaveBeenCalledTimes(1);
});

test('checkpoint recovery waits for an in-flight ACK and retains its accepted server floor', async () => {
  const { engine, storage, api } = fixture();
  await engine.create(fields());
  await storage.update(draft => { draft.lastLogicalTime = Date.parse(now) + 3_600_000; });
  const response = deferred<Awaited<ReturnType<TaskSyncApi['apply']>>>();
  api.apply.mockImplementationOnce(() => response.promise);
  let acceptedTime = Date.parse(now);
  api.clock = jest.fn(async () => ({ userId: 'owner', serverTime: now, logicalTime: acceptedTime }));
  engine.setOnline(true); await flush();
  const creating = engine.create(fields('after ACK')); await flush();
  expect(api.clock).not.toHaveBeenCalled();
  acceptedTime += 240_000;
  response.resolve({ mutationId: id(), outcome: 'superseded', task: task(), logicalTime: acceptedTime, serverTime: now });
  expect(await creating).toBe(true); await flush();
  expect(Date.parse(api.apply.mock.calls[1][0].updatedAt)).toBe(acceptedTime + 1);
});

test.each(['offline', 'absent', 'read failure', 'write failure'] as const)
('clock repair %s preserves the old durable floor and retries on next online refresh', async mode => {
  const { engine, storage, api, backing, values } = fixture();
  await storage.update(draft => { draft.lastLogicalTime = Date.parse(now) + 3_600_000; });
  const before = storage.getSnapshot(); const bytes = [...values.entries()];
  const clock = jest.fn(async () => ({ userId: 'owner', serverTime: now, logicalTime: 0 }));
  if (mode !== 'absent') api.clock = clock;
  if (mode === 'read failure') clock.mockRejectedValueOnce(new ApiError('network', 'private detail'));
  if (mode !== 'offline') { engine.setOnline(true); await flush(); }
  if (mode === 'write failure') backing.setItem.mockRejectedValueOnce(new Error('private detail'));
  expect(await engine.create(fields())).toBe(false);
  expect(storage.getSnapshot()).toEqual(before);
  expect([...values.entries()]).toEqual(bytes);
  expect(engine.getSnapshot().error).toBeTruthy();
  expect(engine.getSnapshot().error).not.toContain('private');
  api.clock = jest.fn(async () => ({ userId: 'owner', serverTime: now, logicalTime: 0 }));
  engine.setOnline(true);
  expect(await engine.refresh(day)).toBe(true);
  expect(storage.getSnapshot()?.lastLogicalTime).toBe(Date.parse(now));
});

test('late checkpoint after owner disposal cannot repair bytes or append an operation', async () => {
  const { engine, storage, api, values } = fixture();
  await storage.update(draft => { draft.lastLogicalTime = Date.parse(now) + 3_600_000; });
  const before = storage.getSnapshot(); const bytes = [...values.entries()];
  const checkpoint = deferred<{ userId: string; serverTime: string; logicalTime: number }>();
  api.clock = jest.fn(() => checkpoint.promise);
  engine.setOnline(true); await flush();
  const creating = engine.create(fields()); await flush(); engine.dispose();
  checkpoint.resolve({ userId: 'owner', serverTime: now, logicalTime: 0 });
  expect(await creating).toBe(false);
  expect(storage.getSnapshot()).toEqual(before);
  expect([...values.entries()]).toEqual(bytes);
});

test('normal logical clocks do not add checkpoint requests to refresh or enqueue', async () => {
  const { engine, api } = fixture();
  api.clock = jest.fn(async () => ({ userId: 'owner', serverTime: now, logicalTime: 0 }));
  engine.setOnline(true);
  expect(await engine.refresh(day)).toBe(true);
  expect(await engine.create(fields())).toBe(true); await flush();
  expect(api.clock).not.toHaveBeenCalled();
});

test.each([undefined, null, '', 'other', ' owner', 42])('rejects checkpoint owner %p before API repair', async userId => {
  await expect(http([{ value: { userId, serverTime: now, logicalTime: 0 } }]).api.clock!())
    .rejects.toMatchObject({ kind: 'protocol' });
});

test.each([undefined, 'other'])('direct API checkpoint owner %p cannot change the durable document', async userId => {
  const { engine, storage, api, values, backing } = fixture();
  await storage.update(draft => {
    draft.lastLogicalTime = Date.parse(now) + 3_600_000;
    draft.cachedDates[day] = [task(5)];
    draft.outbox = [{ operation: op(7), blocked: 'HTTP_409' }];
  });
  api.clock = jest.fn(async () => (userId === undefined
    ? { serverTime: now, logicalTime: 0 }
    : { userId, serverTime: now, logicalTime: 0 }) as Awaited<ReturnType<NonNullable<TaskSyncApi['clock']>>>);
  const before = storage.getSnapshot(); const bytes = [...values.entries()];
  const writes = backing.setItem.mock.calls.length;
  engine.setOnline(true); await flush();
  expect(await engine.refresh(day)).toBe(false);
  expect(storage.getSnapshot()).toEqual(before);
  expect([...values.entries()]).toEqual(bytes);
  expect(backing.setItem).toHaveBeenCalledTimes(writes);
  expect(api.list).not.toHaveBeenCalled();
  expect(engine.getSnapshot().error).toBeTruthy();
});

test('shared client switched to B before A engine disposal cannot lower A clock or erase its cache', async () => {
  const { storage, backing, values, uuid } = fixture();
  await storage.update(draft => {
    draft.lastLogicalTime = Date.parse(now) + 3_600_000;
    draft.cachedDates[day] = [task(5)];
    draft.outbox = [{ operation: op(7), blocked: 'HTTP_409' }];
  });
  let accessToken = 'synthetic-A'; let epoch = 1;
  const acceptedA = Date.parse(now) + 240_000;
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
    const isA = (init?.headers as Record<string, string>).Authorization === 'Bearer synthetic-A';
    const value = url.endsWith('/tasks/sync/clock')
      ? { userId: isA ? 'owner' : 'other', serverTime: now, logicalTime: isA ? acceptedA : 0 }
      : [];
    return { ok: true, status: 200, text: async () => JSON.stringify(value) } as Response;
  });
  const client = createAuthenticatedClient(createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl }), {
    getAccessToken: () => accessToken, getEpoch: () => epoch,
    refreshAccessToken: jest.fn(), onUnauthorized: jest.fn(),
  });
  const engine = new OfflineTaskSync(storage, createTaskSyncApi(client, 'owner'), { uuid, now: () => new Date(now) });
  engines.push(engine); await engine.open(); engine.setOnline(true); await flush();
  const before = storage.getSnapshot(); const bytes = [...values.entries()];
  const writes = backing.setItem.mock.calls.length;
  accessToken = 'synthetic-B'; epoch++;
  expect(await engine.refresh(day)).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer synthetic-B' }));
  expect(storage.getSnapshot()).toEqual(before);
  expect(storage.getSnapshot()!.lastLogicalTime).toBeGreaterThan(acceptedA);
  expect([...values.entries()]).toEqual(bytes);
  expect(backing.setItem).toHaveBeenCalledTimes(writes);
  expect(engine.getSnapshot().error).toBeTruthy();
});
