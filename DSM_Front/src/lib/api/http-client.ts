import { getApiBaseUrl } from '@/config/env';
import type { AuthTokens } from '@/lib/auth/token-types';
import { parseApiError } from './api-error';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type TokenController = {
  getTokens: () => AuthTokens | null;
  setTokens: (tokens: AuthTokens | null) => Promise<void>;
  refreshTokens: (refreshToken: string) => Promise<AuthTokens>;
};

export type ApiRequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  authenticated?: boolean;
  refreshOnUnauthorized?: boolean;
};

let tokenController: TokenController | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function configureHttpClient(controller: TokenController): void {
  tokenController = controller;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return requestWithOptionalRefresh<T>(path, options, true);
}

async function requestWithOptionalRefresh<T>(
  path: string,
  options: ApiRequestOptions,
  allowRefresh: boolean,
): Promise<T> {
  const requestTokens = tokenController?.getTokens() ?? null;
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers: buildHeaders(options, requestTokens),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (
    response.status === 401 &&
    allowRefresh &&
    options.authenticated !== false &&
    options.refreshOnUnauthorized !== false
  ) {
    const currentTokens = tokenController?.getTokens() ?? null;
    if (
      requestTokens?.accessToken &&
      currentTokens?.accessToken &&
      requestTokens.accessToken !== currentTokens.accessToken
    ) {
      return requestWithOptionalRefresh<T>(path, options, false);
    }

    const refreshed = await refreshSession(
      requestTokens?.refreshToken ?? currentTokens?.refreshToken,
    );
    if (refreshed) {
      return requestWithOptionalRefresh<T>(path, options, false);
    }
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function buildHeaders(
  options: ApiRequestOptions,
  tokens: AuthTokens | null,
): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.authenticated !== false && tokens?.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  return headers;
}

async function refreshSession(refreshToken?: string): Promise<boolean> {
  const controller = tokenController;
  if (!controller || !refreshToken) {
    return false;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = refreshSessionWithToken(controller, refreshToken);
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function refreshSessionWithToken(
  controller: TokenController,
  refreshToken: string,
): Promise<boolean> {
  try {
    const nextTokens = await controller.refreshTokens(refreshToken);
    await controller.setTokens(nextTokens);
    return true;
  } catch {
    if (controller.getTokens()?.refreshToken === refreshToken) {
      await controller.setTokens(null);
    }
    return false;
  }
}
