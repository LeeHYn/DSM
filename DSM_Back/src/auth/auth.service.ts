import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SocialProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBusService } from '../realtime/realtime-bus.service';
import type { RevocationTarget } from '../realtime/realtime.policy';
import { AppleTokenVerifier } from './apple-token.verifier';
import type { JwtPayload } from './types/jwt-payload.type';
import type { SocialProfile } from './types/social-profile.type';
import type { TokenResponseDto } from './dto/token-response.dto';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const BCRYPT_ROUNDS = 10;
const SOCIAL_SIGNUP_ATTEMPTS = 3;
const GOOGLE_CERTIFICATE_TIMEOUT_MS = 5000;
const KAKAO_TIMEOUT_MS = 5000;
const MAX_REFRESH_FAMILY_ROWS = 4096;
const REFRESH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_CLEANUP_BATCH_SIZE = 500;
type RefreshTokenClient = Pick<
  Prisma.TransactionClient,
  'refreshToken' | '$queryRaw'
>;

export type CurrentUser = {
  userId: string;
  onboardingCompletedAt: Date | null;
};

@Injectable()
export class AuthService {
  private readonly googleClientId: string;
  private readonly googleClient: OAuth2Client;
  private readonly appleTokenVerifier: AppleTokenVerifier;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Optional() private readonly realtime?: RealtimeBusService,
  ) {
    this.googleClientId =
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.googleClient = new OAuth2Client({
      clientId: this.googleClientId,
      transporterOptions: {
        timeout: GOOGLE_CERTIFICATE_TIMEOUT_MS,
        // The SDK enables retries on certificate requests; retain one deadline.
        retryConfig: { retry: 0 },
      },
    });
    this.appleTokenVerifier = new AppleTokenVerifier(configService, jwtService);
  }

  async socialLogin(
    provider: SocialProvider,
    token: string,
  ): Promise<TokenResponseDto> {
    const profile = await this.verifyProviderToken(provider, token);
    const user = await this.findOrCreateUser(provider, profile);
    return this.prisma.$transaction(async (tx) => {
      await this.lockUserForSessionMutation(tx, user.id);
      return this.issueTokens(user.id, tx);
    });
  }

  async refreshTokens(rawRefreshToken: string): Promise<TokenResponseDto> {
    const { id, secret } = this.parseRefreshToken(rawRefreshToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { id } });
    const checkedAt = new Date();

    if (
      !record ||
      record.revokedAt !== null ||
      record.expiresAt <= checkedAt ||
      !(await bcrypt.compare(secret, record.tokenHash))
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockUserForSessionMutation(tx, record.userId);
      const family = { userId: record.userId, sessionId: record.sessionId };
      const oldest = await tx.refreshToken.findFirst({
        where: family,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { expiresAt: true },
      });
      if (!oldest) {
        throw new UnauthorizedException('Refresh session has expired');
      }
      const count = await tx.refreshToken.count({ where: family });
      const revokedAt = new Date();
      if (oldest.expiresAt <= revokedAt) {
        throw new UnauthorizedException('Refresh session has expired');
      }
      if (count >= MAX_REFRESH_FAMILY_ROWS) {
        // Leave the current session usable until its existing expiry or logout.
        throw new UnauthorizedException('Refresh session limit reached');
      }
      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: record.id,
          revokedAt: null,
          expiresAt: { gt: revokedAt },
        },
        data: { revokedAt },
      });

      if (revoked.count !== 1) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      return this.issueTokens(
        record.userId,
        tx,
        record.sessionId,
        oldest.expiresAt,
      );
    });
  }

  async logout(rawRefreshToken: string): Promise<void> {
    let parsed: { id: string; secret: string };
    try {
      parsed = this.parseRefreshToken(rawRefreshToken);
    } catch {
      return;
    }

    const record = await this.prisma.refreshToken.findUnique({
      where: { id: parsed.id },
    });
    if (!record || !(await bcrypt.compare(parsed.secret, record.tokenHash))) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockUserForSessionMutation(tx, record.userId);
      await tx.refreshToken.updateMany({
        where: {
          userId: record.userId,
          sessionId: record.sessionId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    });
    await this.signalRevocation({
      kind: 'session',
      userId: record.userId,
      sessionId: record.sessionId,
    });
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockUserForSessionMutation(tx, userId);
      await tx.notificationDelivery.deleteMany({
        where: {
          OR: [{ schedule: { userId } }, { fcmToken: { userId } }],
        },
      });
      await tx.user.deleteMany({ where: { id: userId } });
    });
    await this.signalRevocation({ kind: 'user', userId });
  }

  private async signalRevocation(target: RevocationTarget): Promise<void> {
    try {
      await this.realtime?.publishRevocation(target);
    } catch {
      // Socket family checks still enforce a committed revocation.
    }
  }

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'expired-refresh-token-cleanup',
    waitForCompletion: true,
  })
  async cleanupExpiredRefreshTokens(): Promise<number> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - REFRESH_RETENTION_MS);
    // Rotation replaces an unexpired active row atomically under the User lock.
    // A statement snapshot therefore sees the active predecessor or successor;
    // an inactive family cannot be revived, and new logins use a new family ID.
    return this.prisma.$executeRaw`
      DELETE FROM "RefreshToken"
      WHERE id IN (
        SELECT stale.id FROM "RefreshToken" stale
        WHERE stale."expiresAt" < ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM "RefreshToken" active
            WHERE active."userId" = stale."userId"
              AND active."sessionId" = stale."sessionId"
              AND active."revokedAt" IS NULL
              AND active."expiresAt" > ${now}
          )
        ORDER BY stale."expiresAt", stale.id
        LIMIT ${REFRESH_CLEANUP_BATCH_SIZE}
      )
    `;
  }

  async getCurrentUser(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        onboardingCompletedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Authenticated user no longer exists');
    }

    return {
      userId: user.id,
      onboardingCompletedAt: user.onboardingCompletedAt,
    };
  }

  async completeOnboarding(
    userId: string,
    completedAt = new Date(),
  ): Promise<CurrentUser> {
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        onboardingCompletedAt: null,
      },
      data: { onboardingCompletedAt: completedAt },
    });

    return this.getCurrentUser(userId);
  }

  private parseRefreshToken(token: string): { id: string; secret: string } {
    const idx = token.indexOf('.');
    if (idx <= 0 || idx === token.length - 1) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return { id: token.slice(0, idx), secret: token.slice(idx + 1) };
  }

  private async issueTokens(
    userId: string,
    client: RefreshTokenClient,
    sessionId?: string,
    expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  ): Promise<TokenResponseDto> {
    const resolvedSessionId = sessionId ?? crypto.randomUUID();
    const payload: JwtPayload = {
      sub: userId,
      sid: resolvedSessionId,
      type: 'access',
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const secret = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(secret, BCRYPT_ROUNDS);
    const record = await client.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        sessionId: resolvedSessionId,
      },
    });

    return { accessToken, refreshToken: `${record.id}.${secret}` };
  }

  private async lockUserForSessionMutation(
    client: RefreshTokenClient,
    userId: string,
  ): Promise<void> {
    await client.$queryRaw`
      SELECT 1 FROM "User" WHERE id = ${userId} FOR UPDATE
    `;
  }

  private async findOrCreateUser(
    provider: SocialProvider,
    profile: SocialProfile,
  ) {
    const where = {
      provider_providerUserId: {
        provider,
        providerUserId: profile.providerUserId,
      },
    };
    const existing = await this.prisma.socialAccount.findUnique({
      where,
      include: { user: true },
    });

    if (existing) {
      return existing.user;
    }

    let nickname = await this.resolveNickname(profile.nickname);
    for (let attempt = 0; attempt < SOCIAL_SIGNUP_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.user.create({
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
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }

        // A nested create is atomic: only the committed identity can be reused.
        const winner = await this.prisma.socialAccount.findUnique({
          where,
          include: { user: true },
        });
        if (winner) return winner.user;

        const target = error.meta?.target;
        if (Array.isArray(target) && target.includes('email')) {
          throw new ConflictException(
            'Email is already associated with an account',
          );
        }
        if (!Array.isArray(target) || !target.includes('nickname')) {
          throw error;
        }
        if (attempt + 1 === SOCIAL_SIGNUP_ATTEMPTS) {
          throw new ConflictException('Unable to assign a unique nickname');
        }
        nickname = this.nicknameWithSuffix(profile.nickname);
      }
    }
    throw new ConflictException('Unable to create social account');
  }

  private async resolveNickname(base: string): Promise<string> {
    const candidate = base.slice(0, 20);
    const exists = await this.prisma.user.findUnique({
      where: { nickname: candidate },
    });
    if (!exists) return candidate;
    return this.nicknameWithSuffix(candidate);
  }

  private nicknameWithSuffix(base: string): string {
    const suffix = crypto.randomBytes(3).toString('hex');
    return `${base.slice(0, 14)}_${suffix}`;
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
        audience: this.googleClientId,
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
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), KAKAO_TIMEOUT_MS);
    try {
      const { data } = await axios.get<{
        id: number;
        kakao_account?: {
          email?: string;
          profile?: { nickname?: string; profile_image_url?: string };
        };
      }>('https://kapi.kakao.com/v2/user/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { secure_resource: true },
        timeout: KAKAO_TIMEOUT_MS,
        signal: controller.signal,
      });

      if (!Number.isSafeInteger(data?.id) || data.id <= 0) {
        throw new UnauthorizedException('Kakao token verification failed');
      }
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
    } finally {
      clearTimeout(deadline);
    }
  }

  private verifyAppleToken(idToken: string): Promise<SocialProfile> {
    return this.appleTokenVerifier.verify(idToken);
  }
}
