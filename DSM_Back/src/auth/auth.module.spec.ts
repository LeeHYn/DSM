import { Injectable, Module } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SessionVerifierService } from './session-verifier.service';

@Injectable()
class AuthConsumer {
  constructor(
    readonly verifier: SessionVerifierService,
    readonly jwt: JwtService,
    readonly guard: JwtAuthGuard,
  ) {}
}

@Module({ imports: [AuthModule], providers: [AuthConsumer] })
class ConsumerModule {}

describe('AuthModule dependency graph', () => {
  let module: TestingModule;
  const secret = 'synthetic-module-access-secret';
  const prisma = {
    refreshToken: { findFirst: jest.fn().mockResolvedValue({ id: 'active' }) },
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          skipProcessEnv: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: secret,
              GOOGLE_CLIENT_ID: 'synthetic-module-google-client',
            }),
          ],
        }),
        PrismaModule,
        ConsumerModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
  });

  afterAll(async () => module?.close());

  it('exports the verifier while preserving JwtModule and guard exports', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, AuthModule)).toEqual([
      JwtModule,
      JwtAuthGuard,
      SessionVerifierService,
    ]);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule)).toEqual([
      AuthService,
      JwtAuthGuard,
      SessionVerifierService,
    ]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AuthModule),
    ).toEqual([AuthController]);
  });

  it('injects the same exported verifier into another module with global Prisma', () => {
    const consumer = module.get(AuthConsumer);
    expect(consumer.verifier).toBe(module.get(SessionVerifierService));
    expect(consumer.jwt).toBeInstanceOf(JwtService);
    expect(consumer.guard).toBeInstanceOf(JwtAuthGuard);
    expect(module.get(AuthService)).toBeInstanceOf(AuthService);
    expect(module.get(AuthController)).toBeInstanceOf(AuthController);
  });

  it('verifies a synthetic issued token through the injected dependencies', async () => {
    const consumer = module.get(AuthConsumer);
    const token = consumer.jwt.sign(
      { sub: 'module-user', sid: 'module-family', type: 'access' },
      { secret, expiresIn: '15m' },
    );
    await expect(consumer.verifier.verifyAccess(token)).resolves.toMatchObject({
      sub: 'module-user',
      sid: 'module-family',
      type: 'access',
    });
    expect(prisma.refreshToken.findFirst).toHaveBeenCalledTimes(1);
  });
});
