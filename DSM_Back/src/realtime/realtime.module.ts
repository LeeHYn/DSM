import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RankingsModule } from '../rankings/rankings.module';
import { RedisModule } from '../redis/redis.module';
import { RankingGateway } from './ranking.gateway';
import { RankingRealtimeService } from './ranking-realtime.service';

@Module({
  imports: [ConfigModule, JwtModule.register({}), RankingsModule, RedisModule],
  providers: [RankingGateway, RankingRealtimeService],
  exports: [RankingRealtimeService],
})
export class RealtimeModule {}
