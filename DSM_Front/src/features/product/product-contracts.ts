export type Difficulty = 'LOW' | 'MEDIUM' | 'HIGH';
export type Period = 'DAILY' | 'WEEKLY' | 'TOTAL';
export type Tier =
  'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'MASTER';
export type TaskInput = {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  difficulty: Difficulty;
  categoryId?: string;
  notificationEnabled: boolean;
};
export type Task = Omit<TaskInput, 'description' | 'categoryId'> & {
  id: string;
  userId: string;
  description: string | null;
  categoryId: string | null;
  completedAt: string | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
};
export type Category = {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  userId: string | null;
};
export type Score = {
  userId: string;
  scoreDate: string;
  cappedScore: number;
  achievementRate: number;
};
export type Summary = { totalScore: number; tier: Tier };
export type Ranking = {
  period: Period;
  score: number;
  rank: number;
  percentile: number;
  totalUsers: number;
};
export type Leader = {
  userId: string;
  nickname: string;
  rank: number;
  score: number;
  tier: Tier;
  profileImageUrl: string | null;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid object');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid string');
  return value;
}
function id(value: unknown): string {
  const result = text(value);
  if (!result.trim()) throw new Error('Missing identifier');
  return result;
}
function nullable(value: unknown): string | null {
  return value === null ? null : text(value);
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid boolean');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error('Invalid number');
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.includes(value as T)) throw new Error('Invalid enum');
  return value as T;
}
function timestamp(value: unknown): string {
  const result = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    throw new Error('Invalid timestamp');
  return result;
}
function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error('Invalid list');
  return value.map(parse);
}
const tiers: Tier[] = [
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'DIAMOND',
  'MASTER',
];
export function parseTask(value: unknown): Task {
  const v = record(value);
  return {
    id: id(v.id),
    userId: id(v.userId),
    title: text(v.title),
    description: nullable(v.description),
    startAt: timestamp(v.startAt),
    endAt: timestamp(v.endAt),
    difficulty: choice(v.difficulty, ['LOW', 'MEDIUM', 'HIGH']),
    status: choice(v.status, ['PENDING', 'COMPLETED', 'CANCELLED']),
    categoryId: nullable(v.categoryId),
    notificationEnabled: bool(v.notificationEnabled),
    completedAt: v.completedAt === null ? null : timestamp(v.completedAt),
  };
}
export const parseTasks = (value: unknown) => list(value, parseTask);
export const parseCategories = (value: unknown) =>
  list(value, (item) => {
    const v = record(item);
    return {
      id: id(v.id),
      name: text(v.name),
      color: text(v.color),
      isDefault: bool(v.isDefault),
      userId: nullable(v.userId),
    };
  });
export function parseScore(value: unknown): Score | null {
  if (value === null) return null;
  const v = record(value);
  const rate =
    typeof v.achievementRate === 'string' && v.achievementRate.trim()
      ? Number(v.achievementRate)
      : v.achievementRate;
  return {
    userId: id(v.userId),
    scoreDate: timestamp(v.scoreDate),
    cappedScore: number(v.cappedScore),
    achievementRate: number(rate),
  };
}
export function parseSummary(value: unknown): Summary {
  const v = record(value);
  return { totalScore: number(v.totalScore), tier: choice(v.tier, tiers) };
}
export function parseRanking(value: unknown): Ranking {
  const v = record(value);
  return {
    period: choice(v.period, ['DAILY', 'WEEKLY', 'TOTAL']),
    score: number(v.score),
    rank: number(v.rank),
    percentile: number(v.percentile),
    totalUsers: number(v.totalUsers),
  };
}
export const parseLeaderboard = (value: unknown): Leader[] =>
  list(value, (item) => {
    const v = record(item);
    return {
      userId: id(v.userId),
      nickname: text(v.nickname),
      rank: number(v.rank),
      score: number(v.score),
      tier: choice(v.tier, tiers),
      profileImageUrl: nullable(v.profileImageUrl),
    };
  });
export const utcDay = (date = new Date()) => date.toISOString().slice(0, 10);
export function utcTimestamp(day: string, time: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error('Invalid date/time');
  const date = new Date(`${day}T${time}:00.000Z`);
  if (!Number.isFinite(date.getTime()) || utcDay(date) !== day)
    throw new Error('Invalid calendar day');
  return date.toISOString();
}
