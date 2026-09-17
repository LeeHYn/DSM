import { Controller, Get, Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { SessionVerifierService } from '../auth/session-verifier.service';
import { RealtimeBusService } from './realtime-bus.service';
import { RealtimeGateway } from './realtime.gateway';
import { parseServerEvent } from './realtime.policy';
import { RealtimeWsAdapter } from './realtime-ws.adapter';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return 'ok';
  }
}

describe('RealtimeWsAdapter actual loopback transport', () => {
  let app: INestApplication;
  let adapter: RealtimeWsAdapter;
  let server: Server;
  let wsServer: WebSocketServer;
  let port: number;
  const clients = new Set<WebSocket>();
  const verifyAccess = jest.fn();
  const unsubscribe = jest.fn();
  const unreset = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    verifyAccess.mockResolvedValue({
      sub: 'synthetic-user',
      sid: 'synthetic-family',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 900,
    });
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        RealtimeGateway,
        {
          provide: SessionVerifierService,
          useValue: {
            verifyAccess,
            isActive: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: RealtimeBusService,
          useValue: { subscribe: () => unsubscribe, onReset: () => unreset },
        },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    server = app.getHttpServer() as Server;
    adapter = new RealtimeWsAdapter(app);
    const create = jest.spyOn(adapter, 'create');
    app.useWebSocketAdapter(adapter);
    await app.listen(0, '127.0.0.1');
    port = (server.address() as AddressInfo).port;
    wsServer = create.mock.results[0].value as WebSocketServer;
  });

  afterEach(async () => {
    for (const client of clients) client.terminate();
    clients.clear();
    await app.close();
    jest.restoreAllMocks();
  });

  async function open(): Promise<WebSocket> {
    const client = new WebSocket(`ws://127.0.0.1:${port}/realtime`);
    clients.add(client);
    client.on('error', () => undefined);
    await new Promise<void>((resolve, reject) => {
      client.once('open', resolve);
      client.once('error', reject);
    });
    return client;
  }

  function closed(client: WebSocket): Promise<number> {
    return new Promise((resolve) => client.once('close', resolve));
  }

  function upgrade(
    path: string,
    extraHeaders = {},
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path,
          agent: false,
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'websocket',
            'Sec-WebSocket-Version': '13',
            'Sec-WebSocket-Key': 'MDEyMzQ1Njc4OWFiY2RlZg==',
            ...extraHeaders,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
            }),
          );
        },
      );
      req.once('upgrade', (_response, socket) => {
        socket.destroy();
        reject(new Error('Unexpected upgrade acceptance'));
      });
      req.once('error', reject);
      req.end();
    });
  }

  it('shares the Nest HTTP server and authenticates through the sole raw listener', async () => {
    const client = await open();
    const serverClient = [...wsServer.clients][0];
    expect(serverClient.listenerCount('message')).toBe(1);
    const message = new Promise<string>((resolve) => {
      client.once('message', (raw) => {
        expect(Buffer.isBuffer(raw)).toBe(true);
        resolve((raw as Buffer).toString('utf8'));
      });
    });
    client.send(
      JSON.stringify({
        event: 'authenticate',
        data: { version: 1, accessToken: 'synthetic-access' },
      }),
    );
    expect(parseServerEvent(await message)).toMatchObject({
      event: 'reset',
      data: { version: 1, seq: 0 },
    });
    expect(verifyAccess).toHaveBeenCalledTimes(1);
    expect(client.extensions).toBe('');
    const code = closed(client);
    client.send('{}');
    expect(await code).toBe(4001);
  });

  it('rejects binary frames using the gateway policy', async () => {
    const client = await open();
    const code = closed(client);
    client.send(Buffer.from('{}'));
    expect(await code).toBe(4001);
    expect(verifyAccess).not.toHaveBeenCalled();
  });

  it('enforces native maxPayload before the authentication parser', async () => {
    const client = await open();
    const code = closed(client);
    client.send('x'.repeat(4097));
    expect(await code).toBe(1009);
    expect(verifyAccess).not.toHaveBeenCalled();
  });

  it.each([
    '/unknown',
    '/realtime?accessToken=synthetic-private',
    '/realtime?',
    '/realtime#synthetic-private',
    'ws://synthetic:private@localhost/realtime',
    '/realtime/',
  ])(
    'rejects noncanonical upgrade target %s with an empty fixed response',
    async (path) => {
      await expect(upgrade(path)).resolves.toEqual({ status: 400, body: '' });
      expect(verifyAccess).not.toHaveBeenCalled();
    },
  );

  it('rejects credentials in handshake headers', async () => {
    await expect(
      upgrade('/realtime', { Authorization: 'Bearer synthetic-private' }),
    ).resolves.toEqual({ status: 400, body: '' });
    await expect(
      upgrade('/realtime', {
        'Proxy-Authorization': 'Basic synthetic-private',
      }),
    ).resolves.toEqual({ status: 400, body: '' });
  });

  it('returns fixed HTTP400 without reflecting upgrade exceptions', async () => {
    jest.spyOn(wsServer, 'handleUpgrade').mockImplementation(() => {
      throw new Error('synthetic-private raw transport details');
    });
    await expect(upgrade('/realtime')).resolves.toEqual({
      status: 400,
      body: '',
    });
  });

  it('logs only fixed throttled warnings for socket and server errors', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const client = await open();
    const code = closed(client);
    [...wsServer.clients][0].emit(
      'error',
      new Error('synthetic-private socket payload'),
    );
    for (let index = 0; index < 100; index++)
      wsServer.emit('error', new Error('synthetic-private server payload'));
    expect(await code).toBe(1013);
    expect(warn.mock.calls).toEqual([['Realtime transport unavailable']]);
    expect(error).not.toHaveBeenCalled();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 60001);
    wsServer.emit('error', new Error('synthetic-private again'));
    expect(warn.mock.calls).toEqual([
      ['Realtime transport unavailable'],
      ['Realtime transport unavailable'],
    ]);
  });

  it('preserves regular HTTP routes on the shared listener', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Connection: 'close' },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('closes clients and removes adapter upgrade listeners during Nest shutdown', async () => {
    const client = await open();
    const code = closed(client);
    expect(server.listenerCount('upgrade')).toBe(1);
    await app.close();
    await code;
    expect(server.listening).toBe(false);
    expect(server.listenerCount('upgrade')).toBe(0);
    expect(wsServer.clients.size).toBe(0);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unreset).toHaveBeenCalledTimes(1);
  });
});
