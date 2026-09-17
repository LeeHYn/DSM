import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReadinessService } from './readiness.service';

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
  constructor(
    private readonly configService: ConfigService,
    private readonly readinessService: ReadinessService,
  ) {}

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async getReadiness(): Promise<{ status: 'ready' }> {
    if (!(await this.readinessService.check())) {
      throw new ServiceUnavailableException('Database is not ready');
    }
    return { status: 'ready' };
  }

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
