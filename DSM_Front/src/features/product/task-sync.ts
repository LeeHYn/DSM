import type { AuthenticatedClient } from '../../lib/api/authenticated-client';
import { ApiError } from '../../lib/api/api-error';
import { parseTask, utcDay, utcTimestamp, type Task } from './product-contracts';
import {
  OfflineTaskStorage,
  OfflineTaskStorageError,
  type OfflineDocument,
  type TaskSyncFields,
  type TaskSyncOperation,
} from './task-offline-storage';

export type TaskSyncResult = {
  mutationId: string;
  outcome: 'applied' | 'superseded' | 'deleted';
  task: Task;
  logicalTime: number;
  serverTime: string;
};
export type TaskSyncClock = { userId: string; serverTime: string; logicalTime: number };
export interface TaskSyncApi {
  readonly userId: string;
  list(date: string): Promise<{ tasks: Task[]; logicalTime: number }>;
  apply(operation: TaskSyncOperation): Promise<TaskSyncResult>;
  clock?(): Promise<TaskSyncClock>;
}

function valid(condition: unknown): asserts condition {
  if (!condition) throw new ApiError('protocol', 'Invalid task sync data');
}
function object(value: unknown): Record<string, unknown> {
  valid(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  valid(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
  return value.toLowerCase();
}
function time(value: unknown): number {
  valid(typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value));
  const result = Date.parse(value);
  valid(Number.isFinite(result) && new Date(result).toISOString() === value);
  return result;
}
function checkpoint(value: unknown, userId: string): TaskSyncClock {
  const row = object(value);
  valid(Object.keys(row).length === 3 && Object.keys(row).every(key =>
    key === 'userId' || key === 'serverTime' || key === 'logicalTime'));
  valid(typeof row.userId === 'string' && row.userId === userId);
  time(row.serverTime);
  valid(typeof row.logicalTime === 'number' && Number.isSafeInteger(row.logicalTime) &&
    row.logicalTime >= 0 && row.logicalTime <= 253402300799999);
  return { userId: row.userId, serverTime: row.serverTime as string, logicalTime: row.logicalTime };
}
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4;
  }
  return bytes;
}

// Only refetchable server snapshots are evicted; full pending intents stay intact.
function boundServerCache(document: OfflineDocument, protectedDate: string): void {
  const candidates = Object.keys(document.cachedDates).filter(date => date !== protectedDate).sort();
  for (;;) {
    const dates = Object.values(document.cachedDates);
    const taskCount = dates.reduce((total, rows) => total + rows.length, 0);
    // OfflineTaskStorage owns the increment after this mutator returns.
    const next = { ...document, revision: document.revision + 1 };
    if (dates.length <= 42 && taskCount <= 1000 && utf8Bytes(JSON.stringify(next)) <= 1024 * 1024) return;
    const oldest = candidates.shift();
    if (oldest === undefined) throw new OfflineTaskStorageError('limit');
    delete document.cachedDates[oldest];
  }
}
function projection(value: unknown, userId: string) {
  const row = object(value);
  const task = parseTask(row);
  valid(task.userId === userId);
  identifier(task.id);
  const logicalTime = time(row.syncUpdatedAt);
  const mutationId = row.syncMutationId === '' ? '' : identifier(row.syncMutationId);
  return { task, logicalTime, mutationId };
}
function validateOperation(operation: TaskSyncOperation) {
  const row = object(operation);
  const deleting = operation.kind === 'delete';
  const expected = ['mutationId', 'taskId', 'updatedAt', 'kind', ...(deleting ? [] : ['task'])];
  valid(Object.keys(row).length === expected.length && Object.keys(row).every(key => expected.includes(key)));
  valid(['create', 'replace', 'delete'].includes(operation.kind));
  const mutationId = identifier(operation.mutationId);
  const taskId = identifier(operation.taskId);
  time(operation.updatedAt);
  if (!deleting) {
    const fields = object(operation.task);
    const keys = ['title', 'description', 'startAt', 'endAt', 'difficulty', 'status', 'categoryId', 'notificationEnabled'];
    valid(Object.keys(fields).length === keys.length && Object.keys(fields).every(key => keys.includes(key)));
    valid(typeof fields.title === 'string' && fields.title.trim() && Array.from(fields.title.trim()).length <= 200);
    valid(fields.description === null || (typeof fields.description === 'string' && Array.from(fields.description).length <= 4000));
    valid(fields.categoryId === null || (typeof fields.categoryId === 'string' && fields.categoryId.trim() && fields.categoryId.length <= 255));
    valid(time(fields.endAt) > time(fields.startAt));
    parseTask({ ...fields, id: taskId, userId: 'validation', completedAt: null });
    valid(operation.kind !== 'create' || (mutationId === taskId && fields.status === 'PENDING'));
  }
  valid(utf8Bytes(JSON.stringify(operation)) <= 16384);
}

export function createTaskSyncApi(client: AuthenticatedClient, userId: string): TaskSyncApi {
  valid(typeof userId === 'string' && userId.trim() === userId && userId.length > 0);
  return {
    userId,
    async clock() {
      return client.request({ path: '/tasks/sync/clock', validate: value => checkpoint(value, userId) });
    },
    async list(date) {
      utcTimestamp(date, '00:00');
      const tasks: Task[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      let logicalTime = 0;
      for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
        const page = await client.request({
          path: `/tasks/sync?date=${date}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          validate(value) {
            valid(Array.isArray(value) && value.length <= 100);
            return value.map(row => {
              const parsed = projection(row, userId);
              valid(utcDay(new Date(parsed.task.startAt)) === date);
              return parsed;
            });
          },
        });
        for (const row of page) {
          const taskId = identifier(row.task.id);
          valid(!seen.has(taskId));
          seen.add(taskId);
          tasks.push(row.task);
          logicalTime = Math.max(logicalTime, row.logicalTime);
        }
        if (page.length < 100) return { tasks, logicalTime };
        cursor = page[page.length - 1].task.id;
      }
      throw new ApiError('protocol', 'Task sync page limit exceeded');
    },
    async apply(input) {
      const operation = copy(input);
      validateOperation(operation);
      return client.request({
        path: '/tasks/sync', method: 'POST', body: operation,
        validate(value) {
          const row = object(value);
          valid(identifier(row.mutationId) === identifier(operation.mutationId));
          valid(row.outcome === 'applied' || row.outcome === 'superseded' || row.outcome === 'deleted');
          const parsed = projection(row.task, userId);
          valid(identifier(parsed.task.id) === identifier(operation.taskId));
          const serverTime = time(row.serverTime);
          if (row.outcome === 'applied') {
            valid(operation.kind !== 'delete' && parsed.mutationId === identifier(operation.mutationId) && parsed.logicalTime === time(operation.updatedAt));
          }
          if (row.outcome === 'superseded' && operation.kind === 'replace') {
            valid(parsed.logicalTime > time(operation.updatedAt) ||
              (parsed.logicalTime === time(operation.updatedAt) && parsed.mutationId > identifier(operation.mutationId)));
          }
          return { mutationId: identifier(row.mutationId), outcome: row.outcome,
            task: parsed.task, logicalTime: Math.max(parsed.logicalTime, serverTime), serverTime: row.serverTime as string };
        },
      });
    },
  };
}

export type TaskSyncSnapshot = Readonly<{ pendingCount: number; draining: boolean; error: string | null }>;
type SyncOptions = { uuid: () => string; now?: () => Date };

function projected(document: OfflineDocument): Map<string, Task> {
  const tasks = new Map<string, Task>();
  for (const rows of Object.values(document.cachedDates)) {
    for (const task of rows) tasks.set(task.id, task);
  }
  for (const { operation } of document.outbox) {
    if (operation.kind === 'delete') tasks.delete(operation.taskId);
    else {
      const fields = operation.task!;
      const previous = tasks.get(operation.taskId);
      tasks.set(operation.taskId, { ...fields, id: operation.taskId, userId: document.userId,
        completedAt: fields.status === 'COMPLETED' ? previous?.completedAt ?? null : null });
    }
  }
  return tasks;
}
function errorMessage(error: unknown): string {
  if (error instanceof OfflineTaskStorageError) {
    return error.kind === 'limit' ? '오프라인 저장 한도에 도달했습니다. 미전송 작업을 먼저 동기화해 주세요.' : '기기에 저장하지 못했습니다. 다시 시도해 주세요.';
  }
  if (error instanceof ApiError && error.kind === 'unauthorized') return '로그인이 필요합니다. 미전송 작업은 보관됩니다.';
  return '작업을 동기화하지 못했습니다. 입력값과 연결을 확인해 주세요.';
}
function retryable(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'network' || error.kind === 'timeout' ||
    (error.kind === 'http' && error.status !== undefined && error.status >= 500 && error.status < 600));
}
function permanent(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'http' && [400, 403, 404, 409].includes(error.status ?? 0);
}

/** A session owns this engine; dispose it before replacing the authenticated owner. */
export class OfflineTaskSync {
  private online = false;
  private disposed = false;
  private draining = false;
  private error: string | null = null;
  private snapshot: TaskSyncSnapshot = Object.freeze({ pendingCount: 0, draining: false, error: null });
  private listeners = new Set<() => void>();
  private remoteQueue: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1000;

  constructor(private readonly storage: OfflineTaskStorage, private readonly api: TaskSyncApi,
    private readonly options: SyncOptions) {}

  getSnapshot = (): TaskSyncSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  async open(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      await this.ready();
      if (this.disposed) return false;
      this.publish(); this.kick();
      return true;
    } catch (error) { this.fail(error); return false; }
  }

  setOnline(online: boolean): void {
    if (this.disposed) return;
    this.online = online;
    if (!online) this.clearTimer();
    else this.kick();
  }

  tasks(date: string): Task[] {
    utcTimestamp(date, '00:00');
    const document = this.storage.getSnapshot();
    if (!document || document.userId !== this.api.userId) return [];
    return [...projected(document).values()].filter(task => utcDay(new Date(task.startAt)) === date)
      .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
  }

  create(fields: TaskSyncFields): Promise<boolean> {
    return this.enqueue('create', undefined, fields);
  }
  replace(taskId: string, fields: TaskSyncFields): Promise<boolean> {
    return this.enqueue('replace', taskId, fields);
  }
  remove(taskId: string): Promise<boolean> {
    return this.enqueue('delete', taskId);
  }

  blockedTasks(): Array<{ taskId: string; title: string }> {
    const document = this.storage.getSnapshot();
    if (!document || document.userId !== this.api.userId) return [];
    const visible = projected(document);
    const canonical = Object.values(document.cachedDates).flat();
    const seen = new Set<string>();
    return document.outbox.flatMap(row => {
      const taskId = row.operation.taskId;
      if (seen.has(taskId)) return [];
      seen.add(taskId);
      if (!row.blocked) return [];
      return [{ taskId, title: visible.get(taskId)?.title ?? row.operation.task?.title ??
        canonical.find(task => task.id === taskId)?.title ?? '작업' }];
    });
  }

  /** Call only after the user confirms cancellation of this device's task changes. */
  async discardBlocked(taskId: string): Promise<boolean> {
    if (this.disposed) return false;
    try {
      const document = await this.ready();
      const first = document.outbox.find(row => row.operation.taskId === taskId);
      valid(first?.blocked);
      await this.remote(async () => {
        await this.storage.update(draft => {
          valid(!this.disposed && draft.userId === this.api.userId);
          const head = draft.outbox.find(row => row.operation.taskId === taskId);
          valid(head?.blocked && head.operation.mutationId === first.operation.mutationId);
          draft.outbox = draft.outbox.filter(row => row.operation.taskId !== taskId);
        });
        await this.repairClockIfNeeded();
      });
      this.error = null; this.publish(); this.kick();
      return !this.disposed;
    } catch (error) { this.fail(error); return false; }
  }

  async retryBlocked(taskId: string): Promise<boolean> {
    if (this.disposed) return false;
    try {
      await this.ready();
      await this.storage.update(draft => {
        valid(!this.disposed);
        const blocked = draft.outbox.filter(row => row.operation.taskId === taskId && row.blocked);
        valid(blocked.length > 0);
        blocked.forEach(row => { delete row.blocked; });
      });
      this.error = null; this.publish(); this.kick();
      return !this.disposed;
    } catch (error) { this.fail(error); return false; }
  }

  async refresh(date: string): Promise<boolean> {
    if (this.disposed || !this.online) return false;
    try {
      utcTimestamp(date, '00:00');
      await this.ready();
      return await this.remote(async () => {
        if (this.disposed || !this.online) return false;
        await this.repairClockIfNeeded();
        const result = await this.api.list(date);
        if (this.disposed || !this.online) return false;
        await this.storage.update(draft => {
          valid(!this.disposed && draft.userId === this.api.userId);
          const incoming = new Set(result.tasks.map(task => task.id));
          for (const cachedDate of Object.keys(draft.cachedDates)) {
            if (cachedDate !== date) {
              draft.cachedDates[cachedDate] = draft.cachedDates[cachedDate].filter(task => !incoming.has(task.id));
            }
          }
          draft.cachedDates[date] = result.tasks;
          draft.lastLogicalTime = Math.max(draft.lastLogicalTime, result.logicalTime);
          boundServerCache(draft, date);
        });
        this.error = null; this.publish();
        return !this.disposed;
      });
    } catch (error) { this.fail(error); return false; }
  }

  dispose(): void {
    this.disposed = true;
    this.online = false;
    this.clearTimer();
    this.listeners.clear();
  }

  private async ready(): Promise<OfflineDocument> {
    const document = await this.storage.open();
    valid(document.userId === this.api.userId);
    return document;
  }

  private async enqueue(kind: TaskSyncOperation['kind'], taskId?: string, fields?: TaskSyncFields): Promise<boolean> {
    if (this.disposed) return false;
    try {
      const input = fields === undefined ? undefined : copy(fields);
      await this.remote(async () => {
        await this.ready();
        valid(!this.disposed);
        await this.repairClockIfNeeded();
        await this.storage.update(draft => {
          valid(!this.disposed && draft.userId === this.api.userId);
          // An unresolved future intent remains immutable; do not propagate its clock to new work.
          valid(!this.clockNeedsRepair(draft));
          if (draft.outbox.length >= 200) throw new OfflineTaskStorageError('limit');
          const visible = projected(draft);
          const previous = taskId ? visible.get(taskId) : undefined;
          if (kind !== 'create') valid(previous);
          const mutationId = identifier(this.options.uuid());
          if (kind === 'create') valid(!visible.has(mutationId));
          const logicalTime = Math.max((this.options.now?.() ?? new Date()).getTime(), draft.lastLogicalTime + 1);
          const operation: TaskSyncOperation = { mutationId, taskId: kind === 'create' ? mutationId : identifier(taskId),
            updatedAt: new Date(logicalTime).toISOString(), kind, ...(input ? { task: input } : {}) };
          validateOperation(operation);
          draft.outbox.push({ operation });
          draft.lastLogicalTime = logicalTime;
          const protectedDate = utcDay(new Date(kind === 'delete' ? previous!.startAt : operation.task!.startAt));
          boundServerCache(draft, protectedDate);
        });
      });
      this.error = null; this.publish(); this.kick();
      return !this.disposed;
    } catch (error) { this.fail(error); return false; }
  }

  private clockNeedsRepair(document: OfflineDocument): boolean {
    const deviceTime = (this.options.now?.() ?? new Date()).getTime();
    valid(Number.isFinite(deviceTime));
    return document.lastLogicalTime > deviceTime + 300_000;
  }

  /** Called only inside remoteQueue, so our ACKs and new operations cannot race a checkpoint. */
  private async repairClockIfNeeded(): Promise<void> {
    const document = this.storage.getSnapshot();
    valid(document && document.userId === this.api.userId);
    if (!this.clockNeedsRepair(document)) return;
    valid(!this.disposed && this.online && typeof this.api.clock === 'function');
    const clock = checkpoint(await this.api.clock(), this.api.userId);
    await this.storage.rebaseLogicalTime(Math.max(time(clock.serverTime), clock.logicalTime),
      () => !this.disposed && this.online && document.userId === this.api.userId);
  }

  private remote<T>(action: () => Promise<T>): Promise<T> {
    const pending = this.remoteQueue.then(action);
    this.remoteQueue = pending.then(() => {}, () => {});
    return pending;
  }

  private kick(): void {
    if (!this.online || this.disposed || this.draining || this.timer !== null) return;
    this.drain();
  }

  private async drain(): Promise<void> {
    this.draining = true; this.publish();
    try {
      await this.ready();
      while (this.online && !this.disposed) {
        const document = this.storage.getSnapshot()!;
        const seen = new Set<string>();
        const row = document.outbox.find(item => {
          if (seen.has(item.operation.taskId)) return false;
          seen.add(item.operation.taskId);
          return !item.blocked;
        });
        if (!row) break;
        const proceed = await this.remote(async () => {
          if (!this.online || this.disposed) return false;
          const operation = row.operation;
          try {
            const result = await this.api.apply(copy(operation));
            if (this.disposed) return false;
            let discardedLater = false;
            await this.storage.update(draft => {
              valid(!this.disposed);
              const index = draft.outbox.findIndex(item => item.operation.mutationId === operation.mutationId);
              if (index < 0) return;
              valid(result.mutationId === operation.mutationId && result.task.id === operation.taskId && result.task.userId === draft.userId);
              for (const date of Object.keys(draft.cachedDates)) {
                draft.cachedDates[date] = draft.cachedDates[date].filter(task => task.id !== operation.taskId);
              }
              const date = utcDay(new Date(result.task.startAt));
              if (result.outcome !== 'deleted') {
                (draft.cachedDates[date] ??= []).push(result.task);
                draft.outbox.splice(index, 1);
              } else {
                discardedLater = draft.outbox.filter(item => item.operation.taskId === operation.taskId).length > 1;
                draft.outbox = draft.outbox.filter(item => item.operation.taskId !== operation.taskId);
              }
              draft.lastLogicalTime = Math.max(draft.lastLogicalTime, result.logicalTime, time(result.serverTime));
              boundServerCache(draft, date);
            });
            this.retryDelay = 1000;
            this.error = discardedLater ? '서버에서 삭제된 작업의 남은 기기 변경을 정리했습니다.' : null;
            this.publish();
            return true;
          } catch (error) {
            if (this.disposed) return false;
            this.fail(error);
            if (retryable(error)) this.scheduleRetry();
            else if (permanent(error)) {
              await this.storage.update(draft => {
                valid(!this.disposed);
                const current = draft.outbox.find(item => item.operation.mutationId === operation.mutationId);
                if (current) current.blocked = `HTTP_${(error as ApiError).status}`;
              });
              this.publish();
              return true;
            } else if (error instanceof ApiError && error.kind === 'unauthorized') this.online = false;
            return false;
          }
        });
        if (!proceed) break;
      }
    } catch (error) { this.fail(error); }
    finally { this.draining = false; this.publish(); }
  }

  private scheduleRetry(): void {
    if (!this.online || this.disposed || this.timer !== null) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(delay * 2, 60000);
    this.timer = setTimeout(() => { this.timer = null; this.kick(); }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private fail(error: unknown): void {
    this.error = errorMessage(error);
    this.publish();
  }

  private publish(): void {
    if (this.disposed) return;
    const document = this.storage.getSnapshot();
    const blocked = document?.outbox.some(row => row.blocked);
    this.snapshot = Object.freeze({ pendingCount: document?.outbox.length ?? 0,
      draining: this.draining, error: this.error ?? (blocked ? '일부 작업이 동기화되지 않았습니다. 입력값을 확인한 뒤 다시 시도해 주세요.' : null) });
    for (const listener of this.listeners) {
      try { listener(); } catch { /* A view subscriber cannot interrupt persistence. */ }
    }
  }
}
