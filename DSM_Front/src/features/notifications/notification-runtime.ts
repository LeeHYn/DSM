import type { SessionControllerPort } from '../auth/session-controller';
import type { AuthenticatedClient } from '../../lib/api/authenticated-client';
import type { HttpRequest } from '../../lib/api/http-client';
import { ApiError } from '../../lib/api/api-error';
import { createNotificationApi, type DueReminder } from './notification-api';
import { NotificationController, type NotificationControllerDependencies, type NotificationSnapshot } from './notification-controller';
import type { NotificationBinding } from './notification-binding';
import type { NotificationStorage } from './notification-storage';

type BindingPort = {
  read(): Promise<NotificationBinding | null>;
  write(value: NotificationBinding): Promise<void>;
  clear(expected: NotificationBinding): Promise<boolean>;
};
export type NotificationRuntimeDependencies = {
  session: SessionControllerPort;
  client: AuthenticatedClient;
  native: NotificationControllerDependencies['native'];
  binding: BindingPort;
  storageFactory(userId: string): NotificationStorage;
  onForegroundReminder?: (reminder: DueReminder) => void;
  now?: () => number;
};
export type NotificationRuntimeSnapshot = {
  controller: NotificationController | null;
  notification: NotificationSnapshot | null;
  transitioning: boolean;
  error: string | null;
};
type Scope = { owner: string; epoch: number; controller: NotificationController; unsubscribe: () => void; ready: boolean };
const safeError = '알림 연결을 완료하지 못했습니다. 다시 시도해 주세요.';
function stale(): Error { return new ApiError('unauthorized', 'Notification session is unavailable'); }

export class NotificationRuntime {
  private started = false;
  private suspended = false;
  private suspendedIdentity: { owner: string; epoch: number } | null = null;
  private preparing = false;
  private scope: Scope | null = null;
  private retired: NotificationController[] = [];
  private lastOwner: string | null = null;
  private inactiveKey: string | null = null;
  private unsubscribeSession: (() => void) | null = null;
  private tail: Promise<void> = Promise.resolve();
  private logout: Promise<boolean> | null = null;
  private readonly listeners = new Set<() => void>();
  private snapshot: NotificationRuntimeSnapshot = Object.freeze({ controller: null, notification: null, transitioning: false, error: null });

  constructor(private readonly dependencies: NotificationRuntimeDependencies) {}

  getSnapshot = (): NotificationRuntimeSnapshot => this.snapshot;
  toJSON() { return this.snapshot; }
  getController = (): NotificationController | null => this.scope && this.current(this.scope) ? this.scope.controller : null;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): Promise<boolean> {
    if (!this.started) {
      this.started = true;
      this.inactiveKey = null;
      this.unsubscribeSession = this.dependencies.session.subscribe(() => { this.reconcile().catch(() => {}); });
    }
    return this.reconcile();
  }

  stop(): Promise<void> {
    this.started = false;
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.retire();
    return this.serial(async () => {
      await this.settleRetired();
      await this.dependencies.native.cancelAll();
      return true;
    }).then(() => undefined);
  }

  reconcile(): Promise<boolean> {
    if (!this.started) return Promise.resolve(false);
    const identity = this.identity();
    // Session logout advances its epoch before leaving authenticated state.
    // Keep the completed cleanup suspended until that owner leaves or resume is explicit.
    if (this.suspended && identity?.owner !== this.suspendedIdentity?.owner) {
      this.suspended = false;
      this.suspendedIdentity = null;
    }
    if (this.scope && !this.current(this.scope)) this.retire();
    return this.serial(() => this.reconcileNow());
  }

  async receive(data: unknown, foreground: boolean): Promise<boolean> {
    if (!this.started || this.preparing || this.suspended || this.ending()) return false;
    if (!await this.reconcile()) return false;
    const scope = this.scope;
    if (!scope || !this.current(scope)) return false;
    return scope.controller.receive(data, foreground);
  }

  async refresh(foreground: boolean): Promise<boolean> {
    if (!this.started || this.preparing || this.suspended || this.ending()) return false;
    if (!await this.reconcile()) return false;
    const scope = this.scope;
    if (!scope || !this.current(scope)) return false;
    if (!await this.registerWhenAvailable(scope) || !this.current(scope)) return false;
    return scope.controller.sync(foreground);
  }

  prepareLogout(): Promise<boolean> {
    if (this.logout) return this.logout;
    if (!this.started) return Promise.resolve(false);
    if (this.suspended) return Promise.resolve(true);
    this.preparing = true;
    this.logout = this.serial(async () => {
      if (!await this.reconcileNow()) return false;
      const scope = this.scope;
      if (!scope || !this.current(scope)) return false;
      const success = await scope.controller.revokeTokenBeforeLogout();
      if (!success || !this.current(scope)) return false;
      this.suspended = true;
      this.suspendedIdentity = { owner: scope.owner, epoch: scope.epoch };
      this.retire();
      await this.settleRetired();
      return true;
    }).then(success => {
      this.preparing = false;
      return success;
    }).finally(() => { this.logout = null; });
    return this.logout;
  }

  resume(): Promise<boolean> {
    if (!this.started || this.logout) return Promise.resolve(false);
    this.suspended = false;
    this.suspendedIdentity = null;
    this.preparing = false;
    this.retire();
    return this.reconcile();
  }

  private identity() {
    const state = this.dependencies.session.getSnapshot().state;
    return state.status === 'authenticated' ? { owner: state.userId, epoch: this.dependencies.session.getEpoch() } : null;
  }
  private current(scope: Scope): boolean {
    const identity = this.identity();
    return this.started && !this.suspended && (!this.ending() || this.preparing) && this.scope === scope && identity?.owner === scope.owner && identity.epoch === scope.epoch;
  }
  private ending(): boolean {
    const action = this.dependencies.session.getSnapshot().action;
    return action === 'logging-out' || action === 'deleting-account';
  }
  private retire() {
    if (!this.scope) return;
    const scope = this.scope;
    this.scope = null;
    this.lastOwner = scope.owner;
    scope.controller.dispose();
    scope.unsubscribe();
    this.retired.push(scope.controller);
    this.publish({ controller: null, notification: null });
  }
  private async settleRetired() {
    const retired = this.retired.splice(0);
    await Promise.all(retired.map(controller => controller.settle()));
  }

  private async reconcileNow(): Promise<boolean> {
    await this.settleRetired();
    if (!this.started || this.suspended) return false;
    if (this.ending() && !this.preparing) {
      await this.dependencies.native.cancelAll();
      return false;
    }
    const identity = this.identity();
    if (this.scope && this.current(this.scope)) {
      return this.preparing || this.scope.ready ? true : this.initialize(this.scope);
    }
    const state = this.dependencies.session.getSnapshot().state;
    const inactiveKey = `${state.status}:${this.dependencies.session.getEpoch()}`;
    if (!identity && this.inactiveKey === inactiveKey) return true;
    await this.dependencies.native.cancelAll();
    if (!this.started || this.suspended) return false;
    const binding = await this.dependencies.binding.read();
    if (!this.started || this.suspended) return false;
    const latest = this.identity();
    if (identity?.owner !== latest?.owner || identity?.epoch !== latest?.epoch) return false;
    const ended = state.status === 'unauthenticated' || state.status === 'onboarding';
    const changedOwner = identity && ((binding && binding.userId !== identity.owner) || (this.lastOwner !== null && this.lastOwner !== identity.owner));
    if (ended || changedOwner) {
      await this.dependencies.native.deleteToken();
      if (binding && !await this.dependencies.binding.clear(binding)) throw stale();
      // A newer scope cannot start until this serialized cleanup completes.
    }
    if (!this.started || this.suspended) return false;
    const actual = this.identity();
    if (identity?.owner !== actual?.owner || identity?.epoch !== actual?.epoch) return false;
    if (!identity) { this.inactiveKey = inactiveKey; return true; }
    this.inactiveKey = null;
    let ownedBinding = !changedOwner && binding?.userId === identity.owner ? binding : null;
    const isCurrent = () => this.current(scope);
    const scopedClient: AuthenticatedClient = {
      request: async <T>(request: HttpRequest<T>): Promise<T> => {
        if (!isCurrent()) throw stale();
        const result = await this.dependencies.client.request(request, isCurrent);
        if (!isCurrent()) throw stale();
        return result;
      },
    };
    const controller = new NotificationController({
      api: createNotificationApi(scopedClient, identity.owner), storage: this.dependencies.storageFactory(identity.owner),
      native: this.dependencies.native, isCurrent, now: this.dependencies.now,
      registeredToken: ownedBinding?.token,
      onForegroundReminder: this.dependencies.onForegroundReminder,
      onTokenAcquired: async token => {
        if (!isCurrent()) throw stale();
        ownedBinding = { userId: identity.owner, token };
        await this.dependencies.binding.write(ownedBinding);
        if (!isCurrent()) throw stale();
      },
      onTokenCleared: async () => {
        if (!isCurrent()) throw stale();
        if (ownedBinding && !await this.dependencies.binding.clear(ownedBinding)) throw stale();
        if (!isCurrent()) throw stale();
        ownedBinding = null;
      },
    });
    const scope: Scope = { ...identity, controller, unsubscribe: () => {}, ready: false };
    this.scope = scope;
    this.lastOwner = identity.owner;
    scope.unsubscribe = controller.subscribe(() => {
      if (isCurrent()) this.publish({ notification: controller.getSnapshot() });
    });
    this.publish({ controller, notification: controller.getSnapshot(), error: null });
    return this.preparing ? true : this.initialize(scope);
  }

  private async initialize(scope: Scope): Promise<boolean> {
    if (!await scope.controller.load() || !this.current(scope)) return false;
    if (!await this.registerWhenAvailable(scope) || !this.current(scope)) return false;
    scope.ready = true;
    return true;
  }
  private async registerWhenAvailable(scope: Scope): Promise<boolean> {
    if (!this.current(scope) || this.preparing) return false;
    const snapshot = scope.controller.getSnapshot();
    if (!snapshot.enabled) return true;
    const success = await scope.controller.register();
    if (!this.current(scope)) return false;
    const device = scope.controller.getSnapshot().device;
    return success || !device?.configured || device.permission !== 'granted';
  }
  private publish(patch: Partial<NotificationRuntimeSnapshot>) {
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch });
    for (const listener of this.listeners) listener();
  }
  private serial(action: () => Promise<boolean>): Promise<boolean> {
    const result = this.tail.then(async () => {
      this.publish({ transitioning: true });
      try {
        const success = await action();
        this.publish({ error: success ? null : this.snapshot.error });
        return success;
      } catch {
        this.publish({ error: safeError });
        return false;
      } finally { this.publish({ transitioning: false }); }
    });
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
