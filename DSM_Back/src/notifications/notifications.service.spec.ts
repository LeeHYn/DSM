import { ConflictException } from '@nestjs/common';
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
    fcmToken: {
      findUnique: jest.fn<
        Promise<{ userId: string } | null>,
        [Prisma.FcmTokenFindUniqueArgs]
      >(),
      upsert: jest.fn<
        Promise<RegisteredFcmToken>,
        [Prisma.FcmTokenUpsertArgs]
      >(),
      updateMany: jest.fn<
        Promise<Prisma.BatchPayload>,
        [Prisma.FcmTokenUpdateManyArgs]
      >(),
    },
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
        select: { userId: true },
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
        },
        update: {
          platform: 'android',
          deviceId: 'device-1',
          lastSeenAt: NOW,
          revokedAt: null,
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

  describe('revoke', () => {
    it('revokes only an active token owned by the authenticated user', async () => {
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
        data: { revokedAt: NOW },
      });
    });

    it('is idempotent for missing, foreign, or already revoked tokens', async () => {
      prismaMock.fcmToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.revoke('user-1', { token: 'unavailable-token' }),
      ).resolves.toBeUndefined();

      expect(prismaMock.fcmToken.updateMany).toHaveBeenCalledTimes(1);
    });
  });
});
