import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateNotificationSettingsDto {
  @Type(() => Object)
  @IsBoolean()
  notificationEnabled!: boolean;
}

export class ReminderQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Object)
  @IsString()
  @Matches(/\S/)
  @MaxLength(255)
  cursor?: string;
}
