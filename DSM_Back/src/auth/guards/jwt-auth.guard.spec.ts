import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../types/jwt-payload.type';
import { JwtAuthGuard } from './jwt-auth.guard';

const PAYLOAD: JwtPayload = {
  sub: 'user-1',
  sid: 'session-1',
  type: 'access',
};

type TestRequest = {
  headers: { authorization?: string };
  user?: JwtPayload;
};

function makeContext(request: TestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const jwtService = { verify: jest.fn() };
  const configService = {
    get: jest.fn().mockReturnValue('test-access-secret'),
  };
  const prisma = {
    refreshToken: { findFirst: jest.fn() },
  };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    jwtService.verify.mockReturnValue(PAYLOAD);
    prisma.refreshToken.findFirst.mockResolvedValue({ id: 'refresh-1' });
    guard = new JwtAuthGuard(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('accepts an access token only while its refresh family is active', async () => {
    const request: TestRequest = {
      headers: { authorization: 'Bearer signed-access-token' },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);

    expect(jwtService.verify).toHaveBeenCalledWith('signed-access-token', {
      secret: 'test-access-secret',
    });
    expect(prisma.refreshToken.findFirst).toHaveBeenCalledWith({
      where: {
        userId: PAYLOAD.sub,
        sessionId: PAYLOAD.sid,
        revokedAt: null,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expiresAt: { gt: expect.any(Date) },
      },
      select: { id: true },
    });
    expect(request.user).toEqual(PAYLOAD);
  });

  it('rejects a token after its refresh family has no active row', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        makeContext({
          headers: { authorization: 'Bearer signed-access-token' },
        }),
      ),
    ).rejects.toThrow('Access token session is no longer active');
  });

  it('rejects access tokens that predate the required session claim', async () => {
    jwtService.verify.mockReturnValue({ sub: 'user-1', type: 'access' });

    await expect(
      guard.canActivate(
        makeContext({
          headers: { authorization: 'Bearer legacy-access-token' },
        }),
      ),
    ).rejects.toThrow('Invalid access token claims');
    expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a missing bearer token before verification', async () => {
    await expect(
      guard.canActivate(makeContext({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.verify).not.toHaveBeenCalled();
    expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a token whose signature verification fails', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('signature mismatch');
    });

    await expect(
      guard.canActivate(
        makeContext({ headers: { authorization: 'Bearer malformed-token' } }),
      ),
    ).rejects.toThrow('Invalid or expired access token');
    expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
  });

  it('propagates session-store outages instead of misreporting revocation', async () => {
    const databaseError = new Error('database unavailable');
    prisma.refreshToken.findFirst.mockRejectedValue(databaseError);

    await expect(
      guard.canActivate(
        makeContext({
          headers: { authorization: 'Bearer signed-access-token' },
        }),
      ),
    ).rejects.toBe(databaseError);
  });
});
