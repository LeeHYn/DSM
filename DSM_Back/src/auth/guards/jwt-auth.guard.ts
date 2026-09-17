import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../types/jwt-payload.type';
import { SessionVerifierService } from '../session-verifier.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly verifier: SessionVerifierService;

  constructor(
    jwtService: JwtService,
    configService: ConfigService,
    prisma: PrismaService,
  ) {
    this.verifier = new SessionVerifierService(
      jwtService,
      configService,
      prisma,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    request.user = await this.verifier.verifyAccess(token);
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer '))
      return null;
    const token = header.slice(7);
    return token.length > 0 && !/\s/.test(token) ? token : null;
  }
}
