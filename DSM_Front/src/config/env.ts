const DEFAULT_API_BASE_URL = 'http://localhost:3000';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  return trimTrailingSlash(
    process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL,
  );
}

export function getWebSocketUrl(): string {
  return trimTrailingSlash(process.env.EXPO_PUBLIC_WS_URL ?? getApiBaseUrl());
}
