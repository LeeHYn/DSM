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
