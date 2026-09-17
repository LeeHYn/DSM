import {
  parseTask,
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

const score = {
  userId: 'user-1',
  scoreDate: '2026-09-04T00:00:00.000Z',
  cappedScore: 70,
  achievementRate: 50,
};

test.each([0, 900])('accepts the daily score boundary %s', cappedScore => {
  expect(parseScore({ ...score, cappedScore })?.cappedScore).toBe(cappedScore);
});

test.each([901, -1, NaN, Infinity, -Infinity])(
  'rejects an invalid daily capped score %s',
  cappedScore => {
    expect(() => parseScore({ ...score, cappedScore })).toThrow();
  },
);

test('allows accumulated scores above the daily cap', () => {
  expect(parseSummary({ totalScore: 1800, tier: 'GOLD' }).totalScore).toBe(1800);
  expect(
    parseRanking({
      period: 'TOTAL',
      score: 1800,
      rank: 1,
      percentile: 0,
      totalUsers: 1,
    }).score,
  ).toBe(1800);
  expect(
    parseLeaderboard([
      {
        userId: 'user-1',
        nickname: 'test',
        rank: 1,
        score: 1800,
        tier: 'GOLD',
        profileImageUrl: null,
      },
    ])[0].score,
  ).toBe(1800);
});

describe.each([
  ['startAt', (value: string) => parseTask({ ...task, startAt: value }).startAt],
  ['endAt', (value: string) => parseTask({ ...task, endAt: value }).endAt],
  [
    'completedAt',
    (value: string) => parseTask({ ...task, completedAt: value }).completedAt,
  ],
  [
    'scoreDate',
    (value: string) => parseScore({ ...score, scoreDate: value })?.scoreDate,
  ],
] as const)('%s timestamp contract', (_field, parse) => {
  test.each([
    '2026-09-04T09:00:00.000Z',
    '2026-09-04T18:00:00+09:00',
    '2026-09-04T04:00:00-05:00',
    '2026-09-04T09:00+00:00',
  ])('preserves the explicit timezone in %s', value => {
    const parsed = parse(value);
    expect(parsed).toBe(value);
    expect(new Date(parsed ?? '').toISOString()).toBe('2026-09-04T09:00:00.000Z');
  });

  test.each([
    '2026-09-04T09:00:00.000',
    '2026-09-04T09:00',
    '2026-09-04',
    '2026-09-04T09:00:00+0900',
    '2026-09-04T09:00:00+24:00',
    '2026-09-04T09:00:00+09:60',
    '2026-13-04T09:00:00Z',
    '2026-09-04T25:00:00Z',
  ])('rejects a missing or invalid ISO timezone/date in %s', value => {
    expect(() => parse(value)).toThrow();
  });
});

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
