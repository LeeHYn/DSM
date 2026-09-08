import { createHttpClient } from '../../lib/api/http-client';
import { createAuthenticatedClient } from '../../lib/api/authenticated-client';
import { createProductApi } from './product-api';

const clientMutationId = '123e4567-e89b-42d3-a456-426614174000';

test('uses authenticated REST requests, UTC date keys and empty DELETE responses', async () => {
  const fetchImpl = jest.fn(
    async () => ({ ok: true, status: 200, text: async () => '[]' }) as Response,
  );
  const client = createAuthenticatedClient(
    createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl }),
    {
      getAccessToken: () => 'test-token',
      refreshAccessToken: async () => 'new-token',
      onUnauthorized: jest.fn(),
    },
  );
  const api = createProductApi(client);
  await api.tasks('2026-09-04');
  expect(fetchImpl).toHaveBeenLastCalledWith(
    'https://api.example.invalid/tasks?date=2026-09-04',
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }),
  );
  await api.leaderboard('WEEKLY');
  expect(fetchImpl).toHaveBeenLastCalledWith(
    'https://api.example.invalid/rankings/leaderboard?period=WEEKLY&limit=100',
    expect.anything(),
  );
  fetchImpl.mockResolvedValueOnce({
    ok: true,
    status: 204,
    text: async () => '',
  } as Response);
  await expect(api.remove('task /1')).resolves.toBeUndefined();
  expect(fetchImpl).toHaveBeenLastCalledWith(
    'https://api.example.invalid/tasks/task%20%2F1',
    expect.objectContaining({ method: 'DELETE' }),
  );
});
test('creates and changes completion using backend contracts', async () => {
  const task = {
    id: 't',
    userId: 'u',
    title: 'task',
    description: null,
    startAt: '2026-09-04T09:00:00Z',
    endAt: '2026-09-04T10:00:00Z',
    difficulty: 'HIGH',
    status: 'PENDING',
    completedAt: null,
    categoryId: null,
    notificationEnabled: false,
  };
  const fetchImpl = jest.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(task),
      }) as Response,
  );
  const api = createProductApi(
    createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl }),
  );
  const input = {
    title: task.title,
    startAt: task.startAt,
    endAt: task.endAt,
    difficulty: 'HIGH' as const,
    notificationEnabled: false,
  };
  await api.create(input, clientMutationId);
  expect(fetchImpl).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/tasks$/),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ ...input, clientMutationId }),
    }),
  );
  await api.complete('t');
  expect(fetchImpl).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/tasks\/t\/complete$/),
    expect.objectContaining({ method: 'PATCH' }),
  );
  await api.undo('t');
  expect(fetchImpl).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/tasks\/t$/),
    expect.objectContaining({ body: JSON.stringify({ status: 'PENDING' }) }),
  );
});

test('obtains an authenticated server-issued UUIDv4 mutation ID', async () => {
  const fetchImpl = jest.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ clientMutationId }),
      }) as Response,
  );
  const client = createAuthenticatedClient(
    createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl }),
    {
      getAccessToken: () => 'test-token',
      refreshAccessToken: async () => 'new-token',
      onUnauthorized: jest.fn(),
    },
  );

  await expect(
    createProductApi(client).issueClientMutationId(),
  ).resolves.toBe(clientMutationId);
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://api.example.invalid/tasks/client-mutation-ids',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }),
  );
});

it.each([
  ['missing', {}],
  ['malformed', { clientMutationId: 'not-a-uuid' }],
  [
    'wrong-version',
    { clientMutationId: '123e4567-e89b-12d3-a456-426614174000' },
  ],
])('rejects a %s client mutation ID response as a protocol error', async (_, body) => {
  const fetchImpl = jest.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
      }) as Response,
  );
  const api = createProductApi(
    createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl }),
  );

  await expect(api.issueClientMutationId()).rejects.toMatchObject({
    kind: 'protocol',
  });
});
