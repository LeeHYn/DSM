export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export function isAuthTokens(value: unknown): value is AuthTokens {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof AuthTokens, unknown>>;
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.trim().length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.trim().length > 0
  );
}
