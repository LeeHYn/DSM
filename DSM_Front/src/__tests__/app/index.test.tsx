import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import LoginScreen from '../../app/index';

const mockReplace = jest.fn();
const mockShowToast = jest.fn();
const mockAcquireIdToken = jest.fn();
const mockSignIn = jest.fn().mockResolvedValue(undefined);

type MockSessionAction = 'idle' | 'signing-in';
let mockSession: {
  action: MockSessionAction;
  error: Error | null;
  signIn: typeof mockSignIn;
  state: { status: 'unauthenticated' };
} = {
  action: 'idle',
  error: null,
  signIn: mockSignIn,
  state: { status: 'unauthenticated' },
};

function providerError(kind: string) {
  return Object.assign(new Error('Google sign-in failed'), {
    name: 'GoogleProviderError',
    kind,
  });
}

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/features/prototype/prototype-context', () => ({
  usePrototype: () => ({
    showToast: mockShowToast,
    theme: 'dark',
    toastMessage: null,
  }),
}));

jest.mock('@/features/auth/google-sign-in', () => ({
  googleSignInAdapter: { acquireIdToken: () => mockAcquireIdToken() },
  isGoogleProviderError: (value: unknown) =>
    value instanceof Error && value.name === 'GoogleProviderError',
}));

jest.mock('@/features/auth/session-context', () => ({
  useSession: () => mockSession,
}));

beforeEach(() => {
  mockSession = {
    action: 'idle',
    error: null,
    signIn: mockSignIn,
    state: { status: 'unauthenticated' },
  };
  mockAcquireIdToken.mockReset();
  mockSignIn.mockReset().mockResolvedValue(undefined);
  mockShowToast.mockReset();
  mockReplace.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

it('passes one acquired Google ID token to the session', async () => {
  mockAcquireIdToken.mockResolvedValue({
    status: 'success',
    idToken: 'google-id-token',
  });
  await render(<LoginScreen />);

  await fireEvent.press(
    screen.getByRole('button', { name: 'Google로 계속하기' }),
  );

  expect(mockAcquireIdToken).toHaveBeenCalledTimes(1);
  expect(mockSignIn).toHaveBeenCalledTimes(1);
  expect(mockSignIn).toHaveBeenCalledWith('GOOGLE', 'google-id-token');
  expect(mockReplace).not.toHaveBeenCalled();
});

it('silently restores the button after user cancellation', async () => {
  mockAcquireIdToken.mockResolvedValue({ status: 'cancelled' });
  await render(<LoginScreen />);

  const googleButton = screen.getByRole('button', {
    name: 'Google로 계속하기',
  });
  await fireEvent.press(googleButton);

  expect(mockSignIn).not.toHaveBeenCalled();
  expect(mockShowToast).not.toHaveBeenCalled();
  expect(googleButton).not.toBeDisabled();
});

it.each([
  ['configuration', 'Google 로그인 설정이 필요합니다.'],
  ['provider', 'Google 로그인에 실패했습니다. 다시 시도해 주세요.'],
  ['protocol', 'Google 로그인에 실패했습니다. 다시 시도해 주세요.'],
])('shows safe feedback for %s failure', async (kind, message) => {
  mockAcquireIdToken.mockRejectedValue(providerError(kind));
  await render(<LoginScreen />);

  await fireEvent.press(
    screen.getByRole('button', { name: 'Google로 계속하기' }),
  );

  expect(mockShowToast).toHaveBeenCalledWith(message);
  expect(JSON.stringify(mockShowToast.mock.calls)).not.toContain(
    'provider-secret-detail',
  );
});

it('disables provider buttons and ignores duplicate presses while pending', async () => {
  let resolveAcquisition!: (value: { status: 'cancelled' }) => void;
  mockAcquireIdToken.mockReturnValue(
    new Promise((resolve) => {
      resolveAcquisition = resolve;
    }),
  );
  await render(<LoginScreen />);

  const googleButton = screen.getByRole('button', {
    name: 'Google로 계속하기',
  });
  await fireEvent.press(googleButton);
  await fireEvent.press(googleButton);

  expect(mockAcquireIdToken).toHaveBeenCalledTimes(1);
  expect(googleButton).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Kakao로 계속하기' }),
  ).toBeDisabled();
  expect(mockSignIn).not.toHaveBeenCalled();

  resolveAcquisition({ status: 'cancelled' });
  await waitFor(() => expect(googleButton).not.toBeDisabled());
});

it('keeps provider buttons disabled for a session sign-in action', async () => {
  mockSession.action = 'signing-in';
  await render(<LoginScreen />);

  expect(
    screen.getByRole('button', { name: 'Google로 계속하기' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Kakao로 계속하기' }),
  ).toBeDisabled();
});

it('shows a safe message for a newly published session error', async () => {
  mockSession.error = new Error('internal-session-detail');
  await render(<LoginScreen />);

  await waitFor(() =>
    expect(mockShowToast).toHaveBeenCalledWith(
      '로그인에 실패했습니다. 다시 시도해 주세요.',
    ),
  );
  expect(JSON.stringify(mockShowToast.mock.calls)).not.toContain(
    'internal-session-detail',
  );
});

it('keeps Kakao as a placeholder and never replaces routes', async () => {
  await render(<LoginScreen />);

  await fireEvent.press(
    screen.getByRole('button', { name: 'Kakao로 계속하기' }),
  );

  expect(mockShowToast).toHaveBeenCalledWith(
    '소셜 로그인 연결은 다음 단계에서 제공됩니다.',
  );
  expect(mockAcquireIdToken).not.toHaveBeenCalled();
  expect(mockSignIn).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});
