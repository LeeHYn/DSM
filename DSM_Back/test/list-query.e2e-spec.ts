import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app.bootstrap';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { TasksController } from '../src/tasks/tasks.controller';
import { TasksService } from '../src/tasks/tasks.service';
import { CategoriesController } from '../src/categories/categories.controller';
import { CategoriesService } from '../src/categories/categories.service';

describe('Bounded list query (HTTP)', () => {
  let app: INestApplication<App>;
  const tasks = jest.fn().mockResolvedValue([]);
  const categories = jest.fn().mockResolvedValue([]);
  const cursor = 'a9949d51-daf7-4efc-8444-85d2e9f94853';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TasksController, CategoriesController],
      providers: [
        { provide: TasksService, useValue: { findAll: tasks } },
        { provide: CategoriesService, useValue: { findAll: categories } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<{ user: { sub: string } }>().user =
            { sub: 'list-user' };
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

  describe.each([
    ['/tasks', tasks],
    ['/categories', categories],
  ] as const)('%s', (path, findAll) => {
    it.each(['0', '-1', '101', '1.5', 'NaN', '', 'true'])(
      'rejects limit=%s before service execution',
      async (limit) => {
        await request(app.getHttpServer())
          .get(path)
          .query({ limit })
          .expect(400);
        expect(findAll).not.toHaveBeenCalled();
      },
    );
    it('rejects malformed cursor', async () => {
      await request(app.getHttpServer())
        .get(path)
        .query({ cursor: 'foreign-or-malformed' })
        .expect(400);
      expect(findAll).not.toHaveBeenCalled();
    });
    it('passes numeric limit and cursor to the authenticated scope', async () => {
      await request(app.getHttpServer())
        .get(path)
        .query({ limit: '100', cursor })
        .expect(200, []);
      expect(findAll).toHaveBeenCalledWith(
        'list-user',
        expect.objectContaining({ limit: 100, cursor }),
      );
    });
    it('accepts omitted pagination', async () => {
      await request(app.getHttpServer()).get(path).expect(200, []);
      expect(findAll).toHaveBeenCalledTimes(1);
    });
  });
});
