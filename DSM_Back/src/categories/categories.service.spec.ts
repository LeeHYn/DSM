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

const makePrismaMock = () => {
  const client = {
    category: {
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };
  return {
    ...client,
    $transaction: jest.fn(
      (operation: (transaction: typeof client) => Promise<unknown>) =>
        operation(client),
    ),
  };
};

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
    it.each([0, 49])('accepts %i personal categories', async (count) => {
      prismaMock.category.count.mockResolvedValue(count);
      prismaMock.category.create.mockResolvedValue(MOCK_CATEGORY);

      await expect(
        service.create('user-uuid-1', { name: 'Health', color: '#FF0000' }),
      ).resolves.toEqual(MOCK_CATEGORY);

      expect(prismaMock.category.count).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', isDefault: false },
      });
      const [parts, userId] = prismaMock.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        string,
      ];
      expect(parts.join('?').replace(/\s+/g, ' ').trim()).toBe(
        'SELECT 1 FROM "User" WHERE id = ? FOR UPDATE',
      );
      expect(userId).toBe('user-uuid-1');
      expect(prismaMock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prismaMock.category.count.mock.invocationCallOrder[0],
      );
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    });

    it.each([50, 51])('rejects %i personal categories', async (count) => {
      prismaMock.category.count.mockResolvedValue(count);

      await expect(
        service.create('user-uuid-1', { name: 'Health', color: '#FF0000' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.category.create).not.toHaveBeenCalled();
    });

    it('rechecks the cap after a competing create causes P2034', async () => {
      prismaMock.category.count
        .mockResolvedValueOnce(49)
        .mockResolvedValueOnce(50);
      prismaMock.category.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('write conflict', {
          code: 'P2034',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create('user-uuid-1', { name: 'Health', color: '#FF0000' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.category.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('succeeds on the third serializable attempt and stops on another conflict', async () => {
      const conflict = new Prisma.PrismaClientKnownRequestError(
        'write conflict',
        {
          code: 'P2034',
          clientVersion: 'test',
        },
      );
      prismaMock.category.create
        .mockRejectedValueOnce(conflict)
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce(MOCK_CATEGORY);

      await expect(
        service.create('user-uuid-1', { name: 'Health', color: '#FF0000' }),
      ).resolves.toEqual(MOCK_CATEGORY);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);

      prismaMock.$transaction.mockClear();
      prismaMock.category.create.mockRejectedValue(conflict);
      await expect(
        service.create('user-uuid-1', { name: 'Other', color: '#FF0000' }),
      ).rejects.toBe(conflict);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
    });

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
    it.each([undefined, 1, 100, 101])('bounds limit %s', async (limit) => {
      prismaMock.category.findMany.mockResolvedValue([]);
      await expect(service.findAll('user-uuid-1', { limit })).resolves.toEqual(
        [],
      );
      expect(prismaMock.category.findMany).toHaveBeenCalledWith({
        where: { OR: [{ userId: 'user-uuid-1' }, { isDefault: true }] },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: limit === 1 ? 1 : 100,
      });
    });

    it.each([true, false])('pages after default=%s', async (isDefault) => {
      const cursor = { ...MOCK_CATEGORY, isDefault };
      prismaMock.category.findFirst.mockResolvedValue(cursor);
      prismaMock.category.findMany.mockResolvedValue([]);

      await service.findAll('user-uuid-1', { cursor: cursor.id, limit: 2 });

      expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
        where: {
          id: cursor.id,
          OR: [{ userId: 'user-uuid-1' }, { isDefault: true }],
        },
      });
      expect(prismaMock.category.findMany).toHaveBeenCalledWith({
        where: { OR: [{ userId: 'user-uuid-1' }, { isDefault: true }] },
        cursor: { id: cursor.id },
        skip: 1,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: 2,
      });
    });

    it('rejects a missing or foreign cursor before reading a page', async () => {
      prismaMock.category.findFirst.mockResolvedValue(null);
      prismaMock.category.findMany.mockResolvedValue([]);

      await expect(
        service.findAll('user-uuid-1', { cursor: 'foreign-or-missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'foreign-or-missing',
          OR: [{ userId: 'user-uuid-1' }, { isDefault: true }],
        },
      });
      expect(prismaMock.category.findMany).not.toHaveBeenCalled();
    });

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

  describe.each(['update', 'remove'] as const)(
    '%s mutation errors',
    (operation) => {
      const mutate = (target: CategoriesService) =>
        operation === 'update'
          ? target.update('user-uuid-1', 'cat-uuid-1', { name: 'Fitness' })
          : target.remove('user-uuid-1', 'cat-uuid-1');

      const writeMethod = () =>
        operation === 'update'
          ? prismaMock.category.update
          : prismaMock.category.delete;

      it('returns 404 when the owned row disappears after the ownership check', async () => {
        prismaMock.category.findUnique.mockResolvedValue(MOCK_CATEGORY);
        writeMethod().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Record no longer exists', {
            code: 'P2025',
            clientVersion: '6.19.3',
          }),
        );

        await expect(mutate(service)).rejects.toMatchObject({
          status: 404,
          message: 'Category not found',
        });
        expect(writeMethod()).toHaveBeenCalledTimes(1);
      });

      it('preserves unknown database errors', async () => {
        const failure = new Error('database unavailable');
        prismaMock.category.findUnique.mockResolvedValue(MOCK_CATEGORY);
        writeMethod().mockRejectedValue(failure);

        await expect(mutate(service)).rejects.toBe(failure);
      });

      it('hides another user category without attempting a write', async () => {
        prismaMock.category.findUnique.mockResolvedValue({
          ...MOCK_CATEGORY,
          userId: 'another-user',
        });

        await expect(mutate(service)).rejects.toThrow(NotFoundException);
        expect(writeMethod()).not.toHaveBeenCalled();
      });
    },
  );

  it('preserves the duplicate-name conflict on update', async () => {
    prismaMock.category.findUnique.mockResolvedValue(MOCK_CATEGORY);
    prismaMock.category.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    await expect(
      service.update('user-uuid-1', 'cat-uuid-1', { name: 'Fitness' }),
    ).rejects.toThrow(ConflictException);
  });
});
