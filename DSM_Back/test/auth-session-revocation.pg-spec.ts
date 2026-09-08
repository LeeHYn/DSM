import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app.bootstrap';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

function requireDisposableDatabaseUrl(): string {
  if (process.env.F001_F002_DISPOSABLE_DB_TEST !== '1') {
    throw new Error('F001/F002 disposable database marker is required');
  }
  const raw = process.env.AUTH_REVOCATION_DATABASE_URL;
  if (!raw) {
    throw new Error('F001/F002 disposable database URL is required');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('F001/F002 disposable database URL is invalid');
  }
  const databaseName = url.pathname.slice(1);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    !databaseName.startsWith('f001_f002_auth_revocation') ||
    databaseName === 'dsm_test'
  ) {
    throw new Error(
      'F001/F002 database must be a loopback task-owned database',
    );
  }
  return raw;
}

const enabled = process.env.F001_F002_DISPOSABLE_DB_TEST === '1';
const databaseUrl = enabled ? requireDisposableDatabaseUrl() : undefined;
const describePostgres = enabled ? describe : describe.skip;

describePostgres('auth session revocation PostgreSQL integration', () => {
  const accessSecret = 'f001-f002-integration-access-secret';
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl! });
    jwtService = new JwtService();
    const config = {
      get: jest.fn((key: string) =>
        key === 'JWT_ACCESS_SECRET' ? accessSecret : undefined,
      ),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') {
          return 'f001-f002-public-test-client-id';
        }
        throw new Error(`Unexpected required config: ${key}`);
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        JwtAuthGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
    await prisma.$disconnect();
  });

  it('revokes one refresh family and its access JWT without affecting another session', async () => {
    const suffix = randomUUID();
    userId = `auth-revocation-${suffix}`;
    const revokedFamily = `family-revoked-${suffix}`;
    const retainedFamily = `family-retained-${suffix}`;
    const predecessorId = randomUUID();
    const predecessorSecret = `predecessor-${suffix}`;
    const activeId = randomUUID();
    const activeSecret = `active-${suffix}`;
    const retainedId = randomUUID();
    const now = Date.now();

    await prisma.user.create({
      data: {
        id: userId,
        email: `${suffix}@example.invalid`,
        nickname: `auth-${suffix}`,
        onboardingCompletedAt: new Date(now),
      },
    });
    await prisma.refreshToken.createMany({
      data: [
        {
          id: predecessorId,
          tokenHash: await bcrypt.hash(predecessorSecret, 1),
          expiresAt: new Date(now + 60_000),
          revokedAt: new Date(now - 1_000),
          userId,
          sessionId: revokedFamily,
        },
        {
          id: activeId,
          tokenHash: await bcrypt.hash(activeSecret, 1),
          expiresAt: new Date(now + 60_000),
          userId,
          sessionId: revokedFamily,
        },
        {
          id: retainedId,
          tokenHash: await bcrypt.hash(`retained-${suffix}`, 1),
          expiresAt: new Date(now + 60_000),
          userId,
          sessionId: retainedFamily,
        },
      ],
    });

    const revokedAccessToken = jwtService.sign(
      { sub: userId, sid: revokedFamily, type: 'access' },
      { secret: accessSecret, expiresIn: '15m' },
    );
    const retainedAccessToken = jwtService.sign(
      { sub: userId, sid: retainedFamily, type: 'access' },
      { secret: accessSecret, expiresIn: '15m' },
    );

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${revokedAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: `${predecessorId}.${predecessorSecret}` })
      .expect(204);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${revokedAccessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: `${activeId}.${activeSecret}` })
      .expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${retainedAccessToken}`)
      .expect(200);

    await expect(
      prisma.refreshToken.count({
        where: {
          userId,
          sessionId: revokedFamily,
          revokedAt: null,
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.refreshToken.count({
        where: {
          userId,
          sessionId: retainedFamily,
          revokedAt: null,
        },
      }),
    ).resolves.toBe(1);
  });
});
