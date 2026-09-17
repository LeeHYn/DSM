import type { SessionControllerPort, SessionSnapshot } from '../auth/session-controller';
import { RealtimeClient, RealtimeSocket } from './realtime-client';

const STREAM = '12345678-1234-4123-8123-123456789abc';
const ALL = ['scores', 'rankings', 'reminders'];
const reset = () => JSON.stringify({ event: 'reset', data: { version: 1, streamId: STREAM, seq: 0 } });
const signal = (seq: number, scopes = ['scores']) => JSON.stringify({ event: 'invalidate', data: { version: 1, streamId: STREAM, seq, scopes } });
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
class Socket implements RealtimeSocket {
  onopen: RealtimeSocket['onopen'] = null;
  onmessage: RealtimeSocket['onmessage'] = null;
  onclose: RealtimeSocket['onclose'] = null;
  onerror: RealtimeSocket['onerror'] = null;
  sent: string[] = [];
  closes = 0;
  send(data: string) { this.sent.push(data); }
  close() { this.closes++; }
  open() { this.onopen?.(); }
  message(data: unknown) { this.onmessage?.({ data }); }
  closed(code = 1006) { this.onclose?.({ code }); }
}
function setup(baseUrl = 'https://api.example.test') {
  let epoch = 1;
  let token: string | null = 'fixture.access';
  let snapshot: SessionSnapshot = { state: { status: 'authenticated', userId: 'A', onboardingCompletedAt: '2026-01-01' }, action: 'idle', error: null };
  const listeners = new Set<() => void>();
  const session = {
    getEpoch: () => epoch, getSnapshot: () => snapshot, getAccessToken: () => token,
    refreshAccessToken: jest.fn(async () => { token = 'rotated.access'; return token; }),
    endUnauthorizedSession: jest.fn(async () => {}),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  } as unknown as SessionControllerPort;
  const sockets: Socket[] = [];
  const urls: string[] = [];
  const onInvalidate = jest.fn(async (_scopes: string[]) => {});
  const client = new RealtimeClient({ session, baseUrl, random: () => 0, onInvalidate, socketFactory: url => {
    urls.push(url); const socket = new Socket(); sockets.push(socket); return socket;
  } });
  return { client, session, sockets, urls, onInvalidate, listeners,
    token: (value: string | null) => { token = value; },
    change: (state: SessionSnapshot['state'], action: SessionSnapshot['action'] = 'idle', advance = true) => {
      if (advance) epoch++; snapshot = { state, action, error: null }; listeners.forEach(listener => listener());
    },
  };
}
describe('authenticated realtime lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps connection timeout bounded when the device wall clock moves backwards', () => {
    const r = setup();
    r.client.start();
    jest.setSystemTime(Date.now() - 3_600_000);
    jest.advanceTimersByTime(5000);
    expect(r.sockets[0].closes).toBe(1);
    expect(r.client.getSnapshot().status).toBe('backoff');
    r.client.stop();
  });

  it('opens once and sends the current token only in the first authentication frame', () => {
    const r = setup(); r.client.start(); r.client.start();
    expect(r.urls).toEqual(['wss://api.example.test/realtime']);
    expect(r.sockets[0].sent).toEqual([]);
    r.token('latest.access'); r.sockets[0].open(); r.sockets[0].open();
    expect(r.sockets[0].sent).toEqual([JSON.stringify({ event: 'authenticate', data: { version: 1, accessToken: 'latest.access' } })]);
    expect(JSON.stringify(r.client.getSnapshot())).not.toContain('access');
    r.client.stop(); expect(r.listeners.size).toBe(0); expect(jest.getTimerCount()).toBe(0);
  });
  it.each(['https://user:secret@api.test', 'https://api.test?token=secret', 'https://api.test#secret', 'file:///tmp', 'wss://api.test', 'https://api.test\\@other.test', 'https://api.test/a b', 'https://api.test:99999'])('rejects unsafe API base %s', url => {
    expect(() => setup(url)).toThrow('Invalid realtime base URL');
  });
  it('does not depend on writable URL properties absent from native RN URL', () => {
    const original = global.URL;
    global.URL = class { constructor() { throw new Error('URL is unavailable'); } } as unknown as typeof URL;
    try { const r = setup(); r.client.start(); expect(r.urls).toEqual(['wss://api.example.test/realtime']); r.client.stop(); }
    finally { global.URL = original; }
  });
  it('adapts default native socket events and detaches native handlers on stop', async () => {
    const original = global.WebSocket;
    const native = new Socket();
    global.WebSocket = jest.fn(() => native) as unknown as typeof WebSocket;
    const r = setup();
    const client = new RealtimeClient({ session: r.session, baseUrl: 'https://api.test', onInvalidate: r.onInvalidate });
    try {
      client.start(); native.open(); native.message(reset()); await settle();
      expect(r.onInvalidate).toHaveBeenCalledWith(ALL); client.stop();
      expect(native.onmessage).toBeNull(); expect(native.onclose).toBeNull(); expect(native.closes).toBe(1);
    } finally { client.stop(); global.WebSocket = original; }
  });
  it('preserves API path prefixes and converts local HTTP', () => {
    const r = setup('http://127.0.0.1:3000/api/'); r.client.start();
    expect(r.urls).toEqual(['ws://127.0.0.1:3000/api/realtime']); r.client.stop();
  });
  it('converges on reset/gap, ignores duplicate or reversed sequence and coalesces pending scopes', async () => {
    const r = setup(); const first = deferred(); r.onInvalidate.mockReturnValueOnce(first.promise);
    r.client.start(); const socket = r.sockets[0]; socket.open(); socket.message(reset());
    socket.message(signal(1)); socket.message(signal(1)); socket.message(signal(0)); socket.message(signal(2, ['rankings']));
    expect(r.onInvalidate).toHaveBeenCalledTimes(1);
    first.resolve(); await settle(); expect(r.onInvalidate.mock.calls[1][0]).toEqual(['scores', 'rankings']);
    socket.message(signal(4, ['reminders'])); await settle();
    expect(r.onInvalidate.mock.calls[2][0]).toEqual(ALL);
    socket.message(signal(3)); await settle(); expect(r.onInvalidate).toHaveBeenCalledTimes(3);
    r.client.stop();
  });
  it.each([
    '{', new ArrayBuffer(8), ' '.repeat(4097), '가'.repeat(1400),
    JSON.stringify({ event: 'reset', data: { version: 2, streamId: STREAM, seq: 0 } }),
    JSON.stringify({ event: 'reset', data: { version: 1, streamId: 'invalid', seq: 0 } }),
    JSON.stringify({ event: 'reset', data: { version: 1, streamId: STREAM, seq: 1 } }),
    signal(1, []), signal(1, ['scores', 'scores']), signal(1, ['private']), signal(1.5), signal(Number.MAX_SAFE_INTEGER + 1),
    JSON.stringify({ event: 'invalidate', data: { version: 1, streamId: STREAM, seq: 1, scopes: ['scores'], userId: 'other' } }),
  ])('rejects malformed or oversized server data %#', async raw => {
    const r = setup(); r.client.start(); r.sockets[0].open(); r.sockets[0].message(raw); await settle();
    expect(r.onInvalidate).not.toHaveBeenCalled(); expect(r.sockets[0].closes).toBe(1);
    expect(r.client.getSnapshot().status).toBe('backoff'); r.client.stop();
  });
  it('pauses immediately, detaches late callbacks, and fences old account signals', async () => {
    const r = setup(); r.client.start(); const old = r.sockets[0]; old.open();
    const late = old.onmessage!; const lateOpen = old.onopen!;
    r.change({ status: 'authenticated', userId: 'B', onboardingCompletedAt: '2026-01-01' });
    expect(old.closes).toBe(1); expect(old.onmessage).toBeNull(); late({ data: reset() }); lateOpen();
    expect(r.onInvalidate).not.toHaveBeenCalled(); expect(old.sent).toHaveLength(1);
    r.client.setForeground(false); expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(120000); expect(r.sockets).toHaveLength(2);
    r.client.setForeground(true); expect(r.sockets).toHaveLength(3);
    r.change({ status: 'offline', retry: 'bootstrap' }); expect(r.sockets[2].closes).toBe(1); r.client.stop(); await settle();
  });
  it('stays connected through refresh but closes as soon as logout starts', () => {
    const r = setup(); r.client.start();
    const state = r.session.getSnapshot().state;
    r.change(state, 'refreshing', false); expect(r.sockets).toHaveLength(1); expect(r.sockets[0].closes).toBe(0);
    r.change(state, 'logging-out', false); expect(r.sockets[0].closes).toBe(1); expect(jest.getTimerCount()).toBe(0); r.client.stop();
  });
  it('recovers silent connection and reset timeouts with only one timer', () => {
    const r = setup(); r.client.start(); expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(5000); expect(r.sockets[0].closes).toBe(1);
    jest.advanceTimersByTime(999); expect(r.sockets).toHaveLength(1);
    jest.advanceTimersByTime(1); r.sockets[1].open();
    jest.advanceTimersByTime(5000); expect(r.sockets[1].closes).toBe(1); expect(jest.getTimerCount()).toBe(1); r.client.stop();
  });
  it.each([4001, 4010])('refreshes once on auth close %s and ignores duplicate close/error', async code => {
    const r = setup(); const wait = deferred();
    jest.mocked(r.session.refreshAccessToken).mockImplementation(async () => { await wait.promise; r.token('new.access'); return 'new.access'; });
    r.client.start(); const socket = r.sockets[0]; socket.open(); const close = socket.onclose!; const error = socket.onerror!;
    close({ code }); close({ code }); error();
    expect(r.session.refreshAccessToken).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(30000); expect(r.sockets).toHaveLength(1);
    wait.resolve(); await settle(); jest.advanceTimersByTime(1000);
    expect(r.sockets).toHaveLength(2); r.sockets[1].open(); expect(r.sockets[1].sent[0]).toContain('new.access'); r.client.stop();
  });
  it('refreshes missing tokens before connection and fences late refresh after stop', async () => {
    const r = setup(); const wait = deferred(); r.token(null);
    jest.mocked(r.session.refreshAccessToken).mockImplementation(async () => { await wait.promise; return 'late.access'; });
    r.client.start(); expect(r.sockets).toHaveLength(0); expect(r.session.refreshAccessToken).toHaveBeenCalledTimes(1);
    r.client.stop(); wait.resolve(); await settle(); jest.advanceTimersByTime(120000);
    expect(r.sockets).toHaveLength(0); expect(jest.getTimerCount()).toBe(0);
  });
  it('runs foreground REST fallback despite socket loss without retrying failed callbacks in a loop', async () => {
    const r = setup(); r.onInvalidate.mockRejectedValue(new Error('offline'));
    r.client.start(); r.sockets[0].open(); r.sockets[0].message(reset()); await settle();
    for (let seq = 1; seq <= 100; seq++) r.sockets[0].message(signal(seq));
    await settle(); expect(r.onInvalidate).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60000); await settle(); expect(r.onInvalidate).toHaveBeenCalledTimes(2);
    expect(r.onInvalidate.mock.calls[1][0]).toEqual(ALL); r.client.stop();
  });
  it('does not let old REST completion publish failure or drain old scopes into a new account', async () => {
    const r = setup(); const wait = deferred(); r.onInvalidate.mockReturnValueOnce(wait.promise);
    r.client.start(); r.sockets[0].open(); r.sockets[0].message(reset()); r.sockets[0].message(signal(1));
    r.change({ status: 'authenticated', userId: 'B', onboardingCompletedAt: '2026-01-01' });
    wait.resolve(); await settle(); expect(r.onInvalidate).toHaveBeenCalledTimes(1);
    r.sockets[1].open(); r.sockets[1].message(reset()); await settle(); expect(r.onInvalidate).toHaveBeenCalledTimes(2); r.client.stop();
  });
  it('ends only the current revoked session and isolates throwing subscribers', async () => {
    const r = setup(); const listener = jest.fn(() => { throw new Error('observer'); });
    r.client.subscribe(listener); r.client.start(); r.sockets[0].closed(4003); await settle();
    expect(r.session.endUnauthorizedSession).toHaveBeenCalledTimes(1); expect(listener).toHaveBeenCalled(); r.client.stop();
  });
  it('bounds repeated failures to 1–30 second retries and converges after reconnect', async () => {
    const r = setup(); r.client.start();
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const count = r.sockets.length; r.sockets[count - 1].closed();
      jest.advanceTimersByTime(delay - 1); expect(r.sockets).toHaveLength(count);
      jest.advanceTimersByTime(1); expect(r.sockets).toHaveLength(count + 1); expect(jest.getTimerCount()).toBe(1);
    }
    const socket = r.sockets[r.sockets.length - 1]; socket.open(); socket.message(reset()); await settle();
    expect(r.onInvalidate).toHaveBeenLastCalledWith(ALL); socket.closed();
    const count = r.sockets.length; jest.advanceTimersByTime(1000); expect(r.sockets).toHaveLength(count + 1); r.client.stop();
  });
  it('clears REST error state on account transition', async () => {
    const r = setup(); r.onInvalidate.mockRejectedValueOnce(new Error('offline'));
    r.client.start(); r.sockets[0].open(); r.sockets[0].message(reset()); await settle();
    expect(r.client.getSnapshot().restFailed).toBe(true);
    r.change({ status: 'authenticated', userId: 'B', onboardingCompletedAt: '2026-01-01' });
    expect(r.client.getSnapshot().restFailed).toBe(false); r.client.stop();
  });
});
