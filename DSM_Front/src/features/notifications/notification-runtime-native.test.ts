import type { SessionState } from '../auth/session-controller';

const mockNow = Date.parse('2026-09-11T10:00:00.000Z');
let mockState: SessionState;
let mockEpoch: number;
const mockSessionListeners = new Set<() => void>();
let mockAppStateHandler: ((state: string) => void) | undefined;
let mockMessageHandler: ((message: { data?: unknown }) => void) | undefined;
let mockTokenHandler: (() => void) | undefined;
let mockBackgroundHandler: ((message: { data?: unknown }) => Promise<void>) | undefined;
let mockForegroundEvent: ((event: unknown) => void) | undefined;
let mockBackgroundEvent: ((event: unknown) => Promise<void>) | undefined;
const mockRemoveAppState = jest.fn();
const mockRemoveMessage = jest.fn();
const mockRemoveToken = jest.fn();
const mockRemoveEvent = jest.fn();
const mockBootstrap = jest.fn(async () => { mockState = { status: 'authenticated', userId: 'A', onboardingCompletedAt: new Date(mockNow).toISOString() }; });
const mockRequest = jest.fn(async (request: { path: string; method?: string; validate?: (value: unknown) => unknown }) => {
  const value = request.path.includes('/settings') ? { notificationEnabled: true } : request.path.includes('/reminders?') ? {
    serverTime: new Date(mockNow).toISOString(), reminders: [{ id: 'r', taskId: 'task', title: '할 일', startAt: new Date(mockNow).toISOString(), expiresAt: new Date(mockNow + 300_000).toISOString() }], nextCursor: null,
  } : { id: 'registration', platform: 'android', deviceId: null, lastSeenAt: new Date(mockNow).toISOString(), revokedAt: null };
  return request.method === 'DELETE' ? undefined : request.validate?.(value) ?? value;
});
const mockSessionRuntime = {
  controller: {
    getSnapshot: () => ({ state: mockState, action: 'idle', error: null }), getEpoch: () => mockEpoch,
    subscribe: (listener: () => void) => { mockSessionListeners.add(listener); return () => mockSessionListeners.delete(listener); },
    bootstrap: mockBootstrap,
  },
  client: { request: mockRequest },
};
jest.mock('../auth/session-runtime', () => ({ getSessionRuntime: jest.fn(() => mockSessionRuntime) }));
jest.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: jest.fn((_event, handler) => { mockAppStateHandler = handler; return { remove: mockRemoveAppState }; }) } }));
const mockValues = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({ createAsyncStorage: jest.fn(() => ({ getItem: async (key: string) => mockValues.get(key) ?? null, setItem: async (key: string, value: string) => { mockValues.set(key, value); } })) }));
let mockBinding: { userId: string; token: string } | null;
jest.mock('./notification-binding', () => ({ notificationBinding: { read: jest.fn(async () => mockBinding), write: jest.fn(async value => { mockBinding = value; }), clear: jest.fn(async () => { mockBinding = null; return true; }) } }));
const mockNative = {
  status: jest.fn(async () => ({ configured: true, permission: 'granted' })),
  requestPermission: jest.fn(async () => ({ configured: true, permission: 'granted' })),
  getToken: jest.fn(async () => 'synthetic-token'), deleteToken: jest.fn(async () => {}), cancelAll: jest.fn(async () => {}),
  display: jest.fn(async () => {}), openSettings: jest.fn(async () => {}),
  onMessage: jest.fn(handler => { mockMessageHandler = handler; return mockRemoveMessage; }),
  onTokenRefresh: jest.fn(handler => { mockTokenHandler = handler; return mockRemoveToken; }),
  setBackgroundHandler: jest.fn(handler => { mockBackgroundHandler = handler; }),
};
jest.mock('./notification-native', () => ({ notificationNative: mockNative }));
const mockNotifee = {
  onForegroundEvent: jest.fn(handler => { mockForegroundEvent = handler; return mockRemoveEvent; }),
  onBackgroundEvent: jest.fn(handler => { mockBackgroundEvent = handler; }),
  getInitialNotification: jest.fn(async (): Promise<unknown> => null),
};
jest.mock('@notifee/react-native', () => ({ __esModule: true, default: mockNotifee, EventType: { PRESS: 1, DELIVERED: 3, ACTION_PRESS: 2 } }));

function glue(): typeof import('./notification-runtime-native') { return require('./notification-runtime-native'); }
async function flush() { for (let i = 0; i < 80; i++) await Promise.resolve(); }
function appState(value: string) {
  require('react-native').AppState.currentState = value;
  mockAppStateHandler?.(value);
}

beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); jest.useFakeTimers(); jest.setSystemTime(mockNow);
  mockState = { status: 'authenticated', userId: 'A', onboardingCompletedAt: new Date(mockNow).toISOString() };
  mockEpoch = 1; mockBinding = null; mockValues.clear(); mockSessionListeners.clear();
  mockAppStateHandler = undefined; mockMessageHandler = undefined; mockTokenHandler = undefined;
  mockBackgroundHandler = undefined; mockForegroundEvent = undefined; mockBackgroundEvent = undefined;
  mockNative.status.mockResolvedValue({ configured: true, permission: 'granted' });
  mockNotifee.getInitialNotification.mockResolvedValue(null);
});
afterEach(() => { jest.useRealTimers(); });

test('entry and foreground share one lazy runtime and install background handlers once', async () => {
  const module = glue();
  module.installNotificationHandlers(); module.installNotificationHandlers();
  expect(mockNative.setBackgroundHandler).toHaveBeenCalledTimes(1);
  expect(mockNotifee.onBackgroundEvent).toHaveBeenCalledTimes(1);
  expect(mockRequest).not.toHaveBeenCalled();
  const runtime = module.getNotificationRuntime();
  const stop = module.startForegroundNotifications();
  await flush();
  expect(module.getNotificationRuntime()).toBe(runtime);
  expect(require('../auth/session-runtime').getSessionRuntime).toHaveBeenCalledTimes(1);
  expect(require('@react-native-async-storage/async-storage').createAsyncStorage).toHaveBeenCalledWith('dsm_notifications_v1');
  stop();
});

test('background bootstrap only runs for bootstrapping and uses the shared runtime', async () => {
  mockState = { status: 'bootstrapping' };
  const module = glue();
  module.installNotificationHandlers();
  await mockBackgroundHandler?.({ data: { type: 'REMINDER_SYNC', version: '1' } });
  expect(mockBootstrap).toHaveBeenCalledTimes(1);
  expect(mockNative.display).toHaveBeenCalledTimes(1);
  await mockBackgroundHandler?.({ data: { type: 'REMINDER_SYNC', version: '1' } });
  expect(mockBootstrap).toHaveBeenCalledTimes(1);
  expect(mockNative.display).toHaveBeenCalledTimes(1);
});

test.each<SessionState>([{ status: 'unauthenticated' }, { status: 'offline', retry: 'bootstrap' }, { status: 'onboarding', userId: 'A', onboardingCompletedAt: null }])('background messages do not bootstrap or display for state %p', async state => {
  mockState = state;
  glue().installNotificationHandlers();
  await mockBackgroundHandler?.({ data: { type: 'REMINDER_SYNC', version: '1' } });
  expect(mockBootstrap).not.toHaveBeenCalled();
  expect(mockRequest).not.toHaveBeenCalled();
  expect(mockNative.display).not.toHaveBeenCalled();
});

test('foreground observers are reference counted and the last stop cleans observers and polling', async () => {
  const module = glue();
  const stopOne = module.startForegroundNotifications();
  const stopTwo = module.startForegroundNotifications();
  await flush();
  expect(mockNative.onMessage).toHaveBeenCalledTimes(1);
  expect(mockNotifee.onForegroundEvent).toHaveBeenCalledTimes(1);
  stopOne();
  expect(mockRemoveMessage).not.toHaveBeenCalled();
  stopTwo(); stopTwo();
  expect(mockRemoveMessage).toHaveBeenCalledTimes(1);
  expect(mockRemoveToken).toHaveBeenCalledTimes(1);
  expect(mockRemoveEvent).toHaveBeenCalledTimes(1);
  expect(mockRemoveAppState).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  const count = mockRequest.mock.calls.length;
  await jest.advanceTimersByTimeAsync(90_000);
  expect(mockRequest).toHaveBeenCalledTimes(count);
  expect(mockBackgroundHandler).toBeDefined();
});

test('polls every 30 seconds only while active, and resumes on activation', async () => {
  const stop = glue().startForegroundNotifications();
  await flush();
  const first = mockRequest.mock.calls.length;
  await jest.advanceTimersByTimeAsync(30_000);
  expect(mockRequest.mock.calls.length).toBeGreaterThan(first);
  appState('background');
  await flush();
  const inactive = mockRequest.mock.calls.length;
  await jest.advanceTimersByTimeAsync(120_000);
  expect(mockRequest).toHaveBeenCalledTimes(inactive);
  appState('active'); await flush();
  expect(mockRequest.mock.calls.length).toBeGreaterThan(inactive);
  stop();
});

test('initial inactive UI does not poll or bootstrap until active', async () => {
  const module = glue();
  appState('background');
  mockState = { status: 'bootstrapping' };
  const stop = module.startForegroundNotifications();
  await jest.advanceTimersByTimeAsync(60_000);
  expect(mockBootstrap).not.toHaveBeenCalled();
  expect(mockRequest).not.toHaveBeenCalled();
  appState('active'); await flush();
  expect(mockBootstrap).toHaveBeenCalledTimes(1);
  stop();
});

test('message and token refresh callbacks use the existing runtime and malformed pushes cannot display', async () => {
  const module = glue();
  const stop = module.startForegroundNotifications(); await flush();
  mockNative.display.mockClear();
  mockMessageHandler?.({ data: { title: 'injected' } }); await flush();
  expect(mockNative.display).not.toHaveBeenCalled();
  const tokenCount = mockNative.getToken.mock.calls.length;
  mockTokenHandler?.(); await flush();
  expect(mockNative.getToken.mock.calls.length).toBeGreaterThan(tokenCount);
  expect(module.getNotificationRuntime()).toBe(module.getNotificationRuntime());
  stop();
});

test('keeps only the latest pending PRESS data and ignores fake event kinds', async () => {
  const module = glue(); module.installNotificationHandlers();
  await mockBackgroundEvent?.({ type: 1, detail: { notification: { data: { taskId: 'old' } } } });
  await mockBackgroundEvent?.({ type: 1, detail: { notification: { data: { taskId: 'latest' } } } });
  await mockBackgroundEvent?.({ type: 3, detail: { notification: { data: { taskId: 'fake' } } } });
  const onTap = jest.fn();
  const stop = module.startForegroundNotifications(undefined, onTap); await flush();
  expect(onTap.mock.calls).toEqual([[{ taskId: 'latest' }]]);
  mockForegroundEvent?.({ type: 1, detail: { notification: { data: { taskId: 'live' } } } });
  expect(onTap).toHaveBeenLastCalledWith({ taskId: 'live' });
  stop();
});

test('initial notification forwards raw data once and cannot overwrite a newer live tap', async () => {
  let resolve!: (value: unknown) => void;
  mockNotifee.getInitialNotification.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const module = glue();
  const onTap = jest.fn();
  const stop = module.startForegroundNotifications(undefined, onTap);
  mockForegroundEvent?.({ type: 1, detail: { notification: { data: { taskId: 'live' } } } });
  resolve({ notification: { data: { taskId: 'old-initial' } } }); await flush();
  expect(onTap.mock.calls).toEqual([[{ taskId: 'live' }]]);
  stop();
  const stopAgain = module.startForegroundNotifications(undefined, onTap); await flush();
  expect(mockNotifee.getInitialNotification).toHaveBeenCalledTimes(1);
  stopAgain();
});

test('tap payload is cloned and oversized or malformed data is ignored', async () => {
  const module = glue(); module.installNotificationHandlers();
  const data = { taskId: 'original' };
  await mockBackgroundEvent?.({ type: 1, detail: { notification: { data } } });
  data.taskId = 'mutated';
  await mockBackgroundEvent?.({ type: 1, detail: { notification: { data: { huge: 'a'.repeat(9000) } } } });
  await mockBackgroundEvent?.({ type: 1, detail: { notification: { data: null } } });
  const onTap = jest.fn(); const stop = module.startForegroundNotifications(undefined, onTap); await flush();
  expect(onTap).toHaveBeenCalledWith({ taskId: 'original' }); stop();
});

test('bootstrap and native initial-notification failures never reject native callbacks', async () => {
  mockState = { status: 'bootstrapping' };
  mockBootstrap.mockRejectedValueOnce(new Error('private-fixture'));
  const module = glue(); module.installNotificationHandlers();
  await expect(mockBackgroundHandler?.({ data: { type: 'REMINDER_SYNC', version: '1' } })).resolves.toBeUndefined();
  mockNotifee.getInitialNotification.mockRejectedValueOnce(new Error('private-fixture'));
  const stop = module.startForegroundNotifications(); await flush(); stop();
});

test('caps per-account live storage writers at ten and keeps previous writers usable', async () => {
  const module = glue(); const runtime = module.getNotificationRuntime();
  mockNative.status.mockResolvedValue({ configured: true, permission: 'denied' });
  for (let i = 0; i < 10; i++) {
    mockState = { status: 'authenticated', userId: `owner-${i}`, onboardingCompletedAt: new Date(mockNow).toISOString() };
    mockEpoch++; mockSessionListeners.forEach(listener => listener());
    expect(await runtime.start()).toBe(true);
  }
  mockState = { status: 'authenticated', userId: 'overflow', onboardingCompletedAt: new Date(mockNow).toISOString() };
  mockEpoch++; mockSessionListeners.forEach(listener => listener());
  expect(await runtime.reconcile()).toBe(false);
  expect(runtime.getController()).toBeNull();
  mockState = { status: 'authenticated', userId: 'owner-0', onboardingCompletedAt: new Date(mockNow).toISOString() };
  mockEpoch++; mockSessionListeners.forEach(listener => listener());
  expect(await runtime.reconcile()).toBe(true);
  expect(require('@react-native-async-storage/async-storage').createAsyncStorage).toHaveBeenCalledTimes(1);
});

test('a consumed initial notification is delivered once to the foreground tap callback', async () => {
  mockNotifee.getInitialNotification.mockResolvedValueOnce({ notification: { data: { taskId: 'initial', userId: 'A' } } });
  const onTap = jest.fn();
  const stop = glue().startForegroundNotifications(undefined, onTap);
  await flush();
  expect(onTap.mock.calls).toEqual([[{ taskId: 'initial', userId: 'A' }]]);
  stop();
});

test('permission-denied foreground delivery reaches current banner consumers and commits dedupe', async () => {
  mockNative.status.mockResolvedValue({ configured: true, permission: 'denied' });
  const onReminder = jest.fn();
  const module = glue();
  const stop = module.startForegroundNotifications(onReminder); await flush();
  expect(onReminder).toHaveBeenCalledTimes(1);
  expect(mockNative.display).not.toHaveBeenCalled();
  await module.getNotificationRuntime().refresh(true);
  expect(onReminder).toHaveBeenCalledTimes(1);
  stop();
});

test('stopping the last UI owner during bootstrap prevents subsequent foreground polling work', async () => {
  mockState = { status: 'bootstrapping' };
  let resolve!: () => void;
  mockBootstrap.mockImplementationOnce(async () => { await new Promise<void>(done => { resolve = done; }); });
  const stop = glue().startForegroundNotifications(); await Promise.resolve(); await Promise.resolve();
  stop(); resolve(); await flush();
  expect(mockRequest).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
