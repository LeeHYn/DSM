import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../src/app.bootstrap';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { TasksController } from '../src/tasks/tasks.controller';
import { TasksService } from '../src/tasks/tasks.service';

describe('Task mutation input (HTTP)', () => {
  let app: INestApplication<App>;
  const create = jest.fn().mockResolvedValue({ id: 'task' });
  const update = jest.fn().mockResolvedValue({ id: 'task' });
  const validTask = {
    clientMutationId: '00000000-0000-4000-8000-000000000001',
    title: 'Task input fixture',
    difficulty: 'LOW',
    startAt: '2028-02-29T09:00:00Z',
    endAt: '2028-02-29T10:00:00Z',
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: { create, update } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<{ user: { sub: string } }>().user =
            {
              sub: 'task-input-user',
            };
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

  describe.each(['POST', 'PATCH'] as const)('%s /tasks', (method) => {
    const send = (fields: Record<string, unknown>) => {
      const server = request(app.getHttpServer());
      return method === 'POST'
        ? server.post('/tasks').send({ ...validTask, ...fields })
        : server.patch('/tasks/task').send(fields);
    };
    const service = method === 'POST' ? create : update;
    const status = method === 'POST' ? 201 : 200;
    const submittedDto = (): Record<string, unknown> => {
      const args = service.mock.calls[0] as unknown[];
      return args[method === 'POST' ? 1 : 2] as Record<string, unknown>;
    };

    it.each(['false', 'true', '', 0, 1, [], {}])(
      'rejects non-boolean notificationEnabled=%j before service calls',
      async (notificationEnabled) => {
        await send({ notificationEnabled }).expect(400);
        expect(create).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
      },
    );

    it.each([false, true, null])(
      'preserves notificationEnabled=%j',
      async (notificationEnabled) => {
        await send({ notificationEnabled }).expect(status);
        expect(service).toHaveBeenCalledTimes(1);
        expect(submittedDto().notificationEnabled).toBe(notificationEnabled);
      },
    );

    it('preserves omitted optional fields and partial PATCH', async () => {
      await send({ title: 'Changed title' }).expect(status);
      expect(service).toHaveBeenCalledTimes(1);
      expect(submittedDto().notificationEnabled).toBeUndefined();
      if (method === 'PATCH') {
        expect(submittedDto().startAt).toBeUndefined();
        expect(submittedDto().endAt).toBeUndefined();
      }
    });

    describe.each(['startAt', 'endAt'])('%s', (field) => {
      it.each([
        '2026-02-30T09:00:00Z',
        '2026-02-29T09:00:00+09:00',
        '2028-04-31T09:00:00-05:00',
        '2100-02-29T09:00:00Z',
        null,
      ])(
        'rejects impossible or null date %j before service calls',
        async (date) => {
          await send({ [field]: date }).expect(400);
          expect(create).not.toHaveBeenCalled();
          expect(update).not.toHaveBeenCalled();
        },
      );

      it.each([
        '2028-02-29T09:00:00Z',
        '2000-02-29T09:00:00+09:00',
        '2028-04-30T09:00:00-05:00',
      ])('preserves valid calendar date and offset %s', async (date) => {
        await send({ [field]: date }).expect(status);
        expect(service).toHaveBeenCalledTimes(1);
        expect(submittedDto()[field]).toBe(date);
      });
    });
  });
});
