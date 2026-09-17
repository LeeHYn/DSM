import * as Keychain from 'react-native-keychain';
import { notificationBinding } from './notification-binding';
jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' },
  getGenericPassword: jest.fn(), setGenericPassword: jest.fn(), resetGenericPassword: jest.fn(),
}));
let saved: string | null;
const get = jest.mocked(Keychain.getGenericPassword);
const set = jest.mocked(Keychain.setGenericPassword);
const reset = jest.mocked(Keychain.resetGenericPassword);
const binding = { userId: 'owner-a', token: 'synthetic-token' };
beforeEach(() => {
  jest.resetAllMocks(); saved = null;
  get.mockImplementation(async () => saved === null ? false : { password: saved } as never);
  set.mockImplementation(async (_name, value) => { saved = value; return {} as never; });
  reset.mockImplementation(async () => { saved = null; return true; });
});
test('stores a verified device-only binding and reads a defensive snapshot', async () => {
  expect(await notificationBinding.read()).toBeNull();
  await notificationBinding.write(binding);
  expect(set).toHaveBeenCalledWith('notification-binding', expect.any(String), { service: 'dsm.notifications.binding.v1', accessible: 'device-only' });
  const first = await notificationBinding.read(); first!.token = 'modified';
  expect(await notificationBinding.read()).toEqual(binding);
});
test('compare-and-clear never clears another account or replacement token', async () => {
  await notificationBinding.write(binding);
  expect(await notificationBinding.clear({ ...binding, userId: 'owner-b' })).toBe(false);
  expect(await notificationBinding.clear({ ...binding, token: 'new-token' })).toBe(false);
  expect(reset).not.toHaveBeenCalled();
  expect(await notificationBinding.clear(binding)).toBe(true);
  expect(await notificationBinding.read()).toBeNull();
});
test('serialized replacement then stale cleanup preserves the replacement', async () => {
  const a = notificationBinding.write(binding);
  const b = notificationBinding.write({ userId: 'owner-b', token: 'b-token' });
  const oldClear = notificationBinding.clear(binding);
  await Promise.all([a, b]);
  expect(await oldClear).toBe(false);
  expect(await notificationBinding.read()).toEqual({ userId: 'owner-b', token: 'b-token' });
});
test('failed silent native write and reset cannot report success', async () => {
  set.mockResolvedValueOnce(false);
  await expect(notificationBinding.write(binding)).rejects.toThrow('Notification binding storage failed');
  await notificationBinding.write(binding);
  reset.mockImplementationOnce(async () => true);
  await expect(notificationBinding.clear(binding)).rejects.toThrow('Notification binding storage failed');
  expect(await notificationBinding.read()).toEqual(binding);
});
test.each(['broken', '{"version":2}', JSON.stringify({ version: 1, ...binding, extra: true }), JSON.stringify({ version: 1, userId: '', token: 'x' })])('corrupt binding is preserved', async value => {
  saved = value;
  await expect(notificationBinding.read()).rejects.toThrow('Notification binding storage failed');
  expect(saved).toBe(value); expect(set).not.toHaveBeenCalled(); expect(reset).not.toHaveBeenCalled();
});
test('raw native errors are sanitized and queue recovers after rejection', async () => {
  get.mockRejectedValueOnce(new Error('private credential'));
  const error: unknown = await notificationBinding.read().catch(reason => reason);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe('Notification binding storage failed');
  expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
  await notificationBinding.write(binding);
  expect(await notificationBinding.read()).toEqual(binding);
});
test.each([{ userId: ' ', token: 'x' }, { userId: 'a', token: 'with space' }, { userId: 'a', token: 'x'.repeat(4097) }])('invalid writes do not touch native storage', async value => {
  await expect(notificationBinding.write(value)).rejects.toThrow();
  expect(set).not.toHaveBeenCalled();
});
test('JSON escaping cannot write an envelope that the reader rejects', async () => {
  await expect(notificationBinding.write({ userId: 'owner', token: '\u0001'.repeat(4096) })).rejects.toThrow();
  expect(set).not.toHaveBeenCalled();
  await notificationBinding.write(binding);
  expect(await notificationBinding.read()).toEqual(binding);
});
