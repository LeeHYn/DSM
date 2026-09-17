import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  ValidateIf,
} from 'class-validator';
import { TaskDifficulty, TaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateTaskDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({ strict: true })
  startAt?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({ strict: true })
  endAt?: string;

  @IsEnum(TaskDifficulty)
  @IsOptional()
  difficulty?: TaskDifficulty;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsString()
  @IsOptional()
  categoryId?: string;

  // Preserve the JSON type so implicit conversion cannot turn "false" into true.
  @Type(() => Object)
  @IsBoolean()
  @IsOptional()
  notificationEnabled?: boolean;
}
