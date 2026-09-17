import Config from 'react-native-config';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login } from '@react-native-kakao/user';
import { appleAuthAndroid } from '@invertase/react-native-apple-authentication';
import { AdditionalProviderError, appleSignInAdapter, kakaoSignInAdapter } from './additional-sign-in';

jest.mock('@react-native-kakao/core', () => ({ initializeKakaoSDK: jest.fn() }));
jest.mock('@react-native-kakao/user', () => ({ login: jest.fn() }));
jest.mock('@invertase/react-native-apple-authentication', () => ({
  appleAuthAndroid: {
    isSupported: true,
    configure: jest.fn(),
    signIn: jest.fn(),
    Scope: { ALL: 'ALL' },
    ResponseType: { ALL: 'ALL', ID_TOKEN: 'ID_TOKEN' },
    Error: { SIGNIN_CANCELLED: 'E_SIGNIN_CANCELLED_ERROR', NOT_CONFIGURED: 'E_NOT_CONFIGURED_ERROR', SIGNIN_FAILED: 'E_SIGNIN_FAILED_ERROR' },
  },
}));

const kakaoToken = {
  accessToken: 'synthetic-kakao-access', refreshToken: 'synthetic-native-refresh',
  accessTokenExpiresAt: 1700000000, refreshTokenExpiresAt: 1700001000,
  accessTokenExpiresIn: 3600, refreshTokenExpiresIn: 7200, scopes: [],
};
const appleToken = { id_token: 'synthetic.apple.id-token', code: 'synthetic-code', state: 'native-state' };

beforeEach(() => {
  jest.resetAllMocks();
  Config.KAKAO_NATIVE_APP_KEY = '0123456789abcdef0123456789abcdef';
  Config.APPLE_CLIENT_ID = 'com.example.synthetic-service';
  Config.APPLE_REDIRECT_URI = 'https://auth.example.com/apple/callback';
  appleAuthAndroid.isSupported = true;
  jest.mocked(initializeKakaoSDK).mockResolvedValue(undefined);
  jest.mocked(login).mockResolvedValue(kakaoToken);
  jest.mocked(appleAuthAndroid.signIn).mockResolvedValue(appleToken);
});
afterEach(() => {
  delete Config.KAKAO_NATIVE_APP_KEY;
  delete Config.APPLE_CLIENT_ID;
  delete Config.APPLE_REDIRECT_URI;
});

test('initializes Kakao before login and returns only its access token', async () => {
  let initialize!: () => void;
  jest.mocked(initializeKakaoSDK).mockReturnValueOnce(new Promise(resolve => { initialize = resolve; }));
  const pending = kakaoSignInAdapter.acquireToken();
  expect(initializeKakaoSDK).toHaveBeenCalledWith('0123456789abcdef0123456789abcdef');
  expect(login).not.toHaveBeenCalled();
  initialize();
  await expect(pending).resolves.toEqual({ status: 'success', token: kakaoToken.accessToken });
  expect(login).toHaveBeenCalledWith();
});

test('configures Apple on every attempt with native nonce enabled and returns only the ID token', async () => {
  await expect(appleSignInAdapter.acquireToken()).resolves.toEqual({ status: 'success', token: appleToken.id_token });
  await expect(appleSignInAdapter.acquireToken()).resolves.toEqual({ status: 'success', token: appleToken.id_token });
  expect(appleAuthAndroid.configure).toHaveBeenCalledTimes(2);
  expect(appleAuthAndroid.configure).toHaveBeenCalledWith({
    clientId: 'com.example.synthetic-service', redirectUri: 'https://auth.example.com/apple/callback',
    responseType: 'ALL', scope: 'ALL', nonceEnabled: true,
  });
  expect(jest.mocked(appleAuthAndroid.configure).mock.invocationCallOrder[0])
    .toBeLessThan(jest.mocked(appleAuthAndroid.signIn).mock.invocationCallOrder[0]);
});

test.each([undefined, '', ' ', 'not-an-app-key', 'a'.repeat(31), 'g'.repeat(32), 'a'.repeat(33)])(
  'rejects invalid Kakao configuration before invoking native code', async key => {
    Config.KAKAO_NATIVE_APP_KEY = key;
    await expect(kakaoSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'configuration' });
    expect(initializeKakaoSDK).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  },
);

test.each([undefined, '', ' ', 'client id with spaces', 'client/id', 'a'.repeat(256)])(
  'rejects invalid Apple client configuration before opening sign-in', async clientId => {
    Config.APPLE_CLIENT_ID = clientId;
    await expect(appleSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'configuration' });
    expect(appleAuthAndroid.configure).not.toHaveBeenCalled();
    expect(appleAuthAndroid.signIn).not.toHaveBeenCalled();
  },
);

test.each([
  undefined, '', 'http://auth.example.com/callback', 'https://localhost/callback',
  'https://127.0.0.1/callback', 'https://[::1]/callback', 'https://user:pass@auth.example.com/callback',
  'https://auth.example.com/callback#fragment', 'https://auth..example.com/callback',
  'https://-auth.example.com/callback', 'https://auth.example.com:99999/callback',
  'https://auth.example.com/call back', 'https://auth.example.com\\evil/path',
  'https://auth.example.com/callback?next=hello\nworld', 'https://',
])('rejects unsafe or unusable Apple redirect configuration', async redirectUri => {
  Config.APPLE_REDIRECT_URI = redirectUri;
  await expect(appleSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'configuration' });
  expect(appleAuthAndroid.signIn).not.toHaveBeenCalled();
});

test('reports unavailable Apple native support as a configuration error', async () => {
  appleAuthAndroid.isSupported = false;
  await expect(appleSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'configuration' });
  expect(appleAuthAndroid.configure).not.toHaveBeenCalled();
});

test.each([null, undefined, '', '   ', 42, 'a'.repeat(16385), 'embedded whitespace', 'control\u0000token'])(
  'rejects malformed native tokens on both providers', async token => {
    jest.mocked(login).mockResolvedValueOnce({ ...kakaoToken, accessToken: token } as typeof kakaoToken);
    await expect(kakaoSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'protocol' });
    jest.mocked(appleAuthAndroid.signIn).mockResolvedValueOnce({ ...appleToken, id_token: token } as typeof appleToken);
    await expect(appleSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'protocol' });
  },
);

test('returns cancellation only for the documented provider codes and permits retry', async () => {
  jest.mocked(login).mockRejectedValueOnce({ code: 'Cancelled', message: 'native cancellation details' });
  await expect(kakaoSignInAdapter.acquireToken()).resolves.toEqual({ status: 'cancelled' });
  await expect(kakaoSignInAdapter.acquireToken()).resolves.toMatchObject({ status: 'success' });
  jest.mocked(appleAuthAndroid.signIn).mockRejectedValueOnce({ code: 'E_SIGNIN_CANCELLED_ERROR' });
  await expect(appleSignInAdapter.acquireToken()).resolves.toEqual({ status: 'cancelled' });
  await expect(appleSignInAdapter.acquireToken()).resolves.toMatchObject({ status: 'success' });
});

test.each(['cancelled', 'UserCancelled', 'E_CANCELLED', 'unrelated'])('does not hide unknown Kakao failures as cancellation', async code => {
  jest.mocked(login).mockRejectedValueOnce({ code, message: 'user cancelled (untrusted text)' });
  await expect(kakaoSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'provider' });
});

test.each(['Cancelled', '1001', 'unrelated'])('does not use iOS or Kakao cancellation codes for Apple Android', async code => {
  jest.mocked(appleAuthAndroid.signIn).mockRejectedValueOnce({ code, message: 'cancelled' });
  await expect(appleSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'provider' });
});

test('classifies native initialization and runtime setup failures without retaining raw errors', async () => {
  jest.mocked(initializeKakaoSDK).mockRejectedValueOnce(new Error('sensitive-init-detail'));
  await expect(kakaoSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'configuration' });
  expect(login).not.toHaveBeenCalled();
  jest.mocked(login).mockRejectedValueOnce({ code: 'Package-SDKNotInitialized' });
  await expect(kakaoSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'configuration' });
  jest.mocked(appleAuthAndroid.configure).mockImplementationOnce(() => { throw new Error('sensitive-config-detail'); });
  await expect(appleSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'configuration' });
  jest.mocked(appleAuthAndroid.signIn).mockRejectedValueOnce({ code: 'E_NOT_CONFIGURED_ERROR' });
  await expect(appleSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'configuration' });
});

test('sanitizes provider error serialization, message, stack and cause', async () => {
  const sensitive = 'synthetic-private-error-detail';
  jest.mocked(login).mockRejectedValueOnce(Object.assign(new Error(sensitive), {
    code: 'provider-failed', token: sensitive, cause: sensitive, userInfo: { nativeErrorMessage: sensitive },
  }));
  let captured: unknown;
  try { await kakaoSignInAdapter.acquireToken(); } catch (error) { captured = error; }
  expect(captured).toBeInstanceOf(AdditionalProviderError);
  expect(JSON.stringify(captured)).toBe('{"name":"AdditionalProviderError","kind":"provider","message":"Social sign-in failed"}');
  expect(String(captured)).not.toContain(sensitive);
  expect((captured as Error).stack).not.toContain(sensitive);
  expect((captured as Error).cause).toBeUndefined();
});

test('prevents concurrent acquisitions across both adapters and releases the lock on failure', async () => {
  let reject!: (error: unknown) => void;
  jest.mocked(login).mockReturnValueOnce(new Promise((_resolve, rej) => { reject = rej; }));
  const pending = kakaoSignInAdapter.acquireToken();
  await Promise.resolve();
  await expect(kakaoSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'in-progress' });
  await expect(appleSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'in-progress' });
  expect(login).toHaveBeenCalledTimes(1);
  expect(appleAuthAndroid.configure).not.toHaveBeenCalled();
  reject(new Error('native failure'));
  await expect(pending).rejects.toMatchObject({ kind: 'provider' });
  await expect(appleSignInAdapter.acquireToken()).resolves.toMatchObject({ status: 'success' });
});

test('a failed configuration can be corrected and retried without recreating the adapter', async () => {
  Config.KAKAO_NATIVE_APP_KEY = '';
  await expect(kakaoSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'configuration' });
  Config.KAKAO_NATIVE_APP_KEY = 'fedcba9876543210fedcba9876543210';
  await expect(kakaoSignInAdapter.acquireToken()).resolves.toMatchObject({ status: 'success' });
  expect(initializeKakaoSDK).toHaveBeenCalledWith('fedcba9876543210fedcba9876543210');
});

test.each([null, undefined, [], {}])('rejects malformed native success payloads', async value => {
  jest.mocked(login).mockResolvedValueOnce(value as typeof kakaoToken);
  await expect(kakaoSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'protocol' });
  jest.mocked(appleAuthAndroid.signIn).mockResolvedValueOnce(value as typeof appleToken);
  await expect(appleSignInAdapter.acquireToken()).rejects.toMatchObject({ kind: 'protocol' });
});

test('accepts the bounded maximum token without truncating it', async () => {
  const token = 'a'.repeat(16384);
  jest.mocked(login).mockResolvedValueOnce({ ...kakaoToken, accessToken: token });
  await expect(kakaoSignInAdapter.acquireToken()).resolves.toEqual({ status: 'success', token });
});

test('sanitizes an Apple native failure and permits a fresh configured attempt', async () => {
  const sensitive = 'synthetic-apple-native-secret';
  jest.mocked(appleAuthAndroid.signIn).mockRejectedValueOnce({ code: 'E_SIGNIN_FAILED_ERROR', message: sensitive, id_token: sensitive });
  let captured: unknown;
  try { await appleSignInAdapter.acquireToken(); } catch (error) { captured = error; }
  expect(captured).toBeInstanceOf(AdditionalProviderError);
  expect(JSON.stringify(captured)).not.toContain(sensitive);
  expect((captured as AdditionalProviderError).kind).toBe('provider');
  await expect(appleSignInAdapter.acquireToken()).resolves.toMatchObject({ status: 'success' });
  expect(appleAuthAndroid.configure).toHaveBeenCalledTimes(2);
});
