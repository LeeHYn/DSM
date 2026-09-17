import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import axios from 'axios';
import { AppleTokenVerifier } from './apple-token.verifier';

jest.mock('axios');

const ISSUER = 'https://appleid.apple.com';
const AUDIENCE = 'test.apple.service';
const NOW = new Date('2026-09-11T00:00:00Z');

describe('AppleTokenVerifier', () => {
  const first = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const second = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const weak = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const jwk = (key: KeyObject, kid = 'key-1') => ({
    ...key.export({ format: 'jwk' }),
    kid,
    alg: 'RS256',
    use: 'sig',
  });
  const token = (
    claims: Record<string, unknown> = {},
    header: Record<string, unknown> = {},
    key = first.privateKey,
  ) => {
    const body = [
      { alg: 'RS256', kid: 'key-1', typ: 'JWT', ...header },
      {
        iss: ISSUER,
        aud: AUDIENCE,
        sub: 'apple-user',
        exp: NOW.getTime() / 1000 + 3600,
        ...claims,
      },
    ]
      .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
      .join('.');
    return `${body}.${sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`;
  };
  const response = (keys: unknown[]) => ({
    status: 200,
    data: JSON.stringify({ keys }),
  });
  let verifier: AppleTokenVerifier;
  let config: ConfigService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.mocked(axios).get.mockReset();
    jest.mocked(axios).get.mockResolvedValue(response([jwk(first.publicKey)]));
    config = new ConfigService({ APPLE_CLIENT_ID: AUDIENCE });
    verifier = new AppleTokenVerifier(
      config,
      new JwtService({ secret: 'unrelated-app-secret' }),
    );
  });

  afterEach(() => jest.useRealTimers());

  it('verifies real RSA signatures using the Apple key instead of the application secret', async () => {
    await expect(
      verifier.verify(
        token({ email: 'test@example.com', email_verified: true }),
      ),
    ).resolves.toEqual({
      providerUserId: 'apple-user',
      email: 'test@example.com',
      nickname: 'Apple 사용자',
      profileImageUrl: null,
    });
    expect(jest.mocked(axios).get.mock.calls[0]?.[0]).toBe(
      `${ISSUER}/auth/keys`,
    );
    expect(jest.mocked(axios).get.mock.calls[0]?.[1]).toMatchObject({
      timeout: 5000,
      maxContentLength: 65536,
      maxRedirects: 0,
      responseType: 'text',
    });
  });

  it.each([
    { iss: 'https://attacker.example' },
    { aud: 'other-service' },
    { exp: undefined },
    { exp: 0 },
    { exp: NOW.getTime() / 1000 },
    { exp: '9999999999' },
    { sub: '' },
    { sub: ' '.repeat(2) },
    { sub: 'a'.repeat(256) },
    { sub: 123 },
  ])('rejects signed invalid claims %j', async (claims) => {
    await expect(verifier.verify(token(claims))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a signature from a different private key', async () => {
    await expect(
      verifier.verify(token({}, {}, second.privateKey)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([{ alg: 'none' }, { alg: 'HS256' }, { kid: '' }, { kid: undefined }])(
    'rejects header %j before fetching keys',
    async (header) => {
      await expect(verifier.verify(token({}, header))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jest.mocked(axios).get.mock.calls).toHaveLength(0);
    },
  );

  it.each(['not-a-jwt', 'a'.repeat(16385)])(
    'rejects malformed or oversized tokens',
    async (value) => {
      await expect(verifier.verify(value)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jest.mocked(axios).get.mock.calls).toHaveLength(0);
    },
  );

  it('fails safely when Apple client configuration is absent', async () => {
    const missing = new AppleTokenVerifier(
      new ConfigService({ APPLE_CLIENT_ID: '' }),
      new JwtService(),
    );
    await expect(missing.verify(token())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(jest.mocked(axios).get.mock.calls).toHaveLength(0);
  });

  it.each([
    [true, 'test@example.com', 'test@example.com'],
    [
      'true',
      'private@privaterelay.appleid.com',
      'private@privaterelay.appleid.com',
    ],
    [false, 'test@example.com', null],
    ['false', 'test@example.com', null],
    [1, 'test@example.com', null],
    [true, '', null],
    [true, 'not-an-email', null],
    [true, 12, null],
  ])(
    'handles verified email %j / %j',
    async (email_verified, email, expected) => {
      await expect(
        verifier.verify(token({ email_verified, email })),
      ).resolves.toMatchObject({ email: expected });
    },
  );

  it('shares in-flight key requests and caches trusted keys for five minutes', async () => {
    let release: (value: ReturnType<typeof response>) => void = () => undefined;
    jest.mocked(axios).get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = Promise.all([
      verifier.verify(token()),
      verifier.verify(token()),
    ]);
    pending.catch(() => undefined);
    expect(jest.mocked(axios).get.mock.calls).toHaveLength(1);
    release(response([jwk(first.publicKey)]));
    await pending;
    jest.setSystemTime(NOW.getTime() + 299999);
    await verifier.verify(token());
    expect(jest.mocked(axios).get.mock.calls).toHaveLength(1);
    jest.setSystemTime(NOW.getTime() + 300000);
    await verifier.verify(token());
    expect(jest.mocked(axios).get.mock.calls).toHaveLength(2);
  });

  it('refreshes an unknown kid only after the thirty second cooldown', async () => {
    await verifier.verify(token());
    const rotated = token(
      {},
      { kid: 'key-2', jku: 'https://attacker.example/keys' },
      second.privateKey,
    );
    jest
      .mocked(axios)
      .get.mockResolvedValue(response([jwk(second.publicKey, 'key-2')]));
    await expect(verifier.verify(rotated)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    jest.setSystemTime(NOW.getTime() + 29999);
    await expect(verifier.verify(rotated)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jest.mocked(axios).get.mock.calls).toHaveLength(1);
    jest.setSystemTime(NOW.getTime() + 30000);
    await expect(verifier.verify(rotated)).resolves.toMatchObject({
      providerUserId: 'apple-user',
    });
    expect(jest.mocked(axios).get.mock.calls).toHaveLength(2);
    expect(jest.mocked(axios).get.mock.calls[1]?.[0]).toBe(
      `${ISSUER}/auth/keys`,
    );
  });

  it.each([
    () => Array.from({ length: 11 }, () => jwk(first.publicKey)),
    () => [jwk(weak.publicKey)],
    () => [{ ...jwk(first.publicKey), n: 'A'.repeat(1367) }],
    () => [{ ...jwk(first.publicKey), e: 'A'.repeat(9) }],
    () => [{ ...jwk(first.publicKey), kty: 'EC' }],
    () => [{ ...jwk(first.publicKey), alg: 'HS256' }],
    () => [{ ...jwk(first.publicKey), use: 'enc' }],
    () => [jwk(first.publicKey), jwk(second.publicKey)],
  ])('rejects an unsafe or ambiguous key set', async (keys) => {
    jest.mocked(axios).get.mockResolvedValue(response(keys()));
    await expect(verifier.verify(token())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each(['not JSON', ' '.repeat(65537), JSON.stringify({ keys: [] })])(
    'rejects invalid JWKS bodies',
    async (data) => {
      jest.mocked(axios).get.mockResolvedValue({ status: 200, data });
      await expect(verifier.verify(token())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('aborts and rejects at five seconds even if transport does not settle', async () => {
    jest
      .mocked(axios)
      .get.mockImplementation(() => new Promise(() => undefined));
    const outcome = verifier.verify(token()).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(5000);
    const error: unknown = await outcome;
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(jest.mocked(axios).get.mock.calls[0]?.[1]?.signal?.aborted).toBe(
      true,
    );
    expect(jest.getTimerCount()).toBe(0);
    await expect(verifier.verify(token())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jest.mocked(axios).get.mock.calls).toHaveLength(1);
  });

  it('redacts provider failure details and retries only after cooldown', async () => {
    jest
      .mocked(axios)
      .get.mockRejectedValueOnce(
        new Error('secret token and provider internals'),
      );
    await expect(verifier.verify(token())).rejects.toThrow(
      'Apple token verification failed',
    );
    await expect(verifier.verify(token())).rejects.toThrow(
      'Apple token verification failed',
    );
    expect(jest.mocked(axios).get.mock.calls).toHaveLength(1);
    jest.setSystemTime(NOW.getTime() + 30000);
    await expect(verifier.verify(token())).resolves.toMatchObject({
      providerUserId: 'apple-user',
    });
    expect(jest.getTimerCount()).toBe(0);
  });
});
