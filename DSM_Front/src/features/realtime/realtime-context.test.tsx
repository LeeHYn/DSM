import React, { useSyncExternalStore } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react-native';
import { AppState, Text, type AppStateStatus } from 'react-native';
import type { SessionControllerPort, SessionSnapshot } from '../auth/session-controller';
import { ProductStore } from '../product/product-store';
import type { ProductApi } from '../product/product-api';
import { ApiError } from '../../lib/api/api-error';
import { RealtimeClient, type RealtimeScope, type RealtimeSocket } from './realtime-client';
import { RealtimeProvider, useRealtime, type RealtimeFactory } from './realtime-context';

let mockStore: ProductStore;
let mockSession: SessionSnapshot & { epoch: number };
let mockNotifications: { controller: { sync: jest.Mock<Promise<boolean>, [boolean]> } | null };
jest.mock('../auth/session-context', () => ({ useSession: () => mockSession }));
jest.mock('../notifications/notification-context', () => ({ useNotifications: () => mockNotifications }));
const STREAM = '12345678-1234-4123-8123-123456789abc';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { resolve, promise };
}
class Socket implements RealtimeSocket {
  onopen: RealtimeSocket['onopen'] = null;
  onmessage: RealtimeSocket['onmessage'] = null;
  onclose: RealtimeSocket['onclose'] = null;
  onerror: RealtimeSocket['onerror'] = null;
  closes = 0;
  send(_data: string) {}
  close() { this.closes++; }
  reset() {
    this.onopen?.();
    this.onmessage?.({ data: JSON.stringify({ event: 'reset', data: { version: 1, streamId: STREAM, seq: 0 } }) });
  }
}
function setup() {
  const api = {
    score: jest.fn(async () => null),
    summary: jest.fn(async () => ({ totalScore: 123, tier: 'BRONZE' as const })),
    ranking: jest.fn(async () => ({ period: 'DAILY' as const, score: 123, rank: 1, percentile: 100, totalUsers: 1 })),
    leaderboard: jest.fn(async () => []),
  } as unknown as jest.Mocked<ProductApi>;
  mockStore = new ProductStore(api, 'A', '2026-09-04');
  mockSession = { state: { status: 'authenticated', userId: 'A', onboardingCompletedAt: '2026-01-01' }, epoch: 1, action: 'idle', error: null };
  mockNotifications = { controller: { sync: jest.fn(async (_foreground: boolean): Promise<boolean> => true) } };
  const sessionListeners = new Set<() => void>();
  const session = {
    getSnapshot: () => mockSession, getEpoch: () => mockSession.epoch,
    getAccessToken: () => 'fixture.access', refreshAccessToken: async () => 'fixture.access',
    subscribe: (listener: () => void) => { sessionListeners.add(listener); return () => { sessionListeners.delete(listener); }; },
  } as unknown as SessionControllerPort;
  const sockets: Socket[] = [];
  const callbacks: ((scopes: RealtimeScope[]) => Promise<void>)[] = [];
  const clients: RealtimeClient[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const factory: jest.MockedFunction<RealtimeFactory> = jest.fn(onInvalidate => {
    callbacks.push(onInvalidate);
    const client = new RealtimeClient({ session, baseUrl: 'https://api.test', onInvalidate,
      clock: { now: () => Date.now(), setTimeout: (callback, delay) => {
        const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay); timers.add(timer); return timer;
      }, clearTimeout: timer => { timers.delete(timer); clearTimeout(timer); } },
      random: () => 0, socketFactory: () => { const socket = new Socket(); sockets.push(socket); return socket; } });
    clients.push(client);
    return { session, client };
  });
  return { api, factory, sockets, callbacks, clients, sessionListeners, timers };
}
function Probe() {
  const realtime = useRealtime();
  const snapshot = useSyncExternalStore(mockStore.subscribe, mockStore.getSnapshot);
  return <Text>{realtime ? `${realtime.status}:${snapshot.summary.data?.totalScore ?? 'empty'}:${realtime.restFailed}` : 'no-provider'}</Text>;
}
describe('RealtimeProvider', () => {
  let appListeners: Set<(state: AppStateStatus) => void>;
  let originalState: PropertyDescriptor | undefined;
  beforeEach(() => {
    jest.useFakeTimers(); appListeners = new Set();
    originalState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appListeners.add(listener); return { remove: () => { appListeners.delete(listener); } };
    });
  });
  afterEach(async () => {
    await cleanup(); jest.restoreAllMocks();
    if (originalState) Object.defineProperty(AppState, 'currentState', originalState);
    jest.useRealTimers();
  });
  async function foreground(state: AppStateStatus) {
    await act(() => {
      Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
      appListeners.forEach(listener => listener(state));
    });
  }
  test('keeps useRealtime optional outside the provider', async () => {
    setup(); await render(<Probe />); expect(screen.getByText('no-provider')).toBeOnTheScreen();
  });
  test('connects foreground only and cleans up subscriptions and native sockets on unmount', async () => {
    const r = setup(); await foreground('background');
    const view = await render(<RealtimeProvider store={mockStore} factory={r.factory}><Probe /></RealtimeProvider>);
    expect(r.sockets).toHaveLength(0); expect(screen.getByText('paused:empty:false')).toBeOnTheScreen();
    await foreground('active'); expect(r.sockets).toHaveLength(1);
    await act(async () => { r.sockets[0].reset(); });
    expect(screen.getByText('connected:123:false')).toBeOnTheScreen();
    expect(mockNotifications.controller?.sync).toHaveBeenCalledWith(true);
    await foreground('inactive'); expect(r.sockets[0].closes).toBe(1);
    const late = r.callbacks[0]; await act(() => late(['scores', 'reminders'])); expect(r.api.summary).toHaveBeenCalledTimes(1);
    await foreground('active'); expect(r.sockets).toHaveLength(2);
    await view.unmount(); expect(r.sockets[1].closes).toBe(1); expect(r.sessionListeners.size).toBe(0); expect(appListeners.size).toBe(0);
    expect(r.timers.size).toBe(0);
  });
  test('does not recreate the socket for notification controller or ordinary context updates', async () => {
    const r = setup(); const view = await render(<RealtimeProvider store={mockStore} factory={r.factory}><Probe /></RealtimeProvider>);
    const next = { sync: jest.fn(async (_foreground: boolean) => true) }; mockNotifications = { controller: next };
    await view.rerender(<RealtimeProvider store={mockStore} factory={r.factory}><Probe /></RealtimeProvider>);
    expect(r.factory).toHaveBeenCalledTimes(1);
    await act(() => r.callbacks[0](['reminders'])); expect(next.sync).toHaveBeenCalledWith(true);
    expect(r.api.summary).not.toHaveBeenCalled();
  });
  test('does not call a new account notification controller after an old product refresh finishes', async () => {
    const r = setup(); const oldStore = mockStore; const pending = deferred();
    jest.spyOn(oldStore, 'applyRealtime').mockReturnValueOnce(pending.promise);
    const oldNotifications = mockNotifications.controller!;
    const view = await render(<RealtimeProvider store={mockStore} factory={r.factory}><Probe /></RealtimeProvider>);
    let operation!: Promise<void>;
    await act(() => { operation = r.callbacks[0](['scores', 'reminders']); });
    mockSession = { ...mockSession, epoch: 2, state: { status: 'authenticated', userId: 'B', onboardingCompletedAt: '2026-01-01' } };
    mockStore = new ProductStore(r.api, 'B', '2026-09-04');
    const nextNotifications = { sync: jest.fn(async (_foreground: boolean) => true) }; mockNotifications = { controller: nextNotifications };
    await view.rerender(<RealtimeProvider store={mockStore} factory={r.factory}><Probe /></RealtimeProvider>);
    await act(async () => { pending.resolve(); await operation; });
    expect(oldNotifications.sync).not.toHaveBeenCalled(); expect(nextNotifications.sync).not.toHaveBeenCalled();
    await act(() => r.callbacks[0](['reminders'])); expect(nextNotifications.sync).not.toHaveBeenCalled();
    expect(r.sockets[0].closes).toBe(1); expect(r.sockets).toHaveLength(2);
  });
  test.each(['logging-out', 'deleting-account', 'signing-in'] as const)('fences %s before native notifications run', async action => {
    const r = setup(); await render(<RealtimeProvider store={mockStore} factory={r.factory}><Probe /></RealtimeProvider>);
    mockSession = { ...mockSession, action };
    await act(() => r.callbacks[0](['scores', 'reminders']));
    expect(r.api.summary).not.toHaveBeenCalled(); expect(mockNotifications.controller?.sync).not.toHaveBeenCalled();
  });
  test('ignores late store completion after unmount and same-owner notification replacement', async () => {
    const r = setup(); const pending = deferred(); jest.spyOn(mockStore, 'applyRealtime').mockReturnValueOnce(pending.promise);
    const view = await render(<RealtimeProvider store={mockStore} factory={r.factory}><Probe /></RealtimeProvider>);
    let operation!: Promise<void>; await act(() => { operation = r.callbacks[0](['scores', 'reminders']); });
    mockNotifications = { controller: { sync: jest.fn(async (_foreground: boolean): Promise<boolean> => true) } };
    await view.rerender(<RealtimeProvider store={mockStore} factory={r.factory}><Probe /></RealtimeProvider>);
    await act(async () => { pending.resolve(); await operation; }); expect(mockNotifications.controller!.sync).not.toHaveBeenCalled();
    await view.unmount(); await act(() => r.callbacks[0](['reminders'])); expect(mockNotifications.controller!.sync).not.toHaveBeenCalled();
  });
  test('reports REST resource failure without leaking details and retains rendered cached data', async () => {
    const r = setup(); const view = await render(<RealtimeProvider store={mockStore} factory={r.factory}><Probe /></RealtimeProvider>);
    await act(async () => { r.sockets[0].reset(); });
    r.api.summary.mockRejectedValueOnce(new ApiError('network', 'private secret'));
    await act(async () => { jest.advanceTimersByTime(60000); });
    expect(screen.getByText('connected:123:true')).toBeOnTheScreen();
    await act(async () => { jest.advanceTimersByTime(60000); });
    expect(screen.getByText('connected:123:false')).toBeOnTheScreen(); await view.unmount();
  });
  test('survives StrictMode reconnect without retaining discarded clients', async () => {
    const r = setup(); const view = await render(<React.StrictMode><RealtimeProvider store={mockStore} factory={r.factory}><Probe /></RealtimeProvider></React.StrictMode>);
    expect(r.sockets.filter(socket => socket.closes === 0)).toHaveLength(1);
    expect(r.sessionListeners.size).toBe(1); expect(appListeners.size).toBe(1);
    await view.unmount(); expect(r.sockets.every(socket => socket.closes === 1)).toBe(true); expect(r.timers.size).toBe(0);
  });
  test('contains factory setup errors while keeping children visible', async () => {
    setup(); const factory: RealtimeFactory = () => { throw new Error('private config'); };
    await render(<RealtimeProvider store={mockStore} factory={factory}><Probe /></RealtimeProvider>);
    expect(screen.getByText('backoff:empty:true')).toBeOnTheScreen();
  });
});
