import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TaskDifficulty, TaskStatus } from '@prisma/client';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const MOCK_TASK = {
  id: 'task-uuid-1',
  title: 'Morning run',
  description: null,
  startAt: new Date('2026-06-03T06:00:00Z'),
  endAt: new Date('2026-06-03T07:00:00Z'),
  completedAt: null,
  difficulty: TaskDifficulty.MEDIUM,
  status: TaskStatus.PENDING,
  notificationEnabled: true,
  userId: 'user-uuid-1',
  categoryId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const makeTasksServiceMock = () => ({
  create: jest.fn().mockResolvedValue(MOCK_TASK),
  findAll: jest.fn().mockResolvedValue([MOCK_TASK]),
  findOne: jest.fn().mockResolvedValue(MOCK_TASK),
  update: jest.fn().mockResolvedValue(MOCK_TASK),
  remove: jest.fn().mockResolvedValue(undefined),
  complete: jest.fn().mockResolvedValue({
    ...MOCK_TASK,
    status: TaskStatus.COMPLETED,
    completedAt: new Date(),
  }),
});

const makeAuthRequest = (userId = 'user-uuid-1') =>
  ({ user: { sub: userId, type: 'access' } }) as never;

describe('TasksController', () => {
  let controller: TasksController;
  let tasksServiceMock: ReturnType<typeof makeTasksServiceMock>;

  beforeEach(async () => {
    tasksServiceMock = makeTasksServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: tasksServiceMock },
        { provide: JwtService, useValue: { verify: jest.fn(), sign: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        JwtAuthGuard,
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
  });

  it('create delegates to tasksService.create', async () => {
    const dto = {
      title: 'Morning run',
      startAt: '2026-06-03T06:00:00Z',
      endAt: '2026-06-03T07:00:00Z',
      difficulty: TaskDifficulty.MEDIUM,
    };

    const result = await controller.create(makeAuthRequest(), dto);

    expect(tasksServiceMock.create).toHaveBeenCalledWith('user-uuid-1', dto);
    expect(result).toEqual(MOCK_TASK);
  });

  it('findAll delegates to tasksService.findAll', async () => {
    const result = await controller.findAll(makeAuthRequest(), {});

    expect(tasksServiceMock.findAll).toHaveBeenCalledWith('user-uuid-1', {});
    expect(result).toEqual([MOCK_TASK]);
  });

  it('findOne delegates to tasksService.findOne', async () => {
    const result = await controller.findOne(makeAuthRequest(), 'task-uuid-1');

    expect(tasksServiceMock.findOne).toHaveBeenCalledWith(
      'user-uuid-1',
      'task-uuid-1',
    );
    expect(result).toEqual(MOCK_TASK);
  });

  it('update delegates to tasksService.update', async () => {
    const dto = { title: 'Evening run' };
    await controller.update(makeAuthRequest(), 'task-uuid-1', dto);

    expect(tasksServiceMock.update).toHaveBeenCalledWith(
      'user-uuid-1',
      'task-uuid-1',
      dto,
    );
  });

  it('remove delegates to tasksService.remove', async () => {
    await controller.remove(makeAuthRequest(), 'task-uuid-1');

    expect(tasksServiceMock.remove).toHaveBeenCalledWith(
      'user-uuid-1',
      'task-uuid-1',
    );
  });

  it('complete delegates to tasksService.complete', async () => {
    const result = await controller.complete(makeAuthRequest(), 'task-uuid-1');

    expect(tasksServiceMock.complete).toHaveBeenCalledWith(
      'user-uuid-1',
      'task-uuid-1',
    );
    expect(result.status).toBe(TaskStatus.COMPLETED);
  });
});
