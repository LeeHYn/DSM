import { createAuthenticatedClient } from '../../lib/api/authenticated-client';
import { createHttpClient } from '../../lib/api/http-client';
import { createNotificationApi } from './notification-api';

const now = '2026-09-11T10:00:00.000Z';
const expires = '2026-09-11T10:05:00.000Z';
const reminder = (id = 'reminder-1') => ({ id, taskId: 'task-1', title: '할 일', startAt: now, expiresAt: expires });
const page = { serverTime: now, reminders: [reminder()], nextCursor: null };
const registration = { id: 'registration-1', platform: 'android', deviceId: null, lastSeenAt: now, revokedAt: null };

function setup(value: unknown = page, status = 200) {
  const fetchImpl = jest.fn(async (_url: string, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300, status,
    text: async () => status === 204 ? '' : JSON.stringify(value),
  }) as Response);
  const client = createAuthenticatedClient(createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl }), {
    getAccessToken: () => 'synthetic-access', refreshAccessToken: jest.fn(), onUnauthorized: jest.fn(),
  });
  return { api: createNotificationApi(client, 'owner'), client, fetchImpl };
}

test('GET settings is authenticated and keeps the contextual owner', async () => {
  const { api, fetchImpl } = setup({ notificationEnabled: true });
  expect(api.userId).toBe('owner');
  expect(await api.getSettings()).toEqual({ notificationEnabled: true });
  expect(fetchImpl).toHaveBeenCalledWith('https://api.example.invalid/notifications/settings', expect.objectContaining({
    method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer synthetic-access' }),
  }));
});

test.each([true, false])('PATCH settings preserves JSON boolean %p without coercion', async notificationEnabled => {
  const { api, fetchImpl } = setup({ notificationEnabled });
  expect(await api.setSettings(notificationEnabled)).toEqual({ notificationEnabled });
  expect(fetchImpl).toHaveBeenCalledWith('https://api.example.invalid/notifications/settings', expect.objectContaining({
    method: 'PATCH', body: JSON.stringify({ notificationEnabled }),
  }));
});

test.each([undefined, null, 'false', 'true', 0, 1, {}, []])('rejects nonboolean settings input %p before HTTP', async input => {
  const { api, fetchImpl } = setup();
  await expect(api.setSettings(input as boolean)).rejects.toMatchObject({ kind: 'protocol' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([null, [], {}, { notificationEnabled: 'false' }, { notificationEnabled: null },
  { notificationEnabled: false, extra: true }])('rejects malformed settings response %p', async value => {
  const { api } = setup(value);
  await expect(api.getSettings()).rejects.toMatchObject({ kind: 'protocol' });
  await expect(api.setSettings(false)).rejects.toMatchObject({ kind: 'protocol' });
});

test('fetches a due reminder page with an explicit fixed limit', async () => {
  const { api, fetchImpl } = setup();
  expect(await api.reminders()).toEqual(page);
  expect(fetchImpl).toHaveBeenCalledWith('https://api.example.invalid/notifications/reminders?limit=100', expect.objectContaining({ method: 'GET' }));
});

test('accepts an empty final page', async () => {
  const value = { serverTime: now, reminders: [], nextCursor: null };
  expect(await setup(value).api.reminders()).toEqual(value);
});

test('accepts 200 Unicode codepoint titles and a complete advancing page cursor', async () => {
  const reminders = Array.from({ length: 100 }, (_, i) => ({ ...reminder(`reminder-${i}`), title: '😀'.repeat(200) }));
  const value = { serverTime: now, reminders, nextCursor: 'reminder-99' };
  const { api, fetchImpl } = setup(value);
  expect(await api.reminders('previous/cursor')).toEqual(value);
  expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.invalid/notifications/reminders?limit=100&cursor=previous%2Fcursor');
});

test.each([
  { title: '' }, { title: '   ' }, { title: null }, { title: '😀'.repeat(201) },
  { id: '' }, { taskId: ' ' }, { id: 'a'.repeat(256) },
  { startAt: '0000-09-11T10:00:00.000Z' }, { startAt: '2026-02-30T10:00:00.000Z' },
  { startAt: '2026-09-11T10:00:00Z' }, { startAt: '2026-09-11T10:00:00.000+00:00' },
  { startAt: '2026-09-11T10:00:00.001Z', expiresAt: '2026-09-11T10:05:00.001Z' },
  { expiresAt: now }, { expiresAt: '2026-09-11T10:04:59.999Z' },
  { expiresAt: '2026-09-11T10:05:00.001Z' }, { extra: 'unexpected' },
])('rejects malformed, not-yet-due, or inconsistent reminder %p', async change => {
  await expect(setup({ ...page, reminders: [{ ...reminder(), ...change }] }).api.reminders()).rejects.toMatchObject({ kind: 'protocol' });
});

test.each([
  null, [], { ...page, serverTime: 'invalid' }, { ...page, serverTime: '0000-09-11T10:00:00.000Z' },
  { ...page, serverTime: expires }, { ...page, extra: true }, { ...page, nextCursor: '' },
  { ...page, reminders: [reminder(), reminder()] },
  { ...page, reminders: Array.from({ length: 101 }, (_, i) => reminder(`r-${i}`)) },
  { ...page, nextCursor: 'reminder-1' },
  { serverTime: now, reminders: [], nextCursor: 'cursor' },
])('rejects invalid reminder page envelopes', async value => {
  await expect(setup(value).api.reminders()).rejects.toMatchObject({ kind: 'protocol' });
});

test('rejects cursors which do not match the final row or repeat an input cursor', async () => {
  const reminders = Array.from({ length: 100 }, (_, i) => reminder(`r-${i}`));
  await expect(setup({ serverTime: now, reminders, nextCursor: 'r-0' }).api.reminders()).rejects.toMatchObject({ kind: 'protocol' });
  await expect(setup({ serverTime: now, reminders, nextCursor: 'r-99' }).api.reminders('r-99')).rejects.toMatchObject({ kind: 'protocol' });
  await expect(setup({ serverTime: now, reminders, nextCursor: null }).api.reminders('r-0')).rejects.toMatchObject({ kind: 'protocol' });
});

test.each(['', ' ', 'a'.repeat(256), null])('rejects invalid input cursor %p', async cursor => {
  const { api, fetchImpl } = setup();
  await expect(api.reminders(cursor as string)).rejects.toMatchObject({ kind: 'protocol' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([undefined, '', 'device.fixture', '😀'.repeat(255)])('registers Android token with optional device ID %p', async deviceId => {
  const value = { ...registration, deviceId: deviceId ?? null };
  const { api, fetchImpl } = setup(value);
  expect(await api.registerToken('fcm.fixture', deviceId)).toEqual(value);
  expect(fetchImpl).toHaveBeenCalledWith('https://api.example.invalid/notifications/fcm-tokens', expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ token: 'fcm.fixture', platform: 'android', ...(deviceId === undefined ? {} : { deviceId }) }),
  }));
});

test.each(['', ' ', 'with whitespace', 'trailing\n', 'a'.repeat(4097), null, 5])('rejects invalid registration/revocation token before HTTP', async token => {
  const { api, fetchImpl } = setup();
  await expect(api.registerToken(token as string)).rejects.toMatchObject({ kind: 'protocol' });
  await expect(api.revokeToken(token as string)).rejects.toMatchObject({ kind: 'protocol' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([null, 5, '😀'.repeat(256)])('rejects invalid optional device ID', async deviceId => {
  const { api, fetchImpl } = setup();
  await expect(api.registerToken('fcm.fixture', deviceId as string)).rejects.toMatchObject({ kind: 'protocol' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([null, {}, { ...registration, platform: 'ios' }, { ...registration, deviceId: 1 },
  { ...registration, lastSeenAt: 'invalid' }, { ...registration, revokedAt: now },
  { ...registration, token: 'synthetic-private-value' }])('rejects malformed registration response without exposing payload', async value => {
  const error = await setup(value).api.registerToken('fcm.fixture').catch(reason => reason);
  expect(error).toMatchObject({ kind: 'protocol' });
  expect(JSON.stringify(error)).not.toContain('synthetic-private-value');
});

test('accepts the 4096 character token boundary and DELETE 204 without JSON parsing', async () => {
  const { api, fetchImpl } = setup(undefined, 204);
  const token = 'a'.repeat(4096);
  await expect(api.revokeToken(token)).resolves.toBeUndefined();
  expect(fetchImpl).toHaveBeenCalledWith('https://api.example.invalid/notifications/fcm-tokens', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ token }) }));
});

test('preserves the shared empty-response successful 2xx semantics', async () => {
  await expect(setup({}, 200).api.revokeToken('fcm.fixture')).resolves.toBeUndefined();
});

test('propagates safe transient HTTP and network failures without payloads', async () => {
  await expect(setup({ token: 'synthetic-private-value' }, 503).api.reminders()).rejects.toMatchObject({ kind: 'http', status: 503 });
  await expect(setup({}, 409).api.registerToken('fcm.fixture')).rejects.toMatchObject({ kind: 'http', status: 409 });
  await expect(setup({}, 503).api.revokeToken('fcm.fixture')).rejects.toMatchObject({ kind: 'http', status: 503 });
  const { api, fetchImpl } = setup();
  fetchImpl.mockRejectedValueOnce(new Error('synthetic-private-value'));
  const error = await api.revokeToken('fcm.fixture').catch(reason => reason);
  expect(error).toMatchObject({ kind: 'network' });
  expect(JSON.stringify(error)).not.toContain('synthetic-private-value');
});

test.each(['', ' ', ' owner', 'owner '])('rejects invalid contextual owner %p', owner => {
  expect(() => createNotificationApi(setup().client, owner)).toThrow();
});
