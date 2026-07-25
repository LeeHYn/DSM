import { parseTokenPair } from './auth-contracts';
import { createAuthApi } from './auth-api';

it('uses public login and refresh endpoints without recursive auth', async () => {
  const TOKEN_PAIR = {
    accessToken: 'header.payload.signature',
    refreshToken: 'record.secret',
  };
  const http = { request: jest.fn().mockResolvedValue(TOKEN_PAIR) };
  const api = createAuthApi(http);

  await api.exchangeProviderToken('GOOGLE', 'provider-token');
  await api.rotateRefreshToken('old.record-secret');

  expect(http.request).toHaveBeenNthCalledWith(1, {
    path: '/auth/login',
    method: 'POST',
    body: { provider: 'GOOGLE', token: 'provider-token' },
    validate: parseTokenPair,
  });
  expect(http.request).toHaveBeenNthCalledWith(2, {
    path: '/auth/refresh',
    method: 'POST',
    body: { refreshToken: 'old.record-secret' },
    validate: parseTokenPair,
  });
});

it('sends captured tokens once for best-effort logout', async () => {
  const http = { request: jest.fn().mockResolvedValue(undefined) };
  const api = createAuthApi(http);

  await api.revokeSession('access', 'record.secret');

  expect(http.request).toHaveBeenCalledTimes(1);
  expect(http.request).toHaveBeenCalledWith({
    path: '/auth/logout',
    method: 'POST',
    accessToken: 'access',
    body: { refreshToken: 'record.secret' },
    responseMode: 'empty',
  });
});
