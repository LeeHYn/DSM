import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from './../src/app.bootstrap';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
          timestamp: expect.any(String),
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
          timestamp: expect.any(String),
          path: '/missing-route',
          method: 'GET',
          error: 'Not Found',
          message: 'Cannot GET /missing-route',
        });
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
