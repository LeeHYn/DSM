import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { TaskDifficulty } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateTaskDto {
  @IsUUID('4')
  clientMutationId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString({ strict: true })
  startAt!: string;

  @IsDateString({ strict: true })
  endAt!: string;

  @IsEnum(TaskDifficulty)
  difficulty!: TaskDifficulty;

  @IsString()
  @IsOptional()
  categoryId?: string;

  // Preserve the JSON type so implicit conversion cannot turn "false" into true.
  @Type(() => Object)
  @IsBoolean()
  @IsOptional()
  notificationEnabled?: boolean;
}
