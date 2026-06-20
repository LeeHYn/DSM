import { NotificationMode } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsBoolean()
  notificationEnabled!: boolean;

  @IsEnum(NotificationMode)
  @IsOptional()
  notificationMode?: NotificationMode;
}
