import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { useSession } from '../auth/session-context';
import type { NotificationController } from './notification-controller';
import type { DueReminder } from './notification-api';
import type { NotificationRuntime, NotificationRuntimeSnapshot } from './notification-runtime';

type RuntimeView = Pick<NotificationRuntime, 'getSnapshot' | 'subscribe' | 'refresh'>;
type SubscribeForeground = (onReminder: (reminder: DueReminder) => void, onTap: (data: unknown) => void) => () => void;
type Value = {
  controller: NotificationController | null;
  error: string | null;
  reminder: DueReminder | null;
  tap: unknown;
  dismissReminder(): void;
  clearTap(expected?: unknown): void;
  retry(): Promise<boolean>;
};
const Context = createContext<Value | null>(null);
const emptySnapshot: NotificationRuntimeSnapshot = Object.freeze({ controller: null, notification: null, transitioning: false, error: null });
const emptySubscribe = () => () => {};
const emptyRead = () => emptySnapshot;
export function NotificationProvider({ children, runtime: injectedRuntime, subscribeForeground }: PropsWithChildren<{ runtime?: RuntimeView; subscribeForeground?: SubscribeForeground }>) {
  const session = useSession();
  const owner = session.state.status === 'authenticated' ? `${session.state.userId}:${session.epoch}` : null;
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const [runtime, setRuntime] = useState<RuntimeView | null>(injectedRuntime ?? null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ owner: string; reminder: DueReminder } | null>(null);
  const [tap, setTap] = useState<unknown>(null);
  const snapshot = useSyncExternalStore(runtime?.subscribe ?? emptySubscribe, runtime?.getSnapshot ?? emptyRead, emptyRead);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    try {
      const native: typeof import('./notification-runtime-native') | null = injectedRuntime && subscribeForeground ? null : require('./notification-runtime-native');
      setRuntime(injectedRuntime ?? native!.getNotificationRuntime());
      setSetupError(null);
      unsubscribe = (subscribeForeground ?? native!.startForegroundNotifications)(reminder => {
        const currentOwner = ownerRef.current;
        if (active && currentOwner) setNotice({ owner: currentOwner, reminder });
      }, data => { if (active) setTap(data); });
    } catch {
      setSetupError('알림 연결을 준비하지 못했습니다. 앱을 다시 열어 주세요.');
    }
    return () => { active = false; unsubscribe?.(); };
  }, [injectedRuntime, subscribeForeground]);
  const dismissReminder = useCallback(() => setNotice(null), []);
  const clearTap = useCallback((expected?: unknown) => setTap((current: unknown) => expected === undefined || current === expected ? null : current), []);
  const retry = useCallback(() => runtime?.refresh(true) ?? Promise.resolve(false), [runtime]);
  const value = useMemo<Value>(() => ({
    controller: owner ? snapshot.controller : null,
    error: setupError ?? snapshot.error,
    reminder: notice?.owner === owner ? notice.reminder : null,
    tap, dismissReminder, clearTap, retry,
  }), [owner, snapshot, setupError, notice, tap, dismissReminder, clearTap, retry]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNotifications(): Value | null { return useContext(Context); }
