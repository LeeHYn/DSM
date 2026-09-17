import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import type { NotificationController } from '@/features/notifications/notification-controller';
import { AppButton, AppText, SurfaceCard } from './primitives';

export function NotificationPanel({ controller }: { controller: NotificationController | null }) {
  if (!controller) return <SurfaceCard><AppText>알림 설정을 준비하고 있습니다.</AppText></SurfaceCard>;
  return <ReadyNotificationPanel controller={controller} />;
}
function ReadyNotificationPanel({ controller }: { controller: NotificationController }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [busy, setBusy] = useState(false);
  const current = useRef({ controller, active: true, busy: false });
  useEffect(() => {
    const scope = { controller, active: true, busy: false };
    current.current = scope;
    setBusy(false);
    controller.load().catch(() => undefined);
    return () => { scope.active = false; };
  }, [controller]);
  async function run(action: () => Promise<unknown>) {
    const scope = current.current;
    if (scope.busy || !scope.active || scope.controller !== controller) return;
    scope.busy = true; setBusy(true);
    try { await action(); } catch { /* Controller exposes only safe error text. */ }
    finally { scope.busy = false; if (scope.active) setBusy(false); }
  }
  const disabled = busy || snapshot.loading || snapshot.registering;
  function toggle(label: string, checked: boolean, change: (value: boolean) => Promise<unknown>) {
    return <View style={styles.row}>
      <AppText style={styles.label}>{label}</AppText>
      <Switch accessibilityLabel={label} accessibilityState={{ checked, disabled }}
        disabled={disabled} value={checked} onValueChange={value => { run(() => change(value)).catch(() => undefined); }} style={styles.touch} />
    </View>;
  }
  const permissionLabel = snapshot.device?.permission === 'granted' ? 'OS 알림 허용됨' :
    snapshot.device?.permission === 'denied' ? 'OS 알림 차단됨' : 'OS 알림 권한을 확인해 주세요.';
  return <SurfaceCard style={styles.panel}>
    <AppText variant="sectionTitle">알림 설정</AppText>
    <AppText>일정 시작 시간을 알려 드립니다. 권한을 허용하면 앱을 사용하지 않을 때도 알림을 받을 수 있습니다.</AppText>
    {snapshot.loading ? <AppText>알림 설정을 불러오는 중…</AppText> : null}
    {snapshot.error ? <AppText accessibilityRole="alert">{snapshot.error}</AppText> : null}
    {!snapshot.loaded ? <AppButton disabled={disabled} onPress={() => { run(() => controller.load()).catch(() => undefined); }}>알림 설정 다시 불러오기</AppButton> : <>
      {toggle('전체 일정 알림', snapshot.enabled === true, async value => {
        if (await controller.setEnabled(value) && value) await controller.register();
      })}
      {toggle('알림 소리', snapshot.preferences.sound, value => controller.setPreferences({ sound: value }))}
      {toggle('알림 진동', snapshot.preferences.vibration, value => controller.setPreferences({ vibration: value }))}
      {toggle('앱 사용 중 알림', snapshot.preferences.foreground, value => controller.setPreferences({ foreground: value }))}
      <AppText>{permissionLabel}</AppText>
      {snapshot.device?.configured === false ? <AppText>푸시 연결이 설정되지 않았습니다. 연결 설정 후 앱 밖에서도 알림을 받을 수 있습니다.</AppText> : null}
      <AppText>소리와 진동은 이 기기에 저장됩니다. OS에서 차단한 알림이나 채널 설정은 앱에서 변경할 수 없습니다.</AppText>
      <AppButton disabled={disabled} onPress={() => { run(() => controller.requestPermission()).catch(() => undefined); }}>알림 권한 요청</AppButton>
      <AppButton disabled={disabled} onPress={() => { run(() => controller.openSettings()).catch(() => undefined); }}>OS 알림 설정 열기</AppButton>
    </>}
  </SurfaceCard>;
}
const styles = StyleSheet.create({
  panel: { gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  label: { flex: 1 }, touch: { minWidth: 48, minHeight: 48 },
});
