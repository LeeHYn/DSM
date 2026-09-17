import { createHttpClient } from './http-client';

it('parses validated JSON and accepts 204', async () => {
  const makeResponse = (status: number, text: string) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: jest.fn().mockResolvedValue(text),
    }) as unknown as Response;
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(makeResponse(200, '{"ok":true}'))
    .mockResolvedValueOnce(makeResponse(204, ''));
  const client = createHttpClient({
    baseUrl: 'https://api.example.com',
    fetchImpl,
  });

  await expect(
    client.request({
      path: '/json',
      validate: (value) => value as { ok: boolean },
    }),
  ).resolves.toEqual({ ok: true });
  await expect(
    client.request({ path: '/empty', responseMode: 'empty' }),
  ).resolves.toBeUndefined();
});

it('classifies unauthorized and other HTTP failures', async () => {
  const cases = [
    { status: 401, kind: 'unauthorized' },
    { status: 500, kind: 'http' },
  ] as const;

  for (const testCase of cases) {
    const client = createHttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl: jest.fn().mockResolvedValue(
        {
          ok: false,
          status: testCase.status,
          text: jest.fn().mockResolvedValue('{"error":"safe"}'),
        } as unknown as Response,
      ),
    });
    await expect(client.request({ path: '/x' })).rejects.toMatchObject({
      kind: testCase.kind,
      status: testCase.status,
    });
  }
});

it('preserves HTTP classification when reading an error body fails', async () => {
  const cases = [
    { status: 401, kind: 'unauthorized' },
    { status: 500, kind: 'http' },
  ] as const;

  for (const testCase of cases) {
    const text = jest
      .fn()
      .mockRejectedValue(new Error('sensitive body read failure'));
    const client = createHttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl: jest.fn().mockResolvedValue({
        ok: false,
        status: testCase.status,
        text,
      } as unknown as Response),
    });

    await expect(client.request({ path: '/x' })).rejects.toMatchObject({
      kind: testCase.kind,
      status: testCase.status,
    });
    expect(text).toHaveBeenCalledTimes(1);
  }
});

it.each([
  [409, 'Daily task limit reached', 'TASK_DAILY_LIMIT'],
  [409, 'Category name already exists', 'CATEGORY_NAME_CONFLICT'],
  [400, 'endAt must be after startAt', 'INVALID_TIME_RANGE'],
  [400, [{ property: 'title', constraints: { isNotEmpty: 'sensitive-input' } }], 'VALIDATION_FAILED'],
])('maps only recognized error metadata for status %s', async (status, message, code) => {
  const client = createHttpClient({
    baseUrl: 'https://api.example.com',
    fetchImpl: jest.fn().mockResolvedValue({
      ok: false, status,
      text: async () => JSON.stringify({ statusCode: status, message, path: '/private?token=secret' }),
    }),
  });
  const failure = await client.request({ path: '/x' }).catch(error => error);
  expect(failure).toMatchObject({ status, code, kind: 'http' });
  expect(JSON.stringify(failure)).not.toMatch(/sensitive-input|private|secret/);
});

it.each(['not-json', JSON.stringify({ statusCode: 409, message: 'secret-token' }), ' '.repeat(8193)])(
  'keeps unknown or excessive error details out of the error', async body => {
    const client = createHttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 409, text: async () => body }),
    });
    const failure = await client.request({ path: '/x' }).catch(error => error);
    expect(failure).toMatchObject({ kind: 'http', status: 409 });
    expect(failure).toHaveProperty('code', undefined);
    expect(JSON.stringify(failure)).not.toContain('secret-token');
  },
);

it('bounds a stuck 401 error body wait and retains unauthorized classification', async () => {
  jest.useFakeTimers();
  try {
    const text = jest.fn(() => new Promise<string>(() => {}));
    const client = createHttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 401, text }),
    });
    const result = client.request({ path: '/x' }).catch(error => error);
    await jest.advanceTimersByTimeAsync(251);
    expect(await result).toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(text).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

it('classifies network failure without retrying', async () => {
  const fetchImpl = jest
    .fn()
    .mockRejectedValue(new TypeError('Network request failed'));
  const client = createHttpClient({
    baseUrl: 'https://api.example.com',
    fetchImpl,
  });

  await expect(client.request({ path: '/x' })).rejects.toMatchObject({
    kind: 'network',
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it.each([null, undefined])(
  'classifies nullish fetch rejection as network',
  async (value) => {
    const fetchImpl = jest.fn().mockRejectedValue(value);
    const client = createHttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    await expect(client.request({ path: '/x' })).rejects.toMatchObject({
      kind: 'network',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  },
);

it('classifies timeout and malformed JSON', async () => {
  jest.useFakeTimers();
  const abortError = Object.assign(new Error('aborted'), {
    name: 'AbortError',
  });
  const timeoutFetch = jest.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(abortError));
      }),
  );
  const timeoutClient = createHttpClient({
    baseUrl: 'https://api.example.com',
    fetchImpl: timeoutFetch,
  });
  const timeoutRequest = timeoutClient.request({
    path: '/slow',
    timeoutMs: 10,
  });

  jest.advanceTimersByTime(10);
  await expect(timeoutRequest).rejects.toMatchObject({ kind: 'timeout' });
  jest.useRealTimers();

  const protocolClient = createHttpClient({
    baseUrl: 'https://api.example.com',
    fetchImpl: jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('not-json'),
    } as unknown as Response),
  });
  await expect(
    protocolClient.request({ path: '/broken' }),
  ).rejects.toMatchObject({ kind: 'protocol' });
});
