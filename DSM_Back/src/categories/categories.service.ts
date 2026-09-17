import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Category, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';
import type { CategoryQueryDto } from './dto/category-query.dto';

const MAX_PERSONAL_CATEGORIES = 50;
const MAX_CATEGORY_PAGE_SIZE = 100;
const MAX_SERIALIZABLE_TRANSACTION_RETRIES = 2;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    try {
      return await this.runSerializableTransaction(async (client) => {
        await client.$queryRaw`
          SELECT 1 FROM "User" WHERE id = ${userId} FOR UPDATE
        `;
        const count = await client.category.count({
          where: { userId, isDefault: false },
        });
        if (count >= MAX_PERSONAL_CATEGORIES) {
          throw new ConflictException('Personal category limit reached');
        }
        return client.category.create({
          data: {
            userId,
            name: dto.name,
            color: dto.color,
          },
        });
      });
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  async findAll(
    userId: string,
    query: CategoryQueryDto = {},
  ): Promise<Category[]> {
    if (query.cursor) {
      await this.findOne(userId, query.cursor);
    }
    return this.prisma.category.findMany({
      where: { OR: [{ userId }, { isDefault: true }] },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      // Keep timestamp comparison in the DB: createdAt can have microseconds.
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      take: Math.min(
        query.limit ?? MAX_CATEGORY_PAGE_SIZE,
        MAX_CATEGORY_PAGE_SIZE,
      ),
    });
  }

  async findOne(userId: string, id: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { id, OR: [{ userId }, { isDefault: true }] },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    await this.findOwned(userId, id);
    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.color !== undefined && { color: dto.color }),
        },
      });
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  /**
   * Loads a category the user is allowed to mutate. Default categories are
   * read-only, and other users' categories are hidden (treated as missing).
   */
  private async findOwned(userId: string, id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category || (!category.isDefault && category.userId !== userId)) {
      throw new NotFoundException('Category not found');
    }
    if (category.isDefault) {
      throw new ForbiddenException('Default categories cannot be modified');
    }
    return category;
  }

  private async runSerializableTransaction<T>(
    operation: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let retry = 0; ; retry += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          retry >= MAX_SERIALIZABLE_TRANSACTION_RETRIES
        ) {
          throw error;
        }
      }
    }
  }

  private mapKnownError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException('Category name already exists');
      }
      if (error.code === 'P2025') {
        return new NotFoundException('Category not found');
      }
    }
    return error;
  }
}
