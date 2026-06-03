import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type HealthResponse = {
  status: 'ok';
  timestamp: string;
  uptime: number;
  database: {
    configured: boolean;
  };
};

@Controller('health')
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        configured: Boolean(this.configService.get<string>('DATABASE_URL')),
      },
    };
  }
}
