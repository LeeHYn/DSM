import 'reflect-metadata';

process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '3000';
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/dsm_test?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-for-dsm-backend';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-for-dsm-backend';
