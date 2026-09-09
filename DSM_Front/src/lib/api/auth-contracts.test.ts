import { ApiError } from './api-error';
import { parseCurrentUser, parseTokenPair } from './auth-contracts';

it('accepts valid token and current-user responses', () => {
  expect(
    parseTokenPair({
      accessToken: 'header.payload.signature',
      refreshToken: 'record.secret',
      ignored: 'server-extension',
    }),
  ).toEqual({
    accessToken: 'header.payload.signature',
    refreshToken: 'record.secret',
  });

  expect(
    parseCurrentUser({
      userId: 'user-1',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
      ignored: 'server-extension',
    }),
  ).toEqual({
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
  expect(
    parseCurrentUser({
      userId: 'user-2',
      onboardingCompletedAt: null,
    }),
  ).toEqual({
    userId: 'user-2',
    onboardingCompletedAt: null,
  });
});

it.each([
  null,
  [],
  {},
  { accessToken: '', refreshToken: 'record.secret' },
  { accessToken: '   ', refreshToken: 'record.secret' },
  { accessToken: 'access', refreshToken: 'missing-separator' },
  { accessToken: 'access', refreshToken: '.secret' },
  { accessToken: 'access', refreshToken: 'record.' },
  { accessToken: 'access', refreshToken: '   .secret' },
  { accessToken: 'access', refreshToken: 'record.   ' },
  { accessToken: 'access', refreshToken: 'record.secret.extra' },
  { accessToken: 'a'.repeat(16 * 1024 + 1), refreshToken: 'record.secret' },
  { accessToken: 'access', refreshToken: `r.${'x'.repeat(1024)}` },
])('rejects invalid token response %#', (value) => {
  expect(() => parseTokenPair(value)).toThrow(/token response/i);
});

it.each([
  null,
  [],
  {},
  { userId: '', onboardingCompletedAt: null },
  { userId: '   ', onboardingCompletedAt: null },
  { userId: 'user-1', onboardingCompletedAt: 1 },
  { userId: 'user-1', onboardingCompletedAt: '2026-07-25' },
])('rejects invalid current user response %#', (value) => {
  expect(() => parseCurrentUser(value)).toThrow(/current user response/i);
});

it('throws sanitized protocol errors', () => {
  const tokenSecret = 'Bearer secret-token-value';
  const userSecret = 'secret-user-value';

  for (const attempt of [
    () => parseTokenPair({ accessToken: tokenSecret, refreshToken: '' }),
    () =>
      parseCurrentUser({
        userId: userSecret,
        onboardingCompletedAt: 'invalid',
      }),
  ]) {
    try {
      attempt();
      throw new Error('Expected parser to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ kind: 'protocol' });
      expect(String(error)).not.toContain('secret');
      expect(String(error)).not.toContain('Bearer');
    }
  }
});
