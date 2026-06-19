import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { FcmToken } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import { RevokeFcmTokenDto } from './dto/revoke-fcm-token.dto';
import {
  NotificationsService,
  type RevokeFcmTokenResult,
} from './notifications.service';

type AuthRequest = Request & { user: JwtPayload };

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('fcm-tokens')
  registerFcmToken(
    @Req() req: AuthRequest,
    @Body() dto: RegisterFcmTokenDto,
  ): Promise<FcmToken> {
    return this.notificationsService.registerToken(req.user.sub, dto);
  }

  @Delete('fcm-tokens')
  revokeFcmToken(
    @Req() req: AuthRequest,
    @Body() dto: RevokeFcmTokenDto,
  ): Promise<RevokeFcmTokenResult> {
    return this.notificationsService.revokeToken(req.user.sub, dto);
  }
}
