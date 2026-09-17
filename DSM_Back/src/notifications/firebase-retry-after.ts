function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Transfer a delay only; never transfer SDK headers, messages or response data. */
export function firebaseRetryAfterMs(
  error: unknown,
  now = Date.now(),
): number | undefined {
  const delay = (timestamp: number): number | undefined =>
    Number.isFinite(new Date(timestamp).getTime()) && timestamp > now
      ? timestamp - now
      : undefined;
  const parse = (value: unknown): number | undefined => {
    if (value instanceof Date) return delay(value.getTime());
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return delay(now + value * 1000);
    }
    if (typeof value !== 'string' || !value.trim()) return;
    const text = value.trim();
    return delay(
      /^\d+$/.test(text) ? now + Number(text) * 1000 : Date.parse(text),
    );
  };
  const header = (headers: unknown): unknown =>
    record(headers)
      ? (headers['retry-after'] ?? headers['Retry-After'])
      : undefined;
  try {
    if (!record(error)) return;
    const direct = parse(error.retryAfter);
    if (direct !== undefined) return direct;
    if (typeof error.retryAfterMs === 'number' && error.retryAfterMs > 0) {
      const milliseconds = delay(now + error.retryAfterMs);
      if (milliseconds !== undefined) return milliseconds;
    }
    return (
      parse(header(error.headers)) ??
      (record(error.response)
        ? parse(header(error.response.headers))
        : undefined)
    );
  } catch {
    return undefined;
  }
}
