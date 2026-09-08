import { randomUUID } from 'node:crypto';
import {
  PrismaClient,
  RankingPeriod,
  SocialProvider,
  TaskDifficulty,
} from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';

function requireDisposableDatabaseUrl(): string {
  if (process.env.F067_DISPOSABLE_DB_TEST !== '1') {
    throw new Error('F067 disposable database marker is required');
  }
  const raw = process.env.ACCOUNT_DELETION_DATABASE_URL;
  if (!raw) {
    throw new Error('F067 disposable database URL is required');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('F067 disposable database URL is invalid');
  }
  const databaseName = url.pathname.slice(1);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    !databaseName.startsWith('f067_account_deletion') ||
    databaseName === 'dsm_test'
  ) {
    throw new Error('F067 database must be a loopback task-owned database');
  }
  return raw;
}

const enabled = process.env.F067_DISPOSABLE_DB_TEST === '1';
const databaseUrl = enabled ? requireDisposableDatabaseUrl() : undefined;
const describePostgres = enabled ? describe : describe.skip;

describePostgres('account deletion PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let service: AuthService;

  beforeAll(() => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl! });
    service = new AuthService(
      prisma as never,
      { sign: jest.fn() } as never,
      {
        get: jest.fn(),
        getOrThrow: jest.fn().mockReturnValue('public-test-client-id'),
      } as never,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('removes every account-scoped row without touching another user', async () => {
    const suffix = randomUUID();
    const userId = `delete-${suffix}`;
    const otherUserId = `keep-${suffix}`;
    const categoryId = `category-${suffix}`;
    const taskId = `task-${suffix}`;
    const tokenId = `token-${suffix}`;
    const scheduleId = `schedule-${suffix}`;
    const deliveryId = `delivery-${suffix}`;
    const now = new Date();

    await prisma.user.createMany({
      data: [
        {
          id: userId,
          email: `delete-${suffix}@example.invalid`,
          nickname: `delete-${suffix}`,
        },
        {
          id: otherUserId,
          email: `keep-${suffix}@example.invalid`,
          nickname: `keep-${suffix}`,
        },
      ],
    });
    await prisma.socialAccount.create({
      data: {
        provider: SocialProvider.GOOGLE,
        providerUserId: `provider-${suffix}`,
        userId,
      },
    });
    await prisma.refreshToken.create({
      data: {
        tokenHash: `hash-${suffix}`,
        expiresAt: new Date(now.getTime() + 60_000),
        userId,
      },
    });
    await prisma.fcmToken.create({
      data: {
        id: tokenId,
        token: `fcm-${suffix}`,
        platform: 'android',
        userId,
      },
    });
    await prisma.category.create({
      data: {
        id: categoryId,
        name: `category-${suffix}`,
        color: '#000000',
        userId,
      },
    });
    await prisma.task.create({
      data: {
        id: taskId,
        title: 'delete me',
        startAt: now,
        endAt: new Date(now.getTime() + 60_000),
        difficulty: TaskDifficulty.LOW,
        userId,
        categoryId,
      },
    });
    await prisma.dailyScore.create({
      data: {
        userId,
        scoreDate: now,
      },
    });
    await prisma.rankingSnapshot.create({
      data: {
        userId,
        period: RankingPeriod.DAILY,
        rank: 1,
        percentile: 100,
        score: 0,
        snapshotAt: now,
      },
    });
    await prisma.notificationSchedule.create({
      data: {
        id: scheduleId,
        taskId,
        userId,
        scheduledAt: now,
      },
    });
    await prisma.notificationDelivery.create({
      data: {
        id: deliveryId,
        scheduleId,
        fcmTokenId: tokenId,
        tokenUpdatedAt: now,
      },
    });

    await service.deleteAccount(userId);
    await expect(service.deleteAccount(userId)).resolves.toBeUndefined();

    const deletedCounts = await Promise.all([
      prisma.user.count({ where: { id: userId } }),
      prisma.socialAccount.count({ where: { userId } }),
      prisma.refreshToken.count({ where: { userId } }),
      prisma.fcmToken.count({ where: { userId } }),
      prisma.category.count({ where: { userId } }),
      prisma.task.count({ where: { userId } }),
      prisma.dailyScore.count({ where: { userId } }),
      prisma.rankingSnapshot.count({ where: { userId } }),
      prisma.notificationSchedule.count({ where: { userId } }),
      prisma.notificationDelivery.count({ where: { id: deliveryId } }),
    ]);

    expect(deletedCounts).toEqual(new Array(10).fill(0));
    await expect(
      prisma.user.count({ where: { id: otherUserId } }),
    ).resolves.toBe(1);

    await prisma.user.delete({ where: { id: otherUserId } });
  });
});
