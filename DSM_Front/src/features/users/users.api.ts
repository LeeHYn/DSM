import type { SocialProvider } from '@/features/auth/auth.api';
import { apiRequest } from '@/lib/api/http-client';

export type Tier =
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'DIAMOND'
  | 'MASTER';

export type User = {
  id: string;
  nickname: string | null;
  profileImageUrl: string | null;
  notificationEnabled: boolean;
  totalScore: number;
  tier: Tier;
};

export type SocialAccount = {
  provider: SocialProvider;
};

export function getMe(): Promise<User> {
  return apiRequest<User>('/users/me');
}

export function updateProfile(body: {
  nickname?: string;
  profileImageUrl?: string | null;
}): Promise<User> {
  return apiRequest<User>('/users/me/profile', { method: 'PATCH', body });
}

export function updateNotificationSettings(body: {
  notificationEnabled: boolean;
}): Promise<User> {
  return apiRequest<User>('/users/me/notification-settings', {
    method: 'PATCH',
    body,
  });
}

export function getSocialAccounts(): Promise<SocialAccount[]> {
  return apiRequest<SocialAccount[]>('/users/me/social-accounts');
}
