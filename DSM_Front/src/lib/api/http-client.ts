import { ApiError } from './api-error';

const DEFAULT_TIMEOUT_MS = 10_000;
const ERROR_BODY_LIMIT = 8192;
const ERROR_BODY_WAIT_MS = 250;

function errorCode(value: unknown, status: number): string | undefined {
  if (
    typeof value !== 'object' || value === null ||
    !('statusCode' in value) || value.statusCode !== status ||
    !('message' in value)
  ) return;
  if (status === 409 && value.message === 'Daily task limit reached')
    return 'TASK_DAILY_LIMIT';
  if (status === 409 && value.message === 'Category name already exists')
    return 'CATEGORY_NAME_CONFLICT';
  if (status === 400 && value.message === 'endAt must be after startAt')
    return 'INVALID_TIME_RANGE';
  if (
    status === 400 && Array.isArray(value.message) &&
    value.message.length > 0 && value.message.every((item: unknown) =>
      typeof item === 'object' && item !== null && 'property' in item &&
      typeof item.property === 'string' &&
      ['title', 'name', 'startAt', 'endAt', 'difficulty', 'categoryId', 'notificationEnabled', 'color'].includes(item.property),
    )
  ) return 'VALIDATION_FAILED';
}

async function readErrorCode(
  response: Response,
  controller: AbortController,
): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const declaredLength = Number(response.headers?.get('content-length'));
    if (declaredLength > ERROR_BODY_LIMIT) {
      controller.abort();
      return;
    }
    const expired = new Promise<undefined>(resolve => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(undefined);
      }, ERROR_BODY_WAIT_MS);
    });
    const body = await Promise.race([response.text(), expired]);
    if (typeof body !== 'string' || body.length > ERROR_BODY_LIMIT) return;
    return errorCode(JSON.parse(body) as unknown, response.status);
  } catch {
    // Preserve the already known HTTP status even if metadata cannot be read.
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

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
          const code = await readErrorCode(response, controller);
          throw new ApiError(
            response.status === 401 ? 'unauthorized' : 'http',
            'Request failed',
            { status: response.status, code },
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
