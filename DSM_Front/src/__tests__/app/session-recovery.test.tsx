import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ApiError } from '@/lib/api/api-error';
import type { SessionState } from '@/features/auth/session-controller';
import { PrototypeProvider } from '@/features/prototype/prototype-context';

import SessionRecoveryScreen from '../../app/session-recovery';

const mockUseSession = jest.fn();

jest.mock('@/features/auth/session-context', () => ({
  useSession: () => mockUseSession(),
}));

function makeSessionValue(
  state: SessionState,
  retryRecovery = jest.fn().mockResolvedValue(undefined),
  action: 'idle' | 'recovering' = 'idle',
  error: ApiError | null = null,
) {
  return {
    state,
    action,
    error,
    completeOnboarding: jest.fn(),
    logout: jest.fn(),
    leaveOffline: jest.fn().mockResolvedValue(true),
    retryRecovery,
    signIn: jest.fn(),
  };
}

describe('SessionRecoveryScreen', () => {
  it('offers explicit local logout with deferred server revocation and reports cleanup failure', async () => {
    const session = makeSessionValue({ status: 'offline', retry: 'bootstrap' });
    session.leaveOffline.mockResolvedValue(false);
    mockUseSession.mockReturnValue(session);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<PrototypeProvider><SessionRecoveryScreen /></PrototypeProvider>);
    await fireEvent.press(screen.getByText('다른 계정으로 로그인'));
    expect(session.leaveOffline).not.toHaveBeenCalled();
    expect(alert.mock.calls[0]?.[1]).toContain('서버에서도 종료');
    const confirm = alert.mock.calls[0]?.[2]?.find(button => button.text === '로그아웃');
    expect(confirm).toBeDefined();
    confirm?.onPress?.();
    expect(await screen.findByText('로그인 정보를 안전하게 정리하지 못했습니다. 다시 시도해 주세요.')).toBeOnTheScreen();
    expect(session.leaveOffline).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it.each([
    ['offline', '인터넷 연결을 확인해 주세요'],
    ['storage-error', '보안 저장소를 정리하지 못했어요'],
  ])('renders %s recovery copy', async (status, copy) => {
    mockUseSession.mockReturnValue(
      makeSessionValue(
        status === 'offline'
          ? { status: 'offline', retry: 'bootstrap' }
          : { status: 'storage-error', operation: 'clear' },
      ),
    );

    await render(
      <PrototypeProvider>
        <SessionRecoveryScreen />
      </PrototypeProvider>,
    );

    expect(screen.getByText(copy)).toBeOnTheScreen();
  });

  it('invokes retry without exposing diagnostic token data', async () => {
    const retryRecovery = jest.fn().mockResolvedValue(undefined);
    const diagnosticMessage = 'diagnostic-message-sentinel';
    const httpResponseBody = 'http-response-body-sentinel';
    const accessToken = 'access-token-sentinel';
    const refreshToken = 'refresh-token-sentinel';
    const error = new ApiError('http', diagnosticMessage, {
      cause: {
        accessToken,
        body: httpResponseBody,
        refreshToken,
      },
    });
    mockUseSession.mockReturnValue(
      makeSessionValue(
        { status: 'offline', retry: 'bootstrap' },
        retryRecovery,
        'idle',
        error,
      ),
    );

    await render(
      <PrototypeProvider>
        <SessionRecoveryScreen />
      </PrototypeProvider>,
    );

    await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));

    expect(retryRecovery).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(new RegExp(diagnosticMessage))).toBeNull();
    expect(screen.queryByText(new RegExp(httpResponseBody))).toBeNull();
    expect(screen.queryByText(new RegExp(accessToken))).toBeNull();
    expect(screen.queryByText(new RegExp(refreshToken))).toBeNull();
  });

  it('disables retry while recovery is in progress', async () => {
    mockUseSession.mockReturnValue(
      makeSessionValue(
        { status: 'offline', retry: 'profile' },
        jest.fn().mockResolvedValue(undefined),
        'recovering',
      ),
    );

    await render(
      <PrototypeProvider>
        <SessionRecoveryScreen />
      </PrototypeProvider>,
    );

    expect(screen.getByRole('button', { name: '다시 시도' })).toBeDisabled();
  });
});
