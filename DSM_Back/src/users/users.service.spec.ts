import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, SocialProvider, Tier } from '@prisma/client';
import { NOTIFICATION_SCHEDULE_STATUS } from '../notifications/notification-events';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const MOCK_USER = {
  id: 'user-uuid-1',
  email: 'user@example.com',
  nickname: 'starter',
  profileImageUrl: 'https://example.com/profile.png',
  totalScore: 120,
  tier: Tier.BRONZE,
  notificationEnabled: true,
  createdAt: new Date('2026-06-20T00:00:00.000Z'),
  updatedAt: new Date('2026-06-20T00:00:00.000Z'),
};

const makePrismaMock = () => ({
  $transaction: jest.fn(
    async <T extends unknown[]>(operations: readonly [...T]): Promise<T> =>
      Promise.all(operations) as Promise<T>,
  ),
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  notificationSchedule: {
    updateMany: jest.fn(),
  },
  socialAccount: {
    findMany: jest.fn(),
  },
});

describe('UsersService', () => {
  let service: UsersService;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prismaMock = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('getMe', () => {
    it('returns the authenticated user profile', async () => {
      prismaMock.user.findUnique.mockResolvedValue(MOCK_USER);

      const result = await service.getMe('user-uuid-1');

      expect(result).toEqual(MOCK_USER);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
      });
    });

    it('throws NotFoundException when the authenticated user is missing', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('missing-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('updates nickname and profile image for the authenticated user', async () => {
      prismaMock.user.update.mockResolvedValue({
        ...MOCK_USER,
        nickname: 'renamed',
        profileImageUrl: null,
      });

      const result = await service.updateProfile('user-uuid-1', {
        nickname: 'renamed',
        profileImageUrl: null,
      });

      expect(result.nickname).toBe('renamed');
      expect(result.profileImageUrl).toBeNull();
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { nickname: 'renamed', profileImageUrl: null },
      });
    });

    it('throws ConflictException when nickname is already taken', async () => {
      const duplicate = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '6.19.3' },
      );
      prismaMock.user.update.mockRejectedValue(duplicate);

      await expect(
        service.updateProfile('user-uuid-1', { nickname: 'taken' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateNotificationSettings', () => {
    it('updates notificationEnabled for the authenticated user', async () => {
      prismaMock.user.update.mockResolvedValue({
        ...MOCK_USER,
        notificationEnabled: false,
      });

      const result = await service.updateNotificationSettings('user-uuid-1', {
        notificationEnabled: false,
      });

      expect(result.notificationEnabled).toBe(false);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { notificationEnabled: false },
      });
    });

    it('cancels pending schedules when notifications are disabled', async () => {
      prismaMock.user.update.mockResolvedValue({
        ...MOCK_USER,
        notificationEnabled: false,
      });
      prismaMock.notificationSchedule.updateMany.mockResolvedValue({
        count: 2,
      });

      const result = await service.updateNotificationSettings('user-uuid-1', {
        notificationEnabled: false,
      });

      expect(result.notificationEnabled).toBe(false);
      expect(prismaMock.notificationSchedule.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        },
        data: {
          status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED,
          failureReason: null,
        },
      });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSocialAccounts', () => {
    it('returns linked social account providers in creation order', async () => {
      prismaMock.socialAccount.findMany.mockResolvedValue([
        { provider: SocialProvider.GOOGLE },
        { provider: SocialProvider.KAKAO },
      ]);

      const result = await service.getSocialAccounts('user-uuid-1');

      expect(result).toEqual([
        { provider: SocialProvider.GOOGLE },
        { provider: SocialProvider.KAKAO },
      ]);
      expect(prismaMock.socialAccount.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
        select: { provider: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  });
});
