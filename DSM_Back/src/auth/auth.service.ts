import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SocialProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { JwtPayload } from './types/jwt-payload.type';
import type { SocialProfile } from './types/social-profile.type';
import type { TokenResponseDto } from './dto/token-response.dto';

export type LogoutFcmTarget = {
  token?: string;
  deviceId?: string;
};

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
    );
  }

  async socialLogin(
    provider: SocialProvider,
    token: string,
  ): Promise<TokenResponseDto> {
    const profile = await this.verifyProviderToken(provider, token);
    const user = await this.findOrCreateUser(provider, profile);
    return this.issueTokens(user.id);
  }

  async refreshTokens(rawRefreshToken: string): Promise<TokenResponseDto> {
    const { id, secret } = this.parseRefreshToken(rawRefreshToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { id } });

    if (
      !record ||
      record.revokedAt !== null ||
      record.expiresAt <= new Date() ||
      !(await bcrypt.compare(secret, record.tokenHash))
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(record.userId);
  }

  async logout(
    userId: string,
    rawRefreshToken: string,
    fcmTarget?: LogoutFcmTarget,
  ): Promise<void> {
    let parsed: { id: string; secret: string };
    try {
      parsed = this.parseRefreshToken(rawRefreshToken);
    } catch {
      return;
    }

    const record = await this.prisma.refreshToken.findUnique({
      where: { id: parsed.id },
    });
    if (
      !record ||
      record.userId !== userId ||
      record.revokedAt !== null ||
      !(await bcrypt.compare(parsed.secret, record.tokenHash))
    ) {
      return;
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    if (fcmTarget?.token || fcmTarget?.deviceId) {
      await this.notificationsService.revokeToken(userId, fcmTarget);
    }
  }

  private parseRefreshToken(token: string): { id: string; secret: string } {
    const idx = token.indexOf('.');
    if (idx <= 0 || idx === token.length - 1) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return { id: token.slice(0, idx), secret: token.slice(idx + 1) };
  }

  private async issueTokens(userId: string): Promise<TokenResponseDto> {
    const payload: JwtPayload = { sub: userId, type: 'access' };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const secret = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(secret, BCRYPT_ROUNDS);
    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken: `${record.id}.${secret}` };
  }

  private async findOrCreateUser(
    provider: SocialProvider,
    profile: SocialProfile,
  ) {
    const existing = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: profile.providerUserId,
        },
      },
      include: { user: true },
    });

    if (existing) {
      return existing.user;
    }

    const nickname = await this.resolveNickname(profile.nickname);

    return this.prisma.user.create({
      data: {
        email: profile.email,
        nickname,
        profileImageUrl: profile.profileImageUrl,
        socialAccounts: {
          create: {
            provider,
            providerUserId: profile.providerUserId,
          },
        },
      },
    });
  }

  private async resolveNickname(base: string): Promise<string> {
    const candidate = base.slice(0, 20);
    const exists = await this.prisma.user.findUnique({
      where: { nickname: candidate },
    });
    if (!exists) return candidate;
    const suffix = crypto.randomBytes(3).toString('hex');
    return `${candidate.slice(0, 14)}_${suffix}`;
  }

  private async verifyProviderToken(
    provider: SocialProvider,
    token: string,
  ): Promise<SocialProfile> {
    switch (provider) {
      case SocialProvider.GOOGLE:
        return this.verifyGoogleToken(token);
      case SocialProvider.KAKAO:
        return this.verifyKakaoToken(token);
      case SocialProvider.APPLE:
        return this.verifyAppleToken(token);
    }
  }

  private async verifyGoogleToken(idToken: string): Promise<SocialProfile> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new BadRequestException('Invalid Google token');
      }
      return {
        providerUserId: payload.sub,
        email: payload.email ?? null,
        nickname: payload.name ?? payload.email?.split('@')[0] ?? payload.sub,
        profileImageUrl: payload.picture ?? null,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new UnauthorizedException('Google token verification failed');
    }
  }

  private async verifyKakaoToken(accessToken: string): Promise<SocialProfile> {
    try {
      const { data } = await axios.get<{
        id: number;
        kakao_account?: {
          email?: string;
          profile?: { nickname?: string; profile_image_url?: string };
        };
      }>('https://kapi.kakao.com/v2/user/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const account = data.kakao_account;
      return {
        providerUserId: String(data.id),
        email: account?.email ?? null,
        nickname:
          account?.profile?.nickname ??
          account?.email?.split('@')[0] ??
          String(data.id),
        profileImageUrl: account?.profile?.profile_image_url ?? null,
      };
    } catch {
      throw new UnauthorizedException('Kakao token verification failed');
    }
  }

  // Apple Sign In: implement when Apple Developer account is available
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private verifyAppleToken(_idToken: string): Promise<SocialProfile> {
    return Promise.reject(
      new ConflictException('Apple Sign In is not yet configured'),
    );
  }
}
