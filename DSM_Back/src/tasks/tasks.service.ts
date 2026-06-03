import { Injectable, NotFoundException } from '@nestjs/common';
import { type Task, TaskStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { TaskQueryDto } from './dto/task-query.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateTaskDto): Promise<Task> {
    return this.prisma.task.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        difficulty: dto.difficulty,
        categoryId: dto.categoryId,
        notificationEnabled: dto.notificationEnabled ?? true,
      },
    });
  }

  findAll(userId: string, query: TaskQueryDto): Promise<Task[]> {
    const where: Prisma.TaskWhereInput = { userId, deletedAt: null };

    if (query.date) {
      const day = new Date(query.date);
      const nextDay = new Date(day);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      where.startAt = { gte: day, lt: nextDay };
    }

    return this.prisma.task.findMany({
      where,
      orderBy: { startAt: 'asc' },
    });
  }

  async findOne(userId: string, id: string): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async update(userId: string, id: string, dto: UpdateTaskDto): Promise<Task> {
    await this.findOne(userId, id);
    return this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.startAt !== undefined && { startAt: new Date(dto.startAt) }),
        ...(dto.endAt !== undefined && { endAt: new Date(dto.endAt) }),
        ...(dto.difficulty !== undefined && { difficulty: dto.difficulty }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.notificationEnabled !== undefined && {
          notificationEnabled: dto.notificationEnabled,
        }),
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    await this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async complete(userId: string, id: string): Promise<Task> {
    await this.findOne(userId, id);
    return this.prisma.task.update({
      where: { id },
      data: { status: TaskStatus.COMPLETED, completedAt: new Date() },
    });
  }
}
