import { IsDateString, IsOptional } from 'class-validator';

export class ScoreQueryDto {
  @IsDateString()
  @IsOptional()
  date?: string;
}
