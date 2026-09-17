const mockApps = jest.fn((): unknown[] => [{ name: '[DEFAULT]' }]);
const mockToken = jest.fn(async () => 'synthetic-token');
const mockDelete = jest.fn(async () => {});
const mockDisplay = jest.fn(async () => 'display-id');
const mockChannel = jest.fn(async () => 'channel');
const mockSettings = jest.fn(async () => ({ authorizationStatus: 1 }));
const mockPermission = jest.fn(async () => ({ authorizationStatus: 1 }));
const mockCancel = jest.fn(async () => {});
const mockCancelDisplayed = jest.fn(async () => {});
const mockUnsubscribe = jest.fn();
const mockMessage = jest.fn(() => mockUnsubscribe);
const mockRefresh = jest.fn(() => mockUnsubscribe);
const mockBackground = jest.fn();
// Notifee snapshots the platform when utils is imported, before beforeEach runs.
jest.mock('@notifee/react-native/dist/utils', () => ({
  ...jest.requireActual('@notifee/react-native/dist/utils'), isAndroid: true, isIOS: false,
}));
jest.mock('@react-native-firebase/app', () => ({ getApps: () => mockApps() }));
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: () => ({}), getToken: () => mockToken(), deleteToken: () => mockDelete(),
  onMessage: (...args: unknown[]) => mockMessage(...args as []),
  onTokenRefresh: (...args: unknown[]) => mockRefresh(...args as []),
  setBackgroundMessageHandler: (...args: unknown[]) => mockBackground(...args),
}));
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  AndroidDefaults: { LIGHTS: 4 }, AndroidImportance: { HIGH: 4 }, AndroidVisibility: { PRIVATE: 0 },
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2, NOT_DETERMINED: -1 },
  default: {
    getNotificationSettings: () => mockSettings(), requestPermission: () => mockPermission(),
    createChannel: (...args: unknown[]) => mockChannel(...args as []),
    displayNotification: (...args: unknown[]) => mockDisplay(...args as []),
    cancelAllNotifications: () => mockCancel(), openNotificationSettings: jest.fn(),
    cancelDisplayedNotification: (...args: unknown[]) => mockCancelDisplayed(...args as []),
  },
}));
import { notificationNative } from './notification-native';
import { Platform, TurboModuleRegistry } from 'react-native';
import validateAndroidNotification from '@notifee/react-native/dist/validators/validateAndroidNotification';

const reminder = { id: 'schedule', taskId: 'task', title: '할 일', startAt: '2026-09-11T12:00:00.000Z', expiresAt: '2026-09-11T12:05:00.000Z' };
const preferences = { sound: true, vibration: true, foreground: true };
beforeEach(() => {
  jest.clearAllMocks(); mockApps.mockReturnValue([{ name: '[DEFAULT]' }]);
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  jest.spyOn(performance, 'now').mockReturnValue(1000);
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(26);
  mockSettings.mockResolvedValue({ authorizationStatus: 1 });
  mockToken.mockResolvedValue('synthetic-token');
  mockDisplay.mockResolvedValue('display-id');
});
afterEach(() => jest.restoreAllMocks());

test('account or preference changes during channel creation prevent native display', async () => {
  let current = true;
  mockChannel.mockImplementationOnce(async () => { current = false; return 'channel'; });
  await expect(notificationNative.display('owner', reminder, preferences, 1000, () => current)).rejects.toThrow();
  expect(mockDisplay).not.toHaveBeenCalled();
});
test('slow channel creation cannot extend server expiry', async () => {
  mockChannel.mockImplementationOnce(async () => { jest.spyOn(performance, 'now').mockReturnValue(2100); return 'channel'; });
  await expect(notificationNative.display('owner', reminder, preferences, 1000)).rejects.toThrow();
  expect(mockDisplay).not.toHaveBeenCalled();
});

test('unconfigured Firebase reports availability without requesting permissions or token', async () => {
  mockApps.mockReturnValue([]);
  expect(await notificationNative.status()).toEqual({ configured: false, permission: 'granted' });
  expect(mockPermission).not.toHaveBeenCalled(); expect(mockToken).not.toHaveBeenCalled();
  await expect(notificationNative.getToken()).rejects.toThrow('Notification service unavailable');
});
test.each([[1, 'granted'], [0, 'denied'], [-1, 'not-determined']])('maps OS status %s', async (code, label) => {
  mockSettings.mockResolvedValue({ authorizationStatus: code as number });
  expect((await notificationNative.status()).permission).toBe(label);
});
test('requests OS permission only explicitly and blocks token while denied', async () => {
  await notificationNative.requestPermission(); expect(mockPermission).toHaveBeenCalledTimes(1);
  mockSettings.mockResolvedValue({ authorizationStatus: 0 });
  await expect(notificationNative.getToken()).rejects.toThrow('Notification service unavailable');
  expect(mockToken).not.toHaveBeenCalled();
});
test('gets and deletes native token and sanitizes SDK failures', async () => {
  expect(await notificationNative.getToken()).toBe('synthetic-token');
  await notificationNative.deleteToken(); expect(mockDelete).toHaveBeenCalledTimes(1);
  mockToken.mockRejectedValue(new Error('private sdk token'));
  await expect(notificationNative.getToken()).rejects.toThrow('Notification service unavailable');
});
test('display uses owner-scoped stable ID, private visibility and server-derived remaining lifetime', async () => {
  await notificationNative.display('owner-a', reminder, preferences, 1200);
  const first = mockDisplay.mock.calls[0] as unknown as [Record<string, any>];
  expect(first[0]).toMatchObject({ title: '할 일', data: { type: 'TASK_REMINDER', userId: 'owner-a', taskId: 'task', scheduleId: 'schedule' }, android: { timeoutAfter: 1200, visibility: 0, pressAction: { id: 'default' } } });
  await notificationNative.display('owner-a', reminder, preferences, 1200);
  await notificationNative.display('owner-b', reminder, preferences, 1200);
  const calls = mockDisplay.mock.calls as unknown as Array<[Record<string, any>]>;
  expect(calls[0][0].id).toBe(calls[1][0].id);
  expect(calls[0][0].id).not.toBe(calls[2][0].id);
});
test.each([0, -1, 300001, NaN])('never displays invalid remaining lifetime %s', async remaining => {
  await expect(notificationNative.display('owner', reminder, preferences, remaining)).rejects.toThrow();
  expect(mockDisplay).not.toHaveBeenCalled();
});
test('silent preferences choose distinct fixed channel and no pre-26 sound/vibration', async () => {
  await notificationNative.display('owner', reminder, { ...preferences, sound: false, vibration: false }, 1000);
  expect(mockChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'dsm-reminders-v1-s0-v0', sound: undefined, vibration: false }));
  expect(mockDisplay).toHaveBeenCalledWith(expect.objectContaining({ android: expect.objectContaining({ sound: undefined, vibrationPattern: undefined, defaults: [4] }) }));
});
test('does not display while OS denied and cleans up notifications', async () => {
  mockSettings.mockResolvedValue({ authorizationStatus: 0 });
  await expect(notificationNative.display('owner', reminder, preferences, 1000)).rejects.toThrow();
  expect(mockDisplay).not.toHaveBeenCalled();
  await notificationNative.cancelAll(); expect(mockCancel).toHaveBeenCalledTimes(1);
});
test.each([[false, false], [false, true], [true, false], [true, true]])('actual Notifee validator accepts sound=%s vibration=%s without default audible effects', async (sound, vibration) => {
  await notificationNative.display('owner', reminder, { ...preferences, sound, vibration }, 1000);
  const calls = mockDisplay.mock.calls as unknown as Array<[{ android: Parameters<typeof validateAndroidNotification>[0] }]>;
  const validated = validateAndroidNotification(calls[0][0].android);
  expect(validated.defaults).toEqual([4]);
  expect(validated.sound).toBe(sound ? 'default' : undefined);
  expect(validated.vibrationPattern).toEqual(vibration ? [300, 500] : undefined);
});
test('foreground and token observers expose unsubscribe; no subscriptions without config', () => {
  const handler = jest.fn(); notificationNative.onMessage(handler)(); notificationNative.onTokenRefresh(handler)();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(2);
  mockApps.mockReturnValue([]); notificationNative.onMessage(handler)();
  expect(mockMessage).toHaveBeenCalledTimes(1);
});

test('Android 24 reserves expiry then uses normalized native completion with full identity', async () => {
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(24);
  const schedule = jest.fn(async () => 1);
  const display = jest.fn(async (_payload: unknown, _deadline: number, _ticket: number) => {});
  const expiry = { getConstants: () => ({}), elapsedRealtime: () => 30000, schedule, display, cancel: jest.fn(), cancelAll: jest.fn() };
  jest.spyOn(TurboModuleRegistry, 'getEnforcing').mockReturnValue(expiry);
  await notificationNative.display('Aa', reminder, preferences, 1200);
  const id = JSON.stringify(['dsm-reminder-v1', 'Aa', reminder.id]);
  expect(display).toHaveBeenCalledWith(expect.objectContaining({ id, android: expect.objectContaining({ tag: id, defaults: [4], onlyAlertOnce: true }) }), 31200, 1);
  expect(mockDisplay).not.toHaveBeenCalled();
  expect(schedule).toHaveBeenCalledWith(id, 31200);
  expect(schedule).toHaveBeenCalledTimes(1);
  expect(schedule.mock.invocationCallOrder[0]).toBeLessThan(display.mock.invocationCallOrder[0]);
});

test('pre-26 native completion failure is sanitized and never falls back to unguarded SDK display', async () => {
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(24);
  const expiry = { getConstants: () => ({}), elapsedRealtime: () => 30000, schedule: jest.fn(async () => 1),
    display: jest.fn().mockRejectedValue(new Error('private SDK failure')), cancel: jest.fn(), cancelAll: jest.fn() };
  jest.spyOn(TurboModuleRegistry, 'getEnforcing').mockReturnValue(expiry);
  await expect(notificationNative.display('owner', reminder, preferences, 1000)).rejects.toThrow('Notification service unavailable');
  expect(expiry.display).toHaveBeenCalledTimes(1);
  expect(mockDisplay).not.toHaveBeenCalled();
  expect(mockCancelDisplayed).not.toHaveBeenCalled();
  expect(expiry.cancel).toHaveBeenCalledWith(JSON.stringify(['dsm-reminder-v1', 'owner', reminder.id]), 1);
});

test.each([[false, false], [false, true], [true, false], [true, true]])('pre-26 normalized native payload preserves sound=%s vibration=%s', async (sound, vibration) => {
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(24);
  const display = jest.fn(async (_payload: unknown, _deadline: number, _ticket: number) => {});
  const expiry = { getConstants: () => ({}), elapsedRealtime: () => 30000, schedule: jest.fn(async () => 1), display, cancel: jest.fn(), cancelAll: jest.fn() };
  jest.spyOn(TurboModuleRegistry, 'getEnforcing').mockReturnValue(expiry);
  await notificationNative.display('owner', reminder, { ...preferences, sound, vibration }, 1000);
  const payload = display.mock.calls[0][0] as { android: { defaults: number[]; sound?: string; vibrationPattern?: number[] } };
  expect(display.mock.calls[0][1]).toBe(31000);
  expect(payload.android.defaults).toEqual([4]);
  expect(payload.android.sound).toBe(sound ? 'default' : undefined);
  expect(payload.android.vibrationPattern).toEqual(vibration ? [300, 500] : undefined);
});

test('failed native expiry reservation leaves cleanup to the native owner', async () => {
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(25);
  const expiry = { getConstants: () => ({}), elapsedRealtime: () => 30000, schedule: jest.fn().mockRejectedValue(new Error('private native detail')), cancelAll: jest.fn() };
  jest.spyOn(TurboModuleRegistry, 'getEnforcing').mockReturnValue(expiry);
  await expect(notificationNative.display('owner', reminder, preferences, 1200)).rejects.toThrow('Notification service unavailable');
  expect(mockCancelDisplayed).not.toHaveBeenCalled();
  expect(mockDisplay).not.toHaveBeenCalled();
});

test('scope changes after native completion cancel only that reservation ticket', async () => {
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(24);
  let current = true;
  const expiry = { getConstants: () => ({}), elapsedRealtime: () => 30000, schedule: jest.fn(async () => 7),
    display: jest.fn(async () => { current = false; }), cancel: jest.fn(), cancelAll: jest.fn() };
  jest.spyOn(TurboModuleRegistry, 'getEnforcing').mockReturnValue(expiry);
  await expect(notificationNative.display('owner', reminder, preferences, 1000, () => current)).rejects.toThrow();
  expect(expiry.cancel).toHaveBeenCalledWith(JSON.stringify(['dsm-reminder-v1', 'owner', reminder.id]), 7);
  expect(mockCancelDisplayed).not.toHaveBeenCalled();
});

test('late old native rejection cannot ask to cancel the replacement ticket', async () => {
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(24);
  let rejectOld!: (error: Error) => void;
  const old = new Promise<void>((_resolve, reject) => { rejectOld = reject; });
  const expiry = { getConstants: () => ({}), elapsedRealtime: () => 30000,
    schedule: jest.fn().mockResolvedValueOnce(11).mockResolvedValueOnce(12),
    display: jest.fn().mockReturnValueOnce(old).mockResolvedValueOnce(undefined), cancel: jest.fn(), cancelAll: jest.fn() };
  jest.spyOn(TurboModuleRegistry, 'getEnforcing').mockReturnValue(expiry);
  const first = notificationNative.display('owner', reminder, preferences, 1000).catch(() => undefined);
  for (let i = 0; i < 20 && expiry.display.mock.calls.length === 0; i++) await Promise.resolve();
  expect(expiry.display).toHaveBeenCalledTimes(1);
  await notificationNative.display('owner', reminder, preferences, 1000);
  rejectOld(new Error('stale native result'));
  await first;
  expect(expiry.cancel).toHaveBeenCalledTimes(1);
  expect(expiry.cancel).toHaveBeenCalledWith(JSON.stringify(['dsm-reminder-v1', 'owner', reminder.id]), 11);
  expect(mockCancelDisplayed).not.toHaveBeenCalled();
});

test('missing pre-26 native scheduler cannot leave an unbounded displayed notification', async () => {
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(24);
  jest.spyOn(TurboModuleRegistry, 'getEnforcing').mockImplementation(() => { throw Error('unavailable'); });
  await expect(notificationNative.display('owner', reminder, preferences, 1200)).rejects.toThrow();
  expect(mockDisplay).not.toHaveBeenCalled();
});

test('cancelAll clears native expiry alarms as well as displayed notifications', async () => {
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(24);
  const cancelAll = jest.fn(async () => {});
  const expiry = { getConstants: () => ({}), elapsedRealtime: () => 30000, schedule: jest.fn(), cancelAll };
  jest.spyOn(TurboModuleRegistry, 'getEnforcing').mockReturnValue(expiry);
  await notificationNative.cancelAll();
  expect(cancelAll).toHaveBeenCalledTimes(1);
  expect(mockCancel).toHaveBeenCalledTimes(1);
});

test('wall-clock changes do not extend or reject the monotonic remaining duration', async () => {
  mockChannel.mockImplementationOnce(async () => { jest.spyOn(Date, 'now').mockReturnValue(-3600000); return 'channel'; });
  await expect(notificationNative.display('owner', reminder, preferences, 1200)).resolves.toBeUndefined();
});

test('slow native deadline persistence never posts an already expired notification', async () => {
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(24);
  const expiry = { getConstants: () => ({}), elapsedRealtime: () => 30000, cancelAll: jest.fn(), schedule: jest.fn(async () => {
    jest.spyOn(performance, 'now').mockReturnValue(2200);
  }) };
  jest.spyOn(TurboModuleRegistry, 'getEnforcing').mockReturnValue(expiry);
  await expect(notificationNative.display('owner', reminder, preferences, 1000)).rejects.toThrow();
  expect(mockDisplay).not.toHaveBeenCalled();
});
