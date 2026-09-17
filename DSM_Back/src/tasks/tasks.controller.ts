import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import {
  TasksService,
  type SyncTaskProjection,
  type TaskSyncResult,
} from './tasks.service';
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

  @Post('client-mutation-ids')
  @HttpCode(HttpStatus.OK)
  issueClientMutationId(): { clientMutationId: string } {
    return this.tasksService.issueClientMutationId();
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(
    @Req() req: AuthRequest,
    @Body() input: unknown,
  ): Promise<TaskSyncResult> {
    return this.tasksService.sync(req.user.sub, input);
  }

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

  @Get('sync')
  findAllForSync(
    @Req() req: AuthRequest,
    @Query() query: TaskQueryDto,
  ): Promise<SyncTaskProjection[]> {
    return this.tasksService.findAllForSync(req.user.sub, query);
  }

  @Get('sync/clock')
  @Header('Cache-Control', 'no-store')
  getSyncClock(
    @Req() req: AuthRequest,
  ): Promise<{ serverTime: string; logicalTime: number }> {
    return this.tasksService.getSyncClock(req.user.sub);
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
