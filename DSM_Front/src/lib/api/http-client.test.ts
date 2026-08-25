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

it('classifies HTTP failures without reading error bodies', async () => {
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
    expect(text).not.toHaveBeenCalled();
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
