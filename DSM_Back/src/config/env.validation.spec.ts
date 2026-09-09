import { validateEnv } from './env.validation';

const validConfig = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL:
    'postgresql://postgres:postgres@localhost:5432/dsm_test?schema=public',
  JWT_ACCESS_SECRET: 'test-access-secret-for-dsm-backend',
  JWT_REFRESH_SECRET: 'test-refresh-secret-for-dsm-backend',
  GOOGLE_CLIENT_ID: 'test-google-client-id',
};

describe('validateEnv', () => {
  it('converts and returns a valid environment config', () => {
    const config = validateEnv(validConfig);

    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(3001);
    expect(config.DATABASE_URL).toContain('postgresql://');
    expect(config.JWT_ACCESS_SECRET).toBe(validConfig.JWT_ACCESS_SECRET);
    expect(config.JWT_REFRESH_SECRET).toBe(validConfig.JWT_REFRESH_SECRET);
    expect(config.GOOGLE_CLIENT_ID).toBe(validConfig.GOOGLE_CLIENT_ID);
    expect(config.FCM_DISPATCH_ENABLED).toBe(false);
  });

  it('normalizes exact CORS origins and removes duplicates', () => {
    const config = validateEnv({
      ...validConfig,
      CORS_ORIGINS:
        ' http://localhost:8081,https://qa.example.com,http://localhost:8081 ',
    });

    expect(config.CORS_ORIGINS).toEqual([
      'http://localhost:8081',
      'https://qa.example.com',
    ]);
  });

  it.each([
    '*',
    'localhost:8081',
    'https://example.com/path',
    'https://example.com?query=1',
    'https://user:password@example.com',
  ])('rejects unsafe CORS origin %p', (CORS_ORIGINS) => {
    expect(() => validateEnv({ ...validConfig, CORS_ORIGINS })).toThrow(
      /CORS_ORIGINS/,
    );
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('accepts FCM_DISPATCH_ENABLED=%s', (FCM_DISPATCH_ENABLED, expected) => {
    const config = validateEnv({
      ...validConfig,
      FCM_DISPATCH_ENABLED,
      ...(expected ? { FCM_PROJECT_ID: 'test-project-id' } : {}),
    });

    expect(config.FCM_DISPATCH_ENABLED).toBe(expected);
  });

  it.each(['TRUE', '1', 'yes', ''])(
    'rejects invalid FCM_DISPATCH_ENABLED=%p',
    (FCM_DISPATCH_ENABLED) => {
      expect(() =>
        validateEnv({
          ...validConfig,
          FCM_DISPATCH_ENABLED,
        }),
      ).toThrow(/FCM_DISPATCH_ENABLED/);
    },
  );

  it('rejects a missing FCM_PROJECT_ID when dispatch is enabled', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        FCM_DISPATCH_ENABLED: 'true',
      }),
    ).toThrow(/FCM_PROJECT_ID/);
  });

  it('rejects an empty FCM_PROJECT_ID when dispatch is enabled', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        FCM_DISPATCH_ENABLED: 'true',
        FCM_PROJECT_ID: '',
      }),
    ).toThrow(/FCM_PROJECT_ID/);
  });

  it('accepts a missing FCM_PROJECT_ID when dispatch is disabled', () => {
    const config = validateEnv({
      ...validConfig,
      FCM_DISPATCH_ENABLED: 'false',
    });

    expect(config.FCM_DISPATCH_ENABLED).toBe(false);
    expect(config.FCM_PROJECT_ID).toBeUndefined();
  });

  it.each([
    'redis://127.0.0.1:6379',
    'redis://:password@cache.internal:6379/2',
    'rediss://ranking-user:password@cache.example.com:6380/0',
  ])('accepts REDIS_URL %p', (REDIS_URL) => {
    expect(validateEnv({ ...validConfig, REDIS_URL }).REDIS_URL).toBe(
      REDIS_URL,
    );
  });

  it('normalizes an empty non-production REDIS_URL to undefined', () => {
    expect(
      validateEnv({ ...validConfig, REDIS_URL: '' }).REDIS_URL,
    ).toBeUndefined();
  });

  it.each([
    'http://cache.example.com:6379',
    'redis://',
    'redis://cache.example.com/0/extra',
    'redis://cache.example.com/0?timeout=1',
    ' redis://cache.example.com:6379',
  ])('rejects invalid REDIS_URL %p', (REDIS_URL) => {
    expect(() => validateEnv({ ...validConfig, REDIS_URL })).toThrow(
      /REDIS_URL/,
    );
  });

  it.each([undefined, ''])(
    'requires REDIS_URL in production when its value is %p',
    (REDIS_URL) => {
      expect(() =>
        validateEnv({
          ...validConfig,
          NODE_ENV: 'production',
          REDIS_URL,
        }),
      ).toThrow(/REDIS_URL/);
    },
  );

  it('does not echo Redis credentials when URL validation fails', () => {
    const password = 'do-not-log-this-password';
    let message = '';
    try {
      validateEnv({
        ...validConfig,
        REDIS_URL: `http://user:${password}@cache.example.com`,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('REDIS_URL');
    expect(message).not.toContain(password);
  });

  it('removes inline service-account fields from validated config', () => {
    const config = validateEnv({
      ...validConfig,
      FCM_CLIENT_EMAIL: 'firebase-admin@example.com',
      FCM_PRIVATE_KEY: 'private-key-placeholder',
    });

    expect(config).not.toHaveProperty('FCM_CLIENT_EMAIL');
    expect(config).not.toHaveProperty('FCM_PRIVATE_KEY');
  });

  it('rejects a missing GOOGLE_CLIENT_ID', () => {
    const config = { ...validConfig };
    Reflect.deleteProperty(config, 'GOOGLE_CLIENT_ID');

    expect(() => validateEnv(config)).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('rejects an empty GOOGLE_CLIENT_ID', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        GOOGLE_CLIENT_ID: '',
      }),
    ).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('rejects an empty DATABASE_URL', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        DATABASE_URL: '',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects short JWT secrets', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        JWT_ACCESS_SECRET: 'short',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });
});
