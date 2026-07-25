import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RankingsService } from './rankings.service';
import { RankingsController } from './rankings.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [RankingsController],
  providers: [RankingsService],
  exports: [RankingsService],
})
export class RankingsModule {}
