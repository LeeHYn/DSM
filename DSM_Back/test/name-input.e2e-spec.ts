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

describe('Names in partial updates (HTTP)', () => {
  let app: INestApplication<App>;
  const taskUpdate = jest.fn().mockResolvedValue({ id: 'task' });
  const categoryUpdate = jest.fn().mockResolvedValue({ id: 'category' });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TasksController, CategoriesController],
      providers: [
        { provide: TasksService, useValue: { update: taskUpdate } },
        { provide: CategoriesService, useValue: { update: categoryUpdate } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<{ user: { sub: string } }>().user =
            { sub: 'name-input-user' };
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
    ['/tasks/task', 'title', taskUpdate],
    ['/categories/category', 'name', categoryUpdate],
  ] as const)('%s', (path, field, update) => {
    it('rejects an empty name before service execution', async () => {
      await request(app.getHttpServer())
        .patch(path)
        .send({ [field]: '' })
        .expect(400);
      expect(update).not.toHaveBeenCalled();
    });
    it('preserves a valid name', async () => {
      await request(app.getHttpServer())
        .patch(path)
        .send({ [field]: 'Changed name' })
        .expect(200);
      expect(update).toHaveBeenCalledWith(
        'name-input-user',
        expect.any(String),
        expect.objectContaining({ [field]: 'Changed name' }),
      );
    });
    it('preserves omitted names in a partial update', async () => {
      await request(app.getHttpServer()).patch(path).send({}).expect(200);
      expect(update).toHaveBeenCalledTimes(1);
      const dto = (update.mock.calls[0] as unknown[])[2] as Record<
        string,
        unknown
      >;
      expect(dto[field]).toBeUndefined();
    });
  });
});
