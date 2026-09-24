import { NotificationStorage, type NotificationDocument } from './notification-storage';

const initialNow = Date.parse('2026-09-11T10:00:00.000Z');
const expiry = new Date(initialNow + 300_000).toISOString();
const day = 86_400_000;
function fixture() {
  const values = new Map<string, string>();
  const backing = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
  let clock = initialNow;
  const storage = new NotificationStorage('owner', backing, () => clock);
  return { storage, backing, values, advance: (ms: number) => { clock += ms; }, restart: () => new NotificationStorage('owner', backing, () => clock) };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('empty load defaults all preferences true, reads once, and does not write', async () => {
  const { storage, backing } = fixture();
  expect(storage.getSnapshot()).toBeNull();
  expect(() => storage.hasDisplayed('id')).toThrow();
  const [one, two] = await Promise.all([storage.load(), storage.load()]);
  expect(one).toEqual({ version: 1, userId: 'owner', preferences: { sound: true, vibration: true, foreground: true }, displayed: [] });
  expect(two).toEqual(one);
  expect(backing.getItem).toHaveBeenCalledTimes(1);
  expect(backing.setItem).not.toHaveBeenCalled();
});

test.each([-3_600_000, 3_600_000])('stores a server-validated remaining lifetime with device clock offset %s', async offset => {
  const f = fixture();
  f.advance(offset);
  await f.storage.markDisplayed('r', expiry, 120_000);
  expect(f.storage.getSnapshot()?.displayed[0]).toEqual({ id: 'r', displayedAt: initialNow + offset, expiresAt: new Date(initialNow + offset + 120_000).toISOString() });
  const restarted = f.restart();
  await restarted.load();
  expect(restarted.hasDisplayed('r')).toBe(true);
});

test('preserves dedupe, new reminders and preferences after correcting a fast clock', async () => {
  const f = fixture();
  f.advance(3_600_000);
  await f.storage.markDisplayed('previous', expiry, 120_000);
  const before = f.storage.getSnapshot();
  f.advance(-3_600_000);

  expect(f.storage.hasDisplayed('previous')).toBe(true);
  expect(f.storage.hasDisplayed('new')).toBe(false);
  expect(f.storage.getSnapshot()).toEqual(before);
  await f.storage.setPreferences({ sound: false });
  await f.storage.markDisplayed('new', expiry, 300_000);
  await f.storage.markDisplayed('previous', expiry, 300_000);
  const restarted = f.restart();
  const restored = await restarted.load();

  expect(restored.preferences.sound).toBe(false);
  expect(restored.displayed).toEqual([
    { id: 'previous', displayedAt: initialNow, expiresAt: new Date(initialNow + 120_000).toISOString() },
    { id: 'new', displayedAt: initialNow, expiresAt: expiry },
  ]);
  expect(restarted.hasDisplayed('previous')).toBe(true);
  expect(restarted.hasDisplayed('new')).toBe(true);
});

test('persists a cold-load clock correction once without renewing retention on restart', async () => {
  const f = fixture();
  f.advance(3_600_000);
  await f.storage.markDisplayed('previous', expiry, 120_000);
  f.advance(-3_600_000);
  await f.restart().load();
  expect(f.backing.setItem).toHaveBeenCalledTimes(2);
  f.advance(3_600_000);
  const restarted = f.restart();
  const restored = await restarted.load();
  expect(restored.displayed[0].displayedAt).toBe(initialNow);
  expect(f.backing.setItem).toHaveBeenCalledTimes(2);
  f.advance(day - 3_600_000);
  expect(restarted.hasDisplayed('previous')).toBe(false);
});

test('keeps a failed correction write unpublished and retries the same retention anchor', async () => {
  const f = fixture();
  f.advance(3_600_000);
  await f.storage.markDisplayed('previous', expiry, 120_000);
  const raw = f.values.get('dsm.notifications.v1:owner');
  f.advance(-3_600_000);
  const restarted = f.restart();
  f.backing.setItem.mockRejectedValueOnce(new Error('sensitive-fixture'));

  await expect(restarted.load()).rejects.toMatchObject({ kind: 'write' });
  expect(restarted.getSnapshot()).toBeNull();
  expect(f.values.get('dsm.notifications.v1:owner')).toBe(raw);
  f.advance(60_000);
  expect((await restarted.load()).displayed[0].displayedAt).toBe(initialNow);
  expect(restarted.hasDisplayed('previous')).toBe(true);
});

test('preferences and displayed history persist across restart and expiry retains dedupe', async () => {
  const f = fixture();
  await f.storage.setPreferences({ sound: false, foreground: false });
  await f.storage.markDisplayed('reminder', expiry);
  f.advance(600_000);
  const restarted = f.restart();
  const snapshot = await restarted.load();
  expect(snapshot.preferences).toEqual({ sound: false, foreground: false, vibration: true });
  expect(restarted.hasDisplayed('reminder')).toBe(true);
  f.advance(day);
  expect(restarted.hasDisplayed('reminder')).toBe(false);
  expect((await restarted.setPreferences({ vibration: false })).displayed).toEqual([]);
});

test('serializes concurrent read and writes without dropping distinct patches or records', async () => {
  const f = fixture();
  const gate = deferred();
  f.backing.getItem.mockImplementationOnce(async () => { await gate.promise; return null; });
  const changes = [f.storage.load(), f.storage.setPreferences({ sound: false }), f.storage.setPreferences({ vibration: false }), f.storage.markDisplayed('one', expiry), f.storage.markDisplayed('two', expiry)];
  gate.resolve();
  await Promise.all(changes);
  expect(f.storage.getSnapshot()?.preferences).toEqual({ sound: false, vibration: false, foreground: true });
  expect(f.storage.getSnapshot()?.displayed.map(row => row.id)).toEqual(['one', 'two']);
  expect(f.backing.getItem).toHaveBeenCalledTimes(1);
});

test('does not publish pending or failed writes, and the writer recovers', async () => {
  const f = fixture();
  await f.storage.load();
  const before = f.storage.getSnapshot();
  const gate = deferred();
  f.backing.setItem.mockImplementationOnce(async () => { await gate.promise; throw new Error('sensitive-fixture'); });
  const write = f.storage.markDisplayed('one', expiry);
  await Promise.resolve();
  expect(f.storage.getSnapshot()).toEqual(before);
  gate.resolve();
  const error = await write.catch(reason => reason);
  expect(error).toMatchObject({ kind: 'write' });
  expect(JSON.stringify(error)).not.toContain('sensitive-fixture');
  expect(f.storage.hasDisplayed('one')).toBe(false);
  await f.storage.markDisplayed('two', expiry);
  expect(f.storage.hasDisplayed('two')).toBe(true);
});

test('returns independent snapshots and captures patches before a queued write', async () => {
  const f = fixture();
  const patch = { sound: false };
  const write = f.storage.setPreferences(patch);
  patch.sound = true;
  const result = await write;
  result.preferences.sound = true;
  result.displayed.push({ id: 'injected', displayedAt: initialNow, expiresAt: expiry });
  const copy = f.storage.getSnapshot()!;
  copy.preferences.vibration = false;
  expect(f.storage.getSnapshot()?.preferences).toEqual({ sound: false, vibration: true, foreground: true });
  expect(f.storage.hasDisplayed('injected')).toBe(false);
  expect((await f.restart().load()).displayed).toEqual([]);
});

test('isolates owners with encoded storage keys', async () => {
  const f = fixture();
  const other = new NotificationStorage('other/owner', f.backing, () => initialNow);
  await f.storage.markDisplayed('same-id', expiry);
  await other.setPreferences({ sound: false });
  expect(other.hasDisplayed('same-id')).toBe(false);
  expect([...f.values.keys()]).toEqual(['dsm.notifications.v1:owner', 'dsm.notifications.v1:other%2Fowner']);
});

test('repeated marks do not extend the original 24 hour retention', async () => {
  const f = fixture();
  await f.storage.markDisplayed('id', expiry);
  f.advance(120_000);
  await f.storage.markDisplayed('id', expiry);
  expect(f.storage.getSnapshot()?.displayed).toHaveLength(1);
  expect(f.storage.getSnapshot()?.displayed[0].displayedAt).toBe(initialNow);
  f.advance(day - 120_000);
  expect(f.storage.hasDisplayed('id')).toBe(false);
});

test('preserves 200 recent records at capacity and permits writes after retention expires', async () => {
  const f = fixture();
  for (let i = 0; i < 200; i++) await f.storage.markDisplayed(`id-${i}`, expiry);
  const before = f.storage.getSnapshot();
  await expect(f.storage.markDisplayed('overflow', expiry)).rejects.toMatchObject({ kind: 'limit' });
  expect(f.storage.getSnapshot()).toEqual(before);
  f.advance(day);
  await f.storage.markDisplayed('new', new Date(initialNow + day + 300_000).toISOString());
  expect(f.storage.getSnapshot()?.displayed.map(row => row.id)).toEqual(['new']);
});

test('enforces serialized UTF8 64KiB without dropping existing records', async () => {
  const f = fixture();
  let count = 0;
  for (; count < 200; count++) {
    try { await f.storage.markDisplayed(`${count}${'😀'.repeat(250)}`, expiry); }
    catch (error) { expect(error).toMatchObject({ kind: 'limit' }); break; }
  }
  expect(count).toBeGreaterThan(1);
  expect(count).toBeLessThan(200);
  expect(f.storage.getSnapshot()?.displayed).toHaveLength(count);
  expect((await f.restart().load()).displayed).toHaveLength(count);
});

test.each([null, [], { sound: 'false' }, { vibration: 0 }, { foreground: undefined }, { extra: true }])('rejects malformed preferences %p without writes', async patch => {
  const f = fixture();
  await expect(f.storage.setPreferences(patch as never)).rejects.toMatchObject({ kind: 'invalid' });
  expect(f.backing.setItem).not.toHaveBeenCalled();
  await expect(f.storage.setPreferences({ sound: false })).resolves.toMatchObject({ preferences: { sound: false } });
});

test.each([
  ['', expiry], [' ', expiry], ['x'.repeat(256), expiry], ['id', 'invalid'],
  ['id', '0000-09-11T10:00:00.000Z'], ['id', '2026-02-30T10:00:00.000Z'],
  ['id', '2026-09-11T10:05:00Z'], ['id', '2099-09-11T10:00:00.000Z'],
])('rejects invalid ID/expiry before writes', async (id, expiresAt) => {
  const f = fixture();
  await expect(f.storage.markDisplayed(id, expiresAt)).rejects.toMatchObject({ kind: 'invalid' });
  expect(f.backing.setItem).not.toHaveBeenCalled();
});

test.each(['not-json', JSON.stringify({ version: 2 }), 'x'.repeat(65_537)])('preserves corrupt or oversized stored data', async raw => {
  const f = fixture();
  f.values.set('dsm.notifications.v1:owner', raw);
  await expect(f.storage.load()).rejects.toMatchObject({ kind: 'corrupt' });
  await expect(f.storage.setPreferences({ sound: false })).rejects.toMatchObject({ kind: 'corrupt' });
  expect(f.values.get('dsm.notifications.v1:owner')).toBe(raw);
  expect(f.backing.setItem).not.toHaveBeenCalled();
});

test.each([
  (doc: NotificationDocument) => { doc.userId = 'other'; },
  (doc: NotificationDocument) => { (doc.preferences as unknown as Record<string, unknown>).token = 'private-fixture'; },
  (doc: NotificationDocument) => { doc.displayed[0].displayedAt = 253402300800000; },
  (doc: NotificationDocument) => { doc.displayed[0].displayedAt = -1; },
  (doc: NotificationDocument) => { doc.displayed.push(doc.displayed[0]); },
  (doc: NotificationDocument) => { doc.displayed[0].expiresAt = '2099-01-01T00:00:00.000Z'; },
])('rejects owner/schema/time corruption without overwriting', async change => {
  const f = fixture();
  await f.storage.markDisplayed('id', expiry);
  const doc = f.storage.getSnapshot()!;
  change(doc);
  const raw = JSON.stringify(doc);
  f.values.set('dsm.notifications.v1:owner', raw);
  const restarted = f.restart();
  const error = await restarted.load().catch(reason => reason);
  expect(error).toMatchObject({ kind: 'corrupt' });
  expect(JSON.stringify(error)).not.toContain('private-fixture');
  expect(restarted.getSnapshot()).toBeNull();
  expect(f.values.get('dsm.notifications.v1:owner')).toBe(raw);
});

test('read failures are safe and can recover on the next load', async () => {
  const f = fixture();
  f.backing.getItem.mockRejectedValueOnce(new Error('sensitive-fixture'));
  const error = await f.storage.load().catch(reason => reason);
  expect(error).toMatchObject({ kind: 'read' });
  expect(JSON.stringify(error)).not.toContain('sensitive-fixture');
  expect(f.storage.getSnapshot()).toBeNull();
  await expect(f.storage.load()).resolves.toMatchObject({ userId: 'owner' });
});

test('bounds live dedupe after clock correction even when no later write occurs', async () => {
  const f = fixture();
  f.advance(3_600_000);
  await f.storage.markDisplayed('id', expiry, 120_000);
  const before = f.storage.getSnapshot();
  f.advance(-3_600_000);
  expect(f.storage.hasDisplayed('id')).toBe(true);
  expect(f.storage.getSnapshot()).toEqual(before);
  f.advance(day);
  expect(f.storage.hasDisplayed('id')).toBe(false);
  expect(f.backing.setItem).toHaveBeenCalledTimes(1);
});

test('accepts bounded clock skew without discarding recent dedupe history', async () => {
  const f = fixture();
  await f.storage.markDisplayed('id', expiry);
  f.advance(-300_000);
  const restarted = f.restart();
  await restarted.load();
  expect(restarted.hasDisplayed('id')).toBe(true);
});

test.each([NaN, Infinity, -1, 0.5])('rejects an invalid local clock %p', async clock => {
  const f = fixture();
  const storage = new NotificationStorage('owner', f.backing, () => clock);
  await expect(storage.load()).rejects.toMatchObject({ kind: 'invalid' });
  expect(f.backing.setItem).not.toHaveBeenCalled();
});

test.each(['', ' ', ' owner', 'owner '])('rejects invalid owner %p', owner => {
  expect(() => new NotificationStorage(owner, fixture().backing)).toThrow();
});
