import { fireEvent, render, screen } from '@testing-library/react-native';

import type { SessionState } from '@/features/auth/session-controller';
import { PrototypeProvider } from '@/features/prototype/prototype-context';

import SessionRecoveryScreen from './session-recovery';

const mockUseSession = jest.fn();

jest.mock('@/features/auth/session-context', () => ({
  useSession: () => mockUseSession(),
}));

function makeSessionValue(
  state: SessionState,
  retryRecovery = jest.fn().mockResolvedValue(undefined),
  action: 'idle' | 'recovering' = 'idle',
) {
  return {
    state,
    action,
    error: null,
    completeOnboarding: jest.fn(),
    logout: jest.fn(),
    retryRecovery,
    signIn: jest.fn(),
  };
}

describe('SessionRecoveryScreen', () => {
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
    mockUseSession.mockReturnValue(
      makeSessionValue(
        { status: 'offline', retry: 'bootstrap' },
        retryRecovery,
      ),
    );

    await render(
      <PrototypeProvider>
        <SessionRecoveryScreen />
      </PrototypeProvider>,
    );

    await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));

    expect(retryRecovery).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/token|Network unavailable|Secure token storage failed/i)).toBeNull();
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
