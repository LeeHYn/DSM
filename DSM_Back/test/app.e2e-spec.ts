import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from './../src/app.bootstrap';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { RankingCacheService } from './../src/rankings/ranking-cache.service';
import { RealtimeWsAdapter } from './../src/realtime/realtime-ws.adapter';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const query = jest.fn();

  beforeEach(async () => {
    query.mockReset().mockResolvedValue([{ value: 1 }]);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: query })
      .overrideProvider(RankingCacheService)
      .useValue({ isConfigured: () => false })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new RealtimeWsAdapter(app));
    configureApp(app);
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          status: 'ok',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          timestamp: expect.any(String),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          uptime: expect.any(Number),
          database: {
            configured: true,
          },
        });
      });
  });

  it('normalizes not found responses', () => {
    return request(app.getHttpServer())
      .get('/missing-route')
      .expect(404)
      .expect(({ body }) => {
        expect(body).toEqual({
          statusCode: 404,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          timestamp: expect.any(String),
          path: '/missing-route',
          method: 'GET',
          error: 'Not Found',
          message: 'Cannot GET /missing-route',
        });
      });
  });

  it('/health/ready succeeds after a database query and disables caching', async () => {
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect({ status: 'ready' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('/health/ready returns a sanitized 503 when the database fails', async () => {
    query.mockRejectedValue(new Error('private database connection detail'));
    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect('Cache-Control', 'no-store');
    expect(response.body).toMatchObject({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Database is not ready',
    });
    expect(response.text).not.toContain('private database');
    await request(app.getHttpServer()).get('/health').expect(200);
    expect(query).toHaveBeenCalledTimes(1);
  });

  afterEach(async () => {
    await app.close();
  });
});
