import { IsEnum } from 'class-validator';
import { RankingPeriod } from '@prisma/client';

export class RankingQueryDto {
  @IsEnum(RankingPeriod)
  period!: RankingPeriod;
}
