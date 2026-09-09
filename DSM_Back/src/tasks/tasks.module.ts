import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ScoresModule } from '../scores/scores.module';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';

@Module({
  imports: [AuthModule, PrismaModule, ScoresModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
