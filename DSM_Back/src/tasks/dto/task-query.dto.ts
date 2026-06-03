import { IsOptional, IsDateString } from 'class-validator';

export class TaskQueryDto {
  @IsDateString()
  @IsOptional()
  date?: string;
}
