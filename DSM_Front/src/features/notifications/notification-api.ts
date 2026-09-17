import type { AuthenticatedClient } from '../../lib/api/authenticated-client';
import { ApiError } from '../../lib/api/api-error';

export type NotificationSettings = { notificationEnabled: boolean };
export type DueReminder = {
  id: string;
  taskId: string;
  title: string;
  startAt: string;
  expiresAt: string;
};
export type ReminderPage = {
  serverTime: string;
  reminders: DueReminder[];
  nextCursor: string | null;
};
export type RegisteredFcmToken = {
  id: string;
  platform: 'android';
  deviceId: string | null;
  lastSeenAt: string;
  revokedAt: null;
};
export interface NotificationApi {
  readonly userId: string;
  getSettings(): Promise<NotificationSettings>;
  setSettings(notificationEnabled: boolean): Promise<NotificationSettings>;
  reminders(cursor?: string): Promise<ReminderPage>;
  registerToken(token: string, deviceId?: string): Promise<RegisteredFcmToken>;
  revokeToken(token: string): Promise<void>;
}

function valid(condition: unknown): asserts condition {
  if (!condition) throw new ApiError('protocol', 'Invalid notification data');
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  valid(value !== null && typeof value === 'object' && !Array.isArray(value));
  const row = value as Record<string, unknown>;
  valid(Object.keys(row).length === keys.length && Object.keys(row).every(key => keys.includes(key)));
  return row;
}
function identifier(value: unknown): string {
  valid(typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= 255);
  return value;
}
function timestamp(value: unknown): string {
  valid(typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value));
  const time = Date.parse(value);
  valid(Number.isFinite(time) && new Date(time).toISOString() === value);
  return value;
}
function settings(value: unknown): NotificationSettings {
  const row = object(value, ['notificationEnabled']);
  valid(typeof row.notificationEnabled === 'boolean');
  return { notificationEnabled: row.notificationEnabled };
}
function reminderPage(value: unknown, cursor?: string): ReminderPage {
  const row = object(value, ['serverTime', 'reminders', 'nextCursor']);
  const serverTime = timestamp(row.serverTime);
  const serverMs = Date.parse(serverTime);
  valid(Array.isArray(row.reminders) && row.reminders.length <= 100);
  const seen = new Set<string>();
  const reminders = row.reminders.map((entry: unknown): DueReminder => {
    const item = object(entry, ['id', 'taskId', 'title', 'startAt', 'expiresAt']);
    const id = identifier(item.id);
    valid(!seen.has(id) && id !== cursor);
    seen.add(id);
    const taskId = identifier(item.taskId);
    valid(typeof item.title === 'string' && item.title.trim().length > 0 && Array.from(item.title).length <= 200);
    const startAt = timestamp(item.startAt);
    const expiresAt = timestamp(item.expiresAt);
    const startMs = Date.parse(startAt);
    const expiresMs = Date.parse(expiresAt);
    valid(expiresMs === startMs + 5 * 60 * 1000 && startMs <= serverMs && serverMs < expiresMs);
    return { id, taskId, title: item.title, startAt, expiresAt };
  });
  const nextCursor = row.nextCursor === null ? null : identifier(row.nextCursor);
  if (nextCursor !== null) {
    valid(reminders.length === 100 && nextCursor !== cursor && nextCursor === reminders[reminders.length - 1].id);
  }
  return { serverTime, reminders, nextCursor };
}
function tokenInput(value: unknown): asserts value is string {
  valid(typeof value === 'string' && /^\S+$/.test(value) && Array.from(value).length <= 4096);
}
function deviceInput(value: unknown): asserts value is string {
  valid(typeof value === 'string' && Array.from(value).length <= 255);
}
function registration(value: unknown): RegisteredFcmToken {
  const row = object(value, ['id', 'platform', 'deviceId', 'lastSeenAt', 'revokedAt']);
  const id = identifier(row.id);
  valid(row.platform === 'android' && row.revokedAt === null);
  if (row.deviceId !== null) deviceInput(row.deviceId);
  return { id, platform: 'android', deviceId: row.deviceId, lastSeenAt: timestamp(row.lastSeenAt), revokedAt: null };
}

// The controller owns cross-page bounds/deduplication and the session epoch.
// This transport validates one bounded page using its server-issued clock.
export function createNotificationApi(client: AuthenticatedClient, userId: string): NotificationApi {
  valid(typeof userId === 'string' && userId.length > 0 && userId === userId.trim());
  return {
    userId,
    getSettings: () => client.request({ path: '/notifications/settings', validate: settings }),
    async setSettings(notificationEnabled) {
      valid(typeof notificationEnabled === 'boolean');
      return client.request({ path: '/notifications/settings', method: 'PATCH', body: { notificationEnabled }, validate: settings });
    },
    async reminders(cursor) {
      if (cursor !== undefined) identifier(cursor);
      const suffix = cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`;
      return client.request({ path: `/notifications/reminders?limit=100${suffix}`, validate: value => reminderPage(value, cursor) });
    },
    async registerToken(token, deviceId) {
      tokenInput(token);
      if (deviceId !== undefined) deviceInput(deviceId);
      return client.request({
        path: '/notifications/fcm-tokens', method: 'PUT',
        body: { token, platform: 'android', ...(deviceId === undefined ? {} : { deviceId }) },
        validate: registration,
      });
    },
    async revokeToken(token) {
      tokenInput(token);
      return client.request<void>({ path: '/notifications/fcm-tokens', method: 'DELETE', body: { token }, responseMode: 'empty' });
    },
  };
}
