export const MAX_DAILY_TASKS = 20;

export interface UtcDayRange {
  start: Date;
  end: Date;
}

export function utcDayRange(reference: Date | string): UtcDayRange {
  const date = new Date(reference);
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { start, end };
}
