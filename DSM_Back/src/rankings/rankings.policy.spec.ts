import { computeRanking, startOfUtcDay, weeklyRange } from './rankings.policy';

describe('computeRanking', () => {
  it('ranks first when no one scores higher', () => {
    expect(computeRanking(0, 100)).toEqual({ rank: 1, percentile: 1 });
  });

  it('computes top percentile from rank / total', () => {
    expect(computeRanking(24, 200)).toEqual({ rank: 25, percentile: 12.5 });
  });

  it('places the subject last when everyone scores higher', () => {
    expect(computeRanking(99, 100)).toEqual({ rank: 100, percentile: 100 });
  });

  it('returns zero percentile when there are no users', () => {
    expect(computeRanking(0, 0)).toEqual({ rank: 1, percentile: 0 });
  });
});

describe('startOfUtcDay', () => {
  it('truncates a timestamp to the UTC midnight of that day', () => {
    expect(startOfUtcDay('2026-06-07T15:30:00Z').toISOString()).toBe(
      '2026-06-07T00:00:00.000Z',
    );
  });
});

describe('weeklyRange', () => {
  it('returns the inclusive last-7-day half-open UTC window', () => {
    const { gte, lt } = weeklyRange('2026-06-07T10:00:00Z');
    expect(gte.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-06-08T00:00:00.000Z');
  });
});
