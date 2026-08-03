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
import { NotificationsService } from './notifications.service';

type AuthRequest = Request & { user: JwtPayload };

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Put('fcm-tokens')
  registerFcmToken(@Req() req: AuthRequest, @Body() dto: RegisterFcmTokenDto) {
    return this.notificationsService.registerFcmToken(req.user.sub, dto);
  }

  @Delete('fcm-tokens')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeFcmToken(
    @Req() req: AuthRequest,
    @Body() dto: RevokeFcmTokenDto,
  ): Promise<void> {
    await this.notificationsService.revokeFcmToken(req.user.sub, dto);
  }
}
