import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import LoginScreen from '../../app/index';

const mockShowToast = jest.fn();
const mockAcquireIdToken = jest.fn();
const mockOpenLegalLink = jest.fn();
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

jest.mock('@/config/legal-links', () => ({
  openLegalLink: (kind: string) => mockOpenLegalLink(kind),
}));

beforeEach(() => {
  mockSession = {
    action: 'idle',
    error: null,
    signIn: mockSignIn,
    state: { status: 'unauthenticated' },
  };
  mockAcquireIdToken.mockReset();
  mockOpenLegalLink.mockReset().mockResolvedValue(true);
  mockSignIn.mockReset().mockResolvedValue(undefined);
  mockShowToast.mockReset();
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

it('keeps Kakao as a placeholder without starting authentication', async () => {
  await render(<LoginScreen />);

  await fireEvent.press(
    screen.getByRole('button', { name: 'Kakao로 계속하기' }),
  );

  expect(mockShowToast).toHaveBeenCalledWith(
    '소셜 로그인 연결은 다음 단계에서 제공됩니다.',
  );
  expect(mockAcquireIdToken).not.toHaveBeenCalled();
  expect(mockSignIn).not.toHaveBeenCalled();
});

it('opens the configured privacy policy from the login screen', async () => {
  await render(<LoginScreen />);

  await fireEvent.press(
    screen.getByRole('link', { name: '개인정보처리방침' }),
  );

  expect(mockOpenLegalLink).toHaveBeenCalledWith('privacy');
  expect(mockShowToast).not.toHaveBeenCalled();
});

it('ignores duplicate privacy link presses while opening', async () => {
  let resolveOpen!: (opened: boolean) => void;
  mockOpenLegalLink.mockReturnValue(
    new Promise<boolean>((resolve) => {
      resolveOpen = resolve;
    }),
  );
  await render(<LoginScreen />);
  const privacyLink = screen.getByRole('link', {
    name: '개인정보처리방침',
  });

  await fireEvent.press(privacyLink);
  await fireEvent.press(privacyLink);

  expect(mockOpenLegalLink).toHaveBeenCalledTimes(1);
  expect(privacyLink).toBeDisabled();
  resolveOpen(true);
  await waitFor(() => expect(privacyLink).not.toBeDisabled());
});

it('shows safe feedback when the privacy policy cannot be opened', async () => {
  mockOpenLegalLink.mockResolvedValue(false);
  await render(<LoginScreen />);

  await fireEvent.press(
    screen.getByRole('link', { name: '개인정보처리방침' }),
  );

  expect(mockShowToast).toHaveBeenCalledWith(
    '개인정보처리방침을 열 수 없습니다. 다시 시도해 주세요.',
  );
});
