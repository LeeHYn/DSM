import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

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

  app.enableCors({
    origin: true,
    credentials: true,
  });
}
