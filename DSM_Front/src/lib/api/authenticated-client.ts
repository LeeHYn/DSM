import { ApiError } from './api-error';
import { HttpClient, HttpRequest } from './http-client';

export type SessionCallbacks = {
  getAccessToken(): string | null;
  refreshAccessToken(): Promise<string>;
  onUnauthorized(): Promise<void> | void;
};

export interface AuthenticatedClient {
  request<T>(request: HttpRequest<T>): Promise<T>;
}

function isUnauthorized(error: unknown): error is ApiError {
  return error instanceof ApiError && error.kind === 'unauthorized';
}

function withAccessToken<T>(
  request: HttpRequest<T>,
  accessToken: string | null,
): HttpRequest<T> {
  return {
    ...request,
    accessToken: accessToken ?? undefined,
  };
}

export function createAuthenticatedClient(
  http: HttpClient,
  session: SessionCallbacks,
): AuthenticatedClient {
  let refreshPromise: Promise<string> | null = null;

  const refreshAccessToken = (): Promise<string> => {
    if (refreshPromise === null) {
      refreshPromise = (async () => {
        try {
          return await session.refreshAccessToken();
        } finally {
          refreshPromise = null;
        }
      })();
    }

    return refreshPromise;
  };

  return {
    async request<T>(request: HttpRequest<T>): Promise<T> {
      try {
        return await http.request(
          withAccessToken(request, session.getAccessToken()),
        );
      } catch (error) {
        if (!isUnauthorized(error)) {
          throw error;
        }
      }

      const refreshedAccessToken = await refreshAccessToken();

      try {
        return await http.request(withAccessToken(request, refreshedAccessToken));
      } catch (error) {
        if (isUnauthorized(error)) {
          try {
            await session.onUnauthorized();
          } finally {
            throw error;
          }
        }

        throw error;
      }
    },
  };
}
