import { NotificationRuntime } from './notification-runtime';
import { NotificationStorage } from './notification-storage';
import { createAuthenticatedClient } from '../../lib/api/authenticated-client';
import { createHttpClient } from '../../lib/api/http-client';
import type { SessionControllerPort, SessionSnapshot, SessionState } from '../auth/session-controller';
import type { NotificationBinding } from './notification-binding';
import type { DueReminder } from './notification-api';

const now = Date.parse('2026-09-11T10:00:00.000Z');
const auth = (userId: string): SessionState => ({ status: 'authenticated', userId, onboardingCompletedAt: new Date(now).toISOString() });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function response(value: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => status === 204 ? '' : JSON.stringify(value) } as Response;
}
function fixture(initial: SessionState = auth('A'), initialBinding: NotificationBinding | null = null) {
  let state = initial;
  let epoch = 1;
  let action: SessionSnapshot['action'] = 'idle';
  let accessToken = initial.status === 'authenticated' ? `access-${initial.userId}` : null;
  const listeners = new Set<() => void>();
  const session = {
    getSnapshot: (): SessionSnapshot => ({ state, action, error: null }),
    getEpoch: () => epoch,
    getAccessToken: () => accessToken,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    refreshAccessToken: jest.fn(async () => `${accessToken}-refreshed`),
    endUnauthorizedSession: jest.fn(async () => {}),
  };
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.endsWith('/settings')) return response({ notificationEnabled: true });
    if (url.includes('/reminders?')) return response({ serverTime: new Date(now).toISOString(), reminders: [{ id: 'r', taskId: 'task', title: '알림', startAt: new Date(now).toISOString(), expiresAt: new Date(now + 300_000).toISOString() }], nextCursor: null });
    if (init?.method === 'DELETE') return response(undefined, 204);
    return response({ id: 'registration', platform: 'android', deviceId: null, lastSeenAt: new Date(now).toISOString(), revokedAt: null });
  });
  const client = createAuthenticatedClient(createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl }), {
    getAccessToken: session.getAccessToken, refreshAccessToken: session.refreshAccessToken, onUnauthorized: session.endUnauthorizedSession,
  });
  let savedBinding = initialBinding;
  const binding = {
    read: jest.fn(async () => savedBinding),
    write: jest.fn(async (value: NotificationBinding) => { savedBinding = { ...value }; }),
    clear: jest.fn(async (expected: NotificationBinding) => {
      if (savedBinding && (savedBinding.userId !== expected.userId || savedBinding.token !== expected.token)) return false;
      savedBinding = null; return true;
    }),
  };
  let tokenNumber = 1;
  const native = {
    status: jest.fn(async () => ({ configured: true, permission: 'granted' as 'granted' | 'denied' })),
    requestPermission: jest.fn(async () => ({ configured: true, permission: 'granted' as const })),
    getToken: jest.fn(async () => `native-token-${tokenNumber}`),
    deleteToken: jest.fn(async () => { tokenNumber++; }), cancelAll: jest.fn(async () => {}),
    display: jest.fn(async (_owner: string, _row: DueReminder, _preferences: unknown, _remaining: number, guard?: () => boolean) => { if (!guard?.()) throw new Error('stale'); }),
    openSettings: jest.fn(async () => {}),
  };
  const values = new Map<string, string>();
  const stores = new Map<string, NotificationStorage>();
  const storageFactory = (owner: string) => {
    let store = stores.get(owner);
    if (!store) {
      store = new NotificationStorage(owner, { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } }, () => now);
      stores.set(owner, store);
    }
    return store;
  };
  const dependencies = { session: session as unknown as SessionControllerPort, client, native, binding, storageFactory, now: () => now };
  const runtime = new NotificationRuntime(dependencies);
  return { runtime, dependencies, session, native, binding, fetchImpl, getBinding: () => savedBinding,
    setAction: (next: SessionSnapshot['action']) => { action = next; listeners.forEach(listener => listener()); },
    change: (next: SessionState) => { state = next; epoch++; accessToken = next.status === 'authenticated' ? `access-${next.userId}` : null; listeners.forEach(listener => listener()); },
  };
}

test('authenticated start creates one scoped controller and reuses same owner token across restart', async () => {
  const f = fixture(auth('A'), { userId: 'A', token: 'native-token-1' });
  expect(await f.runtime.start()).toBe(true);
  const controller = f.runtime.getController();
  expect(controller).not.toBeNull();
  await f.runtime.reconcile();
  expect(f.runtime.getController()).toBe(controller);
  expect(f.native.deleteToken).not.toHaveBeenCalled();
  expect(f.getBinding()).toEqual({ userId: 'A', token: 'native-token-1' });
  await f.runtime.stop();
  expect(f.runtime.getController()).toBeNull();
  await f.runtime.start();
  expect(f.native.deleteToken).not.toHaveBeenCalled();
  expect(f.getBinding()?.token).toBe('native-token-1');
});

test.each<SessionState>([{ status: 'unauthenticated' }, { status: 'bootstrapping' }, { status: 'onboarding', userId: 'A', onboardingCompletedAt: null }, { status: 'offline', retry: 'bootstrap' }])('does not fetch reminder content outside authenticated state %p', async initial => {
  const f = fixture(initial);
  await f.runtime.start();
  expect(await f.runtime.receive({ type: 'REMINDER_SYNC', version: '1' }, true)).toBe(false);
  expect(f.runtime.getController()).toBeNull();
  expect(f.fetchImpl).not.toHaveBeenCalled();
  expect(f.native.getToken).not.toHaveBeenCalled();
});

test('offline transition fences immediately and preserves token/binding for recovery', async () => {
  const f = fixture();
  await f.runtime.start();
  const old = f.runtime.getController()!;
  f.change({ status: 'offline-workspace', retry: 'bootstrap', userId: 'A', onboardingCompletedAt: new Date(now).toISOString() });
  expect(f.runtime.getController()).toBeNull();
  expect(await old.sync(false)).toBe(false);
  await f.runtime.reconcile();
  expect(f.native.cancelAll).toHaveBeenCalled();
  expect(f.native.deleteToken).not.toHaveBeenCalled();
  expect(f.getBinding()?.userId).toBe('A');
  f.change(auth('A'));
  await f.runtime.reconcile();
  expect(f.runtime.getController()).not.toBe(old);
  expect(f.native.deleteToken).not.toHaveBeenCalled();
});

test('account switch waits for old pending native token acquisition before deleting and registering B', async () => {
  const f = fixture();
  const entered = deferred<void>();
  const gate = deferred<string>();
  f.native.getToken.mockImplementationOnce(async () => { entered.resolve(); return gate.promise; });
  const starting = f.runtime.start();
  await entered.promise;
  f.change(auth('B'));
  expect(f.runtime.getController()).toBeNull();
  await Promise.resolve();
  expect(f.native.deleteToken).not.toHaveBeenCalled();
  gate.resolve('old-native-token');
  await starting;
  expect(await f.runtime.reconcile()).toBe(true);
  expect(f.native.deleteToken).toHaveBeenCalledTimes(1);
  expect(f.getBinding()).toEqual({ userId: 'B', token: 'native-token-2' });
  const registrations = f.fetchImpl.mock.calls.filter(call => call[1]?.method === 'PUT');
  expect(registrations).toHaveLength(1);
  expect(registrations[0][1]?.headers).toMatchObject({ Authorization: 'Bearer access-B' });
});

test('late A 401 does not refresh, replay, or revoke with B credentials', async () => {
  const f = fixture();
  await f.runtime.start();
  const entered = deferred<void>();
  const gate = deferred<Response>();
  const normal = f.fetchImpl.getMockImplementation()!;
  f.fetchImpl.mockImplementation(async (url, init) => {
    if (url.includes('/reminders?') && (init?.headers as Record<string, string>).Authorization === 'Bearer access-A') { entered.resolve(); return gate.promise; }
    return normal(url, init);
  });
  const work = f.runtime.refresh(false);
  await entered.promise;
  f.change(auth('B'));
  gate.resolve(response({}, 401));
  expect(await work).toBe(false);
  await f.runtime.reconcile();
  expect(f.session.refreshAccessToken).not.toHaveBeenCalled();
  expect(f.session.endUnauthorizedSession).not.toHaveBeenCalled();
  expect(f.native.display).not.toHaveBeenCalled();
  expect(f.fetchImpl.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(0);
});

test('stale registration completion cannot start owner A cleanup through B credentials', async () => {
  const f = fixture();
  const entered = deferred<void>();
  const gate = deferred<Response>();
  const normal = f.fetchImpl.getMockImplementation()!;
  f.fetchImpl.mockImplementation(async (url, init) => {
    if (init?.method === 'PUT' && (init.headers as Record<string, string>).Authorization === 'Bearer access-A') { entered.resolve(); return gate.promise; }
    return normal(url, init);
  });
  const work = f.runtime.start();
  await entered.promise;
  f.change(auth('B'));
  gate.resolve(response({ id: 'registration', platform: 'android', deviceId: null, lastSeenAt: new Date(now).toISOString(), revokedAt: null }));
  await work;
  await f.runtime.reconcile();
  expect(f.fetchImpl.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(0);
  expect(f.getBinding()?.userId).toBe('B');
});

test('restart with permission denied uses durable binding for logout cleanup', async () => {
  const f = fixture(auth('A'), { userId: 'A', token: 'persisted-token' });
  f.native.status.mockResolvedValue({ configured: true, permission: 'denied' });
  await f.runtime.start();
  expect(await f.runtime.prepareLogout()).toBe(true);
  expect(f.fetchImpl.mock.calls.find(call => call[1]?.method === 'DELETE')?.[1]?.body).toBe(JSON.stringify({ token: 'persisted-token' }));
  expect(f.native.getToken).not.toHaveBeenCalled();
  expect(f.getBinding()).toBeNull();
  expect(f.runtime.getController()).toBeNull();
  const previous = f.fetchImpl.mock.calls.length;
  await f.runtime.reconcile();
  expect(f.fetchImpl).toHaveBeenCalledTimes(previous);
});

test('logout cleanup failure retains controller and binding, and resume recreates after auth logout failure', async () => {
  const f = fixture();
  await f.runtime.start();
  const controller = f.runtime.getController();
  const normal = f.fetchImpl.getMockImplementation()!;
  f.fetchImpl.mockImplementationOnce(async () => response({}, 503));
  expect(await f.runtime.prepareLogout()).toBe(false);
  expect(f.runtime.getController()).toBe(controller);
  expect(f.getBinding()?.userId).toBe('A');
  f.fetchImpl.mockImplementation(normal);
  expect(await f.runtime.prepareLogout()).toBe(true);
  expect(f.runtime.getController()).toBeNull();
  expect(await f.runtime.resume()).toBe(true);
  expect(f.runtime.getController()).not.toBe(controller);
  expect(f.getBinding()?.userId).toBe('A');
});

test('forced unauthenticated transition deletes local native token before clearing old binding', async () => {
  const f = fixture();
  await f.runtime.start();
  const order: string[] = [];
  f.native.deleteToken.mockImplementation(async () => { order.push('delete'); });
  const clear = f.binding.clear.getMockImplementation()!;
  f.binding.clear.mockImplementation(async binding => { order.push('clear'); return clear(binding); });
  f.change({ status: 'unauthenticated' });
  await f.runtime.reconcile();
  expect(order).toEqual(['delete', 'clear']);
  expect(f.getBinding()).toBeNull();
  expect(f.fetchImpl.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(0);
});

test('failed native deletion prevents B registration and preserves binding for retry', async () => {
  const f = fixture();
  await f.runtime.start();
  f.native.deleteToken.mockRejectedValueOnce(new Error('private-fixture'));
  f.change(auth('B'));
  await Promise.resolve();
  await f.runtime.reconcile();
  expect(JSON.stringify(f.runtime.getSnapshot())).not.toContain('private-fixture');
  // The explicit reconcile retries the failed transition safely.
  expect(f.getBinding()?.userId).toBe('B');
});

test('compare-clear conflict fails closed without overwriting another binding', async () => {
  const f = fixture(auth('B'), { userId: 'A', token: 'old-token' });
  f.binding.clear.mockResolvedValue(false);
  expect(await f.runtime.start()).toBe(false);
  expect(f.runtime.getController()).toBeNull();
  expect(f.binding.write).not.toHaveBeenCalled();
  expect(f.getBinding()?.userId).toBe('A');
});

test('binding write failure prevents server token registration and reports a safe UI error', async () => {
  const f = fixture();
  f.binding.write.mockRejectedValueOnce(new Error('private-fixture'));
  expect(await f.runtime.start()).toBe(false);
  expect(f.fetchImpl.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(0);
  expect(JSON.stringify(f.runtime.getSnapshot())).not.toContain('private-fixture');
});

test('runtime subscription has stable snapshots and stop blocks new work', async () => {
  const f = fixture();
  const listener = jest.fn();
  const unsubscribe = f.runtime.subscribe(listener);
  await f.runtime.start();
  expect(listener).toHaveBeenCalled();
  expect(f.runtime.getSnapshot()).toBe(f.runtime.getSnapshot());
  await f.runtime.stop();
  listener.mockClear();
  f.change(auth('B'));
  expect(await f.runtime.refresh(true)).toBe(false);
  expect(listener).not.toHaveBeenCalled();
  unsubscribe();
});

test('successful prepared logout suspends only the prepared session and permits a later authenticated account', async () => {
  const f = fixture();
  await f.runtime.start();
  expect(await f.runtime.prepareLogout()).toBe(true);
  f.change(auth('A')); // logout increments the epoch while authenticated state is still visible.
  await f.runtime.reconcile();
  expect(f.runtime.getController()).toBeNull();
  f.change({ status: 'unauthenticated' });
  await f.runtime.reconcile();
  f.change(auth('B'));
  expect(await f.runtime.reconcile()).toBe(true);
  expect(f.runtime.getController()).not.toBeNull();
  expect(f.getBinding()?.userId).toBe('B');
});

test('foreground refresh notices an external permission grant and registers in the same refresh', async () => {
  const f = fixture();
  f.native.status.mockResolvedValue({ configured: true, permission: 'denied' });
  await f.runtime.start();
  expect(f.native.getToken).not.toHaveBeenCalled();
  f.native.status.mockResolvedValue({ configured: true, permission: 'granted' });
  expect(await f.runtime.refresh(true)).toBe(true);
  expect(f.native.getToken).toHaveBeenCalledTimes(1);
  expect(f.getBinding()?.userId).toBe('A');
});

test('session ending action blocks ordinary registration but permits explicit cleanup preparation', async () => {
  const f = fixture(auth('A'), { userId: 'A', token: 'persisted-token' });
  f.setAction('logging-out');
  expect(await f.runtime.start()).toBe(false);
  expect(f.native.getToken).not.toHaveBeenCalled();
  expect(await f.runtime.refresh(true)).toBe(false);
  expect(await f.runtime.prepareLogout()).toBe(true);
  expect(f.getBinding()).toBeNull();
  expect(f.native.getToken).not.toHaveBeenCalled();
});
