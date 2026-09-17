import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { Prisma as PrismaRuntime } from '@prisma/client';
import {
  NotificationsService,
  type RegisteredFcmToken,
} from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const NOW = new Date('2026-07-15T00:00:00.000Z');

const makePrismaMock = () => {
  const transactionClient = {
    user: {
      findUnique: jest.fn<
        Promise<{ notificationEnabled: boolean } | null>,
        [Prisma.UserFindUniqueArgs]
      >(),
      update: jest.fn<
        Promise<{ notificationEnabled: boolean }>,
        [Prisma.UserUpdateArgs]
      >(),
    },
    fcmToken: {
      findUnique: jest.fn<
        Promise<{
          userId: string;
          revokedAt: Date | null;
          updatedAt: Date;
        } | null>,
        [Prisma.FcmTokenFindUniqueArgs]
      >(),
      count: jest
        .fn<Promise<number>, [Prisma.FcmTokenCountArgs]>()
        .mockResolvedValue(0),
      upsert: jest.fn<
        Promise<RegisteredFcmToken>,
        [Prisma.FcmTokenUpsertArgs]
      >(),
      updateMany: jest.fn<
        Promise<Prisma.BatchPayload>,
        [Prisma.FcmTokenUpdateManyArgs]
      >(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    notificationDelivery: {
      findFirst: jest.fn<
        Promise<{ id: string } | null>,
        [Prisma.NotificationDeliveryFindFirstArgs]
      >(),
      updateMany: jest.fn<
        Promise<Prisma.BatchPayload>,
        [Prisma.NotificationDeliveryUpdateManyArgs]
      >(),
    },
  };

  return {
    ...transactionClient,
    $transaction: jest.fn(
      async (
        operation: (
          client: typeof transactionClient,
        ) => Promise<RegisteredFcmToken>,
      ) => operation(transactionClient),
    ),
  };
};

const registeredToken = {
  id: 'fcm-token-1',
  platform: 'android',
  deviceId: 'device-1',
  lastSeenAt: NOW,
  revokedAt: null,
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prismaMock = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('notification settings', () => {
    it('reads only the authenticated user preference', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        notificationEnabled: false,
      });
      await expect(service.getSettings('user-1')).resolves.toEqual({
        notificationEnabled: false,
      });
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { notificationEnabled: true },
      });
    });

    it.each([false, true])(
      'persists boolean %s without coercion',
      async (notificationEnabled) => {
        prismaMock.user.update.mockResolvedValue({ notificationEnabled });
        await expect(
          service.setSettings('user-1', notificationEnabled),
        ).resolves.toEqual({ notificationEnabled });
        expect(prismaMock.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: { notificationEnabled },
          select: { notificationEnabled: true },
        });
      },
    );

    it.each(['false', 'true', 0, 1, null, undefined, {}, []])(
      'rejects direct non-boolean input %j before DB access',
      async (value) => {
        await expect(
          service.setSettings('user-1', value as boolean),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prismaMock.user.update).not.toHaveBeenCalled();
      },
    );

    it('returns 404 for a deleted user on read', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.getSettings('deleted-user')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('maps P2025 from an atomic update to 404', async () => {
      prismaMock.user.update.mockRejectedValue(
        new PrismaRuntime.PrismaClientKnownRequestError('gone', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.setSettings('deleted-user', false),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('preserves unexpected storage failures', async () => {
      const error = new Error('synthetic DB failure');
      prismaMock.user.update.mockRejectedValue(error);
      await expect(service.setSettings('user-1', true)).rejects.toBe(error);
    });
  });

  describe('authenticated due reminders', () => {
    const empty = {
      userExists: true,
      cursorValid: true,
      id: null,
      taskId: null,
      title: null,
      startAt: null,
      expiresAt: null,
    };
    const row = (id: string) => ({
      userExists: true,
      cursorValid: true,
      id,
      taskId: `task-${id}`,
      title: 'Task reminder',
      startAt: new Date(NOW.getTime() - 60_000),
      expiresAt: new Date(NOW.getTime() + 240_000),
    });
    const query = () => {
      const [parts, ...values] = prismaMock.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      return { text: parts.join('?').replace(/\s+/g, ' ').trim(), values };
    };

    it('uses one parameterized snapshot for owner, eligible cursor and microsecond-safe ordering', async () => {
      prismaMock.$queryRaw.mockResolvedValue([row('schedule-2')]);
      const result = await service.reminders("owner'--", {
        limit: 2,
        cursor: "cursor'--",
      });
      expect(result).toEqual({
        serverTime: NOW.toISOString(),
        reminders: [
          {
            id: 'schedule-2',
            taskId: 'task-schedule-2',
            title: 'Task reminder',
            startAt: row('').startAt.toISOString(),
            expiresAt: row('').expiresAt.toISOString(),
          },
        ],
        nextCursor: null,
      });
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
      const sql = query();
      expect(sql.values).toEqual(["owner'--", "cursor'--", NOW, 3]);
      expect(sql.text).not.toContain("owner'--");
      expect(sql.text).not.toContain("cursor'--");
      expect(sql.text).toContain('(e."startAt", e.id) > (c."startAt", c.id)');
      expect(sql.text).toContain('FROM eligible WHERE id =');
      expect(sql.text).toContain('ORDER BY e."startAt" ASC, e.id ASC LIMIT ?');
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('encodes due, expiry, owner, live-task and current-schedule checks in the same SQL', async () => {
      prismaMock.$queryRaw.mockResolvedValue([empty]);
      await service.reminders('user-1');
      const sql = query().text;
      for (const clause of [
        'n."userId" = o.id',
        'LEFT(BTRIM(t.title), 200) AS title',
        't."userId" = o.id',
        'o."notificationEnabled" = true',
        't."notificationEnabled" = true',
        "t.status = 'PENDING'",
        't."deletedAt" IS NULL',
        "n.status <> 'CANCELLED'",
        'n."scheduledAt" = t."startAt"',
        'n."scheduledAt" > i.now_at - INTERVAL \'5 minutes\'',
        'n."scheduledAt" <= i.now_at',
        'n."scheduledAt" + INTERVAL \'5 minutes\'',
      ])
        expect(sql).toContain(clause);
      expect(sql).not.toMatch(/n\.status\s*=\s*'SENT'/);
    });

    it.each([undefined, 100])(
      'bounds limit=%s to a fetch of at most 101',
      async (limit) => {
        prismaMock.$queryRaw.mockResolvedValue(
          Array.from({ length: 101 }, (_, index) => row(`schedule-${index}`)),
        );
        const result = await service.reminders('user-1', { limit });
        expect(query().values.at(-1)).toBe(101);
        expect(result.reminders).toHaveLength(100);
        expect(result.nextCursor).toBe('schedule-99');
      },
    );

    it('returns the last delivered ID rather than the lookahead row as cursor', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        row('first'),
        row('second'),
        row('lookahead'),
      ]);
      const result = await service.reminders('user-1', { limit: 2 });
      expect(result.reminders.map((reminder) => reminder.id)).toEqual([
        'first',
        'second',
      ]);
      expect(result.nextCursor).toBe('second');
    });

    it('returns no cursor when the final page exactly fills the limit', async () => {
      prismaMock.$queryRaw.mockResolvedValue([row('first'), row('second')]);
      expect(
        (await service.reminders('user-1', { limit: 2 })).nextCursor,
      ).toBeNull();
    });

    it.each([0, -10, 101, 1000, 1.5, NaN, Infinity, '2', null])(
      'rejects direct invalid limit %j before database access',
      async (limit) => {
        await expect(
          service.reminders('user-1', { limit: limit as number }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
      },
    );

    it('returns a typed empty result for global OFF or no eligible schedules', async () => {
      prismaMock.$queryRaw.mockResolvedValue([empty]);
      await expect(service.reminders('user-1')).resolves.toEqual({
        serverTime: NOW.toISOString(),
        reminders: [],
        nextCursor: null,
      });
    });

    it.each(['foreign', 'expired', 'cancelled', 'moved', 'disabled'])(
      'rejects %s cursor metadata with 404',
      async (cursor) => {
        prismaMock.$queryRaw.mockResolvedValue([
          { ...empty, cursorValid: false },
        ]);
        await expect(
          service.reminders('user-1', { cursor }),
        ).rejects.toBeInstanceOf(NotFoundException);
      },
    );

    it('returns 404 when the authenticated user was deleted before the query snapshot', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ ...empty, userExists: false }]);
      await expect(service.reminders('deleted-user')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('register', () => {
    it('creates a token with the authenticated user and sanitized response', async () => {
      prismaMock.fcmToken.findUnique.mockResolvedValue(null);
      prismaMock.fcmToken.upsert.mockResolvedValue(registeredToken);

      const result = await service.register('user-1', {
        token: 'secret-fcm-token',
        platform: 'android',
        deviceId: 'device-1',
      });

      expect(result).toEqual(registeredToken);
      expect(result).not.toHaveProperty('token');
      expect(result).not.toHaveProperty('userId');
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        {
          isolationLevel: PrismaRuntime.TransactionIsolationLevel.Serializable,
        },
      );
      expect(prismaMock.fcmToken.findUnique).toHaveBeenCalledWith({
        where: { token: 'secret-fcm-token' },
        select: { userId: true, revokedAt: true, updatedAt: true },
      });
      expect(prismaMock.fcmToken.upsert).toHaveBeenCalledWith({
        where: { token: 'secret-fcm-token' },
        create: {
          token: 'secret-fcm-token',
          userId: 'user-1',
          platform: 'android',
          deviceId: 'device-1',
          lastSeenAt: NOW,
          revokedAt: null,
          updatedAt: NOW,
        },
        update: {
          platform: 'android',
          deviceId: 'device-1',
          lastSeenAt: NOW,
          revokedAt: null,
          updatedAt: NOW,
        },
        select: {
          id: true,
          platform: true,
          deviceId: true,
          lastSeenAt: true,
          revokedAt: true,
        },
      });
    });

    it('updates the existing row on repeated registration', async () => {
      prismaMock.fcmToken.findUnique.mockResolvedValue({
        userId: 'user-1',
        revokedAt: null,
        updatedAt: NOW,
      });
      prismaMock.fcmToken.upsert.mockResolvedValue({
        ...registeredToken,
        platform: 'ios',
        deviceId: null,
      });

      const result = await service.register('user-1', {
        token: 'existing-token',
        platform: 'ios',
      });

      expect(result.platform).toBe('ios');
      expect(result.deviceId).toBeNull();
      const upsertArgs = prismaMock.fcmToken.upsert.mock.calls[0]?.[0];
      expect(upsertArgs).toMatchObject({
        where: { token: 'existing-token' },
        update: {
          platform: 'ios',
          deviceId: null,
          lastSeenAt: NOW,
        },
      });
      expect(upsertArgs?.update).not.toHaveProperty('userId');
      expect(prismaMock.notificationDelivery.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.notificationDelivery.updateMany).not.toHaveBeenCalled();
    });

    it('reactivates a revoked token on registration', async () => {
      prismaMock.fcmToken.findUnique.mockResolvedValue({
        userId: 'user-1',
        revokedAt: NOW,
        updatedAt: NOW,
      });
      prismaMock.fcmToken.upsert.mockResolvedValue(registeredToken);

      await service.register('user-1', {
        token: 'revoked-token',
        platform: 'android',
        deviceId: 'device-1',
      });

      const upsertArgs = prismaMock.fcmToken.upsert.mock.calls[0]?.[0];
      expect(upsertArgs).toMatchObject({ update: { revokedAt: null } });
    });

    it.each(['PENDING', 'PROCESSING'] as const)(
      'rejects cross-user ownership transfer with 409 before inspecting a %s delivery',
      async (deliveryStatus) => {
        prismaMock.fcmToken.findUnique.mockResolvedValue({
          userId: 'old-user',
          revokedAt: null,
          updatedAt: NOW,
        });
        prismaMock.notificationDelivery.findFirst.mockResolvedValue(
          deliveryStatus === 'PROCESSING' ? { id: 'delivery-1' } : null,
        );
        prismaMock.notificationDelivery.updateMany.mockResolvedValue({
          count: deliveryStatus === 'PENDING' ? 1 : 0,
        });

        await expect(
          service.register('new-user', {
            token: 'shared-device-token',
            platform: 'android',
          }),
        ).rejects.toMatchObject({
          status: 409,
        });

        expect(
          prismaMock.notificationDelivery.findFirst,
        ).not.toHaveBeenCalled();
        expect(
          prismaMock.notificationDelivery.updateMany,
        ).not.toHaveBeenCalled();
        expect(prismaMock.fcmToken.upsert).not.toHaveBeenCalled();
      },
    );

    it('retries a concurrent no-row registration transaction twice on P2034', async () => {
      const conflict = new PrismaRuntime.PrismaClientKnownRequestError(
        'write conflict',
        { code: 'P2034', clientVersion: 'test' },
      );
      prismaMock.fcmToken.findUnique.mockResolvedValue(null);
      prismaMock.fcmToken.upsert.mockResolvedValue(registeredToken);
      let attempt = 0;
      prismaMock.$transaction.mockImplementation(async (operation) => {
        const result = await operation(prismaMock);
        attempt += 1;
        if (attempt <= 2) {
          throw conflict;
        }
        return result;
      });

      await expect(
        service.register('user-1', {
          token: 'shared-device-token',
          platform: 'android',
        }),
      ).resolves.toEqual(registeredToken);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
      expect(prismaMock.fcmToken.findUnique).toHaveBeenCalledTimes(3);
      expect(prismaMock.fcmToken.upsert).toHaveBeenCalledTimes(3);
    });

    it('returns 409 after a concurrent no-row registration retry reveals a foreign owner', async () => {
      const conflict = new PrismaRuntime.PrismaClientKnownRequestError(
        'write conflict',
        { code: 'P2034', clientVersion: 'test' },
      );
      prismaMock.fcmToken.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'other-user',
          revokedAt: null,
          updatedAt: NOW,
        });
      prismaMock.fcmToken.upsert.mockResolvedValue(registeredToken);
      let attempt = 0;
      prismaMock.$transaction.mockImplementation(async (operation) => {
        const result = await operation(prismaMock);
        attempt += 1;
        if (attempt === 1) {
          throw conflict;
        }
        return result;
      });

      await expect(
        service.register('user-1', {
          token: 'shared-device-token',
          platform: 'android',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      expect(prismaMock.fcmToken.findUnique).toHaveBeenCalledTimes(2);
      expect(prismaMock.fcmToken.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.notificationDelivery.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.notificationDelivery.updateMany).not.toHaveBeenCalled();
    });

    it('stops after two P2034 retries', async () => {
      const conflict = new PrismaRuntime.PrismaClientKnownRequestError(
        'write conflict',
        { code: 'P2034', clientVersion: 'test' },
      );
      prismaMock.$transaction.mockRejectedValue(conflict);

      await expect(
        service.register('user-1', {
          token: 'secret-fcm-token',
          platform: 'android',
        }),
      ).rejects.toBe(conflict);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
    });
  });

  describe('registration generation and active limit', () => {
    it.each([0, 9])(
      'allows a new token with %i active tokens',
      async (count) => {
        prismaMock.fcmToken.findUnique.mockResolvedValue(null);
        prismaMock.fcmToken.count.mockResolvedValue(count);
        prismaMock.fcmToken.upsert.mockResolvedValue(registeredToken);

        await expect(
          service.register('user-1', {
            token: 'new-token',
            platform: 'android',
          }),
        ).resolves.toEqual(registeredToken);
        expect(prismaMock.fcmToken.count).toHaveBeenCalledWith({
          where: { userId: 'user-1', revokedAt: null },
        });
      },
    );

    it.each([10, 11])(
      'rejects new and revoked tokens at %i active tokens',
      async (count) => {
        prismaMock.fcmToken.count.mockResolvedValue(count);
        for (const existing of [
          null,
          {
            userId: 'user-1',
            revokedAt: NOW,
            updatedAt: NOW,
          },
        ]) {
          prismaMock.fcmToken.findUnique.mockResolvedValue(existing);
          await expect(
            service.register('user-1', {
              token: 'new-or-revoked',
              platform: 'android',
            }),
          ).rejects.toBeInstanceOf(ConflictException);
        }
        expect(prismaMock.fcmToken.upsert).not.toHaveBeenCalled();
      },
    );

    it('preserves active delivery generation while refreshing a legacy over-limit account', async () => {
      const generation = new Date('2026-07-14T00:00:00.000Z');
      prismaMock.fcmToken.findUnique.mockResolvedValue({
        userId: 'user-1',
        revokedAt: null,
        updatedAt: generation,
      });
      prismaMock.fcmToken.count.mockResolvedValue(20);
      prismaMock.fcmToken.upsert.mockResolvedValue(registeredToken);

      await service.register('user-1', {
        token: 'active',
        platform: 'android',
      });

      expect(
        prismaMock.fcmToken.upsert.mock.calls[0]?.[0].update,
      ).toMatchObject({
        updatedAt: generation,
        lastSeenAt: NOW,
        revokedAt: null,
      });
      expect(prismaMock.fcmToken.count).not.toHaveBeenCalled();
    });

    it.each([
      ['2026-07-14T00:00:00.000Z', '2026-07-15T00:00:00.000Z'],
      ['2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.001Z'],
      ['2026-07-15T00:00:00.010Z', '2026-07-15T00:00:00.011Z'],
    ])(
      'reactivation strictly advances %s to %s',
      async (previous, expected) => {
        prismaMock.fcmToken.findUnique.mockResolvedValue({
          userId: 'user-1',
          revokedAt: NOW,
          updatedAt: new Date(previous),
        });
        prismaMock.fcmToken.count.mockResolvedValue(9);

        await service.register('user-1', {
          token: 'revoked',
          platform: 'android',
        });

        expect(
          prismaMock.fcmToken.upsert.mock.calls[0]?.[0].update,
        ).toMatchObject({
          updatedAt: new Date(expected),
          lastSeenAt: NOW,
          revokedAt: null,
        });
      },
    );

    it.each(['register', 'revoke'] as const)(
      'locks the user before %s reads token state',
      async (operation) => {
        prismaMock.fcmToken.findUnique.mockResolvedValue(null);
        await service[operation]('user-1', {
          token: 'token',
          platform: 'android',
        });

        const [parts, userId] = prismaMock.$queryRaw.mock.calls[0] as [
          TemplateStringsArray,
          string,
        ];
        expect(parts.join('?').replace(/\s+/g, ' ').trim()).toBe(
          'SELECT 1 FROM "User" WHERE id = ? FOR UPDATE',
        );
        expect(userId).toBe('user-1');
        expect(prismaMock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
          prismaMock.fcmToken.findUnique.mock.invocationCallOrder[0],
        );
        expect(prismaMock.$transaction).toHaveBeenCalledWith(
          expect.any(Function),
          {
            isolationLevel:
              PrismaRuntime.TransactionIsolationLevel.Serializable,
          },
        );
      },
    );

    it('rechecks the cap after a serialization retry', async () => {
      prismaMock.fcmToken.findUnique.mockResolvedValue(null);
      prismaMock.fcmToken.count
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(10);
      prismaMock.fcmToken.upsert.mockRejectedValueOnce(
        new PrismaRuntime.PrismaClientKnownRequestError('write conflict', {
          code: 'P2034',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.register('user-1', {
          token: 'new-token',
          platform: 'android',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.fcmToken.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('revoke', () => {
    it('revokes only an active token owned by the authenticated user', async () => {
      const generation = new Date('2026-07-14T00:00:00.000Z');
      prismaMock.fcmToken.findUnique.mockResolvedValue({
        userId: 'user-1',
        revokedAt: null,
        updatedAt: generation,
      });
      prismaMock.fcmToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.revoke('user-1', { token: 'secret-fcm-token' }),
      ).resolves.toBeUndefined();

      expect(prismaMock.fcmToken.updateMany).toHaveBeenCalledWith({
        where: {
          token: 'secret-fcm-token',
          userId: 'user-1',
          revokedAt: null,
        },
        data: { revokedAt: NOW, updatedAt: generation },
      });
    });

    it.each([
      null,
      { userId: 'foreign-user', revokedAt: null, updatedAt: NOW },
      { userId: 'user-1', revokedAt: NOW, updatedAt: NOW },
    ])('is idempotent for unavailable token %j', async (existing) => {
      prismaMock.fcmToken.findUnique.mockResolvedValue(existing);
      prismaMock.fcmToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.revoke('user-1', { token: 'unavailable-token' }),
      ).resolves.toBeUndefined();

      expect(prismaMock.fcmToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
