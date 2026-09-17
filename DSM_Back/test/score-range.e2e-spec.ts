import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app.bootstrap';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { ScoresController } from '../src/scores/scores.controller';
import { ScoresService } from '../src/scores/scores.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Score ranges (HTTP)', () => {
  let app: INestApplication<App>;
  const findMany = jest.fn().mockResolvedValue([]);
  const queryRaw = jest.fn().mockResolvedValue([]);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ScoresController],
      providers: [
        ScoresService,
        {
          provide: PrismaService,
          useValue: { dailyScore: { findMany }, $queryRaw: queryRaw },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<{ user: { sub: string } }>().user =
            { sub: 'range-user' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  describe.each(['/scores/calendar', '/scores/categories'])('%s', (path) => {
    it.each([
      {},
      { from: '2026-09-01' },
      { from: '2026-02-30', to: '2026-03-02' },
      { from: '2026-09-02', to: '2026-09-01' },
      { from: '2026-01-01', to: '2026-02-12' },
      { from: '2026-09-01T00:00:00Z', to: '2026-09-02' },
      { from: '0000-01-01', to: '0000-01-02' },
    ])('rejects invalid ranges before DB access: %j', async (query) => {
      await request(app.getHttpServer()).get(path).query(query).expect(400);
      expect(findMany).not.toHaveBeenCalled();
      expect(queryRaw).not.toHaveBeenCalled();
    });
    it('returns an authenticated scope for a valid bounded range', async () => {
      const response = await request(app.getHttpServer())
        .get(path)
        .query({ from: '2024-02-28', to: '2024-03-01' })
        .expect(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          userId: 'range-user',
          from: '2024-02-28',
          to: '2024-03-01',
        }),
      );
    });
  });
});
