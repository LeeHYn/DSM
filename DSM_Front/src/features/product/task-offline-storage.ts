import {
  parseTask,
  parseCategories,
  utcTimestamp,
  type Task,
  type Category,
} from './product-contracts';

export interface StringStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type TaskSyncFields = Omit<Task, 'id' | 'userId' | 'completedAt'>;
export type TaskSyncOperation = {
  mutationId: string;
  taskId: string;
  updatedAt: string;
  kind: 'create' | 'replace' | 'delete';
  task?: TaskSyncFields;
};
export type OfflineDocument = {
  version: 1;
  userId: string;
  revision: number;
  lastLogicalTime: number;
  cachedDates: Record<string, Task[]>;
  categories: Category[];
  outbox: Array<{ operation: TaskSyncOperation; blocked?: string }>;
};

type ErrorKind = 'read' | 'write' | 'corrupt' | 'invalid' | 'limit';
export class OfflineTaskStorageError extends Error {
  constructor(readonly kind: ErrorKind) {
    super('Offline task storage could not complete the operation');
    this.name = 'OfflineTaskStorageError';
  }

  toJSON() {
    return { name: this.name, kind: this.kind, message: this.message };
  }
}

const maxBytes = 1024 * 1024;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fieldKeys = ['title', 'description', 'startAt', 'endAt', 'difficulty',
  'categoryId', 'notificationEnabled', 'status'];

function requireValid(value: unknown, kind: ErrorKind = 'invalid'): asserts value {
  if (!value) throw new OfflineTaskStorageError(kind);
}

function record(value: unknown): Record<string, unknown> {
  requireValid(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: string[]) {
  requireValid(Object.keys(value).every(key => allowed.includes(key)));
}

function uuid(value: unknown): string {
  requireValid(typeof value === 'string' && uuidV4.test(value));
  return value;
}

function timestamp(value: unknown): string {
  requireValid(typeof value === 'string' &&
    /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value));
  const time = Date.parse(value);
  requireValid(Number.isFinite(time) && new Date(time).toISOString() === value);
  return value;
}

// Count UTF-8 without depending on Node Buffer or a browser TextEncoder in RN.
function utf8Length(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function serialize(value: OfflineDocument): string {
  const raw = JSON.stringify(value);
  requireValid(utf8Length(raw) <= maxBytes, 'limit');
  return raw;
}

function clone(value: OfflineDocument): OfflineDocument {
  return JSON.parse(JSON.stringify(value)) as OfflineDocument;
}

function parseFields(value: unknown): TaskSyncFields {
  const fields = record(value);
  keys(fields, fieldKeys);
  requireValid(typeof fields.title === 'string' && fields.title.trim().length > 0 && Array.from(fields.title).length <= 200);
  requireValid(fields.description === null || (typeof fields.description === 'string' && Array.from(fields.description).length <= 4000));
  requireValid(fields.categoryId === null || (typeof fields.categoryId === 'string' &&
    fields.categoryId.trim().length > 0 && fields.categoryId.length <= 255));
  const startAt = timestamp(fields.startAt);
  const endAt = timestamp(fields.endAt);
  requireValid(endAt > startAt);
  const parsed = parseTask({ ...fields, id: 'validation', userId: 'validation', completedAt: null });
  return {
    title: parsed.title, description: parsed.description, startAt, endAt,
    categoryId: parsed.categoryId, difficulty: parsed.difficulty,
    status: parsed.status, notificationEnabled: parsed.notificationEnabled,
  };
}

function parseOperation(value: unknown): TaskSyncOperation {
  const v = record(value);
  keys(v, ['mutationId', 'taskId', 'updatedAt', 'kind', 'task']);
  const mutationId = uuid(v.mutationId);
  const taskId = uuid(v.taskId);
  const updatedAt = timestamp(v.updatedAt);
  requireValid(v.kind === 'create' || v.kind === 'replace' || v.kind === 'delete');
  const kind = v.kind;
  if (kind === 'delete') {
    requireValid(!Object.prototype.hasOwnProperty.call(v, 'task'));
    return { mutationId, taskId, updatedAt, kind };
  }
  requireValid(kind !== 'create' || mutationId === taskId);
  const operation: TaskSyncOperation = { mutationId, taskId, updatedAt, kind, task: parseFields(v.task) };
  requireValid(utf8Length(JSON.stringify(operation)) <= 16 * 1024, 'limit');
  return operation;
}

function parseDocument(value: unknown, userId: string): OfflineDocument {
  const v = record(value);
  keys(v, ['version', 'userId', 'revision', 'lastLogicalTime', 'cachedDates', 'categories', 'outbox']);
  requireValid(v.version === 1 && v.userId === userId);
  requireValid(typeof v.revision === 'number' && Number.isSafeInteger(v.revision) && v.revision >= 0);
  requireValid(typeof v.lastLogicalTime === 'number' && Number.isSafeInteger(v.lastLogicalTime) &&
    v.lastLogicalTime >= 0 && v.lastLogicalTime <= 253402300799999);
  const dates = record(v.cachedDates);
  requireValid(Object.keys(dates).length <= 42, 'limit');
  const cachedDates: Record<string, Task[]> = {};
  let taskCount = 0;
  for (const [day, rows] of Object.entries(dates)) {
    utcTimestamp(day, '00:00');
    requireValid(Array.isArray(rows));
    taskCount += rows.length;
    requireValid(taskCount <= 1000, 'limit');
    const seen = new Set<string>();
    cachedDates[day] = rows.map(row => {
      const raw = record(row);
      keys(raw, [...fieldKeys, 'id', 'userId', 'completedAt']);
      const task = parseTask(raw);
      requireValid(task.userId === userId && !seen.has(task.id));
      seen.add(task.id);
      return task;
    });
  }
  requireValid(Array.isArray(v.categories));
  for (const category of v.categories) {
    keys(record(category), ['id', 'name', 'color', 'isDefault', 'userId']);
  }
  const categories = parseCategories(v.categories);
  const categoryIds = new Set<string>();
  for (const category of categories) {
    requireValid(category.userId === userId || (category.isDefault && category.userId === null));
    requireValid(!categoryIds.has(category.id));
    categoryIds.add(category.id);
  }
  requireValid(Array.isArray(v.outbox));
  requireValid(v.outbox.length <= 200, 'limit');
  const mutationIds = new Set<string>();
  const outbox = v.outbox.map(item => {
    const row = record(item);
    keys(row, ['operation', 'blocked']);
    const operation = parseOperation(row.operation);
    requireValid(!mutationIds.has(operation.mutationId.toLowerCase()));
    mutationIds.add(operation.mutationId.toLowerCase());
    if (row.blocked === undefined) return { operation };
    requireValid(typeof row.blocked === 'string' && row.blocked.trim().length > 0 && row.blocked.length <= 200);
    return { operation, blocked: row.blocked };
  });
  return { version: 1, userId, revision: v.revision,
    lastLogicalTime: v.lastLogicalTime, cachedDates, categories, outbox };
}

/** One instance owns the writer for an account. Reuse it across session consumers. */
export class OfflineTaskStorage {
  private readonly key: string;
  private snapshot: OfflineDocument | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: StringStorage, private readonly userId: string) {
    requireValid(typeof userId === 'string' && userId.length > 0 && userId.length <= 1024 && userId.trim() === userId);
    try {
      this.key = `dsm.tasks.offline.v1:${encodeURIComponent(userId)}`;
    } catch {
      throw new OfflineTaskStorageError('invalid');
    }
  }

  getSnapshot(): OfflineDocument | null {
    return this.snapshot === null ? null : clone(this.snapshot);
  }

  open(): Promise<OfflineDocument> {
    return this.enqueue(async () => clone(await this.ensureOpen()));
  }

  update(mutator: (draft: OfflineDocument) => void): Promise<OfflineDocument> {
    return this.enqueue(async () => {
      const current = await this.ensureOpen();
      let next: OfflineDocument;
      let raw: string;
      try {
        const draft = clone(current);
        mutator(draft);
        draft.revision = current.revision + 1;
        requireValid(draft.lastLogicalTime >= current.lastLogicalTime);
        next = parseDocument(draft, this.userId);
        raw = serialize(next);
      } catch (error) {
        if (error instanceof OfflineTaskStorageError) throw error;
        throw new OfflineTaskStorageError('invalid');
      }
      try {
        await this.storage.setItem(this.key, raw);
      } catch {
        throw new OfflineTaskStorageError('write');
      }
      this.snapshot = next;
      return clone(next);
    });
  }

  /** Only a complete, authenticated owner checkpoint can authorize lowering this floor. */
  rebaseLogicalTime(serverFloor: number, isCurrent: () => boolean): Promise<OfflineDocument> {
    return this.enqueue(async () => {
      requireValid(Number.isSafeInteger(serverFloor) && serverFloor >= 0 && serverFloor <= 253402300799999);
      const current = await this.ensureOpen();
      let next: OfflineDocument;
      let raw: string;
      try {
        const draft = clone(current);
        draft.lastLogicalTime = draft.outbox.reduce((floor, row) =>
          Math.max(floor, Date.parse(row.operation.updatedAt)), serverFloor);
        draft.revision = current.revision + 1;
        next = parseDocument(draft, this.userId);
        raw = serialize(next);
        // Check after queued writers/initial read, immediately before starting persistence.
        requireValid(isCurrent() === true);
      } catch (error) {
        if (error instanceof OfflineTaskStorageError) throw error;
        throw new OfflineTaskStorageError('invalid');
      }
      try {
        await this.storage.setItem(this.key, raw);
      } catch {
        throw new OfflineTaskStorageError('write');
      }
      this.snapshot = next;
      return clone(next);
    });
  }

  private enqueue(action: () => Promise<OfflineDocument>): Promise<OfflineDocument> {
    const pending = this.queue.then(action);
    this.queue = pending.then(() => {}, () => {});
    return pending;
  }

  private async ensureOpen(): Promise<OfflineDocument> {
    if (this.snapshot !== null) return this.snapshot;
    let raw: string | null;
    try {
      raw = await this.storage.getItem(this.key);
    } catch {
      throw new OfflineTaskStorageError('read');
    }
    if (raw === null) {
      this.snapshot = { version: 1, userId: this.userId, revision: 0,
        lastLogicalTime: 0, cachedDates: {}, categories: [], outbox: [] };
      return this.snapshot;
    }
    try {
      requireValid(typeof raw === 'string');
      requireValid(utf8Length(raw) <= maxBytes, 'limit');
      const parsed = parseDocument(JSON.parse(raw), this.userId);
      this.snapshot = parsed;
      return parsed;
    } catch (error) {
      if (error instanceof OfflineTaskStorageError && error.kind === 'limit') throw error;
      throw new OfflineTaskStorageError('corrupt');
    }
  }
}
