import * as Keychain from 'react-native-keychain';

export type NotificationBinding = { userId: string; token: string };
const service = 'dsm.notifications.binding.v1';
let queue: Promise<unknown> = Promise.resolve();
function failed(): Error { return new Error('Notification binding storage failed'); }
function validate(value: unknown): NotificationBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failed();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 2 || typeof row.userId !== 'string' || !row.userId.trim() ||
    Array.from(row.userId).length > 255 || typeof row.token !== 'string' || !/^\S{1,4096}$/.test(row.token)) throw failed();
  return { userId: row.userId, token: row.token };
}
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation).catch(() => { throw failed(); });
  queue = next.catch(() => undefined);
  return next;
}
async function read(): Promise<NotificationBinding | null> {
  const value = await Keychain.getGenericPassword({ service });
  if (value === false) return null;
  if (typeof value.password !== 'string' || value.password.length > 16384) throw failed();
  const parsed: unknown = JSON.parse(value.password);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw failed();
  const { version, ...binding } = parsed as Record<string, unknown>;
  if (version !== 1) throw failed();
  return validate(binding);
}
export const notificationBinding = {
  read(): Promise<NotificationBinding | null> { return serialized(read); },
  write(binding: NotificationBinding): Promise<void> {
    // Capture caller input before it can be mutated while waiting for another writer.
    let captured: NotificationBinding;
    try { captured = validate(binding); } catch { return Promise.reject(failed()); }
    return serialized(async () => {
      await read();
      const encoded = JSON.stringify({ version: 1, ...captured });
      if (encoded.length > 16384) throw failed();
      await Keychain.setGenericPassword('notification-binding', encoded, {
        service, accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      const actual = await read();
      if (!actual || actual.userId !== captured.userId || actual.token !== captured.token) throw failed();
    });
  },
  clear(expected: NotificationBinding): Promise<boolean> {
    let captured: NotificationBinding;
    try { captured = validate(expected); } catch { return Promise.reject(failed()); }
    return serialized(async () => {
      const actual = await read();
      if (!actual) return true;
      if (actual.userId !== captured.userId || actual.token !== captured.token) return false;
      await Keychain.resetGenericPassword({ service });
      if (await read() !== null) throw failed();
      return true;
    });
  },
};
