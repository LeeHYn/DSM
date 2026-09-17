import { randomBytes, randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient, SocialProvider } from '@prisma/client';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/auth/auth.service';
import type { JwtPayload } from '../src/auth/types/jwt-payload.type';
import { PrismaService } from '../src/prisma/prisma.service';

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
const DAY_MS = 86_400_000;

describePostgres('refresh retention PostgreSQL integration (F061)', () => {
  const accessSecret = randomBytes(32).toString('hex');
  const ownedUserIds = new Set<string>();
  let prisma: PrismaClient;
  let module: TestingModule;
  let service: AuthService;
  let jwt: JwtService;
  let now: number;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl! });
    jwt = new JwtService();
    module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
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

  beforeEach(() => {
    now = Date.now();
    // Freeze Date only. Prisma, bcrypt and transaction timers continue normally.
    jest.useFakeTimers({
      now,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
  });

  afterEach(async () => {
    jest.useRealTimers();
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

  async function createUser() {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `all55-retention-${suffix}@example.invalid`,
        nickname: `all55-retention-${suffix}`,
      },
    });
    ownedUserIds.add(user.id);
    return user;
  }

  async function createToken(
    userId: string,
    overrides: Partial<Prisma.RefreshTokenCreateManyInput> = {},
  ) {
    const secret = randomBytes(24).toString('hex');
    const record = await prisma.refreshToken.create({
      data: {
        userId,
        sessionId: randomUUID(),
        tokenHash: await bcrypt.hash(secret, 4),
        expiresAt: new Date(now + DAY_MS),
        createdAt: new Date(now - DAY_MS),
        ...overrides,
      },
    });
    return { ...record, secret, raw: `${record.id}.${secret}` };
  }

  async function createHistoricalRows(
    userId: string,
    sessionId: string,
    count: number,
    expiresAt: Date,
  ) {
    const rows = await Promise.all(
      Array.from({ length: count }, async (_, index) => ({
        id: randomUUID(),
        userId,
        sessionId,
        tokenHash: await bcrypt.hash(randomBytes(24).toString('hex'), 4),
        expiresAt,
        revokedAt: new Date(now - DAY_MS),
        createdAt: new Date(now - 29 * DAY_MS + index),
      })),
    );
    await prisma.refreshToken.createMany({ data: rows });
    return rows;
  }

  async function cleanupOwnedCandidates(): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * DAY_MS);
    // The production cleanup is global. Refuse even a protected old foreign row,
    // rather than allowing any unrelated expired fixture to enter its scope.
    const foreignExpired = await prisma.refreshToken.count({
      where: {
        userId: { notIn: [...ownedUserIds] },
        expiresAt: { lt: cutoff },
      },
    });
    if (foreignExpired !== 0) {
      throw new Error('Refusing cleanup with non-owned expired token rows');
    }
    return service.cleanupExpiredRefreshTokens();
  }

  function storedToken(id: string) {
    return prisma.refreshToken.findUniqueOrThrow({ where: { id } });
  }

  it('deletes only rows strictly beyond the seven-day expiry grace boundary', async () => {
    const user = await createUser();
    const cutoff = now - 7 * DAY_MS;
    await createToken(user.id, { expiresAt: new Date(cutoff - 1) });
    await createToken(user.id, {
      expiresAt: new Date(cutoff - 1),
      revokedAt: new Date(now - DAY_MS),
    });
    const boundary = await createToken(user.id, {
      expiresAt: new Date(cutoff),
      revokedAt: new Date(now - DAY_MS),
    });
    const recent = await createToken(user.id, {
      expiresAt: new Date(cutoff + 1),
    });
    const unexpiredRevoked = await createToken(user.id, {
      revokedAt: new Date(now - DAY_MS),
    });

    expect(await cleanupOwnedCandidates()).toBe(2);
    const remaining = await prisma.refreshToken.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    expect(remaining.map((row) => row.id).sort()).toEqual(
      [boundary.id, recent.id, unexpiredRevoked.id].sort(),
    );
    jest.setSystemTime(now + 1);
    expect(await cleanupOwnedCandidates()).toBe(1);
    expect(
      await prisma.refreshToken.findUnique({ where: { id: boundary.id } }),
    ).toBeNull();
    expect(await cleanupOwnedCandidates()).toBe(0);
    expect(
      await prisma.refreshToken.count({ where: { userId: user.id } }),
    ).toBe(2);
  });

  it('preserves live-family predecessors for expired-token logout and scopes family protection by owner', async () => {
    const user = await createUser();
    const other = await createUser();
    const legacySession = randomUUID();
    const predecessor = await createToken(user.id, {
      sessionId: legacySession,
      expiresAt: new Date(now - 9 * DAY_MS),
      revokedAt: new Date(now - 10 * DAY_MS),
      createdAt: new Date(now - 40 * DAY_MS),
    });
    const current = await createToken(user.id, { sessionId: legacySession });
    const unrelated = await createToken(user.id);
    const sharedId = randomUUID();
    const inactive = await createToken(user.id, {
      sessionId: sharedId,
      expiresAt: new Date(now - 9 * DAY_MS),
    });
    const otherActive = await createToken(other.id, { sessionId: sharedId });

    expect(await cleanupOwnedCandidates()).toBe(1);
    expect(
      await prisma.refreshToken.findUnique({ where: { id: inactive.id } }),
    ).toBeNull();
    expect(
      await prisma.refreshToken.findUnique({ where: { id: predecessor.id } }),
    ).not.toBeNull();
    await service.logout(`${predecessor.id}.incorrect-secret`);
    expect((await storedToken(current.id)).revokedAt).toBeNull();
    await service.logout(predecessor.raw);
    expect((await storedToken(current.id)).revokedAt).not.toBeNull();
    for (const record of [unrelated, otherActive]) {
      expect((await storedToken(record.id)).revokedAt).toBeNull();
    }
    await expect(service.refreshTokens(current.raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(await cleanupOwnedCandidates()).toBe(1);
    expect(
      await prisma.refreshToken.findUnique({ where: { id: predecessor.id } }),
    ).toBeNull();
    // Revocation alone does not remove a row whose expiry grace has not elapsed.
    expect(
      await prisma.refreshToken.findUnique({ where: { id: current.id } }),
    ).not.toBeNull();
  });

  it('deletes at most 500 rows per invocation and eventually empties eligible history', async () => {
    const user = await createUser();
    const rows = await createHistoricalRows(
      user.id,
      randomUUID(),
      501,
      new Date(now - 8 * DAY_MS),
    );
    const expectedLastId = rows
      .map((row) => row.id)
      .sort()
      .at(-1);
    expect(await cleanupOwnedCandidates()).toBe(500);
    expect(
      await prisma.refreshToken.findMany({
        where: { userId: user.id },
        select: { id: true },
      }),
    ).toEqual([{ id: expectedLastId }]);
    expect(await cleanupOwnedCandidates()).toBe(1);
    expect(await cleanupOwnedCandidates()).toBe(0);
    expect(
      await prisma.refreshToken.count({ where: { userId: user.id } }),
    ).toBe(0);
  }, 30_000);

  it('starts a thirty-day family and rotates without extending its absolute expiry', async () => {
    const user = await createUser();
    const providerId = randomBytes(6).readUIntBE(0, 6) + 1;
    await prisma.socialAccount.create({
      data: {
        userId: user.id,
        provider: SocialProvider.KAKAO,
        providerUserId: String(providerId),
      },
    });
    jest.mocked(axios).get.mockImplementation((url) => {
      expect(url).toBe('https://kapi.kakao.com/v2/user/me');
      return Promise.resolve({
        data: {
          id: providerId,
          kakao_account: {
            email: user.email,
            profile: { nickname: user.nickname },
          },
        },
      });
    });
    const originalPair = await service.socialLogin(
      SocialProvider.KAKAO,
      'synthetic-provider-token',
    );
    const original = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: originalPair.refreshToken.split('.')[0] },
    });
    expect(original.expiresAt).toEqual(new Date(now + 30 * DAY_MS));
    const payload = jwt.verify<JwtPayload & { iat: number; exp: number }>(
      originalPair.accessToken,
      { secret: accessSecret },
    );
    expect(payload).toMatchObject({
      sub: user.id,
      sid: original.sessionId,
      type: 'access',
    });
    expect(payload.exp - payload.iat).toBe(900);
    expect(
      await bcrypt.compare(
        originalPair.refreshToken.split('.')[1],
        original.tokenHash,
      ),
    ).toBe(true);

    jest.setSystemTime(now + 29 * DAY_MS);
    const nextPair = await service.refreshTokens(originalPair.refreshToken);
    const next = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: nextPair.refreshToken.split('.')[0] },
    });
    expect(next.sessionId).toBe(original.sessionId);
    expect(next.expiresAt).toEqual(original.expiresAt);
    expect(
      jwt.verify<JwtPayload>(nextPair.accessToken, { secret: accessSecret }),
    ).toMatchObject({ sub: user.id, sid: original.sessionId });
    jest.setSystemTime(now + 30 * DAY_MS);
    await expect(
      service.refreshTokens(nextPair.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(
      await prisma.refreshToken.count({
        where: { userId: user.id, sessionId: original.sessionId },
      }),
    ).toBe(2);
  }, 30_000);

  it('rejects a legacy extended current token once the oldest family deadline is reached', async () => {
    const user = await createUser();
    const sessionId = randomUUID();
    await createToken(user.id, {
      sessionId,
      expiresAt: new Date(now),
      createdAt: new Date(now - 30 * DAY_MS),
      revokedAt: new Date(now - DAY_MS),
    });
    const current = await createToken(user.id, { sessionId });
    await expect(service.refreshTokens(current.raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(
      await prisma.refreshToken.count({
        where: { userId: user.id, sessionId },
      }),
    ).toBe(2);
    expect((await storedToken(current.id)).revokedAt).toBeNull();
  });

  it('allows row 4096 and rejects another rotation without affecting other families', async () => {
    const user = await createUser();
    const other = await createUser();
    const sessionId = randomUUID();
    const expiresAt = new Date(now + DAY_MS);
    await createHistoricalRows(user.id, sessionId, 4094, expiresAt);
    const current = await createToken(user.id, { sessionId, expiresAt });
    const unrelated = await createToken(user.id);
    const otherOwner = await createToken(other.id, { sessionId });
    const nextPair = await service.refreshTokens(current.raw);
    expect(
      await prisma.refreshToken.count({
        where: { userId: user.id, sessionId },
      }),
    ).toBe(4096);
    const nextId = nextPair.refreshToken.split('.')[0];
    await expect(
      service.refreshTokens(nextPair.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(
      await prisma.refreshToken.count({
        where: { userId: user.id, sessionId },
      }),
    ).toBe(4096);
    for (const id of [nextId, unrelated.id, otherOwner.id]) {
      expect((await storedToken(id)).revokedAt).toBeNull();
    }
    await service.logout(current.raw);
    expect(
      await prisma.refreshToken.count({
        where: { userId: user.id, sessionId, revokedAt: null },
      }),
    ).toBe(0);
    expect((await storedToken(unrelated.id)).revokedAt).toBeNull();
  }, 60_000);
});
