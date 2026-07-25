import { plainToInstance, Type } from 'class-transformer';
import {
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

  @IsBoolean()
  FCM_DISPATCH_ENABLED = false;

  @ValidateIf((config: EnvironmentVariables) => config.FCM_DISPATCH_ENABLED)
  @IsString()
  @IsNotEmpty()
  FCM_PROJECT_ID?: string;

  @IsOptional()
  @IsString()
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
