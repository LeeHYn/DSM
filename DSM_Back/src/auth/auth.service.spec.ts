import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const MOCK_USER = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  nickname: 'testuser',
  profileImageUrl: null,
  totalScore: 0,
  tier: 'BRONZE' as const,
  notificationEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makePrismaMock = () => ({
  socialAccount: {
    findUnique: jest.fn(),
  },
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
});

const makeJwtMock = () => ({
  sign: jest.fn().mockReturnValue('signed-access-token'),
  verify: jest.fn(),
});

const makeConfigMock = () => ({
  get: jest.fn((key: string) => {
    const map: Record<string, string> = {
      JWT_ACCESS_SECRET: 'test-access-secret-for-dsm-backend',
      GOOGLE_CLIENT_ID: 'test-google-client-id',
    };
    return map[key];
  }),
});

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let jwtMock: ReturnType<typeof makeJwtMock>;
  let notificationsMock: { revokeToken: jest.Mock };

  beforeEach(async () => {
    prismaMock = makePrismaMock();
    jwtMock = makeJwtMock();
    notificationsMock = { revokeToken: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: makeConfigMock() },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('refreshTokens', () => {
    it('issues new tokens when refresh token is valid', async () => {
      const secret = 'raw-secret';
      const hash = await bcrypt.hash(secret, 1);

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: MOCK_USER.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      });
      prismaMock.refreshToken.update.mockResolvedValue({});
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      const result = await service.refreshTokens(`rt-1.${secret}`);

      expect(result.accessToken).toBe('signed-access-token');
      expect(result.refreshToken).toMatch(/^rt-2\./);
      expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
      });
      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-1' },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it('throws on a malformed token (no separator)', async () => {
      await expect(service.refreshTokens('legacy-no-dot')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prismaMock.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('throws when the record is missing', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('rt-x.secret')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when the record is revoked', async () => {
      const hash = await bcrypt.hash('s', 1);
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: MOCK_USER.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
      });

      await expect(service.refreshTokens('rt-1.s')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when the record is expired', async () => {
      const hash = await bcrypt.hash('s', 1);
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: MOCK_USER.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() - 60_000),
        revokedAt: null,
      });

      await expect(service.refreshTokens('rt-1.s')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when the secret does not match', async () => {
      const hash = await bcrypt.hash('correct', 1);
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: MOCK_USER.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      });

      await expect(service.refreshTokens('rt-1.wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the matching refresh token', async () => {
      const secret = 'raw-secret';
      const hash = await bcrypt.hash(secret, 1);

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: MOCK_USER.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      });
      prismaMock.refreshToken.update.mockResolvedValue({});

      await service.logout(MOCK_USER.id, `rt-1.${secret}`);

      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-1' },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it('revokes an optional FCM token after refresh token ownership is verified', async () => {
      const secret = 'raw-secret';
      const hash = await bcrypt.hash(secret, 1);

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: MOCK_USER.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      });
      prismaMock.refreshToken.update.mockResolvedValue({});

      await service.logout(MOCK_USER.id, `rt-1.${secret}`, {
        token: 'fcm-token-1',
      });

      expect(notificationsMock.revokeToken).toHaveBeenCalledWith(MOCK_USER.id, {
        token: 'fcm-token-1',
      });
    });

    it('does nothing when no matching token exists', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.logout(MOCK_USER.id, 'rt-1.not-found'),
      ).resolves.toBeUndefined();
      expect(notificationsMock.revokeToken).not.toHaveBeenCalled();
    });
  });
});
