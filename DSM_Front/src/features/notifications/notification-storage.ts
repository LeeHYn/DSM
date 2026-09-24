export interface NotificationStringStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export type NotificationPreferences = { sound: boolean; vibration: boolean; foreground: boolean };
export type NotificationDocument = {
  version: 1;
  userId: string;
  preferences: NotificationPreferences;
  displayed: Array<{ id: string; displayedAt: number; expiresAt: string }>;
};
type ErrorKind = 'read' | 'write' | 'corrupt' | 'invalid' | 'limit';
export class NotificationStorageError extends Error {
  constructor(readonly kind: ErrorKind) {
    super('Notification storage could not complete the operation');
    this.name = 'NotificationStorageError';
  }
  toJSON() { return { name: this.name, kind: this.kind, message: this.message }; }
}

const retentionMs = 86_400_000;
const maxClockSkewMs = 300_000;
const maxBytes = 64 * 1024;
const preferenceKeys = ['sound', 'vibration', 'foreground'];
function valid(condition: unknown, kind: ErrorKind = 'invalid'): asserts condition {
  if (!condition) throw new NotificationStorageError(kind);
}
function object(value: unknown, keys: string[], partial = false): Record<string, unknown> {
  valid(value !== null && typeof value === 'object' && !Array.isArray(value));
  const row = value as Record<string, unknown>;
  valid((partial || Object.keys(row).length === keys.length) && Object.keys(row).every(key => keys.includes(key)));
  return row;
}
function identifier(value: unknown): asserts value is string {
  valid(typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= 255);
}
function epoch(value: unknown): asserts value is number {
  valid(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799999);
}
function timestamp(value: unknown): asserts value is string {
  valid(typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value));
  const time = Date.parse(value);
  valid(Number.isFinite(time) && new Date(time).toISOString() === value);
}
function byteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4;
  }
  return bytes;
}
function clone(doc: NotificationDocument): NotificationDocument {
  return JSON.parse(JSON.stringify(doc)) as NotificationDocument;
}
function prune(doc: NotificationDocument, now: number) {
  doc.displayed = doc.displayed.filter(row => now - row.displayedAt < retentionMs);
}
function parse(value: unknown, owner: string): NotificationDocument {
  const row = object(value, ['version', 'userId', 'preferences', 'displayed']);
  valid(row.version === 1 && row.userId === owner);
  const preferences = object(row.preferences, preferenceKeys);
  valid(preferenceKeys.every(key => typeof preferences[key] === 'boolean'));
  valid(Array.isArray(row.displayed) && row.displayed.length <= 200);
  const seen = new Set<string>();
  const displayed = row.displayed.map((entry: unknown) => {
    const item = object(entry, ['id', 'displayedAt', 'expiresAt']);
    identifier(item.id);
    epoch(item.displayedAt);
    timestamp(item.expiresAt);
    valid(!seen.has(item.id));
    valid(Date.parse(item.expiresAt) <= item.displayedAt + 2 * maxClockSkewMs);
    seen.add(item.id);
    return { id: item.id, displayedAt: item.displayedAt, expiresAt: item.expiresAt };
  });
  return { version: 1, userId: owner, preferences: preferences as NotificationPreferences, displayed };
}

// Use one instance per account: this writer serializes this instance's changes.
// Stable native IDs handle display-before-storage crashes; this is not exactly-once delivery.
export class NotificationStorage {
  private snapshot: NotificationDocument | null = null;
  private tail: Promise<void> = Promise.resolve();
  private readonly key: string;
  // Keep the first correction while a synchronous dedupe read cannot persist it.
  private readonly corrections = new Map<string, { original: number; corrected: number }>();

  constructor(
    readonly userId: string,
    private readonly storage: NotificationStringStorage,
    private readonly now: () => number = Date.now,
  ) {
    identifier(userId);
    valid(userId === userId.trim());
    this.key = `dsm.notifications.v1:${encodeURIComponent(userId)}`;
  }

  getSnapshot(): NotificationDocument | null { return this.snapshot === null ? null : clone(this.snapshot); }

  load(): Promise<NotificationDocument> {
    return this.enqueue(async () => clone(await this.read()));
  }

  async setPreferences(patch: Partial<NotificationPreferences>): Promise<NotificationDocument> {
    const input = object(patch, preferenceKeys, true);
    valid(Object.values(input).every(value => typeof value === 'boolean'));
    const captured = { ...input } as Partial<NotificationPreferences>;
    return this.update(doc => { Object.assign(doc.preferences, captured); });
  }

  async markDisplayed(id: string, expiresAt: string, remainingMs?: number): Promise<NotificationDocument> {
    identifier(id);
    timestamp(expiresAt);
    if (remainingMs !== undefined) valid(Number.isFinite(remainingMs) && remainingMs >= 0 && remainingMs <= 300_000);
    return this.update((doc, now) => {
      const localExpiry = remainingMs === undefined ? expiresAt : new Date(now + Math.floor(remainingMs)).toISOString();
      valid(Date.parse(localExpiry) <= now + 2 * maxClockSkewMs);
      // Repeated acknowledgements keep their original retention deadline.
      if (!doc.displayed.some(row => row.id === id)) doc.displayed.push({ id, displayedAt: now, expiresAt: localExpiry });
    });
  }

  hasDisplayed(id: string): boolean {
    identifier(id);
    valid(this.snapshot !== null, 'read');
    const now = this.clock();
    const doc = clone(this.snapshot);
    this.normalizeHistory(doc, now);
    return doc.displayed.some(row => row.id === id && now - row.displayedAt < retentionMs);
  }

  private normalizeHistory(doc: NotificationDocument, now: number): boolean {
    let changed = false;
    for (const row of doc.displayed) {
      const prior = this.corrections.get(row.id);
      let displayedAt = prior?.original === row.displayedAt ? prior.corrected : row.displayedAt;
      if (displayedAt > now + maxClockSkewMs) displayedAt = now;
      if (displayedAt === row.displayedAt) continue;
      this.corrections.set(row.id, { original: row.displayedAt, corrected: displayedAt });
      const expiry = Date.parse(row.expiresAt);
      const lifetime = Math.max(0, expiry - row.displayedAt);
      row.expiresAt = new Date(Math.min(expiry, displayedAt + lifetime)).toISOString();
      row.displayedAt = displayedAt;
      changed = true;
    }
    return changed;
  }

  private clock(): number {
    try {
      const now = this.now();
      epoch(now);
      return now;
    } catch { throw new NotificationStorageError('invalid'); }
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async read(): Promise<NotificationDocument> {
    const now = this.clock();
    let doc: NotificationDocument;
    if (this.snapshot !== null) {
      doc = clone(this.snapshot);
    } else {
      let raw: string | null;
      try { raw = await this.storage.getItem(this.key); }
      catch { throw new NotificationStorageError('read'); }
      if (raw === null) {
        doc = { version: 1, userId: this.userId, preferences: { sound: true, vibration: true, foreground: true }, displayed: [] };
      } else {
        try {
          valid(typeof raw === 'string' && byteLength(raw) <= maxBytes);
          doc = parse(JSON.parse(raw) as unknown, this.userId);
        } catch { throw new NotificationStorageError('corrupt'); }
      }
    }
    const corrected = this.normalizeHistory(doc, now);
    prune(doc, now);
    // Persist the corrected retention anchor before publishing it across restarts.
    if (corrected) await this.persist(doc);
    this.snapshot = doc;
    this.corrections.clear();
    return doc;
  }

  private update(mutator: (doc: NotificationDocument, now: number) => void): Promise<NotificationDocument> {
    return this.enqueue(async () => {
      const doc = clone(await this.read());
      const now = this.clock();
      this.normalizeHistory(doc, now);
      prune(doc, now);
      mutator(doc, now);
      valid(doc.displayed.length <= 200, 'limit');
      parse(doc, this.userId);
      await this.persist(doc);
      this.snapshot = doc;
      this.corrections.clear();
      return clone(doc);
    });
  }

  private async persist(doc: NotificationDocument): Promise<void> {
    const raw = JSON.stringify(doc);
    valid(byteLength(raw) <= maxBytes, 'limit');
    try { await this.storage.setItem(this.key, raw); }
    catch { throw new NotificationStorageError('write'); }
  }
}
