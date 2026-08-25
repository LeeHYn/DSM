import { parseTokenPair, SocialProvider, TokenPair } from './auth-contracts';
import { HttpClient } from './http-client';

export interface AuthApi {
  exchangeProviderToken(
    provider: SocialProvider,
    providerToken: string,
  ): Promise<TokenPair>;
  rotateRefreshToken(refreshToken: string): Promise<TokenPair>;
  revokeSession(accessToken: string, refreshToken: string): Promise<void>;
}

export function createAuthApi(http: HttpClient): AuthApi {
  return {
    exchangeProviderToken(provider, providerToken) {
      return http.request({
        path: '/auth/login',
        method: 'POST',
        body: { provider, token: providerToken },
        validate: parseTokenPair,
      });
    },
    rotateRefreshToken(refreshToken) {
      return http.request({
        path: '/auth/refresh',
        method: 'POST',
        body: { refreshToken },
        validate: parseTokenPair,
      });
    },
    revokeSession(accessToken, refreshToken) {
      return http.request<void>({
        path: '/auth/logout',
        method: 'POST',
        accessToken,
        body: { refreshToken },
        responseMode: 'empty',
      });
    },
  };
}
