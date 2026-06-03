import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Task } from '@prisma/client';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

type AuthRequest = Request & { user: JwtPayload };

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateTaskDto): Promise<Task> {
    return this.tasksService.create(req.user.sub, dto);
  }

  @Get()
  findAll(
    @Req() req: AuthRequest,
    @Query() query: TaskQueryDto,
  ): Promise<Task[]> {
    return this.tasksService.findAll(req.user.sub, query);
  }

  @Get(':id')
  findOne(@Req() req: AuthRequest, @Param('id') id: string): Promise<Task> {
    return this.tasksService.findOne(req.user.sub, id);
  }

  @Patch(':id')
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<Task> {
    return this.tasksService.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.tasksService.remove(req.user.sub, id);
  }

  @Patch(':id/complete')
  complete(@Req() req: AuthRequest, @Param('id') id: string): Promise<Task> {
    return this.tasksService.complete(req.user.sub, id);
  }
}
