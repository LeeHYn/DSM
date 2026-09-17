import React, { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useSession } from '../auth/session-context';
import type { SessionControllerPort } from '../auth/session-controller';
import { useNotifications } from '../notifications/notification-context';
import type { ProductStore } from '../product/product-store';
import { RealtimeClient, type RealtimeScope, type RealtimeSnapshot } from './realtime-client';

type ClientPort = Pick<RealtimeClient, 'start' | 'stop' | 'setForeground' | 'subscribe' | 'getSnapshot'>;
export type RealtimeFactory = (onInvalidate: (scopes: RealtimeScope[]) => Promise<void>) => {
  session: SessionControllerPort;
  client: ClientPort;
};
const createNativeClient: RealtimeFactory = onInvalidate => {
  // Share the credential writer already used by the app and headless tasks.
  const native: typeof import('../auth/session-runtime') = require('../auth/session-runtime');
  const config: typeof import('../../config/api-config') = require('../../config/api-config');
  const session = native.getSessionRuntime().controller;
  return { session, client: new RealtimeClient({ session, baseUrl: config.getApiBaseUrl(), onInvalidate }) };
};
const paused: RealtimeSnapshot = Object.freeze({ status: 'paused', restFailed: false });
const Context = createContext<RealtimeSnapshot | null>(null);

export function RealtimeProvider({ children, store, factory = createNativeClient }: PropsWithChildren<{ store: ProductStore; factory?: RealtimeFactory }>) {
  const { state, action, epoch } = useSession();
  const notifications = useNotifications();
  const userId = state.status === 'authenticated' ? state.userId : null;
  const eligible = userId === store.userId && (action === 'idle' || action === 'refreshing');
  const notificationRef = useRef(notifications?.controller);
  notificationRef.current = notifications?.controller;
  const renderRef = useRef({ store, epoch, eligible });
  renderRef.current = { store, epoch, eligible };
  const [observed, setObserved] = useState<{ store: ProductStore; epoch: number; snapshot: RealtimeSnapshot } | null>(null);

  useEffect(() => {
    if (!eligible || !userId) return;
    let active = true;
    let foreground = AppState.currentState === 'active';
    let session: SessionControllerPort | null = null;
    let client: ClientPort | null = null;
    let unsubscribe: (() => void) | undefined;
    let appSubscription: ReturnType<typeof AppState.addEventListener> | undefined;
    const mounted = () => active && renderRef.current.store === store && renderRef.current.epoch === epoch;
    const current = () => {
      if (!mounted() || !foreground || !renderRef.current.eligible || !session) return false;
      const live = session.getSnapshot();
      return session.getEpoch() === epoch && live.state.status === 'authenticated' && live.state.userId === userId &&
        (live.action === 'idle' || live.action === 'refreshing');
    };
    const onInvalidate = async (scopes: RealtimeScope[]) => {
      if (!current()) return;
      // Capture before awaiting product REST: replacement controllers may belong
      // to another session even when React has not run this effect's cleanup.
      const notification = notificationRef.current;
      const metrics = scopes.filter(scope => scope === 'scores' || scope === 'rankings');
      let failed = false;
      if (metrics.length) {
        try { await store.applyRealtime(metrics); } catch { failed = true; }
        if (!current()) return;
        const snapshot = store.getSnapshot();
        failed ||= (metrics.includes('scores') && (snapshot.score.status === 'error' || snapshot.summary.status === 'error')) ||
          (metrics.includes('rankings') && (snapshot.ranking.status === 'error' || snapshot.leaderboard.status === 'error'));
      }
      if (scopes.includes('reminders') && notification && notificationRef.current === notification && current()) {
        try {
          const success = await notification.sync(true);
          if (notificationRef.current === notification && !success) failed = true;
        } catch { failed = true; }
      }
      if (current() && failed) throw new Error('Realtime REST refresh failed');
    };
    try {
      const binding = factory(onInvalidate);
      session = binding.session; client = binding.client;
      const observe = () => {
        if (mounted() && client) setObserved({ store, epoch, snapshot: client.getSnapshot() });
      };
      unsubscribe = client.subscribe(observe);
      client.setForeground(foreground);
      client.start();
      observe();
      appSubscription = AppState.addEventListener('change', next => {
        foreground = next === 'active';
        if (mounted()) client?.setForeground(foreground);
      });
    } catch {
      unsubscribe?.(); client?.stop();
      if (mounted()) setObserved({ store, epoch, snapshot: { status: 'backoff', restFailed: true } });
    }
    return () => {
      active = false;
      appSubscription?.remove(); unsubscribe?.(); client?.stop();
    };
  }, [factory, store, epoch, userId, eligible]);

  const snapshot = eligible && observed?.store === store && observed.epoch === epoch ? observed.snapshot : paused;
  return <Context.Provider value={snapshot}>{children}</Context.Provider>;
}

export function useRealtime(): RealtimeSnapshot | null { return useContext(Context); }
