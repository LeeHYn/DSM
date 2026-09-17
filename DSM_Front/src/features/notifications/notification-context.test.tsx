import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { NotificationProvider, useNotifications } from './notification-context';
import type { DueReminder } from './notification-api';
import type { NotificationRuntimeSnapshot } from './notification-runtime';
let mockSession = { state: { status: 'authenticated', userId: 'owner-a' }, epoch: 1 };
jest.mock('../auth/session-context', () => ({ useSession: () => mockSession }));
const reminder: DueReminder = { id: 'r', taskId: 't', title: '일정', startAt: '2026-09-11T12:00:00.000Z', expiresAt: '2026-09-11T12:05:00.000Z' };
function Probe() {
  const value = useNotifications();
  return <><Text>{value?.reminder?.title ?? 'no reminder'}</Text><Text>{value?.error ?? 'no error'}</Text><Text>{value?.tap ? 'has tap' : 'no tap'}</Text></>;
}
function fixture() {
  let snapshot: NotificationRuntimeSnapshot = { controller: null, notification: null, transitioning: false, error: null };
  const listeners = new Set<() => void>();
  const runtime = { getSnapshot: () => snapshot, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, refresh: jest.fn(async () => true) };
  let onReminder!: (value: DueReminder) => void;
  let onTap!: (value: unknown) => void;
  const unsubscribe = jest.fn();
  const subscribeForeground = jest.fn((a: typeof onReminder, b: typeof onTap) => { onReminder = a; onTap = b; return unsubscribe; });
  return { runtime, subscribeForeground, unsubscribe, remind: () => onReminder(reminder), tap: () => onTap({ type: 'TASK_REMINDER' }),
    emit(error: string) { snapshot = { ...snapshot, error }; listeners.forEach(fn => fn()); } };
}
beforeEach(() => { mockSession = { state: { status: 'authenticated', userId: 'owner-a' }, epoch: 1 }; });
test('subscribes to runtime and foreground lifecycle, then cleans up observers', async () => {
  const f = fixture(); const view = await render(<NotificationProvider runtime={f.runtime} subscribeForeground={f.subscribeForeground}><Probe /></NotificationProvider>);
  await act(() => { f.remind(); f.tap(); f.emit('안전한 연결 오류'); });
  expect(screen.getByText('일정')).toBeOnTheScreen();
  expect(screen.getByText('has tap')).toBeOnTheScreen();
  expect(screen.getByText('안전한 연결 오류')).toBeOnTheScreen();
  await view.unmount(); expect(f.unsubscribe).toHaveBeenCalledTimes(1);
});
test('never renders the previous epoch reminder after account transition or offline state', async () => {
  const f = fixture(); const make = () => <NotificationProvider runtime={f.runtime} subscribeForeground={f.subscribeForeground}><Probe /></NotificationProvider>;
  const view = await render(make());
  await act(() => f.remind()); expect(screen.getByText('일정')).toBeOnTheScreen();
  mockSession = { state: { status: 'authenticated', userId: 'owner-b' }, epoch: 2 };
  await view.rerender(make()); expect(screen.queryByText('일정')).toBeNull();
  mockSession = { state: { status: 'offline-workspace', userId: 'owner-b' }, epoch: 2 };
  await view.rerender(make()); await act(() => f.remind());
  expect(screen.queryByText('일정')).toBeNull();
});
test('optional consumer outside provider returns null', async () => {
  await render(<Probe />); expect(screen.getByText('no reminder')).toBeOnTheScreen();
});
