import { GoogleAuthConfigurationError } from '@/config/google-auth-config';
import {
  createGoogleSignInAdapter,
  GoogleProviderError,
  type GoogleProviderResponse,
  type GoogleSignInDependencies,
} from './google-sign-in';

jest.mock('react-native-nitro-google-signin', () => ({
  GoogleOneTapSignIn: {
    configure: jest.fn(),
    checkPlayServices: jest.fn(),
    signIn: jest.fn(),
    createAccount: jest.fn(),
    presentExplicitSignIn: jest.fn(),
  },
  isCancelledResponse: jest.fn(),
  isErrorWithCode: jest.fn(),
  isNoSavedCredentialFoundResponse: jest.fn(),
  isSuccessResponse: jest.fn(),
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
}));

const success = (idToken: string | null): GoogleProviderResponse => ({
  type: 'success',
  idToken,
});
const noSaved: GoogleProviderResponse = { type: 'no-saved-credential' };
const cancelled: GoogleProviderResponse = { type: 'cancelled' };

function createDependencies(): jest.Mocked<GoogleSignInDependencies> {
  return {
    getWebClientId: jest.fn(() => '123.apps.googleusercontent.com'),
    configure: jest.fn(),
    checkPlayServices: jest.fn().mockResolvedValue(undefined),
    signIn: jest.fn().mockResolvedValue(success(' google-id-token ')),
    createAccount: jest.fn().mockResolvedValue(success('google-id-token')),
    presentExplicitSignIn: jest
      .fn()
      .mockResolvedValue(success('google-id-token')),
    isCancellationError: jest.fn((_error: unknown) => false),
  };
}

it('configures once and returns a trimmed ID token', async () => {
  const dependencies = createDependencies();
  const adapter = createGoogleSignInAdapter(dependencies);

  await expect(adapter.acquireIdToken()).resolves.toEqual({
    status: 'success',
    idToken: 'google-id-token',
  });
  await expect(adapter.acquireIdToken()).resolves.toEqual({
    status: 'success',
    idToken: 'google-id-token',
  });

  expect(dependencies.configure).toHaveBeenCalledTimes(1);
  expect(dependencies.configure).toHaveBeenCalledWith(
    '123.apps.googleusercontent.com',
  );
});

it('uses the documented no-saved cascade', async () => {
  const dependencies = createDependencies();
  dependencies.signIn.mockResolvedValue(noSaved);
  dependencies.createAccount.mockResolvedValue(noSaved);
  const adapter = createGoogleSignInAdapter(dependencies);

  await expect(adapter.acquireIdToken()).resolves.toEqual({
    status: 'success',
    idToken: 'google-id-token',
  });

  expect(dependencies.signIn).toHaveBeenCalledTimes(1);
  expect(dependencies.createAccount).toHaveBeenCalledTimes(1);
  expect(dependencies.presentExplicitSignIn).toHaveBeenCalledTimes(1);
});

it.each([
  ['response', cancelled],
  ['thrown error', new Error('cancelled')],
])('maps cancellation from a %s', async (source, value) => {
  const dependencies = createDependencies();
  if (source === 'response') {
    dependencies.signIn.mockResolvedValue(value as GoogleProviderResponse);
  } else {
    dependencies.signIn.mockRejectedValue(value);
    dependencies.isCancellationError.mockReturnValue(true);
  }
  const adapter = createGoogleSignInAdapter(dependencies);

  await expect(adapter.acquireIdToken()).resolves.toEqual({
    status: 'cancelled',
  });
});

it.each([null, '', '   '])(
  'rejects a success response with blank token %p',
  async (idToken) => {
    const dependencies = createDependencies();
    dependencies.signIn.mockResolvedValue(success(idToken));
    const adapter = createGoogleSignInAdapter(dependencies);

    await expect(adapter.acquireIdToken()).rejects.toMatchObject({
      name: 'GoogleProviderError',
      kind: 'protocol',
      message: 'Google sign-in failed',
    });
  },
);

it('sanitizes configuration and provider failures', async () => {
  const configurationDependencies = createDependencies();
  configurationDependencies.getWebClientId.mockImplementation(() => {
    throw new GoogleAuthConfigurationError();
  });
  const configurationAdapter = createGoogleSignInAdapter(
    configurationDependencies,
  );
  await expect(configurationAdapter.acquireIdToken()).rejects.toMatchObject({
    kind: 'configuration',
  });

  const providerDependencies = createDependencies();
  providerDependencies.signIn.mockRejectedValue(
    new Error('native-detail-with-token-value'),
  );
  const providerAdapter = createGoogleSignInAdapter(providerDependencies);
  let captured: unknown;
  try {
    await providerAdapter.acquireIdToken();
  } catch (error) {
    captured = error;
  }

  expect(captured).toBeInstanceOf(GoogleProviderError);
  expect(JSON.stringify(captured)).toBe(
    '{"name":"GoogleProviderError","kind":"provider","message":"Google sign-in failed"}',
  );
  expect(JSON.stringify(captured)).not.toContain('native-detail');
  expect(JSON.stringify(captured)).not.toContain('token-value');
});

it('rejects a concurrent acquisition and recovers after settle', async () => {
  const dependencies = createDependencies();
  let resolveSignIn!: (response: GoogleProviderResponse) => void;
  dependencies.signIn.mockReturnValue(
    new Promise((resolve) => {
      resolveSignIn = resolve;
    }),
  );
  const adapter = createGoogleSignInAdapter(dependencies);

  const first = adapter.acquireIdToken();
  await expect(adapter.acquireIdToken()).rejects.toMatchObject({
    kind: 'in-progress',
  });
  expect(dependencies.signIn).toHaveBeenCalledTimes(1);

  resolveSignIn(success('google-id-token'));
  await expect(first).resolves.toEqual({
    status: 'success',
    idToken: 'google-id-token',
  });
  await expect(adapter.acquireIdToken()).resolves.toEqual({
    status: 'success',
    idToken: 'google-id-token',
  });
});
