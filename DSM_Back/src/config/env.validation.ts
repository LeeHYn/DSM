import { plainToInstance, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID!: string;

  @IsArray()
  @IsString({ each: true })
  CORS_ORIGINS: string[] = [];

  @IsBoolean()
  FCM_DISPATCH_ENABLED = false;

  @ValidateIf((config: EnvironmentVariables) => config.FCM_DISPATCH_ENABLED)
  @IsString()
  @IsNotEmpty()
  FCM_PROJECT_ID?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  REDIS_URL?: string;
}

function parseFcmDispatchEnabled(value: unknown): boolean {
  if (value === undefined || value === 'false') {
    return false;
  }

  if (value === 'true') {
    return true;
  }

  throw new Error(
    'Environment validation failed: FCM_DISPATCH_ENABLED: must be exactly "true" or "false"',
  );
}

export function parseCorsOrigins(value: unknown): string[] {
  if (value === undefined || value === '') {
    return [];
  }

  if (typeof value !== 'string') {
    throw new Error(
      'Environment validation failed: CORS_ORIGINS: must be a comma-separated string',
    );
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => {
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        throw new Error(
          `Environment validation failed: CORS_ORIGINS: invalid origin ${origin}`,
        );
      }

      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.origin !== origin ||
        url.pathname !== '/' ||
        url.search !== '' ||
        url.hash !== '' ||
        url.username !== '' ||
        url.password !== ''
      ) {
        throw new Error(
          `Environment validation failed: CORS_ORIGINS: invalid origin ${origin}`,
        );
      }

      return url.origin;
    });

  return [...new Set(origins)];
}

export function parseRedisUrl(
  value: unknown,
  nodeEnvironment: unknown,
): string | undefined {
  const required = nodeEnvironment === NodeEnvironment.Production;
  if (value === undefined || value === '') {
    if (required) {
      throw new Error(
        'Environment validation failed: REDIS_URL: is required in production',
      );
    }
    return undefined;
  }

  const invalid = (): never => {
    throw new Error(
      'Environment validation failed: REDIS_URL: must be a valid redis:// or rediss:// connection URL',
    );
  };

  if (typeof value !== 'string' || value.trim() !== value) {
    return invalid();
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid();
  }

  if (
    (url.protocol !== 'redis:' && url.protocol !== 'rediss:') ||
    url.hostname === '' ||
    url.search !== '' ||
    url.hash !== '' ||
    !/^\/(?:\d+)?$|^$/.test(url.pathname)
  ) {
    return invalid();
  }

  return value;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(
    EnvironmentVariables,
    {
      ...config,
      FCM_DISPATCH_ENABLED: parseFcmDispatchEnabled(
        config.FCM_DISPATCH_ENABLED,
      ),
      CORS_ORIGINS: parseCorsOrigins(config.CORS_ORIGINS),
      REDIS_URL: parseRedisUrl(config.REDIS_URL, config.NODE_ENV),
    },
    {
      enableImplicitConversion: true,
    },
  );

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => {
        const constraints = Object.values(error.constraints ?? {}).join(', ');
        return `${error.property}: ${constraints}`;
      })
      .join('; ');

    throw new Error(`Environment validation failed: ${messages}`);
  }

  return validatedConfig;
}
