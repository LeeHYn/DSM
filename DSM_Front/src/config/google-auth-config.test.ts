import {
  getGoogleWebClientId,
  GoogleAuthConfigurationError,
  isGoogleAuthConfigurationError,
} from './google-auth-config';

jest.mock('react-native-config', () => ({
  GOOGLE_WEB_CLIENT_ID: 'native.apps.googleusercontent.com',
}));

it('reads the Google client ID from native config by default', () => {
  expect(getGoogleWebClientId()).toBe('native.apps.googleusercontent.com');
});

it.each(['', '   '])('rejects missing client ID: %p', (value) => {
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
