import { firebaseRetryAfterMs } from './firebase-retry-after';

describe('Firebase retry metadata', () => {
  const now = Date.parse('2026-09-11T00:00:00Z');
  it.each([
    [{ retryAfter: '7200' }, 7_200_000],
    [{ retryAfter: 7200 }, 7_200_000],
    [{ retryAfterMs: 1234 }, 1234],
    [{ headers: { 'Retry-After': '7200' } }, 7_200_000],
    [{ response: { headers: { 'retry-after': '7200' } } }, 7_200_000],
    [{ retryAfter: new Date(now + 5000) }, 5000],
    [{ retryAfter: 'Fri, 11 Sep 2026 00:00:05 GMT' }, 5000],
  ])('normalizes supported metadata %j', (input, expected) => {
    expect(firebaseRetryAfterMs(input, now)).toBe(expected);
  });
  it.each([
    null,
    {},
    { retryAfter: -1 },
    { retryAfterMs: Infinity },
    { retryAfter: 'private request body' },
    { retryAfterMs: 1e20 },
    { retryAfter: new Date(now - 1) },
  ])('drops invalid metadata %j', (input) => {
    expect(firebaseRetryAfterMs(input, now)).toBeUndefined();
  });
  it('ignores raw headers and preserves only numeric retry data', () => {
    expect(
      firebaseRetryAfterMs(
        {
          retryAfter: '7200',
          authorization: 'synthetic-sensitive',
          response: { data: 'private' },
        },
        now,
      ),
    ).toBe(7_200_000);
  });
});
