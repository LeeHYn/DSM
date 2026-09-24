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
  @ValidateIf((_object, value: unknown) => value !== undefined)
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
  @ValidateIf((_object, value: unknown) => value !== undefined)
  difficulty?: TaskDifficulty;

  @IsEnum(TaskStatus)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  status?: TaskStatus;

  @IsString()
  @IsOptional()
  categoryId?: string;

  // Preserve the JSON type so implicit conversion cannot turn "false" into true.
  @Type(() => Object)
  @IsBoolean()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  notificationEnabled?: boolean;
}
