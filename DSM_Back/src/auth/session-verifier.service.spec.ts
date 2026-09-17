import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service';
import { SessionVerifierService } from './session-verifier.service';

describe('SessionVerifierService', () => {
  const secret = 'synthetic-session-verifier-secret';
  const now = new Date('2026-09-11T12:00:00.000Z');
  const expiration = Math.floor(now.getTime() / 1000) + 900;
  const claims = {
    sub: 'user-1',
    sid: 'family-1',
    type: 'access',
    exp: expiration,
  };
  const prisma = { refreshToken: { findFirst: jest.fn() } };
  const config = { get: jest.fn() };
  let jwt: JwtService;
  let verifier: SessionVerifierService;

  beforeEach(() => {
    jest.useFakeTimers({ now });
    jest.clearAllMocks();
    config.get.mockReturnValue(secret);
    prisma.refreshToken.findFirst.mockResolvedValue({ id: 'active-row' });
    jwt = new JwtService({ secret });
    verifier = new SessionVerifierService(
      jwt,
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => jest.useRealTimers());

  // Signing arbitrary synthetic JSON also exercises claims jsonwebtoken.sign
  // itself refuses to construct. Verification still uses the real JWT library.
  function signedRaw(payload: unknown) {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const data = `${header}.${body}`;
    const signature = createHmac('sha256', secret)
      .update(data)
      .digest('base64url');
    return `${data}.${signature}`;
  }

  it('accepts current issuer HS256 claims and the active refresh family', async () => {
    const token = jwt.sign(
      { sub: claims.sub, sid: claims.sid, type: 'access' },
      { expiresIn: '15m' },
    );
    await expect(verifier.verifyAccess(token)).resolves.toEqual(claims);
    expect(config.get).toHaveBeenCalledWith('JWT_ACCESS_SECRET');
    expect(prisma.refreshToken.findFirst).toHaveBeenCalledWith({
      where: {
        userId: claims.sub,
        sessionId: claims.sid,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
  });

  it.each([
    { type: 'refresh' },
    { type: undefined },
    { sub: '' },
    { sub: ' ' },
    { sub: 1 },
    { sub: 'x'.repeat(256) },
    { sid: '' },
    { sid: undefined },
    { sid: 'x'.repeat(256) },
    { exp: undefined },
    { exp: null },
    { exp: String(expiration) },
    { exp: expiration + 0.5 },
    { exp: Number.MAX_SAFE_INTEGER + 1 },
    { exp: Math.floor(now.getTime() / 1000) },
  ])(
    'rejects malformed or expired claims %j before DB access',
    async (override) => {
      await expect(
        verifier.verifyAccess(signedRaw({ ...claims, ...override })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each(['plain string', [], null])(
    'rejects non-object JWT payload %j',
    async (payload) => {
      await expect(
        verifier.verifyAccess(signedRaw(payload)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'x'.repeat(4097), '😀'.repeat(1025), null, undefined, 42])(
    'rejects malformed or oversized raw token %j before JWT verification',
    async (token) => {
      const verify = jest.spyOn(jwt, 'verify');
      await expect(
        verifier.verifyAccess(token as string),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(verify).not.toHaveBeenCalled();
      expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
    },
  );

  it('rejects a signed token with a different algorithm', async () => {
    const token = jwt.sign(claims, { algorithm: 'HS384' });
    await expect(verifier.verifyAccess(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a modified signature with a fixed safe message', async () => {
    const token = signedRaw(claims);
    await expect(
      verifier.verifyAccess(`${token.slice(0, -8)}tampered`),
    ).rejects.toThrow('Invalid access session');
    expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an expired or revoked family even with a valid JWT', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    await expect(
      verifier.verifyAccess(signedRaw(claims)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('checks expiry again after awaiting the session database', async () => {
    prisma.refreshToken.findFirst.mockImplementation(() => {
      jest.setSystemTime(expiration * 1000);
      return Promise.resolve({ id: 'active-row' });
    });
    await expect(
      verifier.verifyAccess(signedRaw(claims)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([true, false])(
    'returns active family state %s for periodic checks',
    async (active) => {
      prisma.refreshToken.findFirst.mockResolvedValue(
        active ? { id: 'active-row' } : null,
      );
      await expect(verifier.isActive('user-1', 'family-1')).resolves.toBe(
        active,
      );
    },
  );

  it('returns false for invalid periodic identity without a DB query', async () => {
    await expect(verifier.isActive('', 'family-1')).resolves.toBe(false);
    expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
  });

  it('returns safe 503 on a DB failure rather than declaring revocation', async () => {
    prisma.refreshToken.findFirst.mockRejectedValue(
      new Error('raw credential and database details'),
    );
    await expect(
      verifier.verifyAccess(signedRaw(claims)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(verifier.isActive('user-1', 'family-1')).rejects.toThrow(
      'Session verification unavailable',
    );
  });

  it('fails safely when the signing secret is not configured', async () => {
    config.get.mockReturnValue(undefined);
    await expect(
      verifier.verifyAccess(signedRaw(claims)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
  });
});
