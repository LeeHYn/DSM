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

type CompletedRefresh = {
  previousAccessToken: string | null;
  refreshedAccessToken: string;
};

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
  let completedRefresh: CompletedRefresh | null = null;

  const refreshAccessToken = (
    previousAccessToken: string | null,
  ): Promise<string> => {
    if (
      completedRefresh?.previousAccessToken === previousAccessToken
    ) {
      return Promise.resolve(completedRefresh.refreshedAccessToken);
    }

    if (refreshPromise !== null) {
      return refreshPromise;
    }

    completedRefresh = null;
    const operation = Promise.resolve().then(() =>
      session.refreshAccessToken(),
    );
    refreshPromise = operation;
    void operation.then(
      (refreshedAccessToken) => {
        completedRefresh = { previousAccessToken, refreshedAccessToken };
        if (refreshPromise === operation) {
          refreshPromise = null;
        }
      },
      () => {
        if (refreshPromise === operation) {
          refreshPromise = null;
        }
      },
    );

    return operation;
  };

  return {
    async request<T>(request: HttpRequest<T>): Promise<T> {
      const initialAccessToken = session.getAccessToken();

      try {
        return await http.request(withAccessToken(request, initialAccessToken));
      } catch (error) {
        if (!isUnauthorized(error)) {
          throw error;
        }
      }

      const refreshedAccessToken = await refreshAccessToken(initialAccessToken);

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
