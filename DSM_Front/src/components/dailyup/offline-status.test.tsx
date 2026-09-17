import { render, screen, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { OfflineStatus } from './offline-status';
const mockSession = { state: { status: 'offline-workspace' }, action: 'idle', retryRecovery: jest.fn(), leaveOffline: jest.fn() };
jest.mock('../../features/auth/session-context', () => ({ useSession: () => mockSession }));
jest.mock('../../features/prototype/prototype-context', () => ({ usePrototype: () => ({ theme: 'dark' }) }));
beforeEach(() => {
  mockSession.state.status = 'offline-workspace';
  mockSession.action = 'idle';
  mockSession.retryRecovery.mockReset().mockResolvedValue(undefined);
  mockSession.leaveOffline.mockReset().mockResolvedValue(true);
});
test('labels cached data and routes retry to session verification', async () => {
  await render(<OfflineStatus />);
  expect(screen.getByText('오프라인 작업 공간')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('연결 다시 확인'));
  expect(mockSession.retryRecovery).toHaveBeenCalledTimes(1);
});
test('requires explicit confirmation before local exit and preserves failed state', async () => {
  mockSession.leaveOffline.mockResolvedValue(false);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await render(<OfflineStatus />);
  await fireEvent.press(screen.getByText('다른 계정으로 로그인'));
  expect(mockSession.leaveOffline).not.toHaveBeenCalled();
  alert.mock.calls[0]?.[2]?.find(button => button.text === '로그아웃')?.onPress?.();
  expect(await screen.findByText('로그인 정보를 안전하게 정리하지 못했습니다. 다시 시도해 주세요.')).toBeOnTheScreen();
  alert.mockRestore();
});
test('does not show an offline identity in an authenticated or unauthenticated session', async () => {
  mockSession.state.status = 'authenticated';
  const view = await render(<OfflineStatus />);
  expect(screen.queryByText('오프라인 작업 공간')).toBeNull();
  mockSession.state.status = 'unauthenticated';
  await view.rerender(<OfflineStatus />);
  expect(screen.queryByText('오프라인 작업 공간')).toBeNull();
});
