import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { ReadinessService } from './readiness.service';

describe('HealthController', () => {
  it('returns service status and database configuration state', () => {
    const check = jest.fn();
    const controller = new HealthController(
      {
        get: (key: string) =>
          key === 'DATABASE_URL' ? 'postgresql://example' : undefined,
      } as ConfigService,
      { check } as unknown as ReadinessService,
    );

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      timestamp: expect.any(String),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      uptime: expect.any(Number),
      database: {
        configured: true,
      },
    });
    expect(check).not.toHaveBeenCalled();
  });
});
