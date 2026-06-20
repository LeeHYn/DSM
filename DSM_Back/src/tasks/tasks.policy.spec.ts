import { MAX_DAILY_TASKS, utcDayRange } from './tasks.policy';

describe('MAX_DAILY_TASKS', () => {
  it('caps active tasks registered in a UTC day at 20', () => {
    expect(MAX_DAILY_TASKS).toBe(20);
  });
});

describe('utcDayRange', () => {
  it('returns UTC midnight boundaries for an offset date string', () => {
    const range = utcDayRange('2026-06-03T23:30:00-02:00');

    expect(range).toEqual({
      start: new Date('2026-06-04T00:00:00.000Z'),
      end: new Date('2026-06-05T00:00:00.000Z'),
    });
  });

  it('accepts a Date reference', () => {
    const range = utcDayRange(new Date('2026-12-31T23:59:59.999Z'));

    expect(range).toEqual({
      start: new Date('2026-12-31T00:00:00.000Z'),
      end: new Date('2027-01-01T00:00:00.000Z'),
    });
  });
});
