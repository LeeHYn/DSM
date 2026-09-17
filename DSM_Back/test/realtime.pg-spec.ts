import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient, TaskDifficulty } from '@prisma/client';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as bcrypt from 'bcrypt';
import WebSocket from 'ws';
import { AuthService } from '../src/auth/auth.service';
import { SessionVerifierService } from '../src/auth/session-verifier.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeBusService } from '../src/realtime/realtime-bus.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { RealtimeWsAdapter } from '../src/realtime/realtime-ws.adapter';
import { parseServerEvent } from '../src/realtime/realtime.policy';
import type {
  RealtimeBusEvent,
  RealtimeServerEvent,
  RealtimeScope,
} from '../src/realtime/realtime.policy';
import { ScoresService } from '../src/scores/scores.service';
import { TasksService } from '../src/tasks/tasks.service';

function disposableUrls() {
  try {
    const database = new URL(process.env.ALL55_DATABASE_URL ?? '');
    const redis = new URL(process.env.ALL55_REALTIME_REDIS_URL ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(database.protocol) ||
      database.hostname !== '127.0.0.1' ||
      database.port !== '55348' ||
      database.pathname !== '/all55_validation' ||
      database.search ||
      database.hash ||
      redis.protocol !== 'redis:' ||
      redis.hostname !== '127.0.0.1' ||
      redis.port !== '56348' ||
      !['', '/'].includes(redis.pathname) ||
      redis.username ||
      redis.password ||
      redis.search ||
      redis.hash
    )
      throw new Error();
    return { database: database.toString(), redis: redis.toString() };
  } catch {
    throw new Error(
      'ALL55 requires disposable PG 127.0.0.1:55348/all55_validation and credential-free Redis 127.0.0.1:56348',
    );
  }
}

const enabled = process.env.ALL55_DISPOSABLE_DB_TEST === '1';
const urls = enabled ? disposableUrls() : undefined;
const describeIntegration = enabled ? describe : describe.skip;

function within<T>(
  work: Promise<T>,
  label: string,
  milliseconds = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out: ${label}`)),
      milliseconds,
    );
    void work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(label));
      },
    );
  });
}

async function until(
  condition: () => boolean,
  label: string,
  milliseconds = 8000,
) {
  const deadline = Date.now() + milliseconds;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
}

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Endpoint = {
  app: INestApplication;
  bus: RealtimeBusService;
  tasks: TasksService;
  auth: AuthService;
  port: number;
};
type Peer = {
  socket: WebSocket;
  messages: RealtimeServerEvent[];
  closed: number | undefined;
};
type Family = {
  userId: string;
  sessionId: string;
  tokenId: string;
  refresh: string;
  access: string;
};
type ScoreGate = {
  userId: string;
  mode: 'hold' | 'fail';
  entered: ReturnType<typeof latch>;
  release: ReturnType<typeof latch>;
};

describeIntegration('realtime PG + Redis (F074/F075)', () => {
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService();
  const ownedUsers = new Set<string>();
  const peers = new Set<Peer>();
  const endpoints: Endpoint[] = [];
  const unsubscribe = new Set<() => void>();
  const inFlight = new Set<Promise<unknown>>();
  let prisma: PrismaClient;
  let first: Endpoint;
  let second: Endpoint;
  let scoreGate: ScoreGate | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasourceUrl: urls!.database,
      transactionOptions: { maxWait: 5000, timeout: 5000 },
    });
    await within(prisma.$connect(), 'PostgreSQL connect');
    const observed = prisma.$extends({
      query: {
        dailyScore: {
          async upsert({ args, query }) {
            const result = await query(args);
            const gate = scoreGate;
            if (gate && gate.userId === args.create.userId) {
              gate.entered.resolve();
              if (gate.mode === 'fail')
                throw new Error('Synthetic post-score rollback');
              await within(
                gate.release.promise,
                'transaction fixture release',
                3000,
              );
            }
            return result;
          },
        },
      },
    });
    for (let index = 0; index < 2; index++) {
      const configValues: Record<string, string> = {
        REDIS_URL: urls!.redis,
        JWT_ACCESS_SECRET: secret,
        GOOGLE_CLIENT_ID: 'all55-realtime-synthetic-client',
      };
      const config = {
        get: (key: string) => configValues[key],
        getOrThrow: (key: string) => {
          if (!configValues[key]) throw new Error('Missing synthetic config');
          return configValues[key];
        },
      };
      const module = await Test.createTestingModule({
        providers: [
          RealtimeBusService,
          RealtimeGateway,
          SessionVerifierService,
          TasksService,
          ScoresService,
          AuthService,
          { provide: PrismaService, useValue: observed },
          { provide: ConfigService, useValue: config },
          { provide: JwtService, useValue: jwt },
        ],
      }).compile();
      const app = module.createNestApplication({ logger: false });
      const bus = app.get(RealtimeBusService);
      const ready = latch();
      const remove = bus.onReset(ready.resolve);
      app.useWebSocketAdapter(new RealtimeWsAdapter(app));
      const endpoint = {
        app,
        bus,
        tasks: app.get(TasksService),
        auth: app.get(AuthService),
        port: 0,
      };
      endpoints.push(endpoint);
      await within(app.listen(0, '127.0.0.1'), 'Nest listen');
      endpoint.port = (
        (app.getHttpServer() as Server).address() as AddressInfo
      ).port;
      await within(ready.promise, 'actual Redis subscription');
      remove();
    }
    [first, second] = endpoints;
  }, 30000);

  afterEach(async () => {
    scoreGate?.release.resolve();
    scoreGate = undefined;
    await within(
      Promise.allSettled([...inFlight]),
      'fixture operations settle',
    );
    inFlight.clear();
    for (const remove of unsubscribe) remove();
    unsubscribe.clear();
    for (const peer of peers) peer.socket.terminate();
    await until(
      () => [...peers].every((peer) => peer.closed !== undefined),
      'fixture sockets close',
    );
    peers.clear();
  });

  afterAll(async () => {
    try {
      const closed = await Promise.allSettled(
        endpoints.map((endpoint) =>
          within(endpoint.app.close(), 'Nest and Redis shutdown'),
        ),
      );
      expect(closed.every((result) => result.status === 'fulfilled')).toBe(
        true,
      );
    } finally {
      if (prisma) {
        try {
          if (ownedUsers.size)
            await within(
              prisma.user.deleteMany({
                where: { id: { in: [...ownedUsers] } },
              }),
              'owned user cleanup',
            );
        } finally {
          await within(prisma.$disconnect(), 'Prisma disconnect');
        }
      }
    }
  }, 30000);

  async function user() {
    const id = randomUUID();
    ownedUsers.add(id);
    await within(
      prisma.user.create({
        data: {
          id,
          email: `all55-realtime-${id}@example.invalid`,
          nickname: `all55-realtime-${id}`,
        },
      }),
      'fixture user',
    );
    return id;
  }

  async function family(userId: string, revoked = false): Promise<Family> {
    const sessionId = randomUUID();
    const tokenId = randomUUID();
    const refreshSecret = randomBytes(24).toString('hex');
    const tokenHash = await within(
      bcrypt.hash(refreshSecret, 4),
      'fixture hash',
    );
    await within(
      prisma.refreshToken.create({
        data: {
          id: tokenId,
          userId,
          sessionId,
          tokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: revoked ? new Date() : null,
        },
      }),
      'fixture active family',
    );
    return {
      userId,
      sessionId,
      tokenId,
      refresh: `${tokenId}.${refreshSecret}`,
      access: jwt.sign(
        { sub: userId, sid: sessionId, type: 'access' },
        { secret, algorithm: 'HS256', expiresIn: '15m' },
      ),
    };
  }

  async function connect(endpoint: Endpoint, access: string, accepted = true) {
    const socket = new WebSocket(`ws://127.0.0.1:${endpoint.port}/realtime`);
    const peer: Peer = { socket, messages: [], closed: undefined };
    peers.add(peer);
    socket.on('error', () => undefined);
    socket.on('close', (code) => {
      peer.closed = code;
    });
    socket.on('message', (raw) => {
      if (!Buffer.isBuffer(raw)) return;
      const event = parseServerEvent(raw.toString('utf8'));
      if (event) peer.messages.push(event);
    });
    await within(
      new Promise<void>((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      }),
      'WebSocket open',
    );
    socket.send(
      JSON.stringify({
        event: 'authenticate',
        data: { version: 1, accessToken: access },
      }),
    );
    if (accepted)
      await until(
        () => peer.messages.some((event) => event.event === 'reset'),
        'authenticated reset',
      );
    else
      await until(() => peer.closed !== undefined, 'rejected authentication');
    return peer;
  }

  function taskDto() {
    const start = new Date(Date.now() + 86400000);
    return {
      clientMutationId: randomUUID(),
      title: 'Synthetic realtime fixture',
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 3600000).toISOString(),
      difficulty: TaskDifficulty.HIGH,
      notificationEnabled: true,
    };
  }

  function scopes(peer: Peer, scope: RealtimeScope) {
    return peer.messages.filter(
      (event) =>
        event.event === 'invalidate' && event.data.scopes.includes(scope),
    );
  }

  function observe(endpoint: Endpoint, userId: string) {
    const events: RealtimeBusEvent[] = [];
    unsubscribe.add(
      endpoint.bus.subscribe((event) => {
        if (event.target.kind !== 'all' && event.target.userId === userId)
          events.push(event);
      }),
    );
    return events;
  }

  it('publishes committed Task/Scores changes across instances only to the owner, with global rankings separately', async () => {
    const own = await family(await user());
    const other = await family(await user());
    const ownPeer = await connect(second, own.access);
    const otherPeer = await connect(second, other.access);
    const localPeer = await connect(first, own.access);
    const events = observe(second, own.userId);
    const localEvents = observe(first, own.userId);
    const dto = taskDto();
    const gate: ScoreGate = {
      userId: own.userId,
      mode: 'hold',
      entered: latch(),
      release: latch(),
    };
    scoreGate = gate;
    const creating = first.tasks.create(own.userId, dto);
    void creating.catch(() => undefined);
    inFlight.add(creating);
    await within(gate.entered.promise, 'real transaction post-score boundary');
    expect(
      await within(
        prisma.task.findUnique({ where: { id: dto.clientMutationId } }),
        'outside transaction read',
      ),
    ).toBeNull();
    expect(events).toHaveLength(0);
    expect(localEvents).toHaveLength(0);
    gate.release.resolve();
    await within(creating, 'committed task');
    scoreGate = undefined;
    await until(
      () =>
        scopes(ownPeer, 'scores').length === 1 &&
        scopes(localPeer, 'scores').length === 1,
      'cross-instance task signal',
    );
    expect(scopes(ownPeer, 'reminders')).toHaveLength(1);
    expect(
      otherPeer.messages.filter((event) => event.event === 'invalidate'),
    ).toHaveLength(0);
    expect(
      await within(
        prisma.notificationSchedule.count({
          where: { taskId: dto.clientMutationId },
        }),
        'committed schedule',
      ),
    ).toBe(1);
    expect(
      await within(
        prisma.dailyScore.count({ where: { userId: own.userId } }),
        'committed score',
      ),
    ).toBe(1);
    await within(
      first.bus.publishInvalidation({ kind: 'all' }, ['rankings']),
      'rankings publication',
    );
    await until(
      () =>
        scopes(ownPeer, 'rankings').length === 1 &&
        scopes(otherPeer, 'rankings').length === 1,
      'global rankings convergence',
    );
  }, 20000);

  it('rolls back actual Task, schedule and score writes without local or remote publication', async () => {
    const own = await family(await user());
    const peer = await connect(second, own.access);
    const local = observe(first, own.userId);
    const remote = observe(second, own.userId);
    const dto = taskDto();
    scoreGate = {
      userId: own.userId,
      mode: 'fail',
      entered: latch(),
      release: latch(),
    };
    await expect(
      within(first.tasks.create(own.userId, dto), 'rollback task'),
    ).rejects.toThrow('Synthetic post-score rollback');
    scoreGate = undefined;
    expect(
      await within(
        prisma.task.count({ where: { id: dto.clientMutationId } }),
        'rolled back task',
      ),
    ).toBe(0);
    expect(
      await within(
        prisma.notificationSchedule.count({
          where: { taskId: dto.clientMutationId },
        }),
        'rolled back schedule',
      ),
    ).toBe(0);
    expect(
      await within(
        prisma.dailyScore.count({ where: { userId: own.userId } }),
        'rolled back score',
      ),
    ).toBe(0);
    expect(local).toHaveLength(0);
    expect(remote).toHaveLength(0);
    expect(scopes(peer, 'scores')).toHaveLength(0);
    await within(first.tasks.create(own.userId, dto), 'retry after rollback');
    await until(
      () => scopes(peer, 'scores').length === 1,
      'successful retry signal',
    );
  }, 20000);

  it('commits real logout then closes that family on the other instance', async () => {
    const userId = await user();
    const loggedOut = await family(userId);
    const retained = await family(userId);
    const revokedPeer = await connect(second, loggedOut.access);
    const retainedPeer = await connect(second, retained.access);
    await within(first.auth.logout(loggedOut.refresh), 'real logout');
    await until(
      () => revokedPeer.closed !== undefined,
      'cross-instance logout close',
    );
    expect(revokedPeer.closed).toBe(4003);
    expect(retainedPeer.closed).toBeUndefined();
    const record = await within(
      prisma.refreshToken.findUnique({ where: { id: loggedOut.tokenId } }),
      'committed family revocation',
    );
    expect(record?.revokedAt).toBeInstanceOf(Date);
    expect((await connect(first, loggedOut.access, false)).closed).toBe(4001);
  }, 15000);

  it('commits account deletion then closes all owned families across both instances', async () => {
    const userId = await user();
    const firstFamily = await family(userId);
    const secondFamily = await family(userId);
    const unrelated = await family(await user());
    const a = await connect(first, firstFamily.access);
    const b = await connect(second, secondFamily.access);
    const untouched = await connect(second, unrelated.access);
    await within(first.auth.deleteAccount(userId), 'real account deletion');
    await until(
      () => a.closed !== undefined && b.closed !== undefined,
      'cross-instance account close',
    );
    expect([a.closed, b.closed]).toEqual([4003, 4003]);
    expect(untouched.closed).toBeUndefined();
    expect(
      await within(
        prisma.user.count({ where: { id: userId } }),
        'deleted user',
      ),
    ).toBe(0);
    expect(
      await within(
        prisma.refreshToken.count({ where: { userId } }),
        'deleted families',
      ),
    ).toBe(0);
  }, 15000);

  it('rejects inactive/expired access and closes an active connection at JWT expiry', async () => {
    const own = await family(await user());
    const inactive = await family(await user(), true);
    expect((await connect(second, inactive.access, false)).closed).toBe(4001);
    const expired = jwt.sign(
      { sub: own.userId, sid: own.sessionId, type: 'access' },
      { secret, algorithm: 'HS256', expiresIn: -1 },
    );
    expect((await connect(second, expired, false)).closed).toBe(4001);
    const short = jwt.sign(
      { sub: own.userId, sid: own.sessionId, type: 'access' },
      { secret, algorithm: 'HS256', expiresIn: 3 },
    );
    const peer = await connect(second, short);
    await until(() => peer.closed !== undefined, 'actual access expiry', 5000);
    expect(peer.closed).toBe(4010);
  }, 15000);

  it('keeps local delivery during owned Redis disconnect and resets after actual resubscription without replay', async () => {
    const own = await family(await user());
    const peer = await connect(second, own.access);
    const initialStream = peer.messages[0].data.streamId;
    // This is the bus instance's own client, not CLIENT KILL or a Redis-wide operation.
    const connection = (
      second.bus as unknown as {
        connection?: { subscriber: { destroy(): void } };
      }
    ).connection;
    if (!connection) throw new Error('Owned Redis subscription not ready');
    connection.subscriber.destroy();
    await within(
      second.bus.publishInvalidation({ kind: 'user', userId: own.userId }, [
        'scores',
      ]),
      'local offline delivery',
    );
    await within(
      first.bus.publishInvalidation({ kind: 'user', userId: own.userId }, [
        'reminders',
      ]),
      'publication during subscriber loss',
    );
    await until(
      () => scopes(peer, 'scores').length === 1,
      'local delivery while disconnected',
    );
    expect(scopes(peer, 'reminders')).toHaveLength(0);
    await until(
      () =>
        peer.messages.some(
          (event) =>
            event.event === 'reset' && event.data.streamId !== initialStream,
        ),
      'actual Redis recovery reset',
      10000,
    );
    expect(scopes(peer, 'reminders')).toHaveLength(0);
    await within(
      first.bus.publishInvalidation({ kind: 'user', userId: own.userId }, [
        'reminders',
      ]),
      'publication after restoration',
    );
    await until(
      () => scopes(peer, 'reminders').length === 1,
      'restored cross-instance delivery',
    );
  }, 20000);
});
