import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app.bootstrap';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Notification client routes (HTTP)', () => {
  let app: INestApplication<App>;
  let authorization: string;
  const owner = 'notification-http-owner';
  const now = new Date('2026-09-11T12:00:00.000Z');
  const db = {
    refreshToken: { findFirst: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    fcmToken: {
      findUnique: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  const transaction = jest.fn(
    (work: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      work(db as unknown as Prisma.TransactionClient),
  );
  const tokenResponse = {
    id: 'device-registration',
    platform: 'android',
    deviceId: null,
    lastSeenAt: now,
    revokedAt: null,
  };

  beforeAll(async () => {
    const jwt = new JwtService({
      secret: 'synthetic-notification-http-secret',
    });
    authorization = `Bearer ${jwt.sign({ sub: owner, sid: 'http-session', type: 'access' }, { expiresIn: '1h' })}`;
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        NotificationsService,
        JwtAuthGuard,
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: { get: () => 'synthetic-notification-http-secret' },
        },
        {
          provide: PrismaService,
          useValue: { ...db, $transaction: transaction },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.refreshToken.findFirst.mockResolvedValue({ id: 'active-session' });
    db.user.findUnique.mockResolvedValue({ notificationEnabled: true });
    db.user.update.mockResolvedValue({ notificationEnabled: false });
    db.fcmToken.findUnique.mockResolvedValue(null);
    db.fcmToken.count.mockResolvedValue(0);
    db.fcmToken.upsert.mockResolvedValue(tokenResponse);
    db.fcmToken.updateMany.mockResolvedValue({ count: 1 });
    db.$queryRaw.mockResolvedValue([
      {
        userExists: true,
        cursorValid: true,
        id: 'schedule-id',
        taskId: 'task-id',
        title: 'Authenticated reminder',
        startAt: now,
        expiresAt: new Date(now.getTime() + 300_000),
      },
    ]);
  });

  afterAll(async () => app.close());

  function expectNoResourceCalls() {
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  }

  it('reads settings using the verified JWT user and active session', async () => {
    await request(app.getHttpServer())
      .get('/notifications/settings')
      .set('Authorization', authorization)
      .expect(200, { notificationEnabled: true });
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: owner },
      select: { notificationEnabled: true },
    });
    const [args] = db.refreshToken.findFirst.mock.calls[0] as [
      Prisma.RefreshTokenFindFirstArgs,
    ];
    expect(args.where).toMatchObject({
      userId: owner,
      sessionId: 'http-session',
      revokedAt: null,
    });
    expect(args.select).toEqual({ id: true });
  });

  it('preserves false through HTTP transformation and atomic settings update', async () => {
    await request(app.getHttpServer())
      .patch('/notifications/settings')
      .set('Authorization', authorization)
      .send({ notificationEnabled: false })
      .expect(200, { notificationEnabled: false });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: owner },
      data: { notificationEnabled: false },
      select: { notificationEnabled: true },
    });
  });

  it.each(['false', 'true', null, 0, 1, [], {}])(
    'rejects invalid notificationEnabled=%j before resource access',
    async (notificationEnabled) => {
      await request(app.getHttpServer())
        .patch('/notifications/settings')
        .set('Authorization', authorization)
        .send({ notificationEnabled })
        .expect(400);
      expectNoResourceCalls();
    },
  );

  it.each([{}, { notificationEnabled: true, userId: 'other' }])(
    'rejects missing and unknown settings fields %j',
    async (body) => {
      await request(app.getHttpServer())
        .patch('/notifications/settings')
        .set('Authorization', authorization)
        .send(body)
        .expect(400);
      expectNoResourceCalls();
    },
  );

  it('binds reminder query numbers and opaque cursor to the JWT owner', async () => {
    const response = await request(app.getHttpServer())
      .get('/notifications/reminders')
      .set('Authorization', authorization)
      .query({ limit: '2', cursor: 'schedule-cursor' })
      .expect(200);
    expect(response.body).toMatchObject({
      reminders: [
        {
          id: 'schedule-id',
          taskId: 'task-id',
          title: 'Authenticated reminder',
          startAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 300_000).toISOString(),
        },
      ],
      nextCursor: null,
    });
    const args = db.$queryRaw.mock.calls[0] as unknown[];
    const [, userId, cursor, clock, take] = args;
    expect([userId, cursor, take]).toEqual([owner, 'schedule-cursor', 3]);
    expect(clock).toBeInstanceOf(Date);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('applies the default reminder page size when query is absent', async () => {
    await request(app.getHttpServer())
      .get('/notifications/reminders')
      .set('Authorization', authorization)
      .expect(200);
    const args = db.$queryRaw.mock.calls[0] as unknown[];
    expect(args.slice(1, 3)).toEqual([owner, null]);
    expect(args.at(-1)).toBe(101);
  });

  it.each([
    { limit: '0' },
    { limit: '101' },
    { limit: 'true' },
    { limit: '1.5' },
    { cursor: '' },
    { cursor: '  ' },
    { cursor: 'x'.repeat(256) },
    { userId: 'other' },
    { now: '2099-01-01' },
  ])('rejects invalid reminder query %j', async (query) => {
    await request(app.getHttpServer())
      .get('/notifications/reminders')
      .set('Authorization', authorization)
      .query(query)
      .expect(400);
    expectNoResourceCalls();
  });

  it('maps the SQL invalid-cursor result to HTTP 404', async () => {
    db.$queryRaw.mockResolvedValue([{ userExists: true, cursorValid: false }]);
    await request(app.getHttpServer())
      .get('/notifications/reminders')
      .set('Authorization', authorization)
      .query({ cursor: 'foreign' })
      .expect(404);
  });

  it('maps a user deleted after guard validation to HTTP 404', async () => {
    db.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('synthetic missing row', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    await request(app.getHttpServer())
      .patch('/notifications/settings')
      .set('Authorization', authorization)
      .send({ notificationEnabled: false })
      .expect(404);
  });

  it.each(['/notifications/settings', '/notifications/reminders'])(
    'requires authentication for GET %s',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
      expectNoResourceCalls();
      expect(db.refreshToken.findFirst).not.toHaveBeenCalled();
    },
  );

  it('rejects a revoked JWT session before the settings write', async () => {
    db.refreshToken.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer())
      .patch('/notifications/settings')
      .set('Authorization', authorization)
      .send({ notificationEnabled: false })
      .expect(401);
    expectNoResourceCalls();
  });

  it('preserves PUT token 200, owner binding and response without raw token', async () => {
    const response = await request(app.getHttpServer())
      .put('/notifications/fcm-tokens')
      .set('Authorization', authorization)
      .send({ token: 'synthetic-fcm-token', platform: 'android' })
      .expect(200);
    expect(response.body).toMatchObject({
      id: tokenResponse.id,
      platform: 'android',
    });
    expect(response.body).not.toHaveProperty('token');
    const [args] = db.fcmToken.upsert.mock.calls[0] as [
      Prisma.FcmTokenUpsertArgs,
    ];
    expect(args.create).toMatchObject({
      userId: owner,
      token: 'synthetic-fcm-token',
    });
  });

  it('preserves DELETE token 204 and owned revocation', async () => {
    db.fcmToken.findUnique.mockResolvedValue({
      userId: owner,
      revokedAt: null,
      updatedAt: now,
    });
    const response = await request(app.getHttpServer())
      .delete('/notifications/fcm-tokens')
      .set('Authorization', authorization)
      .send({ token: 'synthetic-fcm-token' })
      .expect(204);
    expect(response.text).toBe('');
    expect(db.fcmToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'synthetic-fcm-token', userId: owner, revokedAt: null },
      }),
    );
  });
});
