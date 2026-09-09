import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { SocialProvider } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(),
}));

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

const makeTransactionClientMock = () => ({
  $queryRaw: jest.fn(),
  notificationDelivery: {
    deleteMany: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    deleteMany: jest.fn(),
  },
});

const makePrismaMock = () => {
  const transactionClient = makeTransactionClientMock();

  return {
    socialAccount: {
      findUnique: jest.fn(),
    },
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    transactionClient,
    $transaction: jest.fn(
      async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  };
};

const makeJwtMock = () => ({
  sign: jest.fn().mockReturnValue('signed-access-token'),
  verify: jest.fn(),
});

const makeConfigMock = (overrides: Record<string, string | undefined> = {}) => {
  const values: Record<string, string | undefined> = {
    JWT_ACCESS_SECRET: 'test-access-secret-for-dsm-backend',
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`Missing configuration: ${key}`);
      }
      return value;
    }),
  };
};

const expectUserRowLock = (queryRaw: jest.Mock, userId: string) => {
  expect(queryRaw).toHaveBeenCalledTimes(1);
  const [strings, value] = queryRaw.mock.calls[0] as [
    TemplateStringsArray,
    unknown,
  ];
  expect(Array.from(strings).join('?').replace(/\s+/g, ' ').trim()).toBe(
    'SELECT 1 FROM "User" WHERE id = ? FOR UPDATE',
  );
  expect(value).toBe(userId);
};

const expectLockBeforeFamilyMutation = (
  queryRaw: jest.Mock,
  familyMutation: jest.Mock,
) => {
  expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
    familyMutation.mock.invocationCallOrder[0],
  );
};

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let jwtMock: ReturnType<typeof makeJwtMock>;
  let configMock: ReturnType<typeof makeConfigMock>;
  let verifyIdTokenMock: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock = makePrismaMock();
    jwtMock = makeJwtMock();
    configMock = makeConfigMock();
    verifyIdTokenMock = jest.fn();
    jest.mocked(OAuth2Client).mockImplementation(
      () =>
        ({
          verifyIdToken: verifyIdTokenMock,
        }) as unknown as OAuth2Client,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('Google configuration', () => {
    it('reads the required client ID once and reuses it as the audience', async () => {
      verifyIdTokenMock.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-user-1',
          email: 'google@example.com',
          name: 'Google User',
        }),
      });
      prismaMock.socialAccount.findUnique.mockResolvedValue({
        user: MOCK_USER,
      });
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-google' });

      await service.socialLogin(SocialProvider.GOOGLE, 'google-id-token');

      expect(configMock.getOrThrow).toHaveBeenCalledTimes(1);
      expect(configMock.getOrThrow).toHaveBeenCalledWith('GOOGLE_CLIENT_ID');
      expect(OAuth2Client).toHaveBeenCalledWith('test-google-client-id');
      expect(verifyIdTokenMock).toHaveBeenCalledWith({
        idToken: 'google-id-token',
        audience: 'test-google-client-id',
      });
      expect(prismaMock.refreshToken.create).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          userId: MOCK_USER.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          sessionId: expect.any(String),
        }),
      });
      expect(jwtMock.sign).toHaveBeenCalledWith(
        {
          sub: MOCK_USER.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          sid: expect.any(String),
          type: 'access',
        },
        {
          secret: 'test-access-secret-for-dsm-backend',
          expiresIn: '15m',
        },
      );
    });

    it('fails service construction when the client ID is missing', () => {
      const missingConfig = makeConfigMock({ GOOGLE_CLIENT_ID: undefined });

      expect(
        () =>
          new AuthService(
            prismaMock as unknown as PrismaService,
            jwtMock as unknown as JwtService,
            missingConfig as unknown as ConfigService,
          ),
      ).toThrow(/GOOGLE_CLIENT_ID/);
      expect(missingConfig.getOrThrow).toHaveBeenCalledTimes(1);
    });
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
        sessionId: 'family-1',
      });
      prismaMock.transactionClient.refreshToken.updateMany.mockResolvedValue({
        count: 1,
      });
      prismaMock.transactionClient.refreshToken.create.mockResolvedValue({
        id: 'rt-2',
      });

      const result = await service.refreshTokens(`rt-1.${secret}`);

      expect(result.accessToken).toBe('signed-access-token');
      expect(result.refreshToken).toMatch(/^rt-2\./);
      expect(jwtMock.sign).toHaveBeenCalledWith(
        { sub: MOCK_USER.id, sid: 'family-1', type: 'access' },
        {
          secret: 'test-access-secret-for-dsm-backend',
          expiresIn: '15m',
        },
      );
      expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
      });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expectUserRowLock(prismaMock.transactionClient.$queryRaw, MOCK_USER.id);
      expectLockBeforeFamilyMutation(
        prismaMock.transactionClient.$queryRaw,
        prismaMock.transactionClient.refreshToken.updateMany,
      );
      expect(
        prismaMock.transactionClient.refreshToken.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          id: 'rt-1',
          revokedAt: null,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          expiresAt: { gt: expect.any(Date) },
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: { revokedAt: expect.any(Date) },
      });
      expect(
        prismaMock.transactionClient.refreshToken.create,
      ).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          userId: MOCK_USER.id,
          sessionId: 'family-1',
        }),
      });
      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects a losing refresh race without creating replacement tokens', async () => {
      const secret = 'raw-secret';
      const hash = await bcrypt.hash(secret, 1);

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: MOCK_USER.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        sessionId: 'family-1',
      });
      prismaMock.transactionClient.refreshToken.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(service.refreshTokens(`rt-1.${secret}`)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(
        prismaMock.transactionClient.refreshToken.create,
      ).not.toHaveBeenCalled();
      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });

    it('propagates replacement creation failures from the transaction', async () => {
      const secret = 'raw-secret';
      const hash = await bcrypt.hash(secret, 1);
      const creationError = new Error('replacement token write failed');

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: MOCK_USER.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        sessionId: 'family-1',
      });
      prismaMock.transactionClient.refreshToken.updateMany.mockResolvedValue({
        count: 1,
      });
      prismaMock.transactionClient.refreshToken.create.mockRejectedValue(
        creationError,
      );

      await expect(service.refreshTokens(`rt-1.${secret}`)).rejects.toBe(
        creationError,
      );
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
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
        sessionId: 'family-1',
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
        sessionId: 'family-1',
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
        sessionId: 'family-1',
      });

      await expect(service.refreshTokens('rt-1.wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes only the active family when given an already-revoked predecessor', async () => {
      const secret = 'raw-secret';
      const hash = await bcrypt.hash(secret, 1);

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: MOCK_USER.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        sessionId: 'family-1',
      });
      prismaMock.transactionClient.refreshToken.updateMany.mockResolvedValue({
        count: 2,
      });

      await service.logout(`rt-1.${secret}`);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expectUserRowLock(prismaMock.transactionClient.$queryRaw, MOCK_USER.id);
      expectLockBeforeFamilyMutation(
        prismaMock.transactionClient.$queryRaw,
        prismaMock.transactionClient.refreshToken.updateMany,
      );
      expect(
        prismaMock.transactionClient.refreshToken.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          userId: MOCK_USER.id,
          sessionId: 'family-1',
          revokedAt: null,
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.refreshToken.update).not.toHaveBeenCalled();
    });

    it('does nothing when no matching token exists', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.logout('rt-1.not-found')).resolves.toBeUndefined();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('does nothing for a malformed token', async () => {
      await expect(service.logout('legacy-no-dot')).resolves.toBeUndefined();

      expect(prismaMock.refreshToken.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('uses the valid refresh token owner without an access-token identity', async () => {
      const secret = 'raw-secret';
      const hash = await bcrypt.hash(secret, 1);
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'other-user',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        sessionId: 'other-family',
      });

      await expect(service.logout(`rt-1.${secret}`)).resolves.toBeUndefined();

      expectUserRowLock(prismaMock.transactionClient.$queryRaw, 'other-user');
      expect(
        prismaMock.transactionClient.refreshToken.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          userId: 'other-user',
          sessionId: 'other-family',
          revokedAt: null,
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('does nothing when the refresh secret does not match', async () => {
      const hash = await bcrypt.hash('correct-secret', 1);
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: MOCK_USER.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        sessionId: 'family-1',
      });

      await expect(
        service.logout('rt-1.wrong-secret'),
      ).resolves.toBeUndefined();

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('locks the user and removes blocking deliveries before the user row', async () => {
      prismaMock.transactionClient.notificationDelivery.deleteMany.mockResolvedValue(
        { count: 2 },
      );
      prismaMock.transactionClient.user.deleteMany.mockResolvedValue({
        count: 1,
      });

      await expect(
        service.deleteAccount(MOCK_USER.id),
      ).resolves.toBeUndefined();

      expectUserRowLock(prismaMock.transactionClient.$queryRaw, MOCK_USER.id);
      expect(
        prismaMock.transactionClient.notificationDelivery.deleteMany,
      ).toHaveBeenCalledWith({
        where: {
          OR: [
            { schedule: { userId: MOCK_USER.id } },
            { fcmToken: { userId: MOCK_USER.id } },
          ],
        },
      });
      expect(prismaMock.transactionClient.user.deleteMany).toHaveBeenCalledWith(
        {
          where: { id: MOCK_USER.id },
        },
      );
      expect(
        prismaMock.transactionClient.$queryRaw.mock.invocationCallOrder[0],
      ).toBeLessThan(
        prismaMock.transactionClient.notificationDelivery.deleteMany.mock
          .invocationCallOrder[0],
      );
      expect(
        prismaMock.transactionClient.notificationDelivery.deleteMany.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        prismaMock.transactionClient.user.deleteMany.mock
          .invocationCallOrder[0],
      );
    });

    it('keeps repeated deletion idempotent when the user is already absent', async () => {
      prismaMock.transactionClient.notificationDelivery.deleteMany.mockResolvedValue(
        { count: 0 },
      );
      prismaMock.transactionClient.user.deleteMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.deleteAccount('deleted-user'),
      ).resolves.toBeUndefined();

      expect(prismaMock.transactionClient.user.deleteMany).toHaveBeenCalledWith(
        {
          where: { id: 'deleted-user' },
        },
      );
    });
  });

  describe('current user onboarding', () => {
    it('returns the canonical current-user projection', async () => {
      const completedAt = new Date('2026-07-25T00:00:00.000Z');
      prismaMock.user.findUnique.mockResolvedValue({
        id: MOCK_USER.id,
        onboardingCompletedAt: completedAt,
      });

      await expect(service.getCurrentUser(MOCK_USER.id)).resolves.toEqual({
        userId: MOCK_USER.id,
        onboardingCompletedAt: completedAt,
      });
    });

    it('sets onboarding only while the canonical value is null', async () => {
      const completedAt = new Date('2026-07-25T00:00:00.000Z');
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.user.findUnique.mockResolvedValue({
        id: MOCK_USER.id,
        onboardingCompletedAt: completedAt,
      });

      const result = await service.completeOnboarding(
        MOCK_USER.id,
        completedAt,
      );

      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: MOCK_USER.id,
          onboardingCompletedAt: null,
        },
        data: { onboardingCompletedAt: completedAt },
      });
      expect(result.onboardingCompletedAt).toEqual(completedAt);
    });

    it('rejects a deleted user referenced by an old access token', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.getCurrentUser(MOCK_USER.id)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
