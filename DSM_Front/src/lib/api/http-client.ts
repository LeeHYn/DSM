import { ApiError } from './api-error';

const DEFAULT_TIMEOUT_MS = 10_000;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type HttpRequest<T> = {
  path: `/${string}`;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: JsonValue;
  accessToken?: string;
  responseMode?: 'json' | 'empty';
  validate?: (value: unknown) => T;
  timeoutMs?: number;
};

export interface HttpClient {
  request<T = unknown>(request: HttpRequest<T>): Promise<T>;
}

type FetchImplementation = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

type HttpClientOptions = {
  baseUrl: string;
  fetchImpl?: FetchImplementation;
};

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

export function createHttpClient({
  baseUrl,
  fetchImpl = fetch,
}: HttpClientOptions): HttpClient {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  return {
    async request<T = unknown>(request: HttpRequest<T>): Promise<T> {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      if (request.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      if (request.accessToken) {
        headers.Authorization = `Bearer ${request.accessToken}`;
      }

      try {
        const response = await fetchImpl(`${normalizedBaseUrl}${request.path}`, {
          method: request.method ?? 'GET',
          headers,
          body:
            request.body === undefined ? undefined : JSON.stringify(request.body),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new ApiError(
            response.status === 401 ? 'unauthorized' : 'http',
            'Request failed',
            { status: response.status },
          );
        }

        const responseText = await response.text();

        if (request.responseMode === 'empty') {
          return undefined as T;
        }

        try {
          const value = JSON.parse(responseText) as unknown;
          return request.validate ? request.validate(value) : (value as T);
        } catch {
          throw new ApiError('protocol', 'Invalid response');
        }
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }
        if (controller.signal.aborted || isAbortError(error)) {
          throw new ApiError('timeout', 'Request timed out');
        }
        throw new ApiError('network', 'Network request failed');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
