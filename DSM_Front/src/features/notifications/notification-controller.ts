import type { DueReminder, NotificationApi } from './notification-api';
import type { NotificationPreferences, NotificationStorage } from './notification-storage';
import type { notificationNative, NotificationDeviceStatus } from './notification-native';

type NativePort = Pick<typeof notificationNative, 'status' | 'requestPermission' | 'getToken' | 'deleteToken' | 'display' | 'cancelAll' | 'openSettings'>;
export type NotificationSnapshot = {
  loaded: boolean;
  enabled: boolean | null;
  preferences: Readonly<NotificationPreferences>;
  device: Readonly<NotificationDeviceStatus> | null;
  loading: boolean;
  syncing: boolean;
  registering: boolean;
  error: string | null;
};
export type NotificationControllerDependencies = {
  api: NotificationApi;
  storage: NotificationStorage;
  native: NativePort;
  isCurrent: () => boolean;
  /** Monotonic milliseconds for elapsed request time, independent of server time. */
  now?: () => number;
  onForegroundReminder?: (reminder: DueReminder) => void;
  registeredToken?: string;
  /** Persist the owner/token cleanup binding before attempting server registration. */
  onTokenAcquired?: (token: string) => Promise<void>;
  onTokenCleared?: () => Promise<void>;
};

const safeError = '알림 작업을 완료하지 못했습니다. 다시 시도해 주세요.';
function validToken(token: unknown): asserts token is string {
  if (typeof token !== 'string' || !/^\S+$/.test(token) || Array.from(token).length > 4096) throw new Error(safeError);
}

export class NotificationController {
  private snapshot: NotificationSnapshot = Object.freeze({
    loaded: false, enabled: null, preferences: Object.freeze({ sound: true, vibration: true, foreground: true }),
    device: null, loading: false, syncing: false, registering: false, error: null,
  });
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  private closing = false;
  private suppressed = false;
  private generation = 0;
  private enabledGeneration = 0;
  private token: string | undefined;
  private tail: Promise<void> = Promise.resolve();
  private loading: Promise<boolean> | null = null;
  private syncing: Promise<boolean> | null = null;
  private registering: Promise<boolean> | null = null;
  private loggingOut: Promise<boolean> | null = null;
  private lastClock = -Infinity;

  constructor(private readonly dependencies: NotificationControllerDependencies) {
    if (dependencies.api.userId !== dependencies.storage.userId) throw new Error(safeError);
    if (dependencies.registeredToken !== undefined) validToken(dependencies.registeredToken);
    this.token = dependencies.registeredToken;
  }

  getSnapshot = (): NotificationSnapshot => this.snapshot;
  toJSON() { return this.snapshot; }
  subscribe = (listener: () => void): (() => void) => {
    if (!this.disposed) this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  dispose() { this.disposed = true; this.generation++; this.listeners.clear(); }
  /** Dispose first to fence new work, then await this barrier before changing native token ownership. */
  async settle(): Promise<void> {
    await Promise.allSettled([this.loading, this.syncing, this.registering, this.loggingOut, this.tail]);
  }

  load(): Promise<boolean> {
    if (!this.active()) return Promise.resolve(false);
    if (this.snapshot.loaded) return Promise.resolve(true);
    if (this.loading) return this.loading;
    this.loading = this.attempt(async () => {
      this.publish({ loading: true });
      const generation = this.generation;
      const doc = await this.dependencies.storage.load();
      if (!this.active()) return false;
      const settings = await this.dependencies.api.getSettings();
      if (!this.active() || generation !== this.generation) return false;
      const device = await this.dependencies.native.status();
      if (!this.active() || generation !== this.generation) return false;
      this.publish({ loaded: true, enabled: settings.notificationEnabled, preferences: doc.preferences, device, error: null });
      return true;
    }).finally(() => { this.loading = null; this.publish({ loading: false }); });
    return this.loading;
  }

  setEnabled(enabled: boolean): Promise<boolean> {
    if (!this.active() || typeof enabled !== 'boolean') return Promise.resolve(false);
    this.generation++;
    const enabledGeneration = ++this.enabledGeneration;
    if (!enabled) this.suppressed = true;
    return this.serial(async () => {
      if (!await this.load() || !this.active()) return false;
      const settings = await this.dependencies.api.setSettings(enabled);
      if (!this.active()) return false;
      if (enabledGeneration === this.enabledGeneration) {
        this.suppressed = !settings.notificationEnabled;
        this.publish({ enabled: settings.notificationEnabled, error: null });
      }
      if (!settings.notificationEnabled) {
        await this.dependencies.native.cancelAll();
        if (!this.active()) return false;
      }
      return true;
    });
  }

  setPreferences(patch: Partial<NotificationPreferences>): Promise<boolean> {
    if (!this.active()) return Promise.resolve(false);
    this.generation++;
    const captured = patch && typeof patch === 'object' && !Array.isArray(patch) ? { ...patch } : patch;
    return this.serial(async () => {
      if (!await this.load() || !this.active()) return false;
      const doc = await this.dependencies.storage.setPreferences(captured);
      if (!this.active()) return false;
      this.publish({ preferences: doc.preferences, error: null });
      return true;
    });
  }

  requestPermission(): Promise<boolean> { return this.register(true); }

  register(requestPermission = false): Promise<boolean> {
    if (!this.active()) return Promise.resolve(false);
    if (this.registering) return this.registering;
    this.registering = this.serial(async () => {
      if (!await this.load() || !this.active()) return false;
      this.publish({ registering: true });
      const device = await (requestPermission ? this.dependencies.native.requestPermission() : this.dependencies.native.status());
      if (!this.active()) return false;
      this.publish({ device });
      if (!device.configured || device.permission !== 'granted' || !this.allowed()) return false;
      const token = await this.dependencies.native.getToken();
      if (!this.active()) return false;
      validToken(token);
      this.token = token;
      if (this.dependencies.onTokenAcquired) {
        await this.dependencies.onTokenAcquired(token);
        if (!this.active()) return false;
      }
      await this.dependencies.api.registerToken(token);
      if (!this.active()) {
        // Runtime keeps the previous owner's client alive until this cleanup settles.
        // Never delete a native token once account ownership has changed.
        await this.dependencies.api.revokeToken(token);
        return false;
      }
      this.publish({ error: null });
      return true;
    }).finally(() => { this.registering = null; this.publish({ registering: false }); });
    return this.registering;
  }

  receive(data: unknown, foreground: boolean): Promise<boolean> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return Promise.resolve(false);
    const row = data as Record<string, unknown>;
    if (Object.keys(row).length !== 2 || row.type !== 'REMINDER_SYNC' || row.version !== '1') return Promise.resolve(false);
    return this.sync(foreground);
  }

  sync(foreground: boolean): Promise<boolean> {
    if (!this.active()) return Promise.resolve(false);
    if (this.syncing) return this.syncing;
    this.syncing = this.attempt(async () => {
      if (!await this.load() || !this.active()) return false;
      this.publish({ syncing: true });
      const generation = this.generation;
      const current = () => this.allowed() && this.generation === generation && (!foreground || this.snapshot.preferences.foreground);
      const settings = await this.dependencies.api.getSettings();
      if (!this.active() || generation !== this.generation) return false;
      this.publish({ enabled: settings.notificationEnabled });
      if (!current()) return true;
      const device = await this.dependencies.native.status();
      if (!current()) return false;
      this.publish({ device });
      if (device.permission !== 'granted' && (!foreground || !this.dependencies.onForegroundReminder)) return true;
      const rows = new Map<string, { reminder: DueReminder; deadline: number }>();
      const cursors = new Set<string>();
      let cursor: string | undefined;
      let complete = false;
      for (let index = 0; index < 100; index++) {
        const requestStart = this.clock();
        const page = await this.dependencies.api.reminders(cursor);
        if (!current()) return false;
        for (const reminder of page.reminders) {
          const deadline = requestStart + Date.parse(reminder.expiresAt) - Date.parse(page.serverTime);
          const existing = rows.get(reminder.id);
          if (!existing || deadline < existing.deadline) rows.set(reminder.id, { reminder, deadline });
          if (rows.size > 10_000) throw new Error(safeError);
        }
        if (page.nextCursor === null) { complete = true; break; }
        if (cursors.has(page.nextCursor)) throw new Error(safeError);
        cursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      if (!complete) throw new Error(safeError);
      for (const { reminder, deadline } of rows.values()) {
        if (!current()) return false;
        const remainingMs = deadline - this.clock();
        if (remainingMs <= 0 || this.dependencies.storage.hasDisplayed(reminder.id)) continue;
        if (device.permission === 'granted') {
          await this.dependencies.native.display(this.dependencies.api.userId, reminder, this.snapshot.preferences, Math.min(300_000, remainingMs), current);
          if (!current()) return false;
        } else {
          if (!current()) return false;
          this.dependencies.onForegroundReminder?.(reminder);
          if (!current()) return false;
        }
        await this.dependencies.storage.markDisplayed(reminder.id, reminder.expiresAt, Math.max(0, Math.min(300_000, deadline - this.clock())));
        if (!current()) return false;
      }
      this.publish({ error: null });
      return true;
    }).finally(() => { this.syncing = null; this.publish({ syncing: false }); });
    return this.syncing;
  }

  revokeTokenBeforeLogout(): Promise<boolean> {
    if (!this.current()) return Promise.resolve(false);
    if (this.loggingOut) return this.loggingOut;
    this.closing = true;
    this.generation++;
    this.loggingOut = this.attempt(async () => {
      await this.syncing;
      if (!this.current()) return false;
      await this.tail;
      if (!this.current()) return false;
      if (this.token) {
        await this.dependencies.api.revokeToken(this.token);
        if (!this.current()) return false;
      }
      await this.dependencies.native.deleteToken();
      if (!this.current()) return false;
      await this.dependencies.native.cancelAll();
      if (!this.current()) return false;
      if (this.dependencies.onTokenCleared) {
        await this.dependencies.onTokenCleared();
        if (!this.current()) return false;
      }
      this.token = undefined;
      this.publish({ error: null });
      return true;
    }).then(success => {
      if (!success) this.closing = false;
      return success;
    }).finally(() => { this.loggingOut = null; });
    return this.loggingOut;
  }

  openSettings(): Promise<boolean> {
    return this.attempt(async () => {
      if (!this.active()) return false;
      await this.dependencies.native.openSettings();
      return this.active();
    });
  }

  private current(): boolean { return !this.disposed && this.dependencies.isCurrent(); }
  private active(): boolean { return this.current() && !this.closing; }
  private allowed(): boolean { return this.active() && !this.suppressed && this.snapshot.enabled === true; }
  private clock(): number {
    const now = this.dependencies.now ? this.dependencies.now() : performance.now();
    if (!Number.isFinite(now)) throw new Error(safeError);
    this.lastClock = Math.max(this.lastClock, now);
    return this.lastClock;
  }
  private publish(patch: Partial<NotificationSnapshot>) {
    if (!this.current()) return;
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch,
      preferences: Object.freeze({ ...(patch.preferences ?? this.snapshot.preferences) }),
      device: patch.device ? Object.freeze({ ...patch.device }) : this.snapshot.device,
    });
    for (const listener of this.listeners) listener();
  }
  private async attempt(action: () => Promise<boolean>): Promise<boolean> {
    try { return await action(); }
    catch { this.publish({ error: safeError }); return false; }
  }
  private serial(action: () => Promise<boolean>): Promise<boolean> {
    const result = this.tail.then(() => this.attempt(action));
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
