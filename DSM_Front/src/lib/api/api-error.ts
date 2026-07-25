export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'http'
  | 'unauthorized'
  | 'protocol'
  | 'storage';

type ApiErrorOptions = {
  status?: number;
  code?: string;
  cause?: unknown;
};

export class ApiError extends Error {
  readonly name = 'ApiError';
  readonly status?: number;
  readonly code?: string;

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    options: ApiErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.status = options.status;
    this.code = options.code;
  }

  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      status: this.status,
      code: this.code,
    };
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
