import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

const MOCK_CATEGORY = {
  id: 'cat-uuid-1',
  name: 'Health',
  color: '#FF0000',
  isDefault: false,
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DEFAULT_CATEGORY = {
  ...MOCK_CATEGORY,
  id: 'cat-default-1',
  name: 'General',
  isDefault: true,
  userId: null,
};

const makePrismaMock = () => ({
  category: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prismaMock = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  describe('create', () => {
    it('creates a category for the given user', async () => {
      prismaMock.category.create.mockResolvedValue(MOCK_CATEGORY);

      const result = await service.create('user-uuid-1', {
        name: 'Health',
        color: '#FF0000',
      });

      expect(result).toEqual(MOCK_CATEGORY);
      expect(prismaMock.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ userId: 'user-uuid-1' }),
        }),
      );
    });

    it('throws ConflictException on duplicate name', async () => {
      const duplicate = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '6.19.3' },
      );
      prismaMock.category.create.mockRejectedValue(duplicate);

      await expect(
        service.create('user-uuid-1', { name: 'Health', color: '#FF0000' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('returns the user and default categories', async () => {
      prismaMock.category.findMany.mockResolvedValue([
        DEFAULT_CATEGORY,
        MOCK_CATEGORY,
      ]);

      const result = await service.findAll('user-uuid-1');

      expect(result).toEqual([DEFAULT_CATEGORY, MOCK_CATEGORY]);
      expect(prismaMock.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ userId: 'user-uuid-1' }, { isDefault: true }] },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the category when found', async () => {
      prismaMock.category.findFirst.mockResolvedValue(MOCK_CATEGORY);

      const result = await service.findOne('user-uuid-1', 'cat-uuid-1');

      expect(result).toEqual(MOCK_CATEGORY);
    });

    it('throws NotFoundException when missing', async () => {
      prismaMock.category.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('user-uuid-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates an owned category', async () => {
      prismaMock.category.findUnique.mockResolvedValue(MOCK_CATEGORY);
      prismaMock.category.update.mockResolvedValue({
        ...MOCK_CATEGORY,
        name: 'Fitness',
      });

      const result = await service.update('user-uuid-1', 'cat-uuid-1', {
        name: 'Fitness',
      });

      expect(result.name).toBe('Fitness');
    });

    it('throws ForbiddenException for a default category', async () => {
      prismaMock.category.findUnique.mockResolvedValue(DEFAULT_CATEGORY);

      await expect(
        service.update('user-uuid-1', 'cat-default-1', { name: 'X' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the category is missing', async () => {
      prismaMock.category.findUnique.mockResolvedValue(null);

      await expect(
        service.update('user-uuid-1', 'nonexistent', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes an owned category', async () => {
      prismaMock.category.findUnique.mockResolvedValue(MOCK_CATEGORY);
      prismaMock.category.delete.mockResolvedValue(MOCK_CATEGORY);

      await service.remove('user-uuid-1', 'cat-uuid-1');

      expect(prismaMock.category.delete).toHaveBeenCalledWith({
        where: { id: 'cat-uuid-1' },
      });
    });

    it('throws ForbiddenException for a default category', async () => {
      prismaMock.category.findUnique.mockResolvedValue(DEFAULT_CATEGORY);

      await expect(
        service.remove('user-uuid-1', 'cat-default-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
