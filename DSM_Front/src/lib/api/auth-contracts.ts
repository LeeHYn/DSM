import { ApiError } from './api-error';

const MAX_ACCESS_TOKEN_LENGTH = 16 * 1024;
const MAX_REFRESH_TOKEN_LENGTH = 1024;

export type SocialProvider = 'GOOGLE' | 'KAKAO';

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type CurrentUser = {
  userId: string;
  onboardingCompletedAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}

function isRefreshToken(value: unknown): value is string {
  if (!isNonBlankString(value, MAX_REFRESH_TOKEN_LENGTH)) {
    return false;
  }

  const separator = value.indexOf('.');
  return (
    separator > 0 &&
    separator === value.lastIndexOf('.') &&
    separator < value.length - 1
  );
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function parseTokenPair(value: unknown): TokenPair {
  if (
    !isRecord(value) ||
    !isNonBlankString(value.accessToken, MAX_ACCESS_TOKEN_LENGTH) ||
    !isRefreshToken(value.refreshToken)
  ) {
    throw new ApiError('protocol', 'Invalid token response');
  }

  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
  };
}

export function parseCurrentUser(value: unknown): CurrentUser {
  if (
    !isRecord(value) ||
    !isNonBlankString(value.userId, Number.MAX_SAFE_INTEGER) ||
    (value.onboardingCompletedAt !== null &&
      !isCanonicalIsoTimestamp(value.onboardingCompletedAt))
  ) {
    throw new ApiError('protocol', 'Invalid current user response');
  }

  return {
    userId: value.userId,
    onboardingCompletedAt: value.onboardingCompletedAt,
  };
}
