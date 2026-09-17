import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSession, useAuthenticatedClient } from '@/features/auth/session-context';
import { useProduct } from '@/features/product/product-context';
import { parseTask } from '@/features/product/product-contracts';
import { useNotifications } from '@/features/notifications/notification-context';
import { AppButton, AppText, SurfaceCard } from './primitives';

type Tap = { type: 'TASK_REMINDER'; userId: string; taskId: string; scheduleId: string; startAt: string };
function parseTap(value: unknown, owner: string): Tap | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = ['type', 'userId', 'taskId', 'scheduleId', 'startAt'];
  if (Object.keys(row).length !== 5 || Object.keys(row).some(key => !keys.includes(key)) || row.type !== 'TASK_REMINDER' || row.userId !== owner) return null;
  if (![row.userId, row.taskId, row.scheduleId].every(id => typeof id === 'string' && id.trim() && Array.from(id).length <= 255)) return null;
  if (typeof row.startAt !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.startAt)) return null;
  const time = Date.parse(row.startAt);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== row.startAt) return null;
  return row as Tap;
}
export function NotificationTaskBridge() {
  const notifications = useNotifications();
  const session = useSession();
  const client = useAuthenticatedClient();
  const product = useProduct();
  const latest = useRef({ notifications, product }); latest.current = { notifications, product };
  const [requested, setRequested] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const target = requested ?? notifications?.tap;
  const owner = session.state.status === 'authenticated' ? session.state.userId : null;
  const blocked = product.isNewTaskOpen || product.editingTask !== null || product.snapshot.mutating;
  const store = product.store;
  useEffect(() => {
    if (!owner || !target || blocked) return;
    let active = true;
    const tap = parseTap(target, owner);
    const consume = () => {
      if (!active) return;
      setRequested((current: unknown) => current === target ? null : current);
      latest.current.notifications?.clearTap(target);
    };
    if (!tap) {
      setMessage('이 알림의 일과를 열 수 없습니다.'); consume(); return;
    }
    setMessage('알림의 일과를 확인하는 중…');
    const open = async () => {
      try {
        const task = await client.request({ path: `/tasks/${encodeURIComponent(tap.taskId)}`, validate: parseTask });
        if (!active) return;
        if (task.id !== tap.taskId || task.userId !== owner || store.userId !== owner) throw new Error('Invalid notification task');
        const date = task.startAt.slice(0, 10);
        await store.setDate(date);
        if (!active) return;
        const snapshot = store.getSnapshot();
        if (snapshot.date !== date || !snapshot.tasks.data?.some(item => item.id === task.id && item.userId === owner)) throw new Error('Task unavailable');
        latest.current.product.openTaskDetail(task.id);
        setMessage(''); consume();
      } catch {
        if (active) { setMessage('이 알림의 일과를 열 수 없습니다.'); consume(); }
      }
    };
    open().catch(() => undefined);
    return () => { active = false; };
  }, [target, owner, session.epoch, blocked, store, client]);
  const reminder = owner ? notifications?.reminder : null;
  if (!reminder && !message && !(target && blocked)) return null;
  return <SurfaceCard style={{ margin: 12, gap: 8 }}>
    {reminder ? <>
      <AppText accessibilityRole="alert">{reminder.title}</AppText>
      <AppText>일정을 시작할 시간입니다.</AppText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <AppButton onPress={() => {
          setRequested({ type: 'TASK_REMINDER', userId: owner, taskId: reminder.taskId, scheduleId: reminder.id, startAt: reminder.startAt });
          notifications?.dismissReminder();
        }}>일과 열기</AppButton>
        <AppButton variant="ghost" onPress={() => notifications?.dismissReminder()}>알림 닫기</AppButton>
      </View>
    </> : null}
    {target && blocked ? <AppText>작성 중인 내용을 마친 뒤 알림의 일과를 열어 드립니다.</AppText> : null}
    {message ? <AppText accessibilityRole="alert">{message}</AppText> : null}
  </SurfaceCard>;
}
