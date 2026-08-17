import { fireEvent, render, screen } from '@testing-library/react-native';

import MyPageScreen from '../../../app/(tabs)/mypage';

const mockUseSession = jest.fn();
const mockUsePrototype = jest.fn();

jest.mock('@/features/auth/session-context', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/features/prototype/prototype-context', () => ({
  usePrototype: () => mockUsePrototype(),
}));

function makeAuthenticatedSession(
  logout: jest.MockedFunction<() => Promise<void>>,
  action: 'idle' | 'logging-out' = 'idle',
) {
  return {
    state: {
      status: 'authenticated' as const,
      userId: 'user-1',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
    },
    action,
    error: null,
    completeOnboarding: jest.fn(),
    logout,
    retryRecovery: jest.fn(),
    signIn: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePrototype.mockReturnValue({
    resetPrototype: jest.fn(),
    setTheme: jest.fn(),
    showToast: jest.fn(),
    theme: 'dark',
  });
});

it('resets prototype state and invokes secure logout without manual routing', async () => {
  const logout = jest.fn().mockResolvedValue(undefined);
  const resetPrototype = jest.fn();
  mockUseSession.mockReturnValue(makeAuthenticatedSession(logout));
  mockUsePrototype.mockReturnValue({
    resetPrototype,
    setTheme: jest.fn(),
    showToast: jest.fn(),
    theme: 'dark',
  });

  await render(<MyPageScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));

  expect(resetPrototype).toHaveBeenCalledTimes(1);
  expect(logout).toHaveBeenCalledTimes(1);
  expect(resetPrototype.mock.invocationCallOrder[0]).toBeLessThan(
    logout.mock.invocationCallOrder[0],
  );
});

it('disables the accessible logout button while secure logout is pending', async () => {
  mockUseSession.mockReturnValue(
    makeAuthenticatedSession(jest.fn().mockResolvedValue(undefined), 'logging-out'),
  );

  await render(<MyPageScreen />);

  expect(screen.getByRole('button', { name: '로그아웃' })).toBeDisabled();
});
