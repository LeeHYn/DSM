import { getApps } from '@react-native-firebase/app';
import {
  deleteToken, getMessaging, getToken, onMessage, onTokenRefresh,
  setBackgroundMessageHandler, type RemoteMessage,
} from '@react-native-firebase/messaging';
import notifee, { AndroidDefaults, AndroidImportance, AndroidVisibility, AuthorizationStatus } from '@notifee/react-native';
import validateNotification from '@notifee/react-native/dist/validators/validateNotification';
import type { Notification } from '@notifee/react-native';
import { Platform, TurboModuleRegistry, type TurboModule } from 'react-native';
import type { DueReminder } from './notification-api';

export type NotificationPermission = 'granted' | 'denied' | 'not-determined';
export type NotificationDeviceStatus = { configured: boolean; permission: NotificationPermission };
type Preferences = { sound: boolean; vibration: boolean; foreground: boolean };
interface ReminderExpiry extends TurboModule {
  elapsedRealtime(): number;
  schedule(id: string, deadlineElapsedMs: number): Promise<number>;
  display(notification: Notification, deadlineElapsedMs: number, ticket: number): Promise<void>;
  cancel(id: string, ticket: number): Promise<void>;
  cancelAll(): Promise<void>;
}
function expiryScheduler(): ReminderExpiry | null {
  return Platform.OS === 'android' && Number(Platform.Version) < 26
    ? TurboModuleRegistry.getEnforcing<ReminderExpiry>('ReminderExpiry') : null;
}
function unavailable(): Error { return new Error('Notification service unavailable'); }
function configured(): boolean {
  try { return getApps().some(app => app.name === '[DEFAULT]'); } catch { return false; }
}
function permission(status: number): NotificationPermission {
  if (status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL) return 'granted';
  return status === AuthorizationStatus.NOT_DETERMINED ? 'not-determined' : 'denied';
}
async function safely<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch { throw unavailable(); }
}
export const notificationNative = {
  async status(): Promise<NotificationDeviceStatus> {
    return safely(async () => ({ configured: configured(), permission: permission((await notifee.getNotificationSettings()).authorizationStatus) }));
  },
  async requestPermission(): Promise<NotificationDeviceStatus> {
    return safely(async () => ({ configured: configured(), permission: permission((await notifee.requestPermission()).authorizationStatus) }));
  },
  async getToken(): Promise<string> {
    return safely(async () => {
      if (!configured() || (await this.status()).permission !== 'granted') throw unavailable();
      const token = await getToken(getMessaging());
      if (typeof token !== 'string' || !/^\S{1,4096}$/.test(token)) throw unavailable();
      return token;
    });
  },
  async deleteToken(): Promise<void> {
    return safely(async () => { if (configured()) await deleteToken(getMessaging()); });
  },
  onMessage(handler: (message: RemoteMessage) => void): () => void {
    return configured() ? onMessage(getMessaging(), handler) : () => {};
  },
  onTokenRefresh(handler: (token: string) => void): () => void {
    return configured() ? onTokenRefresh(getMessaging(), handler) : () => {};
  },
  setBackgroundHandler(handler: (message: RemoteMessage) => Promise<void>): void {
    if (configured()) setBackgroundMessageHandler(getMessaging(), handler);
  },
  async display(userId: string, reminder: DueReminder, preferences: Preferences, remainingMs: number, shouldDisplay: () => boolean = () => true): Promise<void> {
    return safely(async () => {
      const startedAt = performance.now();
      if (!Number.isFinite(remainingMs) || remainingMs <= 0 || remainingMs > 300000 ||
        !userId.trim() || !reminder.id.trim() || !shouldDisplay() || (await this.status()).permission !== 'granted' || !shouldDisplay()) throw unavailable();
      const channelId = `dsm-reminders-v1-s${Number(preferences.sound)}-v${Number(preferences.vibration)}`;
      const expiry = expiryScheduler();
      const id = JSON.stringify(['dsm-reminder-v1', userId, reminder.id]);
      await notifee.createChannel({ id: channelId, name: `일정 알림 (${preferences.sound ? '소리' : '무음'}, ${preferences.vibration ? '진동' : '진동 없음'})`,
        importance: AndroidImportance.HIGH, sound: preferences.sound ? 'default' : undefined, vibration: preferences.vibration });
      const elapsed = performance.now() - startedAt;
      if (!shouldDisplay() || elapsed < 0 || elapsed >= remainingMs) throw unavailable();
      let ticket: number | undefined;
      try {
        let deadline = 0;
        // Reserve the replacement deadline before posting: an old queued alarm
        // must not cancel the new notification during the native display call.
        if (expiry) {
          const nativeNow = expiry.elapsedRealtime();
          deadline = nativeNow + Math.floor(remainingMs - (performance.now() - startedAt));
          if (!Number.isFinite(nativeNow) || !Number.isFinite(deadline) || deadline <= nativeNow) throw unavailable();
          ticket = await expiry.schedule(id, deadline);
          if (!Number.isSafeInteger(ticket) || ticket <= 0) throw unavailable();
        }
        const beforeDisplayElapsed = performance.now() - startedAt;
        if (!shouldDisplay() || beforeDisplayElapsed < 0 || beforeDisplayElapsed >= remainingMs) throw unavailable();
        const notification: Notification = {
        id,
        title: reminder.title, body: '일정을 시작할 시간입니다.',
        data: { type: 'TASK_REMINDER', userId, taskId: reminder.taskId, scheduleId: reminder.id, startAt: reminder.startAt },
        android: { channelId, tag: id, smallIcon: 'dailyup_notification_icon', visibility: AndroidVisibility.PRIVATE,
          defaults: [AndroidDefaults.LIGHTS], onlyAlertOnce: true,
          importance: AndroidImportance.HIGH, pressAction: { id: 'default', launchActivity: 'default' },
          timeoutAfter: Math.max(1, Math.floor(remainingMs - beforeDisplayElapsed)), autoCancel: true,
          sound: preferences.sound ? 'default' : undefined,
          vibrationPattern: preferences.vibration ? [300, 500] : undefined },
        };
        // Use the installed SDK's own normalizer; native completion enforces the
        // deadline even if JavaScript pauses after the SDK posts the notification.
        if (expiry && ticket !== undefined) await expiry.display(validateNotification(notification), deadline, ticket);
        else await notifee.displayNotification(notification);
        const remaining = Math.floor(remainingMs - (performance.now() - startedAt));
        if (remaining <= 0 || !shouldDisplay()) throw unavailable();
      } catch {
        // A ticket lets the native owner cancel this reservation without allowing
        // a delayed old JS rejection to remove a newer display with the same ID.
        if (expiry && ticket !== undefined) await expiry.cancel(id, ticket);
        else if (!expiry) await notifee.cancelDisplayedNotification(id, id);
        throw unavailable();
      }
    });
  },
  async cancelAll(): Promise<void> {
    return safely(async () => {
      await Promise.all([Promise.resolve().then(() => expiryScheduler()?.cancelAll()), notifee.cancelAllNotifications()]);
    });
  },
  async openSettings(): Promise<void> { return safely(() => notifee.openNotificationSettings()); },
};
