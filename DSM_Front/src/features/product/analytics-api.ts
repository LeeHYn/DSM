import type { AuthenticatedClient } from '../../lib/api/authenticated-client';
import { utcDay, utcTimestamp } from './product-contracts';

export type CalendarDay = {
  date: string;
  registeredTaskCount: number;
  completedTaskCount: number;
  achievementRate: number;
  cappedScore: number;
};
export type CategoryStatistics = Omit<CalendarDay, 'date' | 'cappedScore'> & {
  categoryId: string | null;
  name: string;
  color: string;
  rawScore: number;
};
export function shiftDay(day: string, delta: number): string {
  const date = new Date(utcTimestamp(day, '00:00'));
  date.setUTCDate(date.getUTCDate() + delta);
  return utcDay(date);
}
export function calendarRange(day: string, mode: 'week' | 'month') {
  const date = new Date(utcTimestamp(day, '00:00'));
  if (mode === 'week') {
    const from = shiftDay(day, -date.getUTCDay());
    return { from, to: shiftDay(from, 6) };
  }
  date.setUTCDate(1);
  const from = utcDay(date);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return { from, to: utcDay(date) };
}
function rangeDays(from: string, to: string) {
  if (from.startsWith('0000-') || to.startsWith('0000-')) throw new Error('Invalid analytics range');
  const start = Date.parse(utcTimestamp(from, '00:00'));
  const end = Date.parse(utcTimestamp(to, '00:00'));
  const count = (end - start) / 86_400_000 + 1;
  if (count < 1 || count > 42) throw new Error('Invalid analytics range');
  return count;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid analytics object');
  return value as Record<string, unknown>;
}
function nonnegative(value: unknown, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) throw new Error('Invalid analytics number');
  return value;
}
function counts(v: Record<string, unknown>) {
  const registeredTaskCount = nonnegative(v.registeredTaskCount, true);
  const completedTaskCount = nonnegative(v.completedTaskCount, true);
  const achievementRate = nonnegative(v.achievementRate);
  if (completedTaskCount > registeredTaskCount || achievementRate > 100) throw new Error('Invalid analytics counts');
  return { registeredTaskCount, completedTaskCount, achievementRate };
}
function scopedRows(value: unknown, userId: string, from: string, to: string, key: string): unknown[] {
  const v = record(value);
  if (v.userId !== userId || v.from !== from || v.to !== to || !Array.isArray(v[key])) throw new Error('Invalid analytics scope');
  return v[key] as unknown[];
}
export function createAnalyticsApi(client: AuthenticatedClient, userId: string) {
  return {
    calendar(from: string, to: string): Promise<CalendarDay[]> {
      const count = rangeDays(from, to);
      return client.request({
        path: `/scores/calendar?from=${from}&to=${to}`,
        validate(value) {
          const rows = scopedRows(value, userId, from, to, 'days');
          if (rows.length !== count) throw new Error('Incomplete analytics range');
          return rows.map((row, index) => {
            const v = record(row);
            const date = shiftDay(from, index);
            const cappedScore = nonnegative(v.cappedScore, true);
            if (v.date !== date || cappedScore > 900) throw new Error('Invalid calendar day');
            return { date, cappedScore, ...counts(v) };
          });
        },
      });
    },
    categories(from: string, to: string): Promise<CategoryStatistics[]> {
      rangeDays(from, to);
      return client.request({
        path: `/scores/categories?from=${from}&to=${to}`,
        validate(value) {
          const seen = new Set<string | null>();
          return scopedRows(value, userId, from, to, 'categories').map(row => {
            const v = record(row);
            if (
              !(v.categoryId === null || (typeof v.categoryId === 'string' && v.categoryId.length > 0)) ||
              typeof v.name !== 'string' || typeof v.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v.color) || seen.has(v.categoryId)
            ) throw new Error('Invalid category statistics');
            seen.add(v.categoryId);
            return { categoryId: v.categoryId, name: v.name, color: v.color, rawScore: nonnegative(v.rawScore, true), ...counts(v) };
          });
        },
      });
    },
  };
}
