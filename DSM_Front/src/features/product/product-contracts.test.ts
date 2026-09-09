import {
  parseTasks,
  parseCategories,
  parseScore,
  parseSummary,
  parseRanking,
  parseLeaderboard,
  utcDay,
  utcTimestamp,
} from './product-contracts';

const task = {
  id: 'task-1',
  userId: 'user-1',
  title: '서버 일과',
  description: null,
  startAt: '2026-09-04T09:00:00.000Z',
  endAt: '2026-09-04T10:00:00.000Z',
  status: 'PENDING',
  difficulty: 'MEDIUM',
  categoryId: null,
  notificationEnabled: false,
  completedAt: null,
};

test('parses task data without inventing prototype values', () => {
  expect(parseTasks([task])[0]).toEqual(task);
  expect(() => parseTasks([{ ...task, status: 'UNKNOWN' }])).toThrow();
  expect(() => parseTasks([{ ...task, startAt: 'tomorrow' }])).toThrow();
  expect(() => parseTasks([{ ...task, notificationEnabled: 'yes' }])).toThrow();
  expect(() => parseTasks({ tasks: [] })).toThrow();
});
test('validates categories, score, summary and rank numeric boundaries', () => {
  expect(
    parseCategories([
      {
        id: 'category-1',
        name: '건강',
        color: '#fff',
        isDefault: true,
        userId: null,
      },
    ])[0].id,
  ).toBe('category-1');
  expect(parseScore(null)).toBeNull();
  expect(
    parseScore({
      userId: 'user-1',
      scoreDate: '2026-09-04T00:00:00.000Z',
      cappedScore: 70,
      achievementRate: '50',
    })?.achievementRate,
  ).toBe(50);
  expect(parseSummary({ totalScore: 500, tier: 'SILVER' }).totalScore).toBe(
    500,
  );
  expect(() => parseSummary({ totalScore: '500', tier: 'SILVER' })).toThrow();
  expect(() => parseSummary({ totalScore: -1, tier: 'UNKNOWN' })).toThrow();
  expect(() =>
    parseRanking({
      period: 'DAILY',
      score: 4,
      rank: 2,
      percentile: NaN,
      totalUsers: 10,
    }),
  ).toThrow();
  expect(() =>
    parseLeaderboard([
      {
        rank: 1,
        userId: 'u',
        nickname: 'a',
        tier: 'BAD',
        score: 3,
        profileImageUrl: null,
      },
    ]),
  ).toThrow();
});
test('uses UTC day keys and rejects rollover dates and invalid times', () => {
  expect(utcDay(new Date('2026-09-05T01:00:00+09:00'))).toBe('2026-09-04');
  expect(utcTimestamp('2026-09-04', '09:15')).toBe('2026-09-04T09:15:00.000Z');
  expect(() => utcTimestamp('2026-02-30', '09:00')).toThrow();
  expect(() => utcTimestamp('2026-09-04', '24:00')).toThrow();
});
