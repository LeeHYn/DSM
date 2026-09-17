import {
  OfflineTaskStorage,
  OfflineTaskStorageError,
  type OfflineDocument,
  type StringStorage,
  type TaskSyncOperation,
} from './task-offline-storage';
import type { Task } from './product-contracts';

const owner = 'owner/a';
const key = 'dsm.tasks.offline.v1:owner%2Fa';
const day = '2026-09-11';
const now = `${day}T10:00:00.000Z`;
const uuid = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const task = (n = 1): Task => ({
  id: uuid(n), userId: owner, title: '할 일', description: null,
  startAt: now, endAt: `${day}T11:00:00.000Z`, difficulty: 'LOW',
  categoryId: null, notificationEnabled: false, status: 'PENDING', completedAt: null,
});
const operation = (n = 1): TaskSyncOperation => {
  const { id, title, description, startAt, endAt, difficulty, categoryId,
    notificationEnabled, status } = task(n);
  return { mutationId: id, taskId: id, updatedAt: now, kind: 'create',
    task: { title, description, startAt, endAt, difficulty, categoryId, notificationEnabled, status } };
};
const document = (): OfflineDocument => ({
  version: 1, userId: owner, revision: 3, lastLogicalTime: Date.parse(now),
  cachedDates: { [day]: [task()] },
  categories: [{ id: 'category', name: '기본', color: '#000000', isDefault: true, userId: null }],
  outbox: [{ operation: operation() }],
});
function memory(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[key, initial]]);
  const storage = {
    getItem: jest.fn(async (k: string) => values.get(k) ?? null),
    setItem: jest.fn(async (k: string, value: string) => { values.set(k, value); }),
    removeItem: jest.fn(async (k: string) => { values.delete(k); }),
  } satisfies StringStorage;
  return { values, storage, store: new OfflineTaskStorage(storage, owner) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('opens empty without writing; first write survives a new instance', async () => {
  const { storage, store } = memory();
  expect(store.getSnapshot()).toBeNull();
  expect(await store.open()).toEqual({ version: 1, userId: owner, revision: 0,
    lastLogicalTime: 0, cachedDates: {}, categories: [], outbox: [] });
  expect(storage.setItem).not.toHaveBeenCalled();
  const result = await store.update(draft => { draft.outbox.push({ operation: operation() }); });
  expect(result.revision).toBe(1);
  expect(await new OfflineTaskStorage(storage, owner).open()).toEqual(result);
  expect(storage.getItem).toHaveBeenCalledWith(key);
});

test('concurrent opens and queued writers share one read and preserve both updates', async () => {
  const { storage, store } = memory();
  const read = deferred<string | null>();
  storage.getItem.mockImplementationOnce(() => read.promise);
  const first = store.open();
  const second = store.open();
  const a = store.update(draft => { draft.outbox.push({ operation: operation(1) }); });
  const b = store.update(draft => { draft.outbox.push({ operation: operation(2) }); });
  read.resolve(null);
  await Promise.all([first, second, a, b]);
  expect(storage.getItem).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot()?.revision).toBe(2);
  expect(store.getSnapshot()?.outbox.map(row => row.operation.taskId)).toEqual([uuid(1), uuid(2)]);
});

test('does not publish pending or failed writes; subsequent writer recovers', async () => {
  const { storage, store, values } = memory(JSON.stringify(document()));
  await store.open();
  const write = deferred<void>();
  storage.setItem.mockImplementationOnce(() => write.promise);
  const pending = store.update(draft => { draft.outbox = []; });
  const failure = pending.catch(error => error);
  await Promise.resolve();
  expect(store.getSnapshot()?.outbox).toHaveLength(1);
  write.reject(new Error('sensitive underlying failure'));
  expect(await failure).toMatchObject({ kind: 'write' });
  expect(values.get(key)).toBe(JSON.stringify(document()));
  expect(store.getSnapshot()?.revision).toBe(3);
  await store.update(draft => { draft.outbox[0].blocked = 'TASK_DAILY_LIMIT'; });
  expect(store.getSnapshot()?.revision).toBe(4);
  expect(store.getSnapshot()?.outbox[0].blocked).toBe('TASK_DAILY_LIMIT');
});

test('returns isolated snapshots and isolates a retained updater draft during a write', async () => {
  const { storage, store } = memory(JSON.stringify(document()));
  const opened = await store.open();
  opened.outbox[0].operation.task!.title = 'external';
  store.getSnapshot()!.cachedDates[day][0].title = 'external';
  let retained!: OfflineDocument;
  const write = deferred<void>();
  const started = deferred<void>();
  storage.setItem.mockImplementationOnce(async () => { started.resolve(); await write.promise; });
  const pending = store.update(draft => { retained = draft; draft.outbox[0].blocked = 'CONFLICT'; });
  await started.promise;
  retained.outbox[0].operation.task!.title = 'late external';
  write.resolve();
  const returned = await pending;
  returned.outbox.length = 0;
  expect(store.getSnapshot()?.outbox[0].operation.task?.title).toBe('할 일');
  expect(store.getSnapshot()?.cachedDates[day][0].title).toBe('할 일');
});

test('a throwing mutator does not write or poison the queue; raw errors are redacted', async () => {
  const { store, storage } = memory();
  const error = await store.update(() => { throw new Error('sensitive synthetic detail'); }).catch(e => e);
  expect(error).toBeInstanceOf(OfflineTaskStorageError);
  expect(String(error)).not.toContain('sensitive');
  expect(JSON.stringify(error)).not.toContain('sensitive');
  expect(storage.setItem).not.toHaveBeenCalled();
  expect((await store.update(() => {})).revision).toBe(1);
});

test('read failures retry without writing a replacement', async () => {
  const { store, storage } = memory(JSON.stringify(document()));
  storage.getItem.mockRejectedValueOnce(new Error('synthetic private detail'));
  await expect(store.open()).rejects.toMatchObject({ kind: 'read' });
  expect(store.getSnapshot()).toBeNull();
  expect(await store.open()).toEqual(document());
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('accounts have distinct encoded keys and never see another account snapshot', async () => {
  const { storage, store } = memory(JSON.stringify(document()));
  await store.open();
  const other = new OfflineTaskStorage(storage, 'owner%2Fa');
  expect((await other.open()).outbox).toEqual([]);
  expect(storage.getItem).toHaveBeenLastCalledWith('dsm.tasks.offline.v1:owner%252Fa');
});

test.each(['', ' ', ' owner', 'owner ', '\uD800'])('rejects invalid owner %p', value => {
  expect(() => new OfflineTaskStorage(memory().storage, value)).toThrow(OfflineTaskStorageError);
});

test.each([
  ['wrong owner', (d: any) => { d.userId = 'other'; }],
  ['foreign task', (d: any) => { d.cachedDates[day][0].userId = 'other'; }],
  ['foreign category', (d: any) => { d.categories[0].userId = 'other'; }],
  ['nondefault public category', (d: any) => { d.categories[0].isDefault = false; }],
  ['unknown version', (d: any) => { d.version = 2; }],
  ['credential field', (d: any) => { d.accessToken = 'synthetic'; }],
  ['bad revision', (d: any) => { d.revision = -1; }],
  ['bad logical time', (d: any) => { d.lastLogicalTime = 1.5; }],
  ['bad day', (d: any) => { d.cachedDates['2026-02-30'] = []; }],
  ['bad task', (d: any) => { d.cachedDates[day][0].status = 'unknown'; }],
  ['bad uuid', (d: any) => { d.outbox[0].operation.mutationId = 'invalid'; }],
  ['create mismatch', (d: any) => { d.outbox[0].operation.taskId = uuid(2); }],
  ['timestamp offset', (d: any) => { d.outbox[0].operation.updatedAt = '2026-09-11T10:00:00+00:00'; }],
  ['timestamp rollover', (d: any) => { d.outbox[0].operation.updatedAt = '2026-02-30T10:00:00.000Z'; }],
  ['zero year operation clock', (d: any) => { d.outbox[0].operation.updatedAt = '0000-09-11T10:00:00.000Z'; }],
  ['zero year task interval', (d: any) => {
    d.outbox[0].operation.task.startAt = '0000-09-11T10:00:00.000Z';
    d.outbox[0].operation.task.endAt = '0000-09-11T11:00:00.000Z';
  }],
  ['missing fields', (d: any) => { delete d.outbox[0].operation.task.description; }],
  ['completedAt input', (d: any) => { d.outbox[0].operation.task.completedAt = now; }],
  ['title limit', (d: any) => { d.outbox[0].operation.task.title = 'a'.repeat(201); }],
  ['description limit', (d: any) => { d.outbox[0].operation.task.description = 'a'.repeat(4001); }],
  ['end before start', (d: any) => { d.outbox[0].operation.task.endAt = now; }],
  ['delete payload', (d: any) => { d.outbox[0].operation.kind = 'delete'; }],
  ['duplicate mutation', (d: any) => { d.outbox.push(d.outbox[0]); }],
])('rejects %s without overwriting persisted data', async (_label, change) => {
  const data = document(); change(data);
  const raw = JSON.stringify(data);
  const { store, storage, values } = memory(raw);
  await expect(store.open()).rejects.toBeInstanceOf(OfflineTaskStorageError);
  await expect(store.update(() => {})).rejects.toBeInstanceOf(OfflineTaskStorageError);
  expect(store.getSnapshot()).toBeNull();
  expect(values.get(key)).toBe(raw);
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
});

test.each(['{broken', 'null', '[]', ' '.repeat(1024 * 1024 + 1)])('preserves corrupt or oversized raw data', async raw => {
  const { store, storage, values } = memory(raw);
  await expect(store.open()).rejects.toBeInstanceOf(OfflineTaskStorageError);
  expect(values.get(key)).toBe(raw);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('allows replace and delete, private categories, and the 200 operation boundary', async () => {
  const { store } = memory();
  const result = await store.update(draft => {
    draft.categories = [{ id: 'mine', name: '개인', color: 'red', isDefault: false, userId: owner }];
    draft.outbox = Array.from({ length: 200 }, (_, i) => ({ operation: operation(i + 1) }));
    draft.outbox[0].operation.kind = 'replace';
    draft.outbox[1].operation = { mutationId: uuid(2), taskId: uuid(1), kind: 'delete', updatedAt: now };
  });
  expect(result.outbox).toHaveLength(200);
  await expect(store.update(draft => { draft.outbox.push({ operation: operation(201) }); })).rejects.toMatchObject({ kind: 'limit' });
  expect(store.getSnapshot()?.outbox).toHaveLength(200);
});

test('enforces 42 cached dates and 1000 task bounds without eviction', async () => {
  const { store } = memory();
  await store.update(draft => {
    for (let i = 0; i < 42; i++) {
      const date = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
      draft.cachedDates[date] = [];
    }
  });
  await expect(store.update(draft => { draft.cachedDates[day] = []; })).rejects.toMatchObject({ kind: 'limit' });
  expect(Object.keys(store.getSnapshot()!.cachedDates)).toHaveLength(42);
  await store.update(draft => { draft.cachedDates = { [day]: Array.from({ length: 1000 }, (_, i) => task(i + 1)) }; });
  await expect(store.update(draft => { draft.cachedDates[day].push(task(1001)); })).rejects.toMatchObject({ kind: 'limit' });
  expect(store.getSnapshot()?.cachedDates[day]).toHaveLength(1000);
});

test('measures UTF8 bytes rather than UTF16 length and preserves the previous revision on overflow', async () => {
  const { store, storage } = memory();
  await store.open();
  await expect(store.update(draft => {
    draft.cachedDates[day] = Array.from({ length: 100 }, (_, i) => ({ ...task(i + 1), description: '가'.repeat(4000) }));
  })).rejects.toMatchObject({ kind: 'limit' });
  expect(store.getSnapshot()?.revision).toBe(0);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('second write waits for the first persistence and open cannot return a stale revision', async () => {
  const { store, storage } = memory();
  await store.open();
  const gate = deferred<void>();
  const started = deferred<void>();
  storage.setItem.mockImplementationOnce(async () => { started.resolve(); await gate.promise; });
  const first = store.update(draft => { draft.outbox.push({ operation: operation() }); });
  await started.promise;
  const secondMutator = jest.fn((draft: OfflineDocument) => { draft.outbox.push({ operation: operation(2) }); });
  const second = store.update(secondMutator);
  const open = store.open();
  await Promise.resolve();
  expect(secondMutator).not.toHaveBeenCalled();
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  gate.resolve();
  await Promise.all([first, second]);
  expect((await open).revision).toBe(2);
  expect(storage.setItem).toHaveBeenCalledTimes(2);
});

test('rejects invalid updates without publishing and owns the revision counter', async () => {
  const { store, storage } = memory(JSON.stringify(document()));
  await store.open();
  await expect(store.update(draft => { draft.userId = 'other'; })).rejects.toMatchObject({ kind: 'invalid' });
  await expect(store.update(draft => { draft.lastLogicalTime -= 1; })).rejects.toMatchObject({ kind: 'invalid' });
  expect(store.getSnapshot()).toEqual(document());
  expect(storage.setItem).not.toHaveBeenCalled();
  const result = await store.update(draft => { draft.revision = 1000; });
  expect(result.revision).toBe(4);
});

test('supports the exact 1MiB ASCII envelope boundary and rejects one byte more', async () => {
  const data = document();
  data.cachedDates[day][0].title = 'ascii';
  data.cachedDates[day][0].description = '';
  const size = Buffer.byteLength(JSON.stringify(data), 'utf8');
  data.cachedDates[day][0].description = 'a'.repeat(1024 * 1024 - size);
  const raw = JSON.stringify(data);
  expect(Buffer.byteLength(raw, 'utf8')).toBe(1024 * 1024);
  const { store, storage } = memory(raw);
  await expect(store.open()).resolves.toEqual(data);
  await expect(store.update(draft => { draft.cachedDates[day][0].description += 'a'; })).rejects.toMatchObject({ kind: 'limit' });
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(store.getSnapshot()).toEqual(data);
});

test('counts surrogate pairs as four UTF8 bytes when reading an oversized valid envelope', async () => {
  const data = document();
  data.cachedDates[day][0].description = '😀'.repeat(270000);
  const raw = JSON.stringify(data);
  expect(raw.length).toBeLessThan(1024 * 1024);
  const { store, storage } = memory(raw);
  await expect(store.open()).rejects.toMatchObject({ kind: 'limit' });
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('rejects escaped control-heavy operation bodies over 16KiB', async () => {
  const { store } = memory();
  await expect(store.update(draft => {
    const op = operation();
    op.task!.description = '\u0000'.repeat(4000);
    draft.outbox.push({ operation: op });
  })).rejects.toMatchObject({ kind: 'limit' });
});

test('accepts 200 codepoint titles, 4000 codepoint descriptions, and legacy category IDs', async () => {
  const { store } = memory();
  const result = await store.update(draft => {
    const op = operation();
    op.task!.title = '😀'.repeat(200);
    op.task!.description = 'a'.repeat(3999) + '😀';
    op.task!.categoryId = 'legacy-category';
    draft.outbox.push({ operation: op });
  });
  expect(result.outbox[0].operation.task?.title).toBe('😀'.repeat(200));
  expect(result.outbox[0].operation.task?.categoryId).toBe('legacy-category');
});

test.each([
  { title: '😀'.repeat(201) },
  { description: 'a'.repeat(4000) + '😀' },
  { categoryId: '' },
  { categoryId: '   ' },
  { categoryId: 'c'.repeat(256) },
])('rejects fields outside the sync boundaries %p', async fields => {
  const { store } = memory();
  await expect(store.update(draft => {
    const op = operation();
    Object.assign(op.task!, fields);
    draft.outbox.push({ operation: op });
  })).rejects.toMatchObject({ kind: 'invalid' });
});

test('rebases a legacy clock from a trusted checkpoint without migrating or losing cached data', async () => {
  const data = document();
  data.lastLogicalTime += 3_600_000;
  data.outbox = [];
  const { store, storage } = memory(JSON.stringify(data));
  const serverFloor = Date.parse(now) + 240_000;
  const result = await store.rebaseLogicalTime(serverFloor, () => true);
  expect(result).toEqual({ ...data, revision: data.revision + 1, lastLogicalTime: serverFloor });
  expect(await new OfflineTaskStorage(storage, owner).open()).toEqual(result);
  result.cachedDates[day][0].title = 'external';
  expect(store.getSnapshot()?.cachedDates).toEqual(data.cachedDates);
  await expect(store.update(draft => { draft.lastLogicalTime = serverFloor - 1; }))
    .rejects.toMatchObject({ kind: 'invalid' });
});

test('rebase includes every remaining create, blocked replace and delete without rewriting operations', async () => {
  const data = document();
  data.lastLogicalTime += 3_600_000;
  data.outbox = [
    { operation: { ...operation(), updatedAt: new Date(Date.parse(now) + 60_000).toISOString() } },
    { operation: { ...operation(2), kind: 'replace', taskId: uuid(),
      updatedAt: new Date(Date.parse(now) + 120_000).toISOString() }, blocked: 'CONFLICT' },
    { operation: { mutationId: uuid(3), taskId: uuid(), kind: 'delete',
      updatedAt: new Date(Date.parse(now) + 180_000).toISOString() } },
  ];
  const { store } = memory(JSON.stringify(data));
  const result = await store.rebaseLogicalTime(Date.parse(now) + 30_000, () => true);
  expect(result).toEqual({ ...data, revision: data.revision + 1,
    lastLogicalTime: Date.parse(now) + 180_000 });
});

test('rebase shares the writer queue and includes operations committed by an earlier pending writer', async () => {
  const data = document();
  data.lastLogicalTime += 3_600_000;
  const { store, storage, values } = memory(JSON.stringify(data));
  await store.open();
  const gate = deferred<void>();
  const started = deferred<void>();
  storage.setItem.mockImplementationOnce(async (k, raw) => {
    started.resolve(); await gate.promise; values.set(k, raw);
  });
  const queuedOperation = { ...operation(2), updatedAt: new Date(Date.parse(now) + 600_000).toISOString() };
  const first = store.update(draft => { draft.outbox.push({ operation: queuedOperation, blocked: 'FUTURE_TIME' }); });
  await started.promise;
  const rebase = store.rebaseLogicalTime(Date.parse(now), () => true);
  const after = store.update(draft => { draft.cachedDates[day][0].title = 'after rebase'; });
  await Promise.resolve();
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  gate.resolve();
  await first;
  const rebased = await rebase;
  expect(rebased.lastLogicalTime).toBe(Date.parse(queuedOperation.updatedAt));
  expect(rebased.outbox[1]).toEqual({ operation: queuedOperation, blocked: 'FUTURE_TIME' });
  const result = await after;
  expect(result.lastLogicalTime).toBe(rebased.lastLogicalTime);
  expect(result.revision).toBe(data.revision + 3);
  expect(result.cachedDates[day][0].title).toBe('after rebase');
});

test('rebase checks current ownership after an asynchronous open and before writing', async () => {
  const data = document();
  const { store, storage, values } = memory(JSON.stringify(data));
  const read = deferred<string | null>();
  const started = deferred<void>();
  storage.getItem.mockImplementationOnce(() => { started.resolve(); return read.promise; });
  let current = true;
  const pending = store.rebaseLogicalTime(0, () => current);
  await started.promise;
  current = false;
  read.resolve(JSON.stringify(data));
  await expect(pending).rejects.toMatchObject({ kind: 'invalid' });
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(values.get(key)).toBe(JSON.stringify(data));
  expect(store.getSnapshot()).toEqual(data);
});

test('pending and failed rebase do not publish a new floor or replace durable bytes; retry works', async () => {
  const data = document();
  data.lastLogicalTime += 3_600_000;
  const raw = JSON.stringify(data);
  const { store, storage, values } = memory(raw);
  await store.open();
  const write = deferred<void>();
  const started = deferred<void>();
  storage.setItem.mockImplementationOnce(() => { started.resolve(); return write.promise; });
  const pending = store.rebaseLogicalTime(Date.parse(now), () => true);
  const failed = pending.catch(error => error);
  await started.promise;
  expect(store.getSnapshot()).toEqual(data);
  expect(values.get(key)).toBe(raw);
  write.reject(new Error('synthetic private storage detail'));
  expect(await failed).toMatchObject({ kind: 'write' });
  expect(store.getSnapshot()).toEqual(data);
  expect(values.get(key)).toBe(raw);
  expect((await store.rebaseLogicalTime(Date.parse(now), () => true)).lastLogicalTime).toBe(Date.parse(now));
});

test.each([0, 253402300799999])('accepts trusted floor boundary %p with an empty outbox', async serverFloor => {
  const { store } = memory();
  const result = await store.rebaseLogicalTime(serverFloor, () => true);
  expect(result.lastLogicalTime).toBe(serverFloor);
  expect(result.revision).toBe(1);
});

test.each([-1, 1.5, NaN, Infinity, 253402300800000, Number.MAX_SAFE_INTEGER,
  '1' as unknown as number])('rejects invalid checkpoint %p without a write', async serverFloor => {
  const data = document();
  const { store, storage, values } = memory(JSON.stringify(data));
  await expect(store.rebaseLogicalTime(serverFloor, () => true)).rejects.toMatchObject({ kind: 'invalid' });
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(values.get(key)).toBe(JSON.stringify(data));
});

test('a throwing current guard is redacted and does not poison subsequent queued writes', async () => {
  const { store, storage } = memory();
  const failure = await store.rebaseLogicalTime(0, () => { throw new Error('synthetic private guard detail'); })
    .catch(error => error);
  expect(failure).toBeInstanceOf(OfflineTaskStorageError);
  expect(failure.kind).toBe('invalid');
  expect(JSON.stringify(failure)).not.toContain('private');
  expect(storage.setItem).not.toHaveBeenCalled();
  expect((await store.update(() => {})).revision).toBe(1);
});

test('rebase cannot replace corrupt legacy bytes or overflow the revision counter', async () => {
  for (const raw of ['{broken', JSON.stringify({ ...document(), revision: Number.MAX_SAFE_INTEGER })]) {
    const { store, storage, values } = memory(raw);
    await expect(store.rebaseLogicalTime(0, () => true)).rejects.toBeInstanceOf(OfflineTaskStorageError);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(values.get(key)).toBe(raw);
  }
});
