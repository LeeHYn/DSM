import { ApiError } from '../../lib/api/api-error';

export type LocalUser = { userId: string; onboardingCompletedAt: string };
type Grant = LocalUser & { refreshToken: string; validUntil: string };
type Envelope = { version: 1; grant: Grant | null; pendingRevocations: string[] };
export interface SecureSessionStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}
const lifetimeMs = 30 * 24 * 60 * 60 * 1000;
const fail = () => new ApiError('storage', 'Local session storage failed');
function token(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 8192 && !/\s/.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function date(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function user(value: unknown): value is LocalUser {
  return record(value) && typeof value.userId === 'string' &&
    value.userId.length > 0 && value.userId.length <= 128 &&
    value.userId.trim() === value.userId && date(value.onboardingCompletedAt);
}
function decode(raw: string | null): Envelope {
  if (raw === null) return { version: 1, grant: null, pendingRevocations: [] };
  // All secret fields are ASCII tokens/UUIDs. A conservative code-unit bound
  // also bounds UTF-8 bytes without relying on an RN TextEncoder polyfill.
  if (raw.length > 32768) throw fail();
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.version !== 1 ||
    Object.keys(value).some(key => !['version', 'grant', 'pendingRevocations'].includes(key)) ||
    !Array.isArray(value.pendingRevocations) || value.pendingRevocations.length > 10 ||
    !value.pendingRevocations.every(token) ||
    new Set(value.pendingRevocations).size !== value.pendingRevocations.length) throw fail();
  const grant = value.grant;
  if (grant !== null && (!record(grant) ||
    !token(grant.refreshToken) || !date(grant.validUntil) || !user(grant))) throw fail();
  return value as unknown as Envelope;
}

export class LocalSessionStore {
  private tail: Promise<unknown> = Promise.resolve();
  private draining: Promise<void> | null = null;
  constructor(
    private readonly storage: SecureSessionStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation).catch(() => { throw fail(); });
    this.tail = result.catch(() => undefined);
    return result;
  }
  private async read(): Promise<Envelope> { return decode(await this.storage.read()); }
  private async write(value: Envelope) {
    const encoded = JSON.stringify(value);
    decode(encoded);
    await this.storage.write(encoded);
  }

  readGrant(refreshToken: string): Promise<LocalUser | null> {
    return this.serial(async () => {
      const { grant } = await this.read();
      if (!grant || grant.refreshToken !== refreshToken ||
        Date.parse(grant.validUntil) <= this.now().getTime()) return null;
      return { userId: grant.userId, onboardingCompletedAt: grant.onboardingCompletedAt };
    });
  }

  saveGrant(currentUser: LocalUser, refreshToken: string, isCurrent: () => boolean): Promise<boolean> {
    return this.serial(async () => {
      if (!isCurrent()) return false;
      if (!user(currentUser) || !token(refreshToken)) throw fail();
      const value = await this.read();
      if (!isCurrent()) return false;
      value.grant = {
        userId: currentUser.userId, onboardingCompletedAt: currentUser.onboardingCompletedAt,
        refreshToken, validUntil: new Date(this.now().getTime() + lifetimeMs).toISOString(),
      };
      await this.write(value);
      return isCurrent();
    });
  }

  invalidateGrant(isCurrent: () => boolean = () => true): Promise<void> {
    return this.serial(async () => {
      if (!isCurrent()) return;
      const value = await this.read();
      if (!isCurrent()) return;
      if (value.grant === null) return;
      value.grant = null;
      await this.write(value);
    });
  }

  deferRevocation(refreshToken: string, isCurrent: () => boolean): Promise<boolean> {
    return this.serial(async () => {
      if (!isCurrent()) return false;
      if (!token(refreshToken)) throw fail();
      const value = await this.read();
      if (!isCurrent()) return false;
      if (!value.pendingRevocations.includes(refreshToken)) value.pendingRevocations.push(refreshToken);
      value.grant = null;
      await this.write(value);
      return isCurrent();
    });
  }

  drainRevocations(revoke: (refreshToken: string) => Promise<void>): Promise<void> {
    if (this.draining) return this.draining;
    const operation = this.drain(revoke);
    this.draining = operation;
    void operation.finally(() => {
      if (this.draining === operation) this.draining = null;
    }).catch(() => undefined);
    return operation;
  }

  private async drain(revoke: (refreshToken: string) => Promise<void>): Promise<void> {
    const pending = await this.serial(async () => (await this.read()).pendingRevocations);
    for (const refreshToken of pending) {
      try { await revoke(refreshToken); } catch { continue; }
      await this.serial(async () => {
        const value = await this.read();
        value.pendingRevocations = value.pendingRevocations.filter(item => item !== refreshToken);
        await this.write(value);
      });
    }
  }
}
