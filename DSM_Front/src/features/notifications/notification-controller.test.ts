import { NotificationController } from './notification-controller';
import { NotificationStorage } from './notification-storage';
import type { NotificationApi, ReminderPage, DueReminder } from './notification-api';

const start = Date.parse('2026-09-11T10:00:00.000Z');
const reminder = (id = 'r-1'): DueReminder => ({ id, taskId: `t-${id}`, title: '할 일', startAt: new Date(start).toISOString(), expiresAt: new Date(start + 300_000).toISOString() });
const page = (rows = [reminder()], nextCursor: string | null = null): ReminderPage => ({ serverTime: new Date(start).toISOString(), reminders: rows, nextCursor });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function fixture(wallClockOffset = 0) {
  const values = new Map<string, string>();
  const backing = { getItem: jest.fn(async (key: string) => values.get(key) ?? null), setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }) };
  const storage = new NotificationStorage('owner', backing, () => start + wallClockOffset);
  const api = {
    userId: 'owner', getSettings: jest.fn(async () => ({ notificationEnabled: true })),
    setSettings: jest.fn(async (notificationEnabled: boolean) => ({ notificationEnabled })),
    reminders: jest.fn(async (_cursor?: string) => page()),
    registerToken: jest.fn(async (_token: string): ReturnType<NotificationApi['registerToken']> => ({ id: 'registration', platform: 'android' as const, deviceId: null, lastSeenAt: new Date(start).toISOString(), revokedAt: null })),
    revokeToken: jest.fn(async (_token: string) => {}),
  } satisfies NotificationApi;
  const native = {
    status: jest.fn(async () => ({ configured: true, permission: 'granted' as 'granted' | 'denied' })),
    requestPermission: jest.fn(async () => ({ configured: true, permission: 'granted' as const })),
    getToken: jest.fn(async () => 'synthetic-fcm-token'), deleteToken: jest.fn(async () => {}),
    display: jest.fn(async (_owner: string, _reminder: DueReminder, _preferences: unknown, _remainingMs: number, shouldDisplay?: () => boolean) => { if (shouldDisplay && !shouldDisplay()) throw new Error('stale'); }),
    cancelAll: jest.fn(async () => {}), openSettings: jest.fn(async () => {}),
  };
  let current = true;
  let clock = start;
  const onForegroundReminder = jest.fn();
  const controller = new NotificationController({ api, storage, native, isCurrent: () => current, now: () => clock, onForegroundReminder });
  await controller.load();
  return { controller, api, storage, backing, values, native, onForegroundReminder, stale: () => { current = false; }, advance: (ms: number) => { clock += ms; } };
}

test('loads authenticated settings and preferences without requesting permission or token', async () => {
  const f = await fixture();
  expect(f.controller.getSnapshot()).toMatchObject({ loaded: true, enabled: true, preferences: { sound: true, vibration: true, foreground: true }, device: { configured: true, permission: 'granted' }, error: null });
  expect(f.native.requestPermission).not.toHaveBeenCalled();
  expect(f.native.getToken).not.toHaveBeenCalled();
  expect(f.controller.getSnapshot()).toBe(f.controller.getSnapshot());
});

test.each([-3_600_000, 3_600_000])('does not repeat foreground reminders with device clock offset %s', async offset => {
  const f = await fixture(offset);
  f.native.status.mockResolvedValue({ configured: true, permission: 'denied' });
  expect(await f.controller.sync(true)).toBe(true);
  expect(await f.controller.sync(true)).toBe(true);
  expect(f.onForegroundReminder).toHaveBeenCalledTimes(1);
  const storage = new NotificationStorage('owner', f.backing, () => start + offset);
  const restarted = new NotificationController({ api: f.api, storage, native: f.native, isCurrent: () => true, now: () => start, onForegroundReminder: f.onForegroundReminder });
  expect(await restarted.sync(true)).toBe(true);
  expect(f.onForegroundReminder).toHaveBeenCalledTimes(1);
});

test('only exact neutral envelopes can trigger authenticated reminder fetch', async () => {
  const f = await fixture();
  for (const data of [null, {}, { type: 'REMINDER_SYNC', version: 1 }, { type: 'REMINDER_SYNC', version: '1', title: 'injected' }, { type: 'TASK_REMINDER', version: '1' }]) {
    expect(await f.controller.receive(data, true)).toBe(false);
  }
  expect(f.api.reminders).not.toHaveBeenCalled();
  expect(await f.controller.receive({ type: 'REMINDER_SYNC', version: '1' }, true)).toBe(true);
  expect(f.native.display).toHaveBeenCalledWith('owner', reminder(), { sound: true, vibration: true, foreground: true }, 300_000, expect.any(Function));
  expect(f.storage.hasDisplayed('r-1')).toBe(true);
});

test('coalesces sync and suppresses durable duplicates after restart', async () => {
  const f = await fixture();
  const gate = deferred<ReminderPage>();
  f.api.reminders.mockReturnValueOnce(gate.promise);
  const one = f.controller.sync(false);
  const two = f.controller.sync(false);
  gate.resolve(page());
  expect(await Promise.all([one, two])).toEqual([true, true]);
  expect(f.api.reminders).toHaveBeenCalledTimes(1);
  await f.controller.sync(false);
  expect(f.native.display).toHaveBeenCalledTimes(1);
  const restartedStorage = new NotificationStorage('owner', f.backing, () => start);
  const restarted = new NotificationController({ api: f.api, storage: restartedStorage, native: f.native, isCurrent: () => true, now: () => start });
  await restarted.sync(false);
  expect(f.native.display).toHaveBeenCalledTimes(1);
});

test('fetches all pages before displaying and deduplicates IDs across pages', async () => {
  const f = await fixture();
  f.api.reminders.mockResolvedValueOnce(page([reminder('one')], 'one')).mockResolvedValueOnce(page([reminder('one'), reminder('two')]));
  expect(await f.controller.sync(false)).toBe(true);
  expect(f.api.reminders.mock.calls).toEqual([[undefined], ['one']]);
  expect(f.native.display.mock.calls.map(call => call[1].id)).toEqual(['one', 'two']);
});

test('partial page failure produces no display or dedupe record', async () => {
  const f = await fixture();
  f.api.reminders.mockResolvedValueOnce(page([reminder()], 'next')).mockRejectedValueOnce(new Error('sensitive-fixture'));
  expect(await f.controller.sync(false)).toBe(false);
  expect(f.native.display).not.toHaveBeenCalled();
  expect(f.storage.hasDisplayed('r-1')).toBe(false);
  expect(JSON.stringify(f.controller.getSnapshot())).not.toContain('sensitive-fixture');
});

test('rejects cursor loops and bounded page overflow without displaying partial results', async () => {
  const f = await fixture();
  f.api.reminders.mockResolvedValue(page([reminder()], 'loop'));
  expect(await f.controller.sync(false)).toBe(false);
  expect(f.api.reminders).toHaveBeenCalledTimes(2);
  expect(f.native.display).not.toHaveBeenCalled();
  f.api.reminders.mockClear().mockImplementation(async () => page([], `cursor-${f.api.reminders.mock.calls.length}`));
  expect(await f.controller.sync(false)).toBe(false);
  expect(f.api.reminders).toHaveBeenCalledTimes(100);
});

test('accounts for fetch elapsed time and skips reminders expired while awaiting pages', async () => {
  const f = await fixture();
  f.api.reminders.mockImplementationOnce(async () => { f.advance(299_000); return page(); });
  await f.controller.sync(false);
  expect(f.native.display.mock.calls[0][3]).toBe(1000);
  const g = await fixture();
  g.api.reminders.mockImplementationOnce(async () => { g.advance(300_000); return page(); });
  await g.controller.sync(false);
  expect(g.native.display).not.toHaveBeenCalled();
  expect(g.storage.hasDisplayed('r-1')).toBe(false);
});

test('uses the earliest deadline for duplicate reminders across later pages', async () => {
  const f = await fixture();
  f.api.reminders.mockImplementationOnce(async () => page([reminder()], 'next')).mockImplementationOnce(async () => { f.advance(300_000); return page([reminder()]); });
  await f.controller.sync(false);
  expect(f.native.display).not.toHaveBeenCalled();
});

test.each(['stale', 'dispose'] as const)('fences %s after a delayed authenticated response', async mode => {
  const f = await fixture();
  const gate = deferred<ReminderPage>();
  f.api.reminders.mockReturnValueOnce(gate.promise);
  const work = f.controller.sync(false);
  await Promise.resolve(); await Promise.resolve();
  if (mode === 'dispose') f.controller.dispose(); else f.stale();
  gate.resolve(page());
  expect(await work).toBe(false);
  expect(f.native.display).not.toHaveBeenCalled();
  expect(f.storage.hasDisplayed('r-1')).toBe(false);
});

test('setting OFF during fetch stops display and cancels current notifications', async () => {
  const f = await fixture();
  const gate = deferred<ReminderPage>();
  f.api.reminders.mockReturnValueOnce(gate.promise);
  const work = f.controller.sync(false);
  await Promise.resolve(); await Promise.resolve();
  expect(await f.controller.setEnabled(false)).toBe(true);
  gate.resolve(page());
  expect(await work).toBe(false);
  expect(f.native.display).not.toHaveBeenCalled();
  expect(f.native.cancelAll).toHaveBeenCalled();
});

test('native display guard notices OFF while native work is awaiting', async () => {
  const f = await fixture();
  const entered = deferred<void>();
  const finish = deferred<void>();
  f.native.display.mockImplementationOnce(async (_owner, _row, _prefs, _ms, guard) => {
    entered.resolve(); await finish.promise;
    expect(guard?.()).toBe(false);
    throw new Error('stale');
  });
  const work = f.controller.sync(false);
  await entered.promise;
  await f.controller.setEnabled(false);
  finish.resolve();
  expect(await work).toBe(false);
  expect(f.storage.hasDisplayed('r-1')).toBe(false);
});

test('global OFF and disabled foreground preference suppress display', async () => {
  const f = await fixture();
  await f.controller.setPreferences({ foreground: false });
  expect(await f.controller.sync(true)).toBe(true);
  expect(f.native.display).not.toHaveBeenCalled();
  expect(f.onForegroundReminder).not.toHaveBeenCalled();
  f.api.getSettings.mockResolvedValue({ notificationEnabled: false });
  expect(await f.controller.sync(false)).toBe(true);
  expect(f.api.reminders).not.toHaveBeenCalled();
});

test('denied OS permission allows a current foreground banner, but no background display', async () => {
  const f = await fixture();
  f.native.status.mockResolvedValue({ configured: true, permission: 'denied' });
  await f.controller.sync(false);
  expect(f.storage.hasDisplayed('r-1')).toBe(false);
  await f.controller.sync(true);
  expect(f.native.display).not.toHaveBeenCalled();
  expect(f.onForegroundReminder).toHaveBeenCalledWith(reminder());
  expect(f.storage.hasDisplayed('r-1')).toBe(true);
});

test('storage failure after display remains retryable using the same stable owner/reminder identity', async () => {
  const f = await fixture();
  f.backing.setItem.mockRejectedValueOnce(new Error('private-fixture'));
  expect(await f.controller.sync(false)).toBe(false);
  expect(f.storage.hasDisplayed('r-1')).toBe(false);
  expect(await f.controller.sync(false)).toBe(true);
  expect(f.native.display.mock.calls.map(call => [call[0], call[1].id])).toEqual([['owner', 'r-1'], ['owner', 'r-1']]);
  expect(f.storage.hasDisplayed('r-1')).toBe(true);
});

test('register is singleflight and snapshots never expose tokens', async () => {
  const f = await fixture();
  const gate = deferred<Awaited<ReturnType<NotificationApi['registerToken']>>>();
  f.api.registerToken.mockReturnValueOnce(gate.promise);
  const one = f.controller.register();
  const two = f.controller.register();
  gate.resolve({ id: 'id', platform: 'android', deviceId: null, lastSeenAt: new Date(start).toISOString(), revokedAt: null });
  expect(await Promise.all([one, two])).toEqual([true, true]);
  expect(f.native.getToken).toHaveBeenCalledTimes(1);
  expect(f.api.registerToken).toHaveBeenCalledWith('synthetic-fcm-token');
  expect(JSON.stringify(f.controller)).not.toContain('synthetic-fcm-token');
});

test('explicit permission request precedes registration and can be retried safely', async () => {
  const f = await fixture();
  f.api.registerToken.mockRejectedValueOnce(new Error('sensitive-token-fixture'));
  expect(await f.controller.requestPermission()).toBe(false);
  expect(f.native.requestPermission).toHaveBeenCalledTimes(1);
  expect(f.controller.getSnapshot().error).not.toContain('sensitive-token-fixture');
  expect(await f.controller.register()).toBe(true);
});

test('stale registration revokes only its captured token and never deletes a newer account native token', async () => {
  const f = await fixture();
  const entered = deferred<void>();
  const gate = deferred<Awaited<ReturnType<NotificationApi['registerToken']>>>();
  f.api.registerToken.mockImplementationOnce(async () => { entered.resolve(); return gate.promise; });
  const work = f.controller.register();
  await entered.promise;
  f.stale();
  gate.resolve({ id: 'id', platform: 'android', deviceId: null, lastSeenAt: new Date(start).toISOString(), revokedAt: null });
  expect(await work).toBe(false);
  expect(f.api.revokeToken).toHaveBeenCalledWith('synthetic-fcm-token');
  expect(f.native.deleteToken).not.toHaveBeenCalled();
});

test('logout revokes server token before deleting native token, and failure preserves retry', async () => {
  const f = await fixture();
  await f.controller.register();
  const order: string[] = [];
  f.api.revokeToken.mockImplementationOnce(async () => { throw new Error('private-fixture'); });
  expect(await f.controller.revokeTokenBeforeLogout()).toBe(false);
  expect(f.native.deleteToken).not.toHaveBeenCalled();
  f.api.revokeToken.mockImplementation(async () => { order.push('revoke'); });
  f.native.deleteToken.mockImplementation(async () => { order.push('delete'); });
  f.native.cancelAll.mockImplementation(async () => { order.push('cancel'); });
  expect(await f.controller.revokeTokenBeforeLogout()).toBe(true);
  expect(order).toEqual(['revoke', 'delete', 'cancel']);
});

test('serial preference writes preserve both changes and safe errors do not claim success', async () => {
  const f = await fixture();
  expect(await Promise.all([f.controller.setPreferences({ sound: false }), f.controller.setPreferences({ vibration: false })])).toEqual([true, true]);
  expect(f.controller.getSnapshot().preferences).toEqual({ sound: false, vibration: false, foreground: true });
  f.api.setSettings.mockRejectedValueOnce(new Error('private-fixture'));
  expect(await f.controller.setEnabled(false)).toBe(false);
  expect(f.controller.getSnapshot().error).not.toContain('private-fixture');
  await f.controller.sync(false);
  expect(f.native.display).not.toHaveBeenCalled();
});

test('disposal stops subscription updates and blocks subsequent work', async () => {
  const f = await fixture();
  const listener = jest.fn();
  f.controller.subscribe(listener);
  f.controller.dispose();
  expect(await f.controller.sync(false)).toBe(false);
  expect(await f.controller.register()).toBe(false);
  expect(await f.controller.setEnabled(true)).toBe(false);
  expect(listener).not.toHaveBeenCalled();
});

test('rejects storage belonging to another account', async () => {
  const f = await fixture();
  expect(() => new NotificationController({ api: f.api, storage: new NotificationStorage('other', f.backing), native: f.native, isCurrent: () => true })).toThrow();
});

test('persists acquired token binding before registration and aborts server writes on binding failure', async () => {
  const f = await fixture();
  const order: string[] = [];
  const onTokenAcquired = jest.fn(async (_token: string) => { order.push('bind'); });
  f.api.registerToken.mockImplementation(async () => { order.push('register'); return { id: 'id', platform: 'android', deviceId: null, lastSeenAt: new Date(start).toISOString(), revokedAt: null }; });
  const controller = new NotificationController({ api: f.api, storage: f.storage, native: f.native, isCurrent: () => true, onTokenAcquired });
  expect(await controller.register()).toBe(true);
  expect(order).toEqual(['bind', 'register']);
  onTokenAcquired.mockRejectedValueOnce(new Error('private-fixture'));
  expect(await controller.register()).toBe(false);
  expect(f.api.registerToken).toHaveBeenCalledTimes(1);
});

test('injected binding supports logout after restart with OS permission denied, clearing binding last', async () => {
  const f = await fixture();
  f.native.status.mockResolvedValue({ configured: true, permission: 'denied' });
  const order: string[] = [];
  f.api.revokeToken.mockImplementation(async () => { order.push('revoke'); });
  f.native.deleteToken.mockImplementation(async () => { order.push('delete'); });
  const onTokenCleared = jest.fn(async () => { order.push('clear'); });
  const controller = new NotificationController({ api: f.api, storage: f.storage, native: f.native, isCurrent: () => true, registeredToken: 'synthetic-persisted-token', onTokenCleared });
  onTokenCleared.mockRejectedValueOnce(new Error('private-fixture'));
  expect(await controller.revokeTokenBeforeLogout()).toBe(false);
  expect(await controller.revokeTokenBeforeLogout()).toBe(true);
  expect(order).toEqual(['revoke', 'delete', 'revoke', 'delete', 'clear']);
  expect(f.api.revokeToken).toHaveBeenCalledWith('synthetic-persisted-token');
  expect(f.native.getToken).not.toHaveBeenCalled();
});

test('logout waits for an in-flight registration and blocks subsequent sync', async () => {
  const f = await fixture();
  const entered = deferred<void>();
  const gate = deferred<Awaited<ReturnType<NotificationApi['registerToken']>>>();
  f.api.registerToken.mockImplementationOnce(async () => { entered.resolve(); return gate.promise; });
  const registration = f.controller.register();
  await entered.promise;
  const logout = f.controller.revokeTokenBeforeLogout();
  expect(await f.controller.sync(false)).toBe(false);
  expect(f.native.deleteToken).not.toHaveBeenCalled();
  gate.resolve({ id: 'id', platform: 'android', deviceId: null, lastSeenAt: new Date(start).toISOString(), revokedAt: null });
  expect(await registration).toBe(false);
  expect(await logout).toBe(true);
  expect(f.api.revokeToken).toHaveBeenCalledWith('synthetic-fcm-token');
  expect(f.native.deleteToken).toHaveBeenCalledTimes(1);
});

test('an older enable ACK cannot lift suppression while a newer OFF write is pending', async () => {
  const f = await fixture();
  const enabled = deferred<{ notificationEnabled: boolean }>();
  const disabling = deferred<{ notificationEnabled: boolean }>();
  const entered = deferred<void>();
  f.api.setSettings.mockReturnValueOnce(enabled.promise).mockImplementationOnce(async () => { entered.resolve(); return disabling.promise; });
  const on = f.controller.setEnabled(true);
  const off = f.controller.setEnabled(false);
  enabled.resolve({ notificationEnabled: true });
  await on;
  await entered.promise;
  await f.controller.sync(false);
  expect(f.native.display).not.toHaveBeenCalled();
  disabling.resolve({ notificationEnabled: false });
  expect(await off).toBe(true);
});

test('a late account A response cannot display or cancel account B reminders', async () => {
  const f = await fixture();
  const gate = deferred<ReminderPage>();
  const entered = deferred<void>();
  f.api.reminders.mockImplementationOnce(async () => { entered.resolve(); return gate.promise; });
  const oldWork = f.controller.sync(false);
  await entered.promise;
  f.stale();
  const otherApi = { ...f.api, userId: 'other', reminders: jest.fn(async () => page([reminder('other-reminder')])) };
  const otherStorage = new NotificationStorage('other', f.backing, () => start);
  const other = new NotificationController({ api: otherApi, storage: otherStorage, native: f.native, isCurrent: () => true, now: () => start });
  expect(await other.sync(false)).toBe(true);
  gate.resolve(page());
  expect(await oldWork).toBe(false);
  expect(f.native.display.mock.calls.map(call => [call[0], call[1].id])).toEqual([['other', 'other-reminder']]);
  expect(f.native.cancelAll).not.toHaveBeenCalled();
  expect(f.storage.hasDisplayed('r-1')).toBe(false);
  expect(otherStorage.hasDisplayed('other-reminder')).toBe(true);
});

test('native display failure does not claim displayed history and can retry', async () => {
  const f = await fixture();
  f.native.display.mockRejectedValueOnce(new Error('private-fixture'));
  expect(await f.controller.sync(false)).toBe(false);
  expect(f.storage.hasDisplayed('r-1')).toBe(false);
  expect(f.controller.getSnapshot().error).not.toContain('private-fixture');
  expect(await f.controller.sync(false)).toBe(true);
  expect(f.storage.hasDisplayed('r-1')).toBe(true);
});

test('settle waits for disposed native display work and starts no new operation', async () => {
  const f = await fixture();
  const entered = deferred<void>();
  const gate = deferred<void>();
  f.native.display.mockImplementationOnce(async () => { entered.resolve(); await gate.promise; });
  const work = f.controller.sync(false);
  await entered.promise;
  f.controller.dispose();
  let settled = false;
  const barrier = f.controller.settle().then(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  gate.resolve();
  await barrier;
  expect(await work).toBe(false);
  expect(f.storage.hasDisplayed('r-1')).toBe(false);
  expect(f.api.reminders).toHaveBeenCalledTimes(1);
});

test('settle waits for disposed registration and queued preference writes without rejecting', async () => {
  const f = await fixture();
  const entered = deferred<void>();
  const gate = deferred<Awaited<ReturnType<NotificationApi['registerToken']>>>();
  f.api.registerToken.mockImplementationOnce(async () => { entered.resolve(); return gate.promise; });
  f.api.revokeToken.mockRejectedValueOnce(new Error('private-fixture'));
  const work = f.controller.register();
  await entered.promise;
  const queued = f.controller.setPreferences({ sound: false });
  f.controller.dispose();
  let settled = false;
  const barrier = f.controller.settle().then(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  gate.resolve({ id: 'id', platform: 'android', deviceId: null, lastSeenAt: new Date(start).toISOString(), revokedAt: null });
  await barrier;
  expect(await work).toBe(false);
  expect(await queued).toBe(false);
  expect(f.backing.setItem).not.toHaveBeenCalled();
});
