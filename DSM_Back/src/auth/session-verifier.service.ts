import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './types/jwt-payload.type';

export type VerifiedAccessSession = JwtPayload & { exp: number };

@Injectable()
export class SessionVerifierService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async verifyAccess(token: string): Promise<VerifiedAccessSession> {
    if (
      typeof token !== 'string' ||
      token.length === 0 ||
      Buffer.byteLength(token, 'utf8') > 4096
    ) {
      throw this.unauthorized();
    }
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (typeof secret !== 'string' || secret.length === 0) {
      throw new ServiceUnavailableException('Session verification unavailable');
    }
    let claims: Record<string, unknown>;
    try {
      claims = this.jwt.verify<Record<string, unknown>>(token, {
        secret,
        algorithms: ['HS256'],
      });
    } catch {
      throw this.unauthorized();
    }
    if (
      !claims ||
      typeof claims !== 'object' ||
      Array.isArray(claims) ||
      claims.type !== 'access' ||
      !this.validIdentity(claims.sub) ||
      !this.validIdentity(claims.sid) ||
      typeof claims.exp !== 'number' ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Date.now() / 1000
    ) {
      throw this.unauthorized();
    }
    if (
      !(await this.isActive(claims.sub, claims.sid)) ||
      claims.exp <= Date.now() / 1000
    ) {
      throw this.unauthorized();
    }
    return {
      sub: claims.sub,
      sid: claims.sid,
      type: 'access',
      exp: claims.exp,
    };
  }

  async isActive(userId: string, sessionId: string): Promise<boolean> {
    if (!this.validIdentity(userId) || !this.validIdentity(sessionId)) {
      return false;
    }
    try {
      const active = await this.prisma.refreshToken.findFirst({
        where: {
          userId,
          sessionId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      return active !== null;
    } catch {
      throw new ServiceUnavailableException('Session verification unavailable');
    }
  }

  private validIdentity(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      value.trim().length > 0 &&
      value.length <= 255
    );
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException('Invalid access session');
  }
}
