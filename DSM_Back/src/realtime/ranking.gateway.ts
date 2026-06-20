import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayInit,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import { RankingPeriod } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { RedisService } from '../redis/redis.service';
import {
  isRankingPeriod,
  rankingRoom,
  RealtimeEventName,
  userRoom,
  websocketCorsOrigin,
} from './realtime-events';

type AuthenticatedSocketData = {
  userId?: string;
};

type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  AuthenticatedSocketData
>;

type RankingSubscriptionPayload = {
  period?: unknown;
};

@WebSocketGateway({
  cors: { origin: websocketCorsOrigin() },
})
export class RankingGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async afterInit(server: Server): Promise<void> {
    const clients = await this.redisService.createAdapterClients();
    if (!clients) {
      return;
    }

    server.adapter(createAdapter(clients.pubClient, clients.subClient));
  }

  handleConnection(client: AuthenticatedSocket): void {
    try {
      const payload = this.verifyHandshake(client);
      this.setUserId(client, payload.sub);
      void client.join(userRoom(payload.sub));
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('user.join')
  handleUserJoin(@ConnectedSocket() client: AuthenticatedSocket): {
    event: 'user.joined';
    room: string;
  } {
    const room = userRoom(this.requireUserId(client));
    void client.join(room);
    return { event: 'user.joined', room };
  }

  @SubscribeMessage('ranking.subscribe')
  handleRankingSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: RankingSubscriptionPayload,
  ): {
    event: 'ranking.subscribed';
    period: RankingPeriod;
    room: string;
  } {
    this.requireUserId(client);
    const period = this.requireRankingPeriod(payload);
    const room = rankingRoom(period);
    void client.join(room);
    return { event: 'ranking.subscribed', period, room };
  }

  @SubscribeMessage('ranking.unsubscribe')
  handleRankingUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: RankingSubscriptionPayload,
  ): {
    event: 'ranking.unsubscribed';
    period: RankingPeriod;
    room: string;
  } {
    this.requireUserId(client);
    const period = this.requireRankingPeriod(payload);
    const room = rankingRoom(period);
    void client.leave(room);
    return { event: 'ranking.unsubscribed', period, room };
  }

  emitToUser(
    userId: string,
    eventName: RealtimeEventName,
    payload: unknown,
  ): void {
    this.server.to(userRoom(userId)).emit(eventName, payload);
  }

  emitToRankingPeriod(
    period: RankingPeriod,
    eventName: RealtimeEventName,
    payload: unknown,
  ): void {
    this.server.to(rankingRoom(period)).emit(eventName, payload);
  }

  private verifyHandshake(client: Socket): JwtPayload {
    const token = this.extractHandshakeToken(client);

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    const payload = this.jwtService.verify<JwtPayload>(token, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
    });

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    return payload;
  }

  private extractHandshakeToken(client: Socket): string | null {
    const authToken = this.getHandshakeAuthToken(client);
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const authorization = client.handshake.headers.authorization;
    if (typeof authorization !== 'string') {
      return null;
    }

    const [type, token] = authorization.split(' ');
    return type === 'Bearer' ? (token ?? null) : null;
  }

  private requireUserId(client: AuthenticatedSocket): string {
    const userId = this.getUserId(client);
    if (!userId) {
      throw new WsException('Socket is not authenticated');
    }

    return userId;
  }

  private setUserId(client: AuthenticatedSocket, userId: string): void {
    client.data = { ...client.data, userId };
  }

  private getUserId(client: AuthenticatedSocket): string | undefined {
    return client.data.userId;
  }

  private getHandshakeAuthToken(client: Socket): unknown {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    return auth?.token;
  }

  private requireRankingPeriod(
    payload: RankingSubscriptionPayload,
  ): RankingPeriod {
    if (!isRankingPeriod(payload.period)) {
      throw new WsException('Invalid ranking period');
    }

    return payload.period;
  }
}
