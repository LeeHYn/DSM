import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type DailyScore,
  type Prisma,
  type Tier,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeDailyScore,
  DIFFICULTY_SCORE,
  tierForScore,
} from './scores.policy';

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 42;

export interface CalendarDay {
  date: string;
  registeredTaskCount: number;
  completedTaskCount: number;
  achievementRate: number;
  cappedScore: number;
}

export interface ScoreCalendar {
  userId: string;
  from: string;
  to: string;
  days: CalendarDay[];
}

interface CategoryAggregate {
  categoryId: string | null;
  name: string | null;
  color: string | null;
  registeredTaskCount: number;
  completedTaskCount: number;
  rawScore: number;
}

export interface CategoryStatistics {
  userId: string;
  from: string;
  to: string;
  categories: Array<
    CategoryAggregate & {
      name: string;
      color: string;
      achievementRate: number;
    }
  >;
}

@Injectable()
export class ScoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recomputes the user's DailyScore for the UTC day of `reference`, then
   * refreshes the user's cumulative totalScore and tier. Idempotent.
   */
  async recompute(
    userId: string,
    reference: Date | string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<DailyScore> {
    const dayStart = this.startOfUtcDay(reference);
    const nextDay = new Date(dayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const tasks = await client.task.findMany({
      where: {
        userId,
        deletedAt: null,
        startAt: { gte: dayStart, lt: nextDay },
      },
      select: {
        status: true,
        difficulty: true,
        completedAt: true,
      },
    });

    const result = computeDailyScore({
      registeredTaskCount: tasks.length,
      completedDifficulties: tasks
        .filter(
          (task) =>
            task.status === TaskStatus.COMPLETED &&
            task.completedAt !== null &&
            task.completedAt >= dayStart &&
            task.completedAt < nextDay,
        )
        .map((task) => task.difficulty),
    });

    const dailyScore = await client.dailyScore.upsert({
      where: { userId_scoreDate: { userId, scoreDate: dayStart } },
      create: { userId, scoreDate: dayStart, ...result },
      update: { ...result },
    });

    await this.recomputeUserTotal(userId, client);
    return dailyScore;
  }

  getDaily(
    userId: string,
    reference: Date | string,
  ): Promise<DailyScore | null> {
    const dayStart = this.startOfUtcDay(reference);
    return this.prisma.dailyScore.findUnique({
      where: { userId_scoreDate: { userId, scoreDate: dayStart } },
    });
  }

  getSummary(userId: string): Promise<{ totalScore: number; tier: Tier }> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totalScore: true, tier: true },
    });
  }

  async getCalendar(
    userId: string,
    from: string,
    to: string,
  ): Promise<ScoreCalendar> {
    const { start, end } = this.parseRange(from, to);
    const rows = await this.prisma.dailyScore.findMany({
      where: { userId, scoreDate: { gte: start, lt: end } },
      orderBy: { scoreDate: 'asc' },
      take: MAX_RANGE_DAYS,
      select: {
        scoreDate: true,
        registeredTaskCount: true,
        completedTaskCount: true,
        achievementRate: true,
        cappedScore: true,
      },
    });
    const byDate = new Map(
      rows.map((row) => [row.scoreDate.toISOString().slice(0, 10), row]),
    );
    const days: CalendarDay[] = [];
    for (
      const day = new Date(start);
      day < end;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      const date = day.toISOString().slice(0, 10);
      const row = byDate.get(date);
      days.push({
        date,
        registeredTaskCount: row?.registeredTaskCount ?? 0,
        completedTaskCount: row?.completedTaskCount ?? 0,
        achievementRate: Number(row?.achievementRate ?? 0),
        cappedScore: row?.cappedScore ?? 0,
      });
    }
    return { userId, from, to, days };
  }

  async getCategoryStatistics(
    userId: string,
    from: string,
    to: string,
  ): Promise<CategoryStatistics> {
    const { start, end } = this.parseRange(from, to);
    const rows = await this.prisma.$queryRaw<CategoryAggregate[]>`
      SELECT c.id AS "categoryId", c.name, c.color,
        COUNT(*)::integer AS "registeredTaskCount",
        COUNT(*) FILTER (WHERE t.status = 'COMPLETED'
          AND (t."completedAt" AT TIME ZONE 'UTC')::date =
              (t."startAt" AT TIME ZONE 'UTC')::date
        )::integer AS "completedTaskCount",
        SUM(CASE WHEN t.status = 'COMPLETED'
          AND (t."completedAt" AT TIME ZONE 'UTC')::date =
              (t."startAt" AT TIME ZONE 'UTC')::date
          THEN CASE t.difficulty
            WHEN 'LOW' THEN ${DIFFICULTY_SCORE.LOW}
            WHEN 'MEDIUM' THEN ${DIFFICULTY_SCORE.MEDIUM}
            WHEN 'HIGH' THEN ${DIFFICULTY_SCORE.HIGH}
          END ELSE 0 END)::integer AS "rawScore"
      FROM "Task" t
      LEFT JOIN "Category" c ON c.id = t."categoryId"
        AND (c."userId" = t."userId" OR c."isDefault" = true)
      WHERE t."userId" = ${userId} AND t."deletedAt" IS NULL
        AND t."startAt" >= ${start} AND t."startAt" < ${end}
      GROUP BY c.id, c.name, c.color
      ORDER BY c.id ASC NULLS LAST
    `;
    return {
      userId,
      from,
      to,
      categories: rows.map((row) => ({
        ...row,
        name: row.name ?? '미분류',
        color: row.color ?? '#888888',
        achievementRate:
          row.registeredTaskCount > 0
            ? Math.round(
                (row.completedTaskCount * 10000) / row.registeredTaskCount,
              ) / 100
            : 0,
      })),
    };
  }

  private parseRange(from: string, to: string): { start: Date; end: Date } {
    const parseDay = (value: string): Date => {
      if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        value.startsWith('0000-')
      ) {
        throw new BadRequestException('Invalid score date range');
      }
      const day = new Date(`${value}T00:00:00.000Z`);
      if (
        !Number.isFinite(day.getTime()) ||
        day.toISOString().slice(0, 10) !== value
      ) {
        throw new BadRequestException('Invalid score date range');
      }
      day.setUTCHours(0, 0, 0, 0);
      return day;
    };
    const start = parseDay(from);
    const lastDay = parseDay(to);
    const count = (lastDay.getTime() - start.getTime()) / DAY_MS + 1;
    if (count < 1 || count > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        'Score date range must contain 1 to 42 days',
      );
    }
    const end = new Date(lastDay);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  private async recomputeUserTotal(
    userId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const aggregate = await client.dailyScore.aggregate({
      where: { userId },
      _sum: { cappedScore: true },
    });
    const totalScore = aggregate._sum.cappedScore ?? 0;

    await client.user.update({
      where: { id: userId },
      data: { totalScore, tier: tierForScore(totalScore) },
    });
  }

  private startOfUtcDay(reference: Date | string): Date {
    const date = new Date(reference);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
}
