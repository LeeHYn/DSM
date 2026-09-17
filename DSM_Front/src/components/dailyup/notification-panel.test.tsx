import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NotificationController } from '@/features/notifications/notification-controller';
import { NotificationStorage } from '@/features/notifications/notification-storage';
import { NotificationPanel } from './notification-panel';
jest.mock('@/features/prototype/prototype-context', () => ({ usePrototype: () => ({ theme: 'dark' }) }));

function fixture(configured = true, permission: 'granted' | 'denied' = 'granted') {
  const api = {
    userId: 'owner', getSettings: jest.fn(async () => ({ notificationEnabled: true })),
    setSettings: jest.fn(async (notificationEnabled: boolean) => ({ notificationEnabled })),
    reminders: jest.fn(), registerToken: jest.fn(), revokeToken: jest.fn(),
  };
  const native = { status: jest.fn(async () => ({ configured, permission })),
    requestPermission: jest.fn(async () => ({ configured, permission: 'granted' as const })),
    getToken: jest.fn(async () => 'synthetic'), deleteToken: jest.fn(), display: jest.fn(), cancelAll: jest.fn(), openSettings: jest.fn() };
  const storage = new NotificationStorage('owner', { getItem: async () => null, setItem: jest.fn(async () => {}) });
  const controller = new NotificationController({ api, native, storage, isCurrent: () => true });
  return { api, native, storage, controller };
}
test('shows current settings without requesting OS permission automatically', async () => {
  const f = fixture(); await render(<NotificationPanel controller={f.controller} />);
  expect(await screen.findByRole('switch', { name: '전체 일정 알림', checked: true })).toBeOnTheScreen();
  expect(screen.getByText('OS 알림 허용됨')).toBeOnTheScreen();
  expect(f.native.requestPermission).not.toHaveBeenCalled();
});
test('persists explicit global false and local silent preferences', async () => {
  const f = fixture(); await render(<NotificationPanel controller={f.controller} />);
  await screen.findByText('OS 알림 허용됨');
  await act(() => fireEvent(screen.getByRole('switch', { name: '전체 일정 알림' }), 'valueChange', false));
  expect(f.api.setSettings).toHaveBeenCalledWith(false);
  await act(() => fireEvent(screen.getByRole('switch', { name: '알림 소리' }), 'valueChange', false));
  await act(() => fireEvent(screen.getByRole('switch', { name: '알림 진동' }), 'valueChange', false));
  expect(f.storage.getSnapshot()?.preferences).toMatchObject({ sound: false, vibration: false });
});
test('explains permission before explicit request and offers OS settings', async () => {
  const f = fixture(true, 'denied'); await render(<NotificationPanel controller={f.controller} />);
  await screen.findByText('OS 알림 차단됨');
  expect(screen.getByText(/일정 시작 시간을 알려/)).toBeOnTheScreen();
  await act(() => fireEvent.press(screen.getByText('알림 권한 요청')));
  expect(f.native.requestPermission).toHaveBeenCalledTimes(1);
  await act(() => fireEvent.press(screen.getByText('OS 알림 설정 열기')));
  expect(f.native.openSettings).toHaveBeenCalledTimes(1);
});
test('unconfigured push is clearly shown without disabling local settings', async () => {
  const f = fixture(false); await render(<NotificationPanel controller={f.controller} />);
  expect(await screen.findByText(/푸시 연결이 설정되지 않았습니다/)).toBeOnTheScreen();
  expect(screen.getByRole('switch', { name: '앱 사용 중 알림' })).toBeOnTheScreen();
});
test('load failure exposes safe retry and recovers', async () => {
  const f = fixture(); f.api.getSettings.mockRejectedValueOnce(new Error('private detail'));
  await render(<NotificationPanel controller={f.controller} />);
  await screen.findByText('알림 설정 다시 불러오기');
  expect(screen.queryByText('private detail')).toBeNull();
  await act(() => fireEvent.press(screen.getByText('알림 설정 다시 불러오기')));
  expect(await screen.findByText('OS 알림 허용됨')).toBeOnTheScreen();
});
test('missing current controller shows unavailable state without fake preferences', async () => {
  await render(<NotificationPanel controller={null} />);
  expect(screen.getByText('알림 설정을 준비하고 있습니다.')).toBeOnTheScreen();
  expect(screen.queryByRole('switch')).toBeNull();
});
