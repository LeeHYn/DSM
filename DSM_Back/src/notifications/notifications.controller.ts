import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import { RevokeFcmTokenDto } from './dto/revoke-fcm-token.dto';
import {
  ReminderQueryDto,
  UpdateNotificationSettingsDto,
} from './dto/notification-client.dto';
import {
  NotificationsService,
  type NotificationSettings,
  type ReminderPage,
  type RegisteredFcmToken,
} from './notifications.service';

type AuthRequest = Request & { user: JwtPayload };

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('settings')
  getSettings(@Req() req: AuthRequest): Promise<NotificationSettings> {
    return this.notificationsService.getSettings(req.user.sub);
  }

  @Patch('settings')
  setSettings(
    @Req() req: AuthRequest,
    @Body() dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettings> {
    return this.notificationsService.setSettings(
      req.user.sub,
      dto.notificationEnabled,
    );
  }

  @Get('reminders')
  reminders(
    @Req() req: AuthRequest,
    @Query() query: ReminderQueryDto,
  ): Promise<ReminderPage> {
    return this.notificationsService.reminders(req.user.sub, query);
  }

  @Put('fcm-tokens')
  register(
    @Req() req: AuthRequest,
    @Body() dto: RegisterFcmTokenDto,
  ): Promise<RegisteredFcmToken> {
    return this.notificationsService.register(req.user.sub, dto);
  }

  @Delete('fcm-tokens')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Req() req: AuthRequest,
    @Body() dto: RevokeFcmTokenDto,
  ): Promise<void> {
    await this.notificationsService.revoke(req.user.sub, dto);
  }
}
