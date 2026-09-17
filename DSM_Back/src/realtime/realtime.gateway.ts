import { type OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import {
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { EventEmitter } from 'node:events';
import { TextDecoder } from 'node:util';
import { SessionVerifierService } from '../auth/session-verifier.service';
import type { VerifiedAccessSession } from '../auth/session-verifier.service';
import { RealtimeBusService } from './realtime-bus.service';
import {
  createRealtimeId,
  parseAuthentication,
  REALTIME_CLOSE_CODES as CLOSE,
  REALTIME_LIMITS as LIMIT,
} from './realtime.policy';
import type {
  RealtimeBusEvent,
  RealtimeScope,
  RealtimeServerEvent,
} from './realtime.policy';

export type RealtimeSocket = Pick<EventEmitter, 'on' | 'off'> & {
  readyState: number;
  bufferedAmount: number;
  send(data: string, callback: (error?: Error) => void): void;
  close(code?: number): void;
  terminate(): void;
  ping(): void;
};
export type RealtimeServer = Pick<EventEmitter, 'on' | 'off'>;
type Timer = ReturnType<typeof setTimeout>;
type Client = {
  socket: RealtimeSocket;
  status: 'pending' | 'verifying' | 'authenticated' | 'closing';
  session?: VerifiedAccessSession;
  streamId: string;
  seq: number;
  pending: Set<RealtimeScope>;
  resetPending: boolean;
  checking: boolean;
  lastCheck: number;
  lastSend: number;
  sending: boolean;
  lastPing: number;
  awaitingPong: boolean;
  authTimer?: Timer;
  expiryTimer?: Timer;
  checkTimer?: Timer;
  closeTimer?: Timer;
  message: (raw: unknown, binary: unknown) => void;
  close: () => void;
  error: () => void;
  pong: () => void;
};
const CHECK_CAP = 8;
const CHECK_TIMEOUT_MS = 2000;
const CLOSE_GRACE_MS = 1000;

@WebSocketGateway({
  path: '/realtime',
  maxPayload: LIMIT.maxFrameBytes,
  perMessageDeflate: false,
})
export class RealtimeGateway
  implements
    OnGatewayInit<RealtimeServer>,
    OnGatewayConnection<RealtimeSocket>,
    OnModuleDestroy
{
  private readonly clients = new Map<RealtimeSocket, Client>();
  private readonly users = new Map<string, number>();
  private readonly sessions = new Map<string, number>();
  private server?: RealtimeServer;
  private interval?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;
  private unreset?: () => void;
  private disposed = false;
  private pendingAuth = 0;
  private verifying = 0;
  private checking = 0;
  private revocationGeneration = 0;
  private scanOffset = 0;
  private drainScheduled = false;
  private readonly serverClosed = () => this.onModuleDestroy();

  constructor(
    private readonly verifier: SessionVerifierService,
    private readonly bus: RealtimeBusService,
  ) {}

  afterInit(server: RealtimeServer): void {
    if (this.server || this.disposed) return;
    this.server = server;
    server.on('close', this.serverClosed);
    this.unsubscribe = this.bus.subscribe((event) => this.onSignal(event));
    this.unreset = this.bus.onReset(() => {
      for (const client of this.clients.values()) {
        if (client.status === 'authenticated') client.resetPending = true;
      }
    });
    this.interval = setInterval(() => this.tick(), LIMIT.flushIntervalMs);
    this.interval.unref();
  }

  handleConnection(socket: RealtimeSocket): void {
    if (this.clients.has(socket)) return;
    if (
      this.disposed ||
      this.clients.size >= LIMIT.instanceConnections ||
      this.pendingAuth >= LIMIT.pendingAuthentications ||
      this.verifying >= LIMIT.pendingAuthentications
    ) {
      try {
        socket.close(CLOSE.limit);
      } catch {
        /* Closed transport. */
      }
      this.terminate(socket);
      return;
    }
    const client: Client = {
      socket,
      status: 'pending',
      streamId: '',
      seq: 0,
      pending: new Set(),
      resetPending: false,
      checking: false,
      lastCheck: 0,
      lastSend: 0,
      sending: false,
      lastPing: Date.now(),
      awaitingPong: false,
      message: (raw, binary) => this.onMessage(client, raw, binary),
      close: () => this.remove(client),
      error: () => this.close(client, CLOSE.unavailable),
      pong: () => {
        client.awaitingPong = false;
      },
    };
    this.clients.set(socket, client);
    this.pendingAuth++;
    socket.on('message', client.message);
    socket.on('close', client.close);
    socket.on('error', client.error);
    socket.on('pong', client.pong);
    client.authTimer = setTimeout(
      () => this.close(client, CLOSE.authentication),
      LIMIT.authenticationTimeoutMs,
    );
    client.authTimer.unref();
  }

  handleDisconnect(socket: RealtimeSocket): void {
    const client = this.clients.get(socket);
    if (client) this.remove(client);
  }

  onModuleDestroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.interval) clearInterval(this.interval);
    this.unsubscribe?.();
    this.unreset?.();
    this.server?.off('close', this.serverClosed);
    for (const client of this.clients.values()) {
      this.terminate(client.socket);
      this.remove(client);
    }
    this.users.clear();
    this.sessions.clear();
  }

  private onMessage(client: Client, raw: unknown, binary: unknown): void {
    if (client.status === 'closing') return;
    if (client.status !== 'pending' || binary !== false) {
      this.close(client, CLOSE.authentication);
      return;
    }
    let text: string;
    try {
      if (typeof raw === 'string') text = raw;
      else if (Buffer.isBuffer(raw) && raw.length <= LIMIT.maxFrameBytes) {
        text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      } else throw new Error();
    } catch {
      this.close(client, CLOSE.authentication);
      return;
    }
    const auth = parseAuthentication(text);
    if (!auth) {
      this.close(client, CLOSE.authentication);
      return;
    }
    if (this.verifying >= LIMIT.pendingAuthentications) {
      this.close(client, CLOSE.limit);
      return;
    }
    client.status = 'verifying';
    this.verifying++;
    void this.authenticate(client, auth.data.accessToken);
  }

  private async authenticate(client: Client, token: string): Promise<void> {
    const generation = this.revocationGeneration;
    try {
      const session = await this.verifier.verifyAccess(token);
      if (!this.live(client) || client.status !== 'verifying') return;
      if (generation !== this.revocationGeneration) {
        // The intervening revocation may belong to a different user. Retry
        // authentication without telling this client its session was revoked.
        this.close(client, CLOSE.unavailable);
        return;
      }
      if (session.exp * 1000 <= Date.now()) {
        this.close(client, CLOSE.expired);
        return;
      }
      const key = this.sessionKey(session);
      if (
        (this.users.get(session.sub) ?? 0) >= LIMIT.userConnections ||
        (this.sessions.get(key) ?? 0) >= LIMIT.sessionConnections
      ) {
        this.close(client, CLOSE.limit);
        return;
      }
      client.session = session;
      client.status = 'authenticated';
      this.pendingAuth--;
      this.users.set(session.sub, (this.users.get(session.sub) ?? 0) + 1);
      this.sessions.set(key, (this.sessions.get(key) ?? 0) + 1);
      clearTimeout(client.authTimer);
      client.lastCheck = Date.now();
      this.armExpiry(client);
      this.sendReset(client);
    } catch (error) {
      this.close(
        client,
        error instanceof UnauthorizedException
          ? CLOSE.authentication
          : CLOSE.unavailable,
      );
    } finally {
      // Closing the socket does not cancel the underlying JWT/database work.
      this.verifying--;
    }
  }

  private onSignal(event: RealtimeBusEvent): void {
    if (this.disposed) return;
    if (event.type === 'revoke') this.revocationGeneration++;
    for (const client of this.clients.values()) {
      const session = client.session;
      if (client.status !== 'authenticated' || !session) continue;
      if (event.type === 'revoke') {
        if (
          event.target.userId === session.sub &&
          (event.target.kind === 'user' ||
            event.target.sessionId === session.sid)
        )
          this.close(client, CLOSE.revoked);
      } else if (
        event.target.kind === 'all' ||
        event.target.userId === session.sub
      ) {
        for (const scope of event.scopes) client.pending.add(scope);
      }
    }
  }

  private tick(): void {
    const clients = [...this.clients.values()];
    const now = Date.now();
    for (let index = 0; index < clients.length; index++) {
      const client = clients[(this.scanOffset + index) % clients.length];
      if (client.status !== 'authenticated') continue;
      if (client.socket.readyState !== 1) {
        this.close(client, CLOSE.unavailable);
        continue;
      }
      if (client.socket.bufferedAmount > LIMIT.maxBufferedBytes) {
        this.close(client, CLOSE.limit);
        continue;
      }
      if (client.sending && now - client.lastSend >= CHECK_TIMEOUT_MS) {
        this.close(client, CLOSE.unavailable);
        continue;
      }
      if (now - client.lastPing >= LIMIT.familyCheckIntervalMs) {
        if (client.awaitingPong) {
          this.close(client, CLOSE.unavailable);
          continue;
        }
        client.lastPing = now;
        client.awaitingPong = true;
        try {
          client.socket.ping();
        } catch {
          this.close(client, CLOSE.unavailable);
          continue;
        }
      }
      if (client.checking || this.checking >= CHECK_CAP || client.sending)
        continue;
      const due = now - client.lastCheck >= LIMIT.familyCheckIntervalMs;
      const flushing =
        (client.resetPending || client.pending.size > 0) &&
        now - client.lastSend >= LIMIT.flushIntervalMs;
      if (due || flushing) {
        client.checking = true;
        this.checking++;
        void this.check(client);
      }
    }
    this.scanOffset = clients.length
      ? (this.scanOffset + CHECK_CAP) % clients.length
      : 0;
  }

  private async check(client: Client): Promise<void> {
    client.checkTimer = setTimeout(
      () => this.close(client, CLOSE.unavailable),
      CHECK_TIMEOUT_MS,
    );
    client.checkTimer.unref();
    try {
      const session = client.session!;
      const active = await this.verifier.isActive(session.sub, session.sid);
      if (!this.live(client) || client.status !== 'authenticated') return;
      if (!active) {
        this.close(client, CLOSE.revoked);
        return;
      }
      if (session.exp * 1000 <= Date.now()) {
        this.close(client, CLOSE.expired);
        return;
      }
      client.lastCheck = Date.now();
      if (Date.now() - client.lastSend < LIMIT.flushIntervalMs) return;
      if (client.resetPending || client.seq >= Number.MAX_SAFE_INTEGER) {
        this.sendReset(client);
      } else if (client.pending.size > 0) {
        const scopes = [...client.pending];
        client.pending.clear();
        this.send(client, {
          event: 'invalidate',
          data: {
            version: 1,
            streamId: client.streamId,
            seq: ++client.seq,
            scopes,
          },
        });
      }
    } catch {
      this.close(client, CLOSE.unavailable);
    } finally {
      clearTimeout(client.checkTimer);
      client.checking = false;
      this.checking--;
      this.drainChecks();
    }
  }

  private drainChecks(): void {
    if (this.disposed || this.drainScheduled) return;
    this.drainScheduled = true;
    void Promise.resolve().then(() => {
      this.drainScheduled = false;
      if (!this.disposed) this.tick();
    });
  }

  private sendReset(client: Client): void {
    client.streamId = createRealtimeId();
    client.seq = 0;
    client.resetPending = false;
    this.send(client, {
      event: 'reset',
      data: { version: 1, streamId: client.streamId, seq: 0 },
    });
  }

  private send(client: Client, event: RealtimeServerEvent): void {
    if (!this.live(client) || client.status !== 'authenticated') return;
    if (
      client.socket.readyState !== 1 ||
      client.socket.bufferedAmount > LIMIT.maxBufferedBytes
    ) {
      this.close(client, CLOSE.limit);
      return;
    }
    client.lastSend = Date.now();
    client.sending = true;
    try {
      client.socket.send(JSON.stringify(event), (error) => {
        client.sending = false;
        if (error) this.close(client, CLOSE.unavailable);
      });
    } catch {
      this.close(client, CLOSE.unavailable);
    }
  }

  private armExpiry(client: Client): void {
    const delay = client.session!.exp * 1000 - Date.now();
    if (delay <= 0) {
      this.close(client, CLOSE.expired);
      return;
    }
    client.expiryTimer = setTimeout(
      () => {
        if (this.live(client) && client.status === 'authenticated')
          this.armExpiry(client);
      },
      Math.min(delay, 2147483647),
    );
    client.expiryTimer.unref();
  }

  private close(client: Client, code: number): void {
    if (!this.live(client) || client.status === 'closing') return;
    if (client.status === 'pending' || client.status === 'verifying')
      this.pendingAuth--;
    client.status = 'closing';
    this.clearTimers(client);
    client.pending.clear();
    client.closeTimer = setTimeout(() => {
      this.terminate(client.socket);
      this.remove(client);
    }, CLOSE_GRACE_MS);
    client.closeTimer.unref();
    try {
      client.socket.close(code);
    } catch {
      this.terminate(client.socket);
      this.remove(client);
    }
  }

  private remove(client: Client): void {
    if (!this.clients.delete(client.socket)) return;
    if (client.status === 'pending' || client.status === 'verifying')
      this.pendingAuth--;
    client.status = 'closing';
    this.clearTimers(client);
    client.pending.clear();
    client.socket.off('message', client.message);
    client.socket.off('close', client.close);
    client.socket.off('error', client.error);
    client.socket.off('pong', client.pong);
    if (client.session) {
      this.decrement(this.users, client.session.sub);
      this.decrement(this.sessions, this.sessionKey(client.session));
    }
  }

  private clearTimers(client: Client): void {
    for (const timer of [
      client.authTimer,
      client.expiryTimer,
      client.checkTimer,
      client.closeTimer,
    ])
      clearTimeout(timer);
  }

  private terminate(socket: RealtimeSocket): void {
    try {
      socket.terminate();
    } catch {
      /* Closed transport. */
    }
  }

  private decrement(map: Map<string, number>, key: string): void {
    const count = (map.get(key) ?? 1) - 1;
    if (count <= 0) map.delete(key);
    else map.set(key, count);
  }

  private sessionKey(session: VerifiedAccessSession): string {
    return JSON.stringify([session.sub, session.sid]);
  }

  private live(client: Client): boolean {
    return !this.disposed && this.clients.get(client.socket) === client;
  }
}
