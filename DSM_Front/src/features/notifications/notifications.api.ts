import { apiRequest } from '@/lib/api/http-client';

export type FcmToken = {
  id: string;
  userId: string;
  token: string;
  platform: string;
  deviceId: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RegisterFcmTokenRequest = {
  token: string;
  platform: string;
  deviceId?: string;
};

export type RevokeFcmTokenRequest =
  | { token: string; deviceId?: never }
  | { token?: never; deviceId: string };

export type RevokeFcmTokenResult = {
  revokedCount: number;
};

export function registerFcmToken(
  body: RegisterFcmTokenRequest,
): Promise<FcmToken> {
  return apiRequest<FcmToken>('/notifications/fcm-tokens', {
    method: 'POST',
    body,
  });
}

export function revokeFcmToken(
  body: RevokeFcmTokenRequest,
): Promise<RevokeFcmTokenResult> {
  return apiRequest<RevokeFcmTokenResult>('/notifications/fcm-tokens', {
    method: 'DELETE',
    body,
  });
}
