import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ScoresModule } from '../scores/scores.module';

@Module({
  imports: [PrismaModule, ScoresModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
