import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createPublicKey } from 'node:crypto';
import { isEmail } from 'class-validator';
import axios from 'axios';
import type { SocialProfile } from './types/social-profile.type';

const APPLE_ISSUER = 'https://appleid.apple.com';
const CACHE_MS = 5 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 30_000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class AppleTokenVerifier {
  private readonly audience: string | undefined;
  private keys = new Map<string, string>();
  private cacheExpiresAt = 0;
  private lastFetchAt = Number.NEGATIVE_INFINITY;
  private pending: Promise<void> | null = null;

  constructor(
    configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.audience = configService.get<string>('APPLE_CLIENT_ID')?.trim();
  }

  async verify(idToken: string): Promise<SocialProfile> {
    if (!this.audience) {
      throw new BadRequestException('Apple sign-in is not configured');
    }
    try {
      if (typeof idToken !== 'string' || idToken.length > 16384) {
        throw new Error('Invalid token');
      }
      const parts = idToken.split('.');
      if (parts.length !== 3 || parts.some((part) => !this.isBase64Url(part))) {
        throw new Error('Invalid token');
      }
      const header: unknown = JSON.parse(
        Buffer.from(parts[0], 'base64url').toString('utf8'),
      );
      if (
        !isObject(header) ||
        header.alg !== 'RS256' ||
        typeof header.kid !== 'string' ||
        !header.kid.trim() ||
        header.kid.length > 128 ||
        header.crit !== undefined ||
        header.b64 !== undefined
      ) {
        throw new Error('Invalid token header');
      }
      const publicKey = await this.getKey(header.kid);
      const claims = this.jwtService.verify<Record<string, unknown>>(idToken, {
        // JwtService gives module secret precedence over publicKey alone.
        secret: publicKey,
        publicKey,
        algorithms: ['RS256'],
        issuer: APPLE_ISSUER,
        audience: this.audience,
        ignoreExpiration: false,
        ignoreNotBefore: false,
        clockTolerance: 0,
      });
      if (
        claims.iss !== APPLE_ISSUER ||
        claims.aud !== this.audience ||
        typeof claims.exp !== 'number' ||
        !Number.isFinite(claims.exp) ||
        claims.exp <= Date.now() / 1000 ||
        typeof claims.sub !== 'string' ||
        !claims.sub.trim() ||
        claims.sub.length > 255
      ) {
        throw new Error('Invalid token claims');
      }
      const email =
        (claims.email_verified === true || claims.email_verified === 'true') &&
        typeof claims.email === 'string' &&
        claims.email.length <= 254 &&
        isEmail(claims.email)
          ? claims.email
          : null;
      return {
        providerUserId: claims.sub,
        email,
        nickname: 'Apple 사용자',
        profileImageUrl: null,
      };
    } catch {
      throw new UnauthorizedException('Apple token verification failed');
    }
  }

  private async getKey(kid: string): Promise<string> {
    if (Date.now() < this.cacheExpiresAt && this.keys.has(kid)) {
      return this.keys.get(kid)!;
    }
    if (!this.pending && Date.now() - this.lastFetchAt >= REFRESH_COOLDOWN_MS) {
      this.lastFetchAt = Date.now();
      this.pending = this.fetchKeys();
    }
    const pending = this.pending;
    if (pending) {
      try {
        await pending;
      } finally {
        if (this.pending === pending) this.pending = null;
      }
    }
    const key = this.keys.get(kid);
    if (!key || Date.now() >= this.cacheExpiresAt)
      throw new Error('Unknown key');
    return key;
  }

  private async fetchKeys(): Promise<void> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('Key request timed out'));
      }, 5000);
    });
    try {
      const response = await Promise.race([
        axios.get<string>(`${APPLE_ISSUER}/auth/keys`, {
          timeout: 5000,
          signal: controller.signal,
          maxContentLength: 65536,
          maxRedirects: 0,
          responseType: 'text',
          transformResponse: [(data: unknown) => data],
        }),
        deadline,
      ]);
      if (
        response.status !== 200 ||
        typeof response.data !== 'string' ||
        Buffer.byteLength(response.data, 'utf8') > 65536
      ) {
        throw new Error('Invalid key response');
      }
      const body: unknown = JSON.parse(response.data);
      if (
        !isObject(body) ||
        !Array.isArray(body.keys) ||
        body.keys.length < 1 ||
        body.keys.length > 10
      ) {
        throw new Error('Invalid key response');
      }
      const keys = new Map<string, string>();
      for (const value of body.keys as unknown[]) {
        if (
          !isObject(value) ||
          value.kty !== 'RSA' ||
          value.alg !== 'RS256' ||
          value.use !== 'sig' ||
          typeof value.kid !== 'string' ||
          !value.kid.trim() ||
          value.kid.length > 128 ||
          keys.has(value.kid) ||
          typeof value.n !== 'string' ||
          value.n.length > 1366 ||
          typeof value.e !== 'string' ||
          value.e.length > 8 ||
          !this.isBase64Url(value.n) ||
          !this.isBase64Url(value.e)
        ) {
          throw new Error('Invalid public key');
        }
        const key = createPublicKey({
          key: { kty: 'RSA', n: value.n, e: value.e },
          format: 'jwk',
        });
        const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
        const exponent = key.asymmetricKeyDetails?.publicExponent ?? 0n;
        if (
          bits < 2048 ||
          bits > 8192 ||
          exponent < 3n ||
          exponent % 2n === 0n ||
          exponent > 0xffffffffn
        ) {
          throw new Error('Invalid public key');
        }
        keys.set(
          value.kid,
          key.export({ type: 'spki', format: 'pem' }).toString(),
        );
      }
      this.keys = keys;
      this.cacheExpiresAt = Date.now() + CACHE_MS;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isBase64Url(value: string): boolean {
    return (
      /^[A-Za-z0-9_-]+$/.test(value) &&
      Buffer.from(value, 'base64url').toString('base64url') === value
    );
  }
}
