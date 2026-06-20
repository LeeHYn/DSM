import { Module } from '@nestjs/common';
import { ScoresService } from './scores.service';
import { ScoresController } from './scores.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RankingsModule } from '../rankings/rankings.module';
import { DailyScoreFinalizationService } from './daily-score-finalization.service';

@Module({
  imports: [PrismaModule, RankingsModule],
  controllers: [ScoresController],
  providers: [ScoresService, DailyScoreFinalizationService],
  exports: [ScoresService],
})
export class ScoresModule {}
