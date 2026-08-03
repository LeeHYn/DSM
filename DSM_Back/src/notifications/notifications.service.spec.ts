import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const FROZEN_NOW = new Date('2026-08-02T12:34:56.789Z');

const SANITIZED_FCM_TOKEN = {
  id: 'fcm-token-uuid-1',
  platform: 'android',
  deviceId: 'device-uuid-1',
  lastSeenAt: FROZEN_NOW,
  revokedAt: null,
};

const makePrismaMock = () => ({
  fcmToken: {
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
});

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
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

  describe('registerFcmToken', () => {
    it('creates an active token registration with a sanitized response', async () => {
      prismaMock.fcmToken.upsert.mockResolvedValue(SANITIZED_FCM_TOKEN);

      const result = await service.registerFcmToken('user-uuid-1', {
        token: 'fcm-token-value',
        platform: 'android',
        deviceId: 'device-uuid-1',
      });

      expect(prismaMock.fcmToken.upsert).toHaveBeenCalledWith({
        where: { token: 'fcm-token-value' },
        create: {
          token: 'fcm-token-value',
          userId: 'user-uuid-1',
          platform: 'android',
          deviceId: 'device-uuid-1',
          lastSeenAt: FROZEN_NOW,
          revokedAt: null,
        },
        update: {
          userId: 'user-uuid-1',
          platform: 'android',
          deviceId: 'device-uuid-1',
          lastSeenAt: FROZEN_NOW,
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
      expect(result).toEqual(SANITIZED_FCM_TOKEN);
      expect(result).not.toHaveProperty('token');
    });

    it('transfers ownership and clears an omitted device ID during update', async () => {
      prismaMock.fcmToken.upsert.mockResolvedValue({
        ...SANITIZED_FCM_TOKEN,
        platform: 'ios',
        deviceId: null,
      });

      await service.registerFcmToken('user-uuid-2', {
        token: 'fcm-token-value',
        platform: 'ios',
      });

      expect(prismaMock.fcmToken.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { token: 'fcm-token-value' },
          update: {
            userId: 'user-uuid-2',
            platform: 'ios',
            deviceId: null,
            lastSeenAt: FROZEN_NOW,
            revokedAt: null,
          },
        }),
      );
    });
  });

  describe('revokeFcmToken', () => {
    it.each([0, 1])(
      'resolves idempotently when %i active token record is revoked',
      async (count) => {
        prismaMock.fcmToken.updateMany.mockResolvedValue({ count });

        await expect(
          service.revokeFcmToken('user-uuid-1', {
            token: 'fcm-token-value',
          }),
        ).resolves.toBeUndefined();

        expect(prismaMock.fcmToken.updateMany).toHaveBeenCalledWith({
          where: {
            token: 'fcm-token-value',
            userId: 'user-uuid-1',
            revokedAt: null,
          },
          data: { revokedAt: FROZEN_NOW },
        });
      },
    );
  });
});
