import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RealtimeBusService } from '../realtime/realtime-bus.service';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, SocialProvider } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AppleTokenVerifier } from './apple-token.verifier';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(),
}));
jest.mock('axios');

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
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
    }),
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
      create: jest.fn().mockResolvedValue({ id: 'legacy-direct-token' }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    transactionClient,
    $executeRaw: jest.fn().mockResolvedValue(0),
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
  const signal = { publishRevocation: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock = makePrismaMock();
    jwtMock = makeJwtMock();
    configMock = makeConfigMock();
    verifyIdTokenMock = jest.fn();
    signal.publishRevocation.mockReset().mockResolvedValue(undefined);
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
        { provide: RealtimeBusService, useValue: signal },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('publishes account revocation after commit and does not turn a signal failure into a deletion failure', async () => {
    let commit!: () => void;
    prismaMock.$transaction.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          commit = resolve;
        }),
    );
    const deletion = service.deleteAccount(MOCK_USER.id);
    expect(signal.publishRevocation).not.toHaveBeenCalled();
    commit();
    await deletion;
    expect(signal.publishRevocation).toHaveBeenCalledWith({
      kind: 'user',
      userId: MOCK_USER.id,
    });
    signal.publishRevocation.mockRejectedValueOnce(
      new Error('bus unavailable'),
    );
    await expect(service.deleteAccount(MOCK_USER.id)).resolves.toBeUndefined();
  });

  it('does not broadcast a rolled back account deletion', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('rollback'));
    await expect(service.deleteAccount(MOCK_USER.id)).rejects.toThrow(
      'rollback',
    );
    expect(signal.publishRevocation).not.toHaveBeenCalled();
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
      prismaMock.transactionClient.refreshToken.create.mockResolvedValue({
        id: 'rt-google',
      });

      await service.socialLogin(SocialProvider.GOOGLE, 'google-id-token');

      expect(configMock.getOrThrow).toHaveBeenCalledTimes(1);
      expect(configMock.getOrThrow).toHaveBeenCalledWith('GOOGLE_CLIENT_ID');
      expect(OAuth2Client).toHaveBeenCalledWith('test-google-client-id');
      expect(verifyIdTokenMock).toHaveBeenCalledWith({
        idToken: 'google-id-token',
        audience: 'test-google-client-id',
      });
      expect(
        prismaMock.transactionClient.refreshToken.create,
      ).toHaveBeenCalledWith({
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

  describe('Apple social login', () => {
    afterEach(() => jest.restoreAllMocks());

    it('uses the verified Apple identity and issues distinct locked login families', async () => {
      const verify = jest
        .spyOn(AppleTokenVerifier.prototype, 'verify')
        .mockResolvedValue({
          providerUserId: 'verified-apple-user',
          email: 'verified@privaterelay.appleid.com',
          nickname: 'Apple 사용자',
          profileImageUrl: null,
        });
      const appleConfig = makeConfigMock({ APPLE_CLIENT_ID: 'test.apple' });
      const appleService = new AuthService(
        prismaMock as unknown as PrismaService,
        jwtMock as unknown as JwtService,
        appleConfig as unknown as ConfigService,
      );
      prismaMock.socialAccount.findUnique.mockResolvedValue({
        user: MOCK_USER,
      });
      prismaMock.transactionClient.refreshToken.create.mockResolvedValue({
        id: 'apple-refresh',
      });

      const first = await appleService.socialLogin(
        SocialProvider.APPLE,
        'apple-id-token',
      );
      expect(first.accessToken).toBe('signed-access-token');
      expect(first.refreshToken).toMatch(/^apple-refresh\./);
      expect(verify).toHaveBeenCalledWith('apple-id-token');
      expect(prismaMock.socialAccount.findUnique).toHaveBeenCalledWith({
        where: {
          provider_providerUserId: {
            provider: SocialProvider.APPLE,
            providerUserId: 'verified-apple-user',
          },
        },
        include: { user: true },
      });
      const client = prismaMock.transactionClient;
      expectUserRowLock(client.$queryRaw, MOCK_USER.id);
      expectLockBeforeFamilyMutation(
        client.$queryRaw,
        client.refreshToken.create,
      );

      await appleService.socialLogin(
        SocialProvider.APPLE,
        'second-apple-token',
      );
      const families = client.refreshToken.create.mock.calls.map(
        ([args]: [{ data: { userId: string; sessionId: string } }]) =>
          args.data,
      );
      expect(families).toHaveLength(2);
      expect(families.every(({ userId }) => userId === MOCK_USER.id)).toBe(
        true,
      );
      expect(families[0].sessionId).not.toBe(families[1].sessionId);
      expect(
        appleConfig.get.mock.calls.filter(([key]) => key === 'APPLE_CLIENT_ID'),
      ).toHaveLength(1);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('propagates Apple verification rejection before any account or session access', async () => {
      const failure = new UnauthorizedException(
        'Apple token verification failed',
      );
      const verify = jest
        .spyOn(AppleTokenVerifier.prototype, 'verify')
        .mockRejectedValue(failure);

      await expect(
        service.socialLogin(SocialProvider.APPLE, 'rejected-apple-token'),
      ).rejects.toBe(failure);
      expect(verify).toHaveBeenCalledWith('rejected-apple-token');
      expect(prismaMock.socialAccount.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(jwtMock.sign).not.toHaveBeenCalled();
    });

    it('fails Apple login safely without configuration while construction remains available', async () => {
      await expect(
        service.socialLogin(SocialProvider.APPLE, 'apple-id-token'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(jest.mocked(axios).get.mock.calls).toHaveLength(0);
      expect(prismaMock.socialAccount.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(jwtMock.sign).not.toHaveBeenCalled();
    });
  });

  describe('social signup conflicts', () => {
    const uniqueError = (target: string[]) =>
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target },
      });

    beforeEach(() => {
      verifyIdTokenMock.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-user-1',
          email: 'google@example.com',
          name: 'Google User',
        }),
      });
      prismaMock.socialAccount.findUnique.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.transactionClient.refreshToken.create.mockResolvedValue({
        id: 'rt-signup',
      });
    });

    it.each([['provider', 'providerUserId'], ['email'], ['nickname']])(
      'recovers the same identity winner after a unique conflict on %j',
      async (...target: string[]) => {
        prismaMock.socialAccount.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ user: MOCK_USER });
        prismaMock.user.create.mockRejectedValue(uniqueError(target));

        await expect(
          service.socialLogin(SocialProvider.GOOGLE, 'google-id-token'),
        ).resolves.toMatchObject({ accessToken: 'signed-access-token' });

        expect(prismaMock.socialAccount.findUnique).toHaveBeenLastCalledWith({
          where: {
            provider_providerUserId: {
              provider: SocialProvider.GOOGLE,
              providerUserId: 'google-user-1',
            },
          },
          include: { user: true },
        });
        expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
        const [payload] = jwtMock.sign.mock.calls[0] as [{ sub: string }];
        expect(payload).toMatchObject({
          sub: MOCK_USER.id,
        });
      },
    );

    it('returns 409 for another identity using the email without linking it', async () => {
      prismaMock.user.create.mockRejectedValue(uniqueError(['email']));
      prismaMock.user.findUnique.mockImplementation(
        (args: { where: { email?: string } }) =>
          Promise.resolve(args.where.email ? MOCK_USER : null),
      );

      await expect(
        service.socialLogin(SocialProvider.GOOGLE, 'google-id-token'),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
      expect(jwtMock.sign).not.toHaveBeenCalled();
    });

    it('lets both concurrent first logins issue tokens for the one winner', async () => {
      prismaMock.socialAccount.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ user: MOCK_USER });
      prismaMock.user.create
        .mockResolvedValueOnce(MOCK_USER)
        .mockRejectedValueOnce(uniqueError(['provider', 'providerUserId']));

      const results = await Promise.all([
        service.socialLogin(SocialProvider.GOOGLE, 'google-id-token'),
        service.socialLogin(SocialProvider.GOOGLE, 'google-id-token'),
      ]);

      expect(results).toHaveLength(2);
      expect(prismaMock.user.create).toHaveBeenCalledTimes(2);
      expect(jwtMock.sign).toHaveBeenCalledTimes(2);
      for (const [payload] of jwtMock.sign.mock.calls as [{ sub: string }][]) {
        expect(payload.sub).toBe(MOCK_USER.id);
      }
    });

    it('retries a nickname collision with a new candidate', async () => {
      prismaMock.user.create
        .mockRejectedValueOnce(uniqueError(['nickname']))
        .mockResolvedValueOnce(MOCK_USER);

      await expect(
        service.socialLogin(SocialProvider.GOOGLE, 'google-id-token'),
      ).resolves.toMatchObject({ accessToken: 'signed-access-token' });
      const calls = prismaMock.user.create.mock.calls as [
        { data: { nickname: string } },
      ][];
      expect(calls).toHaveLength(2);
      expect(calls[1][0].data.nickname).not.toBe(calls[0][0].data.nickname);
    });

    it('stops repeated nickname collisions after three creation attempts', async () => {
      prismaMock.user.create.mockRejectedValue(uniqueError(['nickname']));

      await expect(
        service.socialLogin(SocialProvider.GOOGLE, 'google-id-token'),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.user.create).toHaveBeenCalledTimes(3);
      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });

    it.each([
      new Error('Database unavailable'),
      uniqueError(['id']),
      new Prisma.PrismaClientKnownRequestError('Foreign key failed', {
        code: 'P2003',
        clientVersion: '6.19.3',
      }),
    ])('preserves unrelated database errors: %s', async (error) => {
      prismaMock.user.create.mockRejectedValue(error);

      await expect(
        service.socialLogin(SocialProvider.GOOGLE, 'google-id-token'),
      ).rejects.toBe(error);
      expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('Kakao verification', () => {
    afterEach(() => {
      jest.useRealTimers();
      jest.mocked(axios).get.mockReset();
    });

    it.each(
      [
        undefined,
        null,
        '',
        '123',
        0,
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.MAX_SAFE_INTEGER + 1,
        {},
        [],
      ].map((id) => ({ id })),
    )(
      'rejects invalid identity $id before touching the database',
      async ({ id }) => {
        jest.mocked(axios).get.mockResolvedValue({ data: { id } });
        prismaMock.socialAccount.findUnique.mockResolvedValue({
          user: MOCK_USER,
        });
        prismaMock.transactionClient.refreshToken.create.mockResolvedValue({
          id: 'rt-kakao',
        });

        await expect(
          service.socialLogin(SocialProvider.KAKAO, 'kakao-access-token'),
        ).rejects.toThrow(UnauthorizedException);
        expect(prismaMock.socialAccount.findUnique).not.toHaveBeenCalled();
        expect(prismaMock.user.create).not.toHaveBeenCalled();
        expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
      },
    );

    it.each([1, Number.MAX_SAFE_INTEGER])(
      'accepts positive safe identity %s',
      async (id) => {
        jest.mocked(axios).get.mockResolvedValue({ data: { id } });
        prismaMock.socialAccount.findUnique.mockResolvedValue({
          user: MOCK_USER,
        });
        prismaMock.transactionClient.refreshToken.create.mockResolvedValue({
          id: 'rt-kakao',
        });

        await expect(
          service.socialLogin(SocialProvider.KAKAO, 'kakao-access-token'),
        ).resolves.toMatchObject({ accessToken: 'signed-access-token' });
        expect(prismaMock.socialAccount.findUnique).toHaveBeenCalledWith({
          where: {
            provider_providerUserId: {
              provider: SocialProvider.KAKAO,
              providerUserId: String(id),
            },
          },
          include: { user: true },
        });
        expect(jest.mocked(axios).get.mock.calls[0]?.[1]?.timeout).toBe(5000);
        expect(jest.mocked(axios).get.mock.calls[0]?.[1]?.params).toEqual({
          secure_resource: true,
        });
      },
    );

    it('aborts a pending provider request at the five second deadline', async () => {
      jest.useFakeTimers();
      let rejectRequest: (reason: Error) => void = () => undefined;
      let outcome: unknown;
      jest.mocked(axios).get.mockImplementation(
        (_url, config) =>
          new Promise((_resolve, reject) => {
            rejectRequest = reject;
            config?.signal?.addEventListener?.('abort', () => {
              reject(new Error('Request cancelled'));
            });
          }),
      );
      const request = service
        .socialLogin(SocialProvider.KAKAO, 'kakao-access-token')
        .catch((error: unknown) => {
          outcome = error;
        });

      try {
        await jest.advanceTimersByTimeAsync(4999);
        expect(outcome).toBeUndefined();
        await jest.advanceTimersByTimeAsync(1);
        expect(outcome).toBeInstanceOf(UnauthorizedException);
        expect(prismaMock.socialAccount.findUnique).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        rejectRequest(new Error('Test cleanup'));
        await request;
      }
    });

    it.each(['response', 'failure'])(
      'clears the deadline after early %s',
      async (kind) => {
        jest.useFakeTimers();
        if (kind === 'response') {
          jest.mocked(axios).get.mockResolvedValue({ data: {} });
        } else {
          jest
            .mocked(axios)
            .get.mockRejectedValue(new Error('Sensitive upstream detail'));
        }

        await expect(
          service.socialLogin(SocialProvider.KAKAO, 'kakao-access-token'),
        ).rejects.toThrow('Kakao token verification failed');
        expect(jest.getTimerCount()).toBe(0);
        expect(prismaMock.socialAccount.findUnique).not.toHaveBeenCalled();
      },
    );
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
    it('accepts an expired predecessor hash to revoke its live successor family', async () => {
      const hash = await bcrypt.hash('predecessor-secret', 1);
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'old-token',
        userId: MOCK_USER.id,
        sessionId: 'live-family',
        tokenHash: hash,
        expiresAt: new Date('2000-01-01T00:00:00Z'),
        revokedAt: new Date('1999-12-31T00:00:00Z'),
      });

      await service.logout('old-token.predecessor-secret');

      expect(signal.publishRevocation).toHaveBeenCalledWith({
        kind: 'session',
        userId: MOCK_USER.id,
        sessionId: 'live-family',
      });

      expect(
        prismaMock.transactionClient.refreshToken.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          userId: MOCK_USER.id,
          sessionId: 'live-family',
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

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

  describe('refresh retention', () => {
    const dto = {
      id: 'current-token',
      userId: MOCK_USER.id,
      sessionId: 'family-1',
    };

    beforeEach(async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        ...dto,
        tokenHash: await bcrypt.hash('secret', 1),
        expiresAt: new Date(Date.now() + 30 * 86400000),
        revokedAt: null,
      });
      prismaMock.transactionClient.refreshToken.updateMany.mockResolvedValue({
        count: 1,
      });
      prismaMock.transactionClient.refreshToken.create.mockResolvedValue({
        id: 'next-token',
      });
    });

    it.each([1, 4095])('keeps expiry at %i family rows', async (count) => {
      const deadline = new Date(Date.now() + 60_000);
      const client = prismaMock.transactionClient;
      client.refreshToken.findFirst.mockResolvedValue({ expiresAt: deadline });
      client.refreshToken.count.mockResolvedValue(count);

      await service.refreshTokens('current-token.secret');

      expect(client.refreshToken.findFirst).toHaveBeenCalledWith({
        where: { userId: MOCK_USER.id, sessionId: 'family-1' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { expiresAt: true },
      });
      expect(client.refreshToken.count).toHaveBeenCalledWith({
        where: { userId: MOCK_USER.id, sessionId: 'family-1' },
      });
      const [args] = client.refreshToken.create.mock.calls[0] as [
        { data: { expiresAt: Date } },
      ];
      expect(args.data.expiresAt).toEqual(deadline);
      expectLockBeforeFamilyMutation(
        client.$queryRaw,
        client.refreshToken.findFirst,
      );
    });

    it.each([4096, 4097])('rejects %i family rows', async (count) => {
      prismaMock.transactionClient.refreshToken.count.mockResolvedValue(count);

      await expect(
        service.refreshTokens('current-token.secret'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(
        prismaMock.transactionClient.refreshToken.updateMany,
      ).not.toHaveBeenCalled();
      expect(
        prismaMock.transactionClient.refreshToken.create,
      ).not.toHaveBeenCalled();
      expect(jwtMock.sign).not.toHaveBeenCalled();
    });

    it.each([null, { expiresAt: new Date('2000-01-01T00:00:00Z') }])(
      'rejects a missing or expired oldest family row',
      async (oldest) => {
        prismaMock.transactionClient.refreshToken.findFirst.mockResolvedValue(
          oldest,
        );
        await expect(
          service.refreshTokens('current-token.secret'),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(
          prismaMock.transactionClient.refreshToken.updateMany,
        ).not.toHaveBeenCalled();
        expect(
          prismaMock.transactionClient.refreshToken.create,
        ).not.toHaveBeenCalled();
      },
    );

    it('starts each login family under the user lock with a thirty day expiry', async () => {
      verifyIdTokenMock.mockResolvedValue({
        getPayload: () => ({ sub: 'provider-id' }),
      });
      prismaMock.socialAccount.findUnique.mockResolvedValue({
        user: MOCK_USER,
      });
      const before = Date.now();
      await service.socialLogin(SocialProvider.GOOGLE, 'provider-token');
      const after = Date.now();

      const client = prismaMock.transactionClient;
      expectUserRowLock(client.$queryRaw, MOCK_USER.id);
      expectLockBeforeFamilyMutation(
        client.$queryRaw,
        client.refreshToken.create,
      );
      const [args] = client.refreshToken.create.mock.calls[0] as [
        { data: { expiresAt: Date; sessionId: string } },
      ];
      expect(args.data.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + 30 * 86400000,
      );
      expect(args.data.expiresAt.getTime()).toBeLessThanOrEqual(
        after + 30 * 86400000,
      );
      expect(args.data.sessionId).not.toBe('family-1');
      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects when the absolute expiry is reached while reading the family count', async () => {
      const now = Date.now();
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(now);
      prismaMock.transactionClient.refreshToken.findFirst.mockResolvedValue({
        expiresAt: new Date(now + 1000),
      });
      prismaMock.transactionClient.refreshToken.count.mockImplementation(() => {
        jest.setSystemTime(now + 1000);
        return Promise.resolve(1);
      });
      try {
        await expect(
          service.refreshTokens('current-token.secret'),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(
          prismaMock.transactionClient.refreshToken.updateMany,
        ).not.toHaveBeenCalled();
        expect(
          prismaMock.transactionClient.refreshToken.create,
        ).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('cleanupExpiredRefreshTokens', () => {
    it('deletes at most 500 expired rows while retaining every live-family predecessor', async () => {
      prismaMock.$executeRaw.mockResolvedValue(500);
      const before = Date.now();
      await expect(service.cleanupExpiredRefreshTokens()).resolves.toBe(500);
      const after = Date.now();
      const [parts, cutoff, now, limit] = prismaMock.$executeRaw.mock
        .calls[0] as [TemplateStringsArray, Date, Date, number];
      const sql = parts.join('?').replace(/\s+/g, ' ').trim();
      expect(sql).toContain('DELETE FROM "RefreshToken"');
      expect(sql).toContain('stale."expiresAt" < ?');
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('active."userId" = stale."userId"');
      expect(sql).toContain('active."sessionId" = stale."sessionId"');
      expect(sql).toContain('active."revokedAt" IS NULL');
      expect(sql).toContain('active."expiresAt" > ?');
      expect(sql).toContain('ORDER BY stale."expiresAt", stale.id LIMIT ?');
      expect(limit).toBe(500);
      expect(now.getTime()).toBeGreaterThanOrEqual(before);
      expect(now.getTime()).toBeLessThanOrEqual(after);
      expect(cutoff.getTime()).toBe(now.getTime() - 7 * 86400000);
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
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
