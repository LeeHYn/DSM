import type { AuthenticatedClient } from '../../lib/api/authenticated-client';
import {
  parseTasks,
  parseTask,
  parseCategories,
  parseScore,
  parseSummary,
  parseRanking,
  parseLeaderboard,
  utcTimestamp,
  type Period,
  type TaskInput,
} from './product-contracts';

const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseClientMutationId(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid client mutation ID response');
  }
  const clientMutationId = (value as Record<string, unknown>)
    .clientMutationId;
  if (
    typeof clientMutationId !== 'string' ||
    !uuidV4Pattern.test(clientMutationId)
  ) {
    throw new Error('Invalid client mutation ID');
  }
  return clientMutationId;
}

export function createProductApi(client: AuthenticatedClient) {
  const path = (id: string): `/tasks/${string}` =>
    `/tasks/${encodeURIComponent(id)}`;
  return {
    tasks(date: string) {
      utcTimestamp(date, '00:00');
      return client.request({
        path: `/tasks?date=${date}`,
        validate: parseTasks,
      });
    },
    categories: () =>
      client.request({ path: '/categories', validate: parseCategories }),
    score(date: string) {
      utcTimestamp(date, '00:00');
      return client.request({
        path: `/scores?date=${date}`,
        validate: parseScore,
      });
    },
    summary: () =>
      client.request({ path: '/scores/summary', validate: parseSummary }),
    ranking: (period: Period) =>
      client.request({
        path: `/rankings?period=${period}`,
        validate: parseRanking,
      }),
    leaderboard: (period: Period) =>
      client.request({
        path: `/rankings/leaderboard?period=${period}&limit=100`,
        validate: parseLeaderboard,
      }),
    issueClientMutationId: () =>
      client.request({
        path: '/tasks/client-mutation-ids',
        method: 'POST',
        validate: parseClientMutationId,
      }),
    create: (input: TaskInput, clientMutationId: string) =>
      client.request({
        path: '/tasks',
        method: 'POST',
        body: { ...input, clientMutationId },
        validate: parseTask,
      }),
    update: (id: string, input: TaskInput) =>
      client.request({
        path: path(id),
        method: 'PATCH',
        body: input,
        validate: parseTask,
      }),
    complete: (id: string) =>
      client.request({
        path: `${path(id)}/complete`,
        method: 'PATCH',
        validate: parseTask,
      }),
    undo: (id: string) =>
      client.request({
        path: path(id),
        method: 'PATCH',
        body: { status: 'PENDING' },
        validate: parseTask,
      }),
    remove: (id: string) =>
      client.request<void>({
        path: path(id),
        method: 'DELETE',
        responseMode: 'empty',
      }),
  };
}
export type ProductApi = ReturnType<typeof createProductApi>;
