import { Module } from '@nestjs/common';
import { RankingsService } from './rankings.service';
import { RankingsController } from './rankings.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { RankingsCacheService } from './rankings-cache.service';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [RankingsController],
  providers: [RankingsService, RankingsCacheService],
  exports: [RankingsService, RankingsCacheService],
})
export class RankingsModule {}
