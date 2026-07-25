import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ValidationError } from 'class-validator';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { parseCorsOrigins } from './config/env.validation';

type ValidationFailure = {
  property: string;
  constraints: Record<string, string>;
};

function flattenValidationErrors(
  errors: ValidationError[],
): ValidationFailure[] {
  return errors.flatMap((error) => {
    const current: ValidationFailure[] = error.constraints
      ? [
          {
            property: error.property,
            constraints: error.constraints,
          },
        ]
      : [];

    const children = error.children?.length
      ? flattenValidationErrors(error.children)
      : [];

    return [...current, ...children];
  });
}

export function buildCorsOptions(origins: string[]): CorsOptions {
  const allowlist = new Set(origins);

  return {
    origin(origin, callback) {
      callback(null, origin === undefined || allowlist.has(origin));
    },
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  };
}

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) =>
        new BadRequestException({
          error: 'Bad Request',
          message: flattenValidationErrors(errors),
        }),
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors(buildCorsOptions(parseCorsOrigins(process.env.CORS_ORIGINS)));
}
