import type { SessionControllerPort } from '../auth/session-controller';

export type RealtimeScope = 'scores' | 'rankings' | 'reminders';
export interface RealtimeSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}
export type RealtimeSnapshot = Readonly<{
  status: 'stopped' | 'paused' | 'connecting' | 'authenticating' | 'connected' | 'backoff';
  restFailed: boolean;
}>;
export interface RealtimeClock {
  now(): number;
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}
export interface RealtimeClientDependencies {
  session: SessionControllerPort;
  baseUrl: string;
  socketFactory?: (url: string) => RealtimeSocket;
  // The consumer must also fence its own asynchronous REST results by session.
  onInvalidate(scopes: RealtimeScope[]): Promise<void>;
  clock?: RealtimeClock;
  random?: () => number;
}
const SCOPES: RealtimeScope[] = ['scores', 'rankings', 'reminders'];
const FALLBACK_MS = 60000;
const TIMEOUT_MS = 5000;
type Owner = { epoch: number; userId: string };
type ServerFrame = { event: 'reset' | 'invalidate'; streamId: string; seq: number; scopes: RealtimeScope[] };

function byteLength(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > 4096) break;
  }
  return bytes;
}
function record(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function parseFrame(raw: unknown): ServerFrame | null {
  if (typeof raw !== 'string' || raw.length > 4096 || byteLength(raw) > 4096) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value, ['event', 'data']) || (value.event !== 'reset' && value.event !== 'invalidate')) return null;
    const data = value.data;
    const reset = value.event === 'reset';
    if (!record(data, reset ? ['version', 'streamId', 'seq'] : ['version', 'streamId', 'seq', 'scopes']) ||
      data.version !== 1 || typeof data.streamId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.streamId) ||
      typeof data.seq !== 'number' || !Number.isSafeInteger(data.seq) || data.seq < 0) return null;
    if (reset) return data.seq === 0 ? { event: 'reset', streamId: data.streamId, seq: 0, scopes: [...SCOPES] } : null;
    const scopes = data.scopes;
    if (!Array.isArray(scopes) || scopes.length < 1 || scopes.length > 3 ||
      !scopes.every(scope => SCOPES.includes(scope)) || new Set(scopes).size !== scopes.length) return null;
    return { event: 'invalidate', streamId: data.streamId, seq: data.seq, scopes: scopes as RealtimeScope[] };
  } catch { return null; }
}
function socketUrl(baseUrl: string): string {
  // RN 0.83's URL has no protocol/pathname setters. Keep the configured API
  // prefix verbatim and reject URL components that could carry credentials.
  const match = /^(https?):\/\/((?:[a-z\d.-]+|\[[a-f\d:]+\])(?::(\d{1,5}))?)(\/[^?#]*)?$/i.exec(baseUrl);
  if (!match || /[\\\s@?#]/.test(baseUrl) || (match[3] && (Number(match[3]) < 1 || Number(match[3]) > 65535))) {
    throw new Error('Invalid realtime base URL');
  }
  return `${match[1].toLowerCase() === 'https' ? 'wss' : 'ws'}://${match[2]}${(match[4] ?? '').replace(/\/+$/, '')}/realtime`;
}
function nativeSocket(url: string): RealtimeSocket {
  const native = new WebSocket(url);
  const socket: RealtimeSocket = {
    onopen: null, onmessage: null, onclose: null, onerror: null,
    send: data => native.send(data),
    close: () => {
      native.onopen = null; native.onmessage = null; native.onclose = null; native.onerror = null;
      native.close();
    },
  };
  native.onopen = () => socket.onopen?.();
  native.onmessage = event => socket.onmessage?.({ data: event.data });
  native.onclose = event => socket.onclose?.({ code: event.code ?? 1006 });
  native.onerror = () => socket.onerror?.();
  return socket;
}

/** WebSocket signals only invalidate REST state; no server data is trusted as UI state. */
export class RealtimeClient {
  private readonly url: string;
  private readonly clock: RealtimeClock;
  private readonly listeners = new Set<() => void>();
  private snapshot: RealtimeSnapshot = { status: 'stopped', restFailed: false };
  private started = false;
  private foreground = true;
  private unsubscribe: (() => void) | null = null;
  private owner: Owner | null = null;
  private socket: RealtimeSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline = Infinity;
  private retryAt = Infinity;
  private fallbackAt = Infinity;
  private failures = 0;
  private streamId: string | null = null;
  private sequence = 0;
  private refreshFlight: object | null = null;
  private restFlight: object | null = null;
  private restRetryAt = 0;
  private readonly pending = new Set<RealtimeScope>();

  constructor(private readonly dependencies: RealtimeClientDependencies) {
    this.url = socketUrl(dependencies.baseUrl);
    this.clock = dependencies.clock ?? { now: () => performance.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: timer => clearTimeout(timer) };
  }
  getSnapshot = (): RealtimeSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  start(): void {
    if (this.started) return;
    this.started = true;
    this.unsubscribe = this.dependencies.session.subscribe(() => this.reconcile());
    this.reconcile();
  }
  stop(): void {
    this.started = false;
    this.unsubscribe?.(); this.unsubscribe = null;
    this.resetOwner(); this.publish('stopped', false);
  }
  setForeground(foreground: boolean): void {
    this.foreground = foreground;
    this.reconcile();
  }
  private eligible(): Owner | null {
    if (!this.started || !this.foreground) return null;
    const { state, action } = this.dependencies.session.getSnapshot();
    return state.status === 'authenticated' && (action === 'idle' || action === 'refreshing')
      ? { epoch: this.dependencies.session.getEpoch(), userId: state.userId } : null;
  }
  private current(owner: Owner): boolean {
    const eligible = this.eligible();
    return this.owner === owner && eligible?.epoch === owner.epoch && eligible.userId === owner.userId;
  }
  private reconcile(): void {
    const next = this.eligible();
    if (!next) {
      this.resetOwner(); this.publish(this.started ? 'paused' : 'stopped', false); return;
    }
    if (this.owner?.epoch === next.epoch && this.owner.userId === next.userId) return;
    this.resetOwner(); this.owner = next;
    this.fallbackAt = this.clock.now() + FALLBACK_MS;
    this.publish('paused', false);
    this.connect(next); this.schedule();
  }
  private resetOwner(): void {
    this.owner = null;
    this.detachSocket();
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null; this.retryAt = Infinity; this.fallbackAt = Infinity;
    this.failures = 0; this.pending.clear(); this.restRetryAt = 0;
  }
  private detachSocket(): void {
    const socket = this.socket;
    this.socket = null; this.deadline = Infinity; this.streamId = null; this.sequence = 0;
    if (!socket) return;
    // Native close is asynchronous. Remove all JS listeners before closing.
    socket.onopen = null; socket.onmessage = null; socket.onclose = null; socket.onerror = null;
    try { socket.close(); } catch { /* Already closed native sockets need no further cleanup. */ }
  }
  private connect(owner: Owner): void {
    if (!this.current(owner) || this.socket) return;
    this.retryAt = Infinity;
    if (!this.dependencies.session.getAccessToken()) { this.refresh(owner); return; }
    this.publish('connecting');
    if (!this.current(owner)) return;
    let socket: RealtimeSocket;
    try { socket = (this.dependencies.socketFactory ?? nativeSocket)(this.url); }
    catch { this.backoff(owner); return; }
    this.socket = socket;
    const current = () => this.current(owner) && this.socket === socket;
    this.deadline = this.clock.now() + TIMEOUT_MS;
    let opened = false;
    socket.onopen = () => {
      if (!current() || opened) return;
      opened = true;
      const accessToken = this.dependencies.session.getAccessToken();
      if (!accessToken) { this.detachSocket(); this.refresh(owner); return; }
      const frame = JSON.stringify({ event: 'authenticate', data: { version: 1, accessToken } });
      if (byteLength(frame) > 4096 || !accessToken.trim()) { this.detachSocket(); this.backoff(owner); return; }
      this.publish('authenticating');
      if (!current()) return;
      try { socket.send(frame); } catch { this.detachSocket(); this.backoff(owner); return; }
      this.deadline = this.clock.now() + TIMEOUT_MS; this.schedule();
    };
    socket.onmessage = ({ data }) => {
      if (!current()) return;
      const frame = opened ? parseFrame(data) : null;
      if (!frame || (!this.streamId && frame.event !== 'reset')) { this.detachSocket(); this.backoff(owner); return; }
      if (frame.event === 'reset') {
        this.streamId = frame.streamId; this.sequence = 0; this.deadline = Infinity; this.failures = 0;
        this.publish('connected');
        this.invalidate(owner, SCOPES); this.schedule(); return;
      }
      if (frame.streamId !== this.streamId) { this.invalidate(owner, SCOPES); this.detachSocket(); this.backoff(owner); return; }
      if (frame.seq <= this.sequence) return;
      const scopes = frame.seq === this.sequence + 1 ? frame.scopes : SCOPES;
      this.sequence = frame.seq; this.invalidate(owner, scopes);
    };
    socket.onclose = ({ code }) => {
      if (!current()) return;
      this.detachSocket();
      if (code === 4001 || code === 4010) this.refresh(owner);
      else if (code === 4003) {
        this.backoff(owner);
        if (this.current(owner)) this.dependencies.session.endUnauthorizedSession().catch(() => undefined);
      } else this.backoff(owner);
    };
    socket.onerror = () => { if (current()) { this.detachSocket(); this.backoff(owner); } };
    this.schedule();
  }
  private refresh(owner: Owner): void {
    if (!this.current(owner)) return;
    if (this.refreshFlight) { this.backoff(owner); return; }
    const flight = {}; this.refreshFlight = flight;
    this.publish('backoff'); this.schedule();
    if (!this.current(owner)) { this.refreshFlight = null; return; }
    let operation: Promise<string>;
    try { operation = this.dependencies.session.refreshAccessToken(); }
    catch { operation = Promise.reject(new Error('Refresh failed')); }
    operation.then(() => undefined, () => undefined).then(() => {
      if (this.refreshFlight === flight) this.refreshFlight = null;
      if (this.current(owner)) this.backoff(owner);
    });
  }
  private backoff(owner: Owner): void {
    if (!this.current(owner)) return;
    const base = Math.min(30000, 1000 * 2 ** Math.min(this.failures++, 5));
    const random = (this.dependencies.random ?? Math.random)();
    this.retryAt = this.clock.now() + Math.min(30000, base + base * 0.25 * (Number.isFinite(random) ? Math.max(0, Math.min(1, random)) : 0));
    this.publish('backoff'); this.schedule();
  }
  private invalidate(owner: Owner, scopes: RealtimeScope[]): void {
    if (!this.current(owner)) return;
    scopes.forEach(scope => this.pending.add(scope));
    this.drain(owner);
  }
  private drain(owner: Owner): void {
    if (!this.current(owner) || this.restFlight || !this.pending.size || this.clock.now() < this.restRetryAt) return;
    const scopes = SCOPES.filter(scope => this.pending.has(scope)); this.pending.clear();
    const flight = {}; this.restFlight = flight;
    let operation: Promise<void>;
    try { operation = this.dependencies.onInvalidate(scopes); }
    catch { operation = Promise.reject(new Error('REST refresh failed')); }
    operation.then(() => {
      if (this.current(owner)) this.publish(this.snapshot.status, false);
    }, () => {
      if (this.current(owner)) {
        this.restRetryAt = this.clock.now() + FALLBACK_MS;
        SCOPES.forEach(scope => this.pending.add(scope));
        this.publish(this.snapshot.status, true);
      }
    }).then(() => {
      if (this.restFlight === flight) this.restFlight = null;
      // Pending scopes belong to the current owner; old scopes were cleared on transition.
      if (this.owner) this.drain(this.owner);
    });
  }
  private schedule(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    const owner = this.owner;
    if (!owner || !this.current(owner)) return;
    const next = Math.min(this.deadline, this.retryAt, this.fallbackAt);
    if (!Number.isFinite(next)) return;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      if (!this.current(owner)) { this.reconcile(); return; }
      const now = this.clock.now();
      if (this.fallbackAt <= now) { this.fallbackAt = now + FALLBACK_MS; this.invalidate(owner, SCOPES); }
      if (!this.current(owner)) return;
      if (this.deadline <= now) { this.detachSocket(); this.backoff(owner); }
      else if (this.retryAt <= now) this.connect(owner);
      this.schedule();
    }, Math.max(0, next - this.clock.now()));
  }
  private publish(status: RealtimeSnapshot['status'], restFailed = this.snapshot.restFailed): void {
    if (this.snapshot.status === status && this.snapshot.restFailed === restFailed) return;
    this.snapshot = Object.freeze({ status, restFailed });
    for (const listener of this.listeners) {
      try { listener(); } catch { /* Observers cannot interrupt lifecycle cleanup. */ }
    }
  }
}
