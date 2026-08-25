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
  let refreshPromisePreviousAccessToken: string | null = null;
  let completedRefresh: CompletedRefresh | null = null;

  const refreshAccessToken = (
    previousAccessToken: string | null,
    initialUnauthorizedError: ApiError,
  ): Promise<string> => {
    if (
      completedRefresh?.previousAccessToken === previousAccessToken
    ) {
      if (
        session.getAccessToken() === completedRefresh.refreshedAccessToken
      ) {
        return Promise.resolve(completedRefresh.refreshedAccessToken);
      }

      completedRefresh = null;
      throw initialUnauthorizedError;
    }

    if (refreshPromise !== null) {
      if (refreshPromisePreviousAccessToken === previousAccessToken) {
        return refreshPromise;
      }

      throw initialUnauthorizedError;
    }

    completedRefresh = null;
    const operation = Promise.resolve().then(() =>
      session.refreshAccessToken(),
    );
    refreshPromise = operation;
    refreshPromisePreviousAccessToken = previousAccessToken;
    void operation.then(
      (refreshedAccessToken) => {
        completedRefresh = { previousAccessToken, refreshedAccessToken };
        if (refreshPromise === operation) {
          refreshPromise = null;
          refreshPromisePreviousAccessToken = null;
        }
      },
      () => {
        if (refreshPromise === operation) {
          refreshPromise = null;
          refreshPromisePreviousAccessToken = null;
        }
      },
    );

    return operation;
  };

  const replayAfterRefresh = async <T>(
    request: HttpRequest<T>,
    initialAccessToken: string | null,
    initialUnauthorizedError: ApiError,
  ): Promise<T> => {
    const currentAccessToken = session.getAccessToken();
    const canUseCompletedRefresh =
      completedRefresh?.previousAccessToken === initialAccessToken &&
      completedRefresh.refreshedAccessToken === currentAccessToken;
    if (
      currentAccessToken !== initialAccessToken &&
      !canUseCompletedRefresh
    ) {
      throw initialUnauthorizedError;
    }

    const refreshedAccessToken = await refreshAccessToken(
      initialAccessToken,
      initialUnauthorizedError,
    );
    if (session.getAccessToken() !== refreshedAccessToken) {
      throw initialUnauthorizedError;
    }

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

        return replayAfterRefresh(request, initialAccessToken, error);
      }
    },
  };
}
