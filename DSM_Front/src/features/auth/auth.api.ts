import { apiRequest } from '@/lib/api/http-client';
import type { AuthTokens } from '@/lib/auth/token-types';

export type SocialProvider = 'GOOGLE' | 'KAKAO' | 'APPLE';

export type SocialLoginRequest = {
  provider: SocialProvider;
  token: string;
};

export type LogoutRequest = {
  refreshToken: string;
  fcmToken?: string;
  deviceId?: string;
};

export function loginWithProviderToken(
  body: SocialLoginRequest,
): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/login', {
    method: 'POST',
    body,
    authenticated: false,
  });
}

export function refreshAuthTokens(refreshToken: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    authenticated: false,
  });
}

export function logout(body: LogoutRequest): Promise<void> {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    body,
    refreshOnUnauthorized: false,
  });
}
