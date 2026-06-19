import { IsBoolean } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsBoolean()
  notificationEnabled!: boolean;
}
