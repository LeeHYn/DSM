import {
  getGoogleWebClientId,
  GoogleAuthConfigurationError,
  isGoogleAuthConfigurationError,
} from './google-auth-config';

const originalClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
});

afterAll(() => {
  if (originalClientId === undefined) {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  } else {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = originalClientId;
  }
});

it.each([undefined, '', '   '])('rejects missing client ID: %p', (value) => {
  expect(() => getGoogleWebClientId(value)).toThrow(
    GoogleAuthConfigurationError,
  );
});

it('returns a trimmed public Web client ID', () => {
  expect(
    getGoogleWebClientId('  123.apps.googleusercontent.com  '),
  ).toBe('123.apps.googleusercontent.com');
});

it('serializes only a fixed safe configuration error', () => {
  let captured: unknown;
  try {
    getGoogleWebClientId('   ');
  } catch (error) {
    captured = error;
  }

  expect(isGoogleAuthConfigurationError(captured)).toBe(true);
  expect(JSON.stringify(captured)).toBe(
    '{"name":"GoogleAuthConfigurationError","message":"Google sign-in configuration is unavailable"}',
  );
});
