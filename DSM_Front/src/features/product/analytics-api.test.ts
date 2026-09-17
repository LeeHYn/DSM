import { createHttpClient } from '../../lib/api/http-client';
import { createAnalyticsApi, calendarRange } from './analytics-api';

test('builds UTC week and month ranges across leap days and year boundaries', () => {
  expect(calendarRange('2024-02-29', 'month')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  expect(calendarRange('2026-01-01', 'week')).toEqual({ from: '2025-12-28', to: '2026-01-03' });
  expect(() => calendarRange('2025-02-29', 'month')).toThrow();
});

const day = { date: '2026-09-11', registeredTaskCount: 2, completedTaskCount: 1, achievementRate: 50, cappedScore: 20 };
const body = { userId: 'u', from: day.date, to: day.date, days: [day] };
function setup(value: unknown) {
  const fetchImpl = jest.fn(async (_input: RequestInfo | URL) => ({
    ok: true, status: 200, text: async () => JSON.stringify(value),
  }) as Response);
  return { fetchImpl, api: createAnalyticsApi(createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl }), 'u') };
}
test('requests and validates the exact owner/date scope', async () => {
  const { api, fetchImpl } = setup(body);
  await expect(api.calendar(day.date, day.date)).resolves.toEqual(body.days);
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://api.example.invalid/scores/calendar?from=2026-09-11&to=2026-09-11', expect.anything(),
  );
});
test('rejects year zero before sending calendar or category requests', async () => {
  const { api, fetchImpl } = setup(body);
  await expect(Promise.resolve().then(() => api.calendar('0000-01-01', '0000-01-01'))).rejects.toThrow();
  await expect(Promise.resolve().then(() => api.categories('0000-01-01', '0000-01-01'))).rejects.toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
});
it.each([
  { ...body, userId: 'other' },
  { ...body, from: '2026-09-10' },
  { ...body, days: [] },
  { ...body, days: [day, day] },
  { ...body, days: [{ ...day, cappedScore: 901 }] },
  { ...body, days: [{ ...day, completedTaskCount: 3 }] },
  { ...body, days: [{ ...day, achievementRate: 101 }] },
])('rejects mismatched or invalid calendar responses', async (value) => {
  await expect(setup(value).api.calendar(day.date, day.date)).rejects.toMatchObject({ kind: 'protocol' });
});
test('validates category statistics and keeps uncapped raw scores', async () => {
  const category = { categoryId: null, name: '미분류', color: '#888888', registeredTaskCount: 50, completedTaskCount: 40, achievementRate: 80, rawScore: 1200 };
  const { api } = setup({ userId: 'u', from: day.date, to: day.date, categories: [category] });
  await expect(api.categories(day.date, day.date)).resolves.toEqual([category]);
});
test('rejects invalid ranges without sending requests', async () => {
  const { api, fetchImpl } = setup(body);
  expect(() => api.calendar('2026-09-11', '2026-09-10')).toThrow();
  expect(() => api.calendar('2026-01-01', '2026-03-01')).toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
});
