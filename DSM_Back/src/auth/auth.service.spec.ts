import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

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
    findMany: jest.fn(),
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

  beforeEach(async () => {
    prismaMock = makePrismaMock();
    jwtMock = makeJwtMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: makeConfigMock() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('refreshTokens', () => {
    it('issues new tokens when refresh token is valid', async () => {
      const rawToken = 'raw-refresh-token';
      const hash = await bcrypt.hash(rawToken, 1);

      prismaMock.refreshToken.findMany.mockResolvedValue([
        {
          id: 'rt-1',
          userId: MOCK_USER.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + 1000 * 60),
          revokedAt: null,
        },
      ]);
      prismaMock.refreshToken.update.mockResolvedValue({});
      prismaMock.refreshToken.create.mockResolvedValue({});

      const result = await service.refreshTokens(rawToken);

      expect(result.accessToken).toBe('signed-access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
      );
    });

    it('throws when refresh token is not found', async () => {
      prismaMock.refreshToken.findMany.mockResolvedValue([]);

      await expect(service.refreshTokens('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the matching refresh token', async () => {
      const rawToken = 'raw-refresh-token';
      const hash = await bcrypt.hash(rawToken, 1);

      prismaMock.refreshToken.findMany.mockResolvedValue([
        { id: 'rt-1', tokenHash: hash },
      ]);
      prismaMock.refreshToken.update.mockResolvedValue({});

      await service.logout(MOCK_USER.id, rawToken);

      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
      );
    });

    it('does nothing when no matching token exists', async () => {
      prismaMock.refreshToken.findMany.mockResolvedValue([]);

      await expect(
        service.logout(MOCK_USER.id, 'not-found'),
      ).resolves.toBeUndefined();
    });
  });
});
