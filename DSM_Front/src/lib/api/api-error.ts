export type ApiErrorBody = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody | null,
  ) {
    super(formatApiErrorMessage(status, body));
    this.name = 'ApiError';
  }
}

function formatApiErrorMessage(
  status: number,
  body: ApiErrorBody | null,
): string {
  const message = body?.message;
  if (Array.isArray(message)) {
    return message.join('\n');
  }

  return message ?? body?.error ?? `Request failed with status ${status}`;
}

export async function parseApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(response.status, body);
  } catch {
    return new ApiError(response.status, null);
  }
}
