import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { type SocialAccountProvider, UsersService } from './users.service';

type AuthRequest = Request & { user: JwtPayload };

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@Req() req: AuthRequest): Promise<User> {
    return this.usersService.getMe(req.user.sub);
  }

  @Patch('me/profile')
  updateProfile(
    @Req() req: AuthRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<User> {
    return this.usersService.updateProfile(req.user.sub, dto);
  }

  @Patch('me/notification-settings')
  updateNotificationSettings(
    @Req() req: AuthRequest,
    @Body() dto: UpdateNotificationSettingsDto,
  ): Promise<User> {
    return this.usersService.updateNotificationSettings(req.user.sub, dto);
  }

  @Get('me/social-accounts')
  getSocialAccounts(@Req() req: AuthRequest): Promise<SocialAccountProvider[]> {
    return this.usersService.getSocialAccounts(req.user.sub);
  }
}
