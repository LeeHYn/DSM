import { AppState } from 'react-native';
import notifee, { EventType, type Event } from '@notifee/react-native';
import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { getSessionRuntime } from '../auth/session-runtime';
import { notificationBinding } from './notification-binding';
import { notificationNative } from './notification-native';
import { NotificationRuntime } from './notification-runtime';
import { NotificationStorage, NotificationStorageError, type NotificationStringStorage } from './notification-storage';
import type { DueReminder } from './notification-api';

type ForegroundOwner = { onReminder?: (reminder: DueReminder) => void; onTap?: (data: unknown) => void };
const owners = new Set<ForegroundOwner>();
const stores = new Map<string, NotificationStorage>();
let backing: NotificationStringStorage | undefined;
let session: ReturnType<typeof getSessionRuntime> | undefined;
let runtime: NotificationRuntime | undefined;
let installed = false;
let initialRequested = false;
let pendingTap: Record<string, unknown> | null = null;
let tapGeneration = 0;
let foregroundCleanup: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let polling: Promise<void> | null = null;
let bootstrapping: Promise<void> | null = null;

function getSharedSession() {
  session ??= getSessionRuntime();
  return session;
}
function storageFactory(userId: string): NotificationStorage {
  const existing = stores.get(userId);
  if (existing) return existing;
  if (stores.size >= 10) throw new NotificationStorageError('limit');
  try {
    backing ??= createAsyncStorage('dsm_notifications_v1');
    const storage = new NotificationStorage(userId, backing);
    stores.set(userId, storage);
    return storage;
  } catch (error) {
    if (error instanceof NotificationStorageError) throw error;
    throw new NotificationStorageError('read');
  }
}
function active(): boolean { return owners.size > 0 && AppState.currentState === 'active'; }
function dispatchReminder(reminder: DueReminder) {
  let delivered = false;
  if (active()) {
    for (const owner of owners) {
      if (!owner.onReminder) continue;
      try { owner.onReminder({ ...reminder }); delivered = true; } catch { /* Another current UI owner can still display it. */ }
    }
  }
  if (!delivered) throw new Error('Foreground notification is unavailable');
}

/** Headless and UI paths share both the session coordinator and notification writer. */
export function getNotificationRuntime(): NotificationRuntime {
  if (!runtime) {
    const shared = getSharedSession();
    runtime = new NotificationRuntime({ session: shared.controller, client: shared.client, native: notificationNative,
      binding: notificationBinding, storageFactory, onForegroundReminder: dispatchReminder });
  }
  return runtime;
}

async function bootstrapIfNeeded() {
  const controller = getSharedSession().controller;
  if (controller.getSnapshot().state.status !== 'bootstrapping') return;
  bootstrapping ??= controller.bootstrap().finally(() => { bootstrapping = null; });
  await bootstrapping;
}
function safely(action: () => Promise<unknown>): Promise<void> {
  // Session/controller snapshots already carry safe operational errors. Native callbacks must settle.
  return Promise.resolve().then(action).then(() => undefined, () => undefined);
}
function neutral(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const value = data as Record<string, unknown>;
  return Object.keys(value).length === 2 && value.type === 'REMINDER_SYNC' && value.version === '1';
}
function flushTap() {
  if (!active() || !pendingTap) return;
  const callbacks = [...owners].filter(owner => owner.onTap);
  if (!callbacks.length) return;
  const data = pendingTap;
  pendingTap = null;
  for (const owner of callbacks) {
    try { owner.onTap?.(JSON.parse(JSON.stringify(data)) as unknown); } catch { /* Consumer owns navigation and validation. */ }
  }
}
function rememberTap(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  try {
    const encoded = JSON.stringify(data);
    // Bound both retained memory and JSON parsing work without storing a tap history.
    if (encoded.length > 8192) return;
    pendingTap = JSON.parse(encoded) as Record<string, unknown>;
    tapGeneration++;
    flushTap();
  } catch { /* Malformed native event data is ignored. */ }
}
function press(event: Event) {
  if (event?.type === EventType.PRESS) rememberTap(event.detail?.notification?.data);
}

/** Register early in index.js; background handlers stay installed for this process. */
export function installNotificationHandlers(): void {
  if (installed) return;
  installed = true;
  notificationNative.setBackgroundHandler(message => safely(async () => {
    if (!neutral(message.data)) return;
    await bootstrapIfNeeded();
    const shared = getNotificationRuntime();
    await shared.start();
    await shared.receive(message.data, false);
  }));
  notifee.onBackgroundEvent(event => safely(async () => { press(event); }));
}

function poll(): Promise<void> {
  if (!active()) return Promise.resolve();
  if (polling) return polling;
  polling = safely(async () => {
    await bootstrapIfNeeded();
    if (!active()) return;
    const shared = getNotificationRuntime();
    await shared.start();
    if (!active()) return;
    await shared.refresh(true);
  }).finally(() => { polling = null; });
  return polling;
}
function schedule() {
  clearTimeout(timer);
  timer = undefined;
  if (!active()) return;
  timer = setTimeout(() => {
    timer = undefined;
    poll().finally(schedule).catch(() => {});
  }, 30_000);
}

/** Last unsubscribe removes only foreground observers; headless ownership remains shared. */
export function startForegroundNotifications(
  onReminder?: (reminder: DueReminder) => void,
  onTap?: (data: unknown) => void,
): () => void {
  installNotificationHandlers();
  const owner: ForegroundOwner = { onReminder, onTap };
  owners.add(owner);
  if (!foregroundCleanup) {
    const state = AppState.addEventListener('change', () => {
      if (active()) { poll().catch(() => {}); flushTap(); }
      schedule();
    });
    const message = notificationNative.onMessage(value => {
      if (!foregroundCleanup || !neutral(value.data)) return;
      safely(async () => {
        await bootstrapIfNeeded();
        if (!foregroundCleanup) return;
        const shared = getNotificationRuntime();
        await shared.start();
        if (!foregroundCleanup) return;
        await shared.receive(value.data, AppState.currentState === 'active');
      });
    });
    const token = notificationNative.onTokenRefresh(() => {
      if (!foregroundCleanup) return;
      safely(async () => {
        const shared = getNotificationRuntime();
        await shared.start();
        if (foregroundCleanup) await shared.refresh(AppState.currentState === 'active');
      });
    });
    const event = notifee.onForegroundEvent(press);
    foregroundCleanup = () => { state.remove(); message(); token(); event(); };
    if (!initialRequested) {
      initialRequested = true;
      const generation = tapGeneration;
      safely(async () => {
        const initial = await notifee.getInitialNotification();
        if (generation === tapGeneration && initial) rememberTap(initial.notification.data);
      });
    }
    if (active()) poll().catch(() => {});
    schedule();
  }
  flushTap();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    owners.delete(owner);
    if (owners.size === 0) {
      foregroundCleanup?.();
      foregroundCleanup = null;
      clearTimeout(timer);
      timer = undefined;
    }
  };
}
