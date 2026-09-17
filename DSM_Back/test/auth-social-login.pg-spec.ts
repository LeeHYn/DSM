import { randomBytes, randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, SocialProvider } from '@prisma/client';
import axios from 'axios';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import type { TokenResponseDto } from '../src/auth/dto/token-response.dto';
import type { JwtPayload } from '../src/auth/types/jwt-payload.type';

jest.mock('axios');

function requireDisposableDatabaseUrl(): string {
  const raw = process.env.ALL55_DATABASE_URL;
  if (process.env.ALL55_DISPOSABLE_DB_TEST !== '1' || !raw) {
    throw new Error('ALL55 disposable database marker and URL are required');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('ALL55 disposable database URL is invalid');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '55348' ||
    !/^\/all55_[a-zA-Z0-9_]+$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'ALL55 requires 127.0.0.1:55348/all55_* without URL query or fragment',
    );
  }
  return raw;
}

const enabled = process.env.ALL55_DISPOSABLE_DB_TEST === '1';
const databaseUrl = enabled ? requireDisposableDatabaseUrl() : undefined;
const describePostgres = enabled ? describe : describe.skip;

type Identity = { id: number; email: string; nickname: string };

// Scheduling only: every lookup and mutation still executes against PostgreSQL.
function nicknameReadBarrier(nickname: string, participants: number) {
  let arrivals = 0;
  let release!: () => void;
  let reject!: (error: Error) => void;
  const gate = new Promise<void>((resolve, fail) => {
    release = resolve;
    reject = fail;
  });
  const timeout = setTimeout(
    () => reject(new Error('Concurrent nickname lookup barrier timed out')),
    10_000,
  );
  // A changed code path may never reach the barrier; avoid an unhandled rejection.
  void gate.catch(() => undefined);
  return {
    nickname,
    get arrivals() {
      return arrivals;
    },
    async arrive() {
      arrivals++;
      if (arrivals === participants) {
        clearTimeout(timeout);
        release();
      }
      await gate;
    },
    dispose() {
      clearTimeout(timeout);
      release();
    },
  };
}

describePostgres('social login PostgreSQL integration (F004/F027)', () => {
  const accessSecret = randomBytes(32).toString('hex');
  const ownedUserIds = new Set<string>();
  let prisma: PrismaClient;
  let module: TestingModule;
  let service: AuthService;
  let jwt: JwtService;
  let barrier: ReturnType<typeof nicknameReadBarrier> | undefined;

  function identity(nickname?: string): Identity {
    const suffix = randomUUID();
    return {
      id: randomBytes(6).readUIntBE(0, 6) + 1,
      email: `all55-${suffix}@example.invalid`,
      nickname: nickname ?? `a55-${suffix.slice(0, 12)}`,
    };
  }

  function mockIdentities(identities: Identity[]) {
    const profiles = new Map(identities.map((item) => [String(item.id), item]));
    jest.mocked(axios).get.mockImplementation((url, config) => {
      expect(url).toBe('https://kapi.kakao.com/v2/user/me');
      const authorization: unknown = config?.headers?.Authorization;
      const profile =
        typeof authorization === 'string'
          ? profiles.get(authorization.replace(/^Bearer /, ''))
          : undefined;
      if (!profile) throw new Error('Unexpected synthetic Kakao identity');
      return Promise.resolve({
        data: {
          id: profile.id,
          kakao_account: {
            email: profile.email,
            profile: { nickname: profile.nickname },
          },
        },
      });
    });
  }

  const login = (profile: Identity) =>
    service.socialLogin(SocialProvider.KAKAO, String(profile.id));

  function accessPayload(tokens: TokenResponseDto): JwtPayload {
    return jwt.verify<JwtPayload>(tokens.accessToken, { secret: accessSecret });
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl! });
    const observedPrisma = prisma.$extends({
      query: {
        user: {
          async findUnique({ args, query }) {
            const result = await query(args);
            const activeBarrier = barrier;
            if (
              activeBarrier &&
              args.where.nickname === activeBarrier.nickname &&
              result === null
            ) {
              await activeBarrier.arrive();
            }
            return result;
          },
          async create({ args, query }) {
            const result = await query(args);
            if (typeof result.id !== 'string') {
              throw new Error('Fixture user creation must return its ID');
            }
            ownedUserIds.add(result.id);
            return result;
          },
        },
      },
    });
    jwt = new JwtService();
    module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: observedPrisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            JWT_ACCESS_SECRET: accessSecret,
            GOOGLE_CLIENT_ID: 'all55-synthetic-client-id',
          }),
        },
      ],
    }).compile();
    service = module.get(AuthService);
    await prisma.$connect();
  });

  afterEach(async () => {
    barrier?.dispose();
    barrier = undefined;
    jest.mocked(axios).get.mockReset();
    if (prisma && ownedUserIds.size > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: [...ownedUserIds] } },
      });
      ownedUserIds.clear();
    }
  });

  afterAll(async () => {
    try {
      await module?.close();
    } finally {
      await prisma?.$disconnect();
    }
  });

  it('converges 20 simultaneous first logins onto one user and social account', async () => {
    const profile = identity();
    mockIdentities([profile]);
    barrier = nicknameReadBarrier(profile.nickname, 20);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => login(profile)),
    );
    expect(barrier.arrivals).toBe(20);
    expect(results.map((result) => result.status)).toEqual(
      Array<string>(20).fill('fulfilled'),
    );
    const tokens = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const users = await prisma.user.findMany({
      where: { email: profile.email },
    });
    expect(users).toHaveLength(1);
    const userId = users[0].id;
    const accounts = await prisma.socialAccount.findMany({
      where: {
        provider: SocialProvider.KAKAO,
        providerUserId: String(profile.id),
      },
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].userId).toBe(userId);
    expect(ownedUserIds.size).toBe(1);
    expect(tokens.map((token) => accessPayload(token).sub)).toEqual(
      Array<string>(20).fill(userId),
    );
    const sessions = await prisma.refreshToken.findMany({ where: { userId } });
    expect(sessions).toHaveLength(20);
    expect(new Set(sessions.map((session) => session.sessionId)).size).toBe(20);
    for (const token of tokens) {
      const payload = accessPayload(token);
      expect(payload.type).toBe('access');
      expect(sessions).toContainEqual(
        expect.objectContaining({
          id: token.refreshToken.split('.')[0],
          userId: payload.sub,
          sessionId: payload.sid,
          revokedAt: null,
        }),
      );
    }
  }, 60_000);

  it('returns 409 for another provider with the same email without linking or issuing tokens', async () => {
    const profile = identity();
    const existing = await prisma.user.create({
      data: {
        email: profile.email,
        nickname: `seed-${randomUUID()}`,
        socialAccounts: {
          create: {
            provider: SocialProvider.GOOGLE,
            providerUserId: `all55-${randomUUID()}`,
          },
        },
      },
      include: { socialAccounts: true },
    });
    ownedUserIds.add(existing.id);
    mockIdentities([profile]);

    await expect(login(profile)).rejects.toBeInstanceOf(ConflictException);
    await expect(login(profile)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.user.count({ where: { email: profile.email } })).toBe(
      1,
    );
    expect(
      await prisma.socialAccount.findMany({ where: { userId: existing.id } }),
    ).toEqual(existing.socialAccounts);
    expect(
      await prisma.socialAccount.count({
        where: {
          provider: SocialProvider.KAKAO,
          providerUserId: String(profile.id),
        },
      }),
    ).toBe(0);
    expect(
      await prisma.refreshToken.count({ where: { userId: existing.id } }),
    ).toBe(0);
    expect(ownedUserIds.size).toBe(1);
  });

  it('recovers a real nickname unique collision for simultaneous distinct identities', async () => {
    const first = identity();
    const second = identity(first.nickname);
    mockIdentities([first, second]);
    barrier = nicknameReadBarrier(first.nickname, 2);

    const results = await Promise.allSettled([login(first), login(second)]);
    expect(barrier.arrivals).toBe(2);
    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'fulfilled',
    ]);
    const users = await prisma.user.findMany({
      where: { email: { in: [first.email, second.email] } },
      include: { socialAccounts: true },
    });
    expect(users).toHaveLength(2);
    expect(new Set(users.map((user) => user.nickname)).size).toBe(2);
    expect(
      users.filter((user) => user.nickname === first.nickname),
    ).toHaveLength(1);
    expect(ownedUserIds.size).toBe(2);
    for (const [index, profile] of [first, second].entries()) {
      const user = users.find(
        (candidate) => candidate.email === profile.email,
      )!;
      expect(user.socialAccounts).toHaveLength(1);
      expect(user.socialAccounts[0]).toMatchObject({
        provider: SocialProvider.KAKAO,
        providerUserId: String(profile.id),
        userId: user.id,
      });
      const result = results[index];
      if (result.status !== 'fulfilled') throw new Error('Login failed');
      expect(accessPayload(result.value).sub).toBe(user.id);
    }
  }, 30_000);
});
