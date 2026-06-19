import { UnauthorizedException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RankingPeriod } from '@prisma/client';
import { RankingGateway } from './ranking.gateway';
import { REALTIME_EVENTS, websocketCorsOrigin } from './realtime-events';

const makeJwtMock = () => ({
  verify: jest.fn(),
});

const makeConfigMock = () => ({
  get: jest.fn().mockReturnValue('test-access-secret-for-dsm-backend'),
});

const makeClientMock = (token?: string) => ({
  handshake: {
    auth: token ? { token } : {},
    headers: {},
  },
  data: {},
  join: jest.fn(),
  leave: jest.fn(),
  disconnect: jest.fn(),
});

describe('RankingGateway', () => {
  let gateway: RankingGateway;
  let jwtMock: ReturnType<typeof makeJwtMock>;
  let configMock: ReturnType<typeof makeConfigMock>;

  beforeEach(() => {
    jwtMock = makeJwtMock();
    configMock = makeConfigMock();
    gateway = new RankingGateway(
      jwtMock as unknown as JwtService,
      configMock as unknown as ConfigService,
    );
  });

  it('authenticates a socket with a JWT handshake token and joins the user room', () => {
    const client = makeClientMock('access-token');
    jwtMock.verify.mockReturnValue({ sub: 'user-1', type: 'access' });

    gateway.handleConnection(client as never);

    expect(jwtMock.verify).toHaveBeenCalledWith('access-token', {
      secret: 'test-access-secret-for-dsm-backend',
    });
    expect(client.data.userId).toBe('user-1');
    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects sockets without a valid access JWT', () => {
    const client = makeClientMock('bad-token');
    jwtMock.verify.mockImplementation(() => {
      throw new UnauthorizedException();
    });

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('supports explicit user room join after authentication', () => {
    const client = makeClientMock();
    client.data.userId = 'user-1';

    const result = gateway.handleUserJoin(client as never);

    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(result).toEqual({ event: 'user.joined', room: 'user:user-1' });
  });

  it('subscribes authenticated sockets to a valid ranking period room', () => {
    const client = makeClientMock();
    client.data.userId = 'user-1';

    const result = gateway.handleRankingSubscribe(client as never, {
      period: RankingPeriod.WEEKLY,
    });

    expect(client.join).toHaveBeenCalledWith('ranking:WEEKLY');
    expect(result).toEqual({
      event: 'ranking.subscribed',
      period: RankingPeriod.WEEKLY,
      room: 'ranking:WEEKLY',
    });
  });

  it('rejects ranking subscriptions for invalid periods', () => {
    const client = makeClientMock();
    client.data.userId = 'user-1';

    expect(() =>
      gateway.handleRankingSubscribe(client as never, { period: 'MONTHLY' }),
    ).toThrow(WsException);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('unsubscribes authenticated sockets from a valid ranking period room', () => {
    const client = makeClientMock();
    client.data.userId = 'user-1';

    const result = gateway.handleRankingUnsubscribe(client as never, {
      period: RankingPeriod.DAILY,
    });

    expect(client.leave).toHaveBeenCalledWith('ranking:DAILY');
    expect(result).toEqual({
      event: 'ranking.unsubscribed',
      period: RankingPeriod.DAILY,
      room: 'ranking:DAILY',
    });
  });

  it('emits realtime events to user and ranking rooms through the server', () => {
    const to = jest.fn().mockReturnThis();
    const emit = jest.fn();
    gateway.server = { to, emit } as never;

    gateway.emitToUser('user-1', REALTIME_EVENTS.SCORE_UPDATED, {
      score: 200,
    });
    gateway.emitToRankingPeriod(
      RankingPeriod.TOTAL,
      REALTIME_EVENTS.LEADERBOARD_UPDATED,
      { leaders: [] },
    );

    expect(to).toHaveBeenCalledWith('user:user-1');
    expect(to).toHaveBeenCalledWith('ranking:TOTAL');
    expect(emit).toHaveBeenCalledWith(REALTIME_EVENTS.SCORE_UPDATED, {
      score: 200,
    });
    expect(emit).toHaveBeenCalledWith(REALTIME_EVENTS.LEADERBOARD_UPDATED, {
      leaders: [],
    });
  });

  it('uses an explicit websocket CORS allowlist when configured', () => {
    const previous = process.env.WS_CORS_ORIGINS;
    process.env.WS_CORS_ORIGINS =
      'https://app.example.com, https://admin.example.com ';

    expect(websocketCorsOrigin()).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);

    if (previous === undefined) {
      delete process.env.WS_CORS_ORIGINS;
    } else {
      process.env.WS_CORS_ORIGINS = previous;
    }
  });
});
