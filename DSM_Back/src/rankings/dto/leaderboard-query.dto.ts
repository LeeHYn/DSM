import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RankingPeriod } from '@prisma/client';

export class LeaderboardQueryDto {
  @IsEnum(RankingPeriod)
  period!: RankingPeriod;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
