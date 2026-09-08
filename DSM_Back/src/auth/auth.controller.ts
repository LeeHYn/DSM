import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type CurrentUser } from './auth.service';
import { SocialLoginDto } from './dto/social-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtPayload } from './types/jwt-payload.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: SocialLoginDto): Promise<TokenResponseDto> {
    return this.authService.socialLogin(dto.provider, dto.token);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenResponseDto> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: JwtPayload }): Promise<CurrentUser> {
    return this.authService.getCurrentUser(req.user.sub);
  }

  @Patch('me/onboarding')
  @UseGuards(JwtAuthGuard)
  completeOnboarding(
    @Req() req: Request & { user: JwtPayload },
  ): Promise<CurrentUser> {
    return this.authService.completeOnboarding(req.user.sub);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async deleteAccount(
    @Req() req: Request & { user: JwtPayload },
  ): Promise<void> {
    await this.authService.deleteAccount(req.user.sub);
  }
}
