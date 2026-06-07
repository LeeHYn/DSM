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

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    try {
      return await this.prisma.category.create({
        data: {
          userId,
          name: dto.name,
          color: dto.color,
        },
      });
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  findAll(userId: string): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { OR: [{ userId }, { isDefault: true }] },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
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
    await this.prisma.category.delete({ where: { id } });
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

  private mapKnownError(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('Category name already exists');
    }
    return error;
  }
}
