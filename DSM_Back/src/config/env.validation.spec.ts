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
