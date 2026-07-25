import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import { RevokeFcmTokenDto } from './dto/revoke-fcm-token.dto';
import {
  NotificationsService,
  type RegisteredFcmToken,
} from './notifications.service';

type AuthRequest = Request & { user: JwtPayload };

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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
