import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TaskDifficulty, TaskStatus } from '@prisma/client';
import { validate } from 'class-validator';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const CLIENT_MUTATION_ID = '0cfe1042-769f-4d19-88bc-7a0d710553ca';

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
  getSyncClock: jest.fn(),
  sync: jest.fn(),
  findAllForSync: jest.fn(),
  issueClientMutationId: jest.fn().mockReturnValue({
    clientMutationId: CLIENT_MUTATION_ID,
  }),
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
  ({ user: { sub: userId, sid: 'session-1', type: 'access' } }) as never;

const getControllerHandler = (
  methodName:
    | 'issueClientMutationId'
    | 'sync'
    | 'findAllForSync'
    | 'getSyncClock',
): object => {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    TasksController.prototype,
    methodName,
  )?.value;

  if (typeof handler !== 'function') {
    throw new TypeError(`Missing controller handler: ${methodName}`);
  }

  return handler;
};

const expectValidationError = async (
  dto: object,
  property: string,
): Promise<void> => {
  const errors = await validate(dto);

  expect(errors.map((error) => error.property)).toContain(property);
};

describe('TasksController', () => {
  let controller: TasksController;
  let tasksServiceMock: ReturnType<typeof makeTasksServiceMock>;

  beforeEach(async () => {
    tasksServiceMock = makeTasksServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: tasksServiceMock },
        {
          provide: JwtService,
          useValue: { verify: jest.fn(), sign: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: PrismaService,
          useValue: { refreshToken: { findFirst: jest.fn() } },
        },
        JwtAuthGuard,
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
  });

  it('uses the tasks path and JWT guard at class level', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TasksController)).toBe('tasks');
    expect(Reflect.getMetadata(GUARDS_METADATA, TasksController)).toEqual([
      JwtAuthGuard,
    ]);
  });

  it('exposes POST client-mutation-ids with a 200 status', () => {
    const handler = getControllerHandler('issueClientMutationId');

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'client-mutation-ids',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.OK,
    );
  });

  it('delegates client mutation ID issuance to tasksService', () => {
    const result = controller.issueClientMutationId();

    expect(tasksServiceMock.issueClientMutationId).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ clientMutationId: CLIENT_MUTATION_ID });
  });

  it('reads the clock for the authenticated owner through the dedicated static route', async () => {
    const checkpoint = {
      serverTime: '2026-09-11T12:00:00.000Z',
      logicalTime: 0,
    };
    tasksServiceMock.getSyncClock.mockResolvedValue(checkpoint);
    expect(await controller.getSyncClock(makeAuthRequest('actual-owner'))).toBe(
      checkpoint,
    );
    expect(tasksServiceMock.getSyncClock).toHaveBeenCalledWith('actual-owner');
    expect(
      Reflect.getMetadata(PATH_METADATA, getControllerHandler('getSyncClock')),
    ).toBe('sync/clock');
    expect(tasksServiceMock.findOne).not.toHaveBeenCalled();
  });

  it('exposes guarded sync routes and declares GET sync before the dynamic task ID', () => {
    const post = getControllerHandler('sync');
    const get = getControllerHandler('findAllForSync');
    expect(Reflect.getMetadata(PATH_METADATA, post)).toBe('sync');
    expect(Reflect.getMetadata(METHOD_METADATA, post)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, post)).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata(PATH_METADATA, get)).toBe('sync');
    expect(Reflect.getMetadata(METHOD_METADATA, get)).toBe(RequestMethod.GET);
    const methods = Object.getOwnPropertyNames(TasksController.prototype);
    expect(methods.indexOf('findAllForSync')).toBeLessThan(
      methods.indexOf('findOne'),
    );
  });

  it('passes the original unknown body and authenticated owner to sync validation', async () => {
    const input: unknown = { userId: 'forged-owner', unexpected: true };
    const response = {
      mutationId: CLIENT_MUTATION_ID,
      outcome: 'applied',
      task: MOCK_TASK,
      serverTime: new Date().toISOString(),
    };
    tasksServiceMock.sync.mockResolvedValue(response);
    await expect(
      controller.sync(makeAuthRequest('actual-owner'), input),
    ).resolves.toBe(response);
    expect(tasksServiceMock.sync).toHaveBeenCalledWith('actual-owner', input);
    expect(tasksServiceMock.create).not.toHaveBeenCalled();
  });

  it('delegates sync pagination using the authenticated owner', async () => {
    const query = { date: '2026-06-03', limit: 25, cursor: CLIENT_MUTATION_ID };
    const rows = [
      {
        ...MOCK_TASK,
        syncUpdatedAt: MOCK_TASK.updatedAt.toISOString(),
        syncMutationId: '',
      },
    ];
    tasksServiceMock.findAllForSync.mockResolvedValue(rows);
    await expect(
      controller.findAllForSync(makeAuthRequest('actual-owner'), query),
    ).resolves.toBe(rows);
    expect(tasksServiceMock.findAllForSync).toHaveBeenCalledWith(
      'actual-owner',
      query,
    );
    expect(tasksServiceMock.findOne).not.toHaveBeenCalled();
  });

  it.each([BadRequestException, ConflictException, NotFoundException])(
    'propagates sync policy exception %p',
    async (Exception) => {
      const failure = new Exception();
      tasksServiceMock.sync.mockRejectedValue(failure);
      await expect(controller.sync(makeAuthRequest(), null)).rejects.toBe(
        failure,
      );
    },
  );

  it('propagates inaccessible sync cursor failure', async () => {
    const failure = new NotFoundException();
    tasksServiceMock.findAllForSync.mockRejectedValue(failure);
    await expect(
      controller.findAllForSync(makeAuthRequest(), {
        cursor: CLIENT_MUTATION_ID,
      }),
    ).rejects.toBe(failure);
  });

  it('create delegates to tasksService.create', async () => {
    const dto = {
      clientMutationId: CLIENT_MUTATION_ID,
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

describe('CreateTaskDto validation', () => {
  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-uuid'],
    ['non-v4', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'],
  ])('rejects a %s clientMutationId', async (_label, clientMutationId) => {
    const dto = Object.assign(new CreateTaskDto(), {
      ...(clientMutationId === undefined ? {} : { clientMutationId }),
      title: 'Morning run',
      startAt: '2026-06-03T06:00:00Z',
      endAt: '2026-06-03T07:00:00Z',
      difficulty: TaskDifficulty.MEDIUM,
    });

    await expectValidationError(dto, 'clientMutationId');
  });

  it('accepts a valid create task DTO', async () => {
    const dto = Object.assign(new CreateTaskDto(), {
      clientMutationId: CLIENT_MUTATION_ID,
      title: 'Morning run',
      startAt: '2026-06-03T06:00:00Z',
      endAt: '2026-06-03T07:00:00Z',
      difficulty: TaskDifficulty.MEDIUM,
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });
});

describe('UpdateTaskDto validation', () => {
  it.each(['startAt', 'endAt'] as const)(
    'rejects an explicit null %s',
    async (property) => {
      const dto = Object.assign(new UpdateTaskDto(), { [property]: null });

      await expectValidationError(dto, property);
    },
  );

  it('accepts omitted dates', async () => {
    await expect(validate(new UpdateTaskDto())).resolves.toEqual([]);
  });
});
