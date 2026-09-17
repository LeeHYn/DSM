import { Type } from 'class-transformer';
import {
  IsOptional,
  IsDateString,
  IsInt,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class TaskQueryDto {
  @IsDateString()
  @IsOptional()
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID()
  cursor?: string;
}
