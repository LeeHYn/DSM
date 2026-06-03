import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns service status and database configuration state', () => {
    const controller = new HealthController({
      get: (key: string) => (key === 'DATABASE_URL' ? 'postgresql://example' : undefined),
    } as ConfigService);

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
      uptime: expect.any(Number),
      database: {
        configured: true,
      },
    });
  });
});
