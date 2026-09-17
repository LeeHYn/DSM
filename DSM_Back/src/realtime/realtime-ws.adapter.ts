import { WsAdapter } from '@nestjs/platform-ws';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocket, WebSocketServer } from 'ws';

const SAFE_BAD_REQUEST =
  'HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';
const WARNING_INTERVAL_MS = 60000;
type Upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
type RegisteredServer = WebSocketServer & { path: string };

export class RealtimeWsAdapter extends WsAdapter {
  private readonly upgrades = new Map<Server, Upgrade>();
  private lastWarningAt: number | undefined;

  override bindMessageHandlers(): void {
    // RealtimeGateway alone parses the complete raw envelope and binary flag.
  }

  override bindErrorHandler(server: WebSocketServer): WebSocketServer {
    const warn = () => this.warnUnavailable();
    const connection = (socket: WebSocket) => {
      socket.on('error', warn);
      socket.once('close', () => socket.off('error', warn));
    };
    server.on('connection', connection);
    server.on('error', warn);
    server.once('close', () => {
      server.off('connection', connection);
      server.off('error', warn);
    });
    return server;
  }

  protected override ensureHttpServerExists(
    port: number,
    httpServer: Server = createServer(),
  ): Server | undefined {
    if (this.httpServersRegistry.has(port)) return;
    this.httpServersRegistry.set(port, httpServer);
    const upgrade: Upgrade = (request, socket, head) => {
      const destroy = () => socket.destroy();
      socket.once('error', destroy);
      try {
        // Native clients authenticate once in a frame. Neither request-target
        // credentials nor authorization headers participate in authentication.
        if (
          request.url !== '/realtime' ||
          request.headers.authorization !== undefined ||
          request.headers['proxy-authorization'] !== undefined
        ) {
          this.rejectUpgrade(socket);
          return;
        }
        const entries = this.wsServersRegistry.get(port) as
          | RegisteredServer[]
          | undefined;
        const server = entries?.find((entry) => entry.path === '/realtime');
        if (!server) {
          this.rejectUpgrade(socket);
          return;
        }
        server.handleUpgrade(request, socket, head, (client) => {
          socket.off('error', destroy);
          server.emit('connection', client, request);
        });
      } catch {
        this.warnUnavailable();
        this.rejectUpgrade(socket);
      }
    };
    this.upgrades.set(httpServer, upgrade);
    httpServer.on('upgrade', upgrade);
    return httpServer;
  }

  override async dispose(): Promise<void> {
    for (const [server, upgrade] of this.upgrades)
      server.off('upgrade', upgrade);
    this.upgrades.clear();
    // WsAdapter owns only standalone HTTP servers; Nest owns shared port zero.
    await super.dispose();
  }

  private rejectUpgrade(socket: Duplex): void {
    if (socket.destroyed) return;
    try {
      socket.end(SAFE_BAD_REQUEST, () => socket.destroy());
    } catch {
      socket.destroy();
    }
  }

  private warnUnavailable(): void {
    const now = Date.now();
    if (
      this.lastWarningAt !== undefined &&
      now - this.lastWarningAt < WARNING_INTERVAL_MS
    ) {
      return;
    }
    this.lastWarningAt = now;
    this.logger.warn('Realtime transport unavailable');
  }
}
