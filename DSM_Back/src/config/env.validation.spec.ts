import { validateEnv } from './env.validation';

const validConfig = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL:
    'postgresql://postgres:postgres@localhost:5432/dsm_test?schema=public',
  JWT_ACCESS_SECRET: 'test-access-secret-for-dsm-backend',
  JWT_REFRESH_SECRET: 'test-refresh-secret-for-dsm-backend',
};

describe('validateEnv', () => {
  it('converts and returns a valid environment config', () => {
    const config = validateEnv(validConfig);

    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(3001);
    expect(config.DATABASE_URL).toContain('postgresql://');
    expect(config.JWT_ACCESS_SECRET).toBe(validConfig.JWT_ACCESS_SECRET);
    expect(config.JWT_REFRESH_SECRET).toBe(validConfig.JWT_REFRESH_SECRET);
  });

  it('accepts optional notification scheduler settings as positive integers', () => {
    const config = validateEnv({
      ...validConfig,
      NOTIFICATION_DUE_BATCH_SIZE: '25',
      NOTIFICATION_PROCESSING_TIMEOUT_SECONDS: '120',
      RANKING_CACHE_TTL_SECONDS: '45',
      WS_CORS_ORIGINS: 'http://localhost:3000,http://localhost:19006',
    });
    const configRecord = config as unknown as Record<string, unknown>;

    expect(configRecord.NOTIFICATION_DUE_BATCH_SIZE).toBe(25);
    expect(configRecord.NOTIFICATION_PROCESSING_TIMEOUT_SECONDS).toBe(120);
    expect(configRecord.RANKING_CACHE_TTL_SECONDS).toBe(45);
    expect(config.WS_CORS_ORIGINS).toBe(
      'http://localhost:3000,http://localhost:19006',
    );
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

  it('rejects non-positive notification scheduler and ranking cache settings', () => {
    const validate = () =>
      validateEnv({
        ...validConfig,
        NOTIFICATION_DUE_BATCH_SIZE: '0',
        NOTIFICATION_PROCESSING_TIMEOUT_SECONDS: '-1',
        RANKING_CACHE_TTL_SECONDS: '0',
      });

    expect(validate).toThrow(/NOTIFICATION_DUE_BATCH_SIZE/);
    expect(validate).toThrow(/NOTIFICATION_PROCESSING_TIMEOUT_SECONDS/);
    expect(validate).toThrow(/RANKING_CACHE_TTL_SECONDS/);
  });
});
