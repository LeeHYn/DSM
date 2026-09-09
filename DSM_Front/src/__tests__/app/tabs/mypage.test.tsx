import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';

import MyPageScreen from '../../../app/(tabs)/mypage';

const mockUseSession = jest.fn();
const mockUsePrototype = jest.fn();
const mockOpenLegalLink = jest.fn();
jest.mock('@/features/product/product-context', () => ({
  useProduct: () => ({ snapshot: { summary: { data: { totalScore: 321, tier: 'BRONZE' }, status: 'ready', error: null } }, store: { loadHome: jest.fn() } }),
}));

jest.mock('@/features/auth/session-context', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/features/prototype/prototype-context', () => ({
  usePrototype: () => mockUsePrototype(),
}));

jest.mock('@/config/legal-links', () => ({
  openLegalLink: (kind: string) => mockOpenLegalLink(kind),
}));

function makeAuthenticatedSession(
  logout: jest.MockedFunction<() => Promise<boolean>>,
  action: 'idle' | 'logging-out' | 'deleting-account' = 'idle',
  deleteAccount: jest.MockedFunction<() => Promise<boolean>> = jest
    .fn()
    .mockResolvedValue(false),
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
    deleteAccount,
    logout,
    retryRecovery: jest.fn(),
    signIn: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOpenLegalLink.mockResolvedValue(true);
  mockUsePrototype.mockReturnValue({
    resetPrototype: jest.fn(),
    setTheme: jest.fn(),
    showToast: jest.fn(),
    theme: 'dark',
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('resets prototype state only after secure logout succeeds', async () => {
  const logout = jest.fn().mockResolvedValue(true);
  const resetPrototype = jest.fn();
  mockUseSession.mockReturnValue(makeAuthenticatedSession(logout));
  mockUsePrototype.mockReturnValue({
    resetPrototype,
    setTheme: jest.fn(),
    showToast: jest.fn(),
    theme: 'dark',
  });

  await render(<MyPageScreen />);
  expect(screen.getByText('내 계정')).toBeOnTheScreen();
  expect(screen.getByText('누적 점수 321점')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));

  expect(logout).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(resetPrototype).toHaveBeenCalledTimes(1));
  expect(logout.mock.invocationCallOrder[0]).toBeLessThan(
    resetPrototype.mock.invocationCallOrder[0],
  );
});

it('keeps local state and shows retry feedback when secure logout fails', async () => {
  const logout = jest.fn().mockResolvedValue(false);
  const resetPrototype = jest.fn();
  const showToast = jest.fn();
  mockUseSession.mockReturnValue(makeAuthenticatedSession(logout));
  mockUsePrototype.mockReturnValue({
    resetPrototype,
    setTheme: jest.fn(),
    showToast,
    theme: 'dark',
  });

  await render(<MyPageScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));

  await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
  expect(resetPrototype).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith(
    '로그아웃에 실패했습니다. 연결 상태를 확인하고 다시 시도해 주세요.',
  );
});

it('disables the accessible logout button while secure logout is pending', async () => {
  mockUseSession.mockReturnValue(
    makeAuthenticatedSession(jest.fn().mockResolvedValue(false), 'logging-out'),
  );

  await render(<MyPageScreen />);

  expect(screen.getByRole('button', { name: '로그아웃' })).toBeDisabled();
});

it('requires two confirmations and resets local state only after server deletion succeeds', async () => {
  let resolveDeletion!: (deleted: boolean) => void;
  const deleteAccount = jest.fn().mockReturnValue(
    new Promise<boolean>((resolve) => {
      resolveDeletion = resolve;
    }),
  );
  const resetPrototype = jest.fn();
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();
  mockUseSession.mockReturnValue(
    makeAuthenticatedSession(jest.fn(), 'idle', deleteAccount),
  );
  mockUsePrototype.mockReturnValue({
    resetPrototype,
    setTheme: jest.fn(),
    showToast: jest.fn(),
    theme: 'dark',
  });
  await render(<MyPageScreen />);

  await fireEvent.press(screen.getByRole('button', { name: '계정 삭제' }));
  expect(alertSpy).toHaveBeenCalledWith(
    '계정 삭제',
    expect.stringContaining('일과'),
    expect.any(Array),
  );
  alertSpy.mock.calls[0][2]?.find((button) => button.text === '계속')
    ?.onPress?.();
  expect(alertSpy).toHaveBeenCalledTimes(2);
  const destructiveButton = alertSpy.mock.calls[1][2]?.find(
    (button) => button.text === '계정 삭제',
  );
  expect(destructiveButton).toMatchObject({ style: 'destructive' });

  await act(() => {
    destructiveButton?.onPress?.();
    destructiveButton?.onPress?.();
  });
  expect(deleteAccount).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '계정 삭제' })).toBeDisabled();
  expect(resetPrototype).not.toHaveBeenCalled();

  resolveDeletion(true);
  await waitFor(() => expect(resetPrototype).toHaveBeenCalledTimes(1));
});

it('keeps local account state and shows safe retry feedback when deletion fails', async () => {
  const deleteAccount = jest.fn().mockResolvedValue(false);
  const resetPrototype = jest.fn();
  const showToast = jest.fn();
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();
  mockUseSession.mockReturnValue(
    makeAuthenticatedSession(jest.fn(), 'idle', deleteAccount),
  );
  mockUsePrototype.mockReturnValue({
    resetPrototype,
    setTheme: jest.fn(),
    showToast,
    theme: 'dark',
  });
  await render(<MyPageScreen />);

  await fireEvent.press(screen.getByRole('button', { name: '계정 삭제' }));
  alertSpy.mock.calls[0][2]?.find((button) => button.text === '계속')
    ?.onPress?.();
  await act(async () => {
    alertSpy.mock.calls[1][2]?.find(
      (button) => button.text === '계정 삭제',
    )?.onPress?.();
  });

  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith(
      '계정 삭제에 실패했습니다. 연결 상태를 확인하고 다시 시도해 주세요.',
    ),
  );
  expect(resetPrototype).not.toHaveBeenCalled();
});

it('disables account actions while account deletion is pending', async () => {
  mockUseSession.mockReturnValue(
    makeAuthenticatedSession(
      jest.fn().mockResolvedValue(false),
      'deleting-account',
    ),
  );

  await render(<MyPageScreen />);

  expect(screen.getByRole('button', { name: '계정 삭제' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '로그아웃' })).toBeDisabled();
});

it('opens privacy and external account deletion guidance links', async () => {
  mockUseSession.mockReturnValue(
    makeAuthenticatedSession(jest.fn().mockResolvedValue(false)),
  );
  await render(<MyPageScreen />);

  await fireEvent.press(
    screen.getByRole('link', { name: '개인정보처리방침' }),
  );
  await fireEvent.press(
    screen.getByRole('link', { name: '계정 삭제 안내' }),
  );

  expect(mockOpenLegalLink.mock.calls).toEqual([
    ['privacy'],
    ['account-deletion'],
  ]);
});

it('shows safe feedback when an external legal link cannot be opened', async () => {
  const showToast = jest.fn();
  mockOpenLegalLink.mockResolvedValue(false);
  mockUseSession.mockReturnValue(
    makeAuthenticatedSession(jest.fn().mockResolvedValue(false)),
  );
  mockUsePrototype.mockReturnValue({
    resetPrototype: jest.fn(),
    setTheme: jest.fn(),
    showToast,
    theme: 'dark',
  });
  await render(<MyPageScreen />);

  await fireEvent.press(
    screen.getByRole('link', { name: '계정 삭제 안내' }),
  );

  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith(
      '계정 삭제 안내를 열 수 없습니다. 다시 시도해 주세요.',
    ),
  );
});
