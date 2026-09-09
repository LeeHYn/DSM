import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RankingCacheService } from './ranking-cache.service';
import { RankingProjectionService } from './ranking-projection.service';
import { RankingsService } from './rankings.service';
import { RankingsController } from './rankings.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [RankingsController],
  providers: [RankingsService, RankingCacheService, RankingProjectionService],
  exports: [RankingsService],
})
export class RankingsModule {}
