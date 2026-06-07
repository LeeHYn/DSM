import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const MOCK_CATEGORY = {
  id: 'cat-uuid-1',
  name: 'Health',
  color: '#FF0000',
  isDefault: false,
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makeCategoriesServiceMock = () => ({
  create: jest.fn().mockResolvedValue(MOCK_CATEGORY),
  findAll: jest.fn().mockResolvedValue([MOCK_CATEGORY]),
  findOne: jest.fn().mockResolvedValue(MOCK_CATEGORY),
  update: jest.fn().mockResolvedValue(MOCK_CATEGORY),
  remove: jest.fn().mockResolvedValue(undefined),
});

const makeAuthRequest = (userId = 'user-uuid-1') =>
  ({ user: { sub: userId, type: 'access' } }) as never;

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let categoriesServiceMock: ReturnType<typeof makeCategoriesServiceMock>;

  beforeEach(async () => {
    categoriesServiceMock = makeCategoriesServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        { provide: CategoriesService, useValue: categoriesServiceMock },
        {
          provide: JwtService,
          useValue: { verify: jest.fn(), sign: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        JwtAuthGuard,
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  it('create delegates to categoriesService.create', async () => {
    const dto = { name: 'Health', color: '#FF0000' };

    const result = await controller.create(makeAuthRequest(), dto);

    expect(categoriesServiceMock.create).toHaveBeenCalledWith(
      'user-uuid-1',
      dto,
    );
    expect(result).toEqual(MOCK_CATEGORY);
  });

  it('findAll delegates to categoriesService.findAll', async () => {
    const result = await controller.findAll(makeAuthRequest());

    expect(categoriesServiceMock.findAll).toHaveBeenCalledWith('user-uuid-1');
    expect(result).toEqual([MOCK_CATEGORY]);
  });

  it('findOne delegates to categoriesService.findOne', async () => {
    const result = await controller.findOne(makeAuthRequest(), 'cat-uuid-1');

    expect(categoriesServiceMock.findOne).toHaveBeenCalledWith(
      'user-uuid-1',
      'cat-uuid-1',
    );
    expect(result).toEqual(MOCK_CATEGORY);
  });

  it('update delegates to categoriesService.update', async () => {
    const dto = { name: 'Fitness' };
    await controller.update(makeAuthRequest(), 'cat-uuid-1', dto);

    expect(categoriesServiceMock.update).toHaveBeenCalledWith(
      'user-uuid-1',
      'cat-uuid-1',
      dto,
    );
  });

  it('remove delegates to categoriesService.remove', async () => {
    await controller.remove(makeAuthRequest(), 'cat-uuid-1');

    expect(categoriesServiceMock.remove).toHaveBeenCalledWith(
      'user-uuid-1',
      'cat-uuid-1',
    );
  });
});
