import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../types/jwt-payload.type';
import { JwtAuthGuard } from './jwt-auth.guard';

const PAYLOAD: JwtPayload & { exp: number } = {
  sub: 'user-1',
  sid: 'session-1',
  type: 'access',
  exp: Math.floor(Date.now() / 1000) + 900,
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
      algorithms: ['HS256'],
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
    ).rejects.toThrow('Invalid access session');
  });

  it('rejects access tokens that predate the required session claim', async () => {
    jwtService.verify.mockReturnValue({ sub: 'user-1', type: 'access' });

    await expect(
      guard.canActivate(
        makeContext({
          headers: { authorization: 'Bearer legacy-access-token' },
        }),
      ),
    ).rejects.toThrow('Invalid access session');
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
    ).rejects.toThrow('Invalid access session');
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
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([
    'Bearer signed-access-token junk',
    'Bearer  signed-access-token',
    'Bearer signed-access-token ',
    'Bearer\tsigned-access-token',
    'Bearer signed-access-token\n',
    'bearer signed-access-token',
    'Basic signed-access-token',
  ])(
    'rejects malformed Authorization header %j before verification',
    async (authorization) => {
      await expect(
        guard.canActivate(makeContext({ headers: { authorization } })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtService.verify).not.toHaveBeenCalled();
      expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, Math.floor(Date.now() / 1000) - 1])(
    'rejects missing or expired exp=%j before session lookup',
    async (exp) => {
      jwtService.verify.mockReturnValue({ ...PAYLOAD, exp });
      await expect(
        guard.canActivate(
          makeContext({
            headers: { authorization: 'Bearer signed-access-token' },
          }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each(['missing-exp', 'expired', 'wrong-algorithm'] as const)(
    'rejects a real signed JWT with %s',
    async (condition) => {
      const realJwt = new JwtService();
      const claims = {
        sub: PAYLOAD.sub,
        sid: PAYLOAD.sid,
        type: 'access',
        ...(condition === 'missing-exp'
          ? {}
          : { exp: condition === 'expired' ? 1 : PAYLOAD.exp }),
      };
      const token = realJwt.sign(claims, {
        secret: 'test-access-secret',
        algorithm: condition === 'wrong-algorithm' ? 'HS384' : 'HS256',
      });
      const realGuard = new JwtAuthGuard(
        realJwt,
        configService as unknown as ConfigService,
        prisma as unknown as PrismaService,
      );
      await expect(
        realGuard.canActivate(
          makeContext({ headers: { authorization: `Bearer ${token}` } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
    },
  );
});
