import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SocialProvider } from '@prisma/client';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const TOKEN_RESPONSE = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
};

const CURRENT_USER = {
  userId: 'user-uuid-1',
  onboardingCompletedAt: new Date('2026-07-25T00:00:00.000Z'),
};

const makeAuthServiceMock = () => ({
  socialLogin: jest.fn().mockResolvedValue(TOKEN_RESPONSE),
  refreshTokens: jest.fn().mockResolvedValue(TOKEN_RESPONSE),
  logout: jest.fn().mockResolvedValue(undefined),
  getCurrentUser: jest.fn().mockResolvedValue(CURRENT_USER),
  completeOnboarding: jest.fn().mockResolvedValue(CURRENT_USER),
});

describe('AuthController', () => {
  let controller: AuthController;
  let authServiceMock: ReturnType<typeof makeAuthServiceMock>;

  beforeEach(async () => {
    authServiceMock = makeAuthServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        {
          provide: JwtService,
          useValue: { verify: jest.fn(), sign: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        JwtAuthGuard,
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('login delegates to authService.socialLogin', async () => {
    const result = await controller.login({
      provider: SocialProvider.GOOGLE,
      token: 'google-id-token',
    });

    expect(authServiceMock.socialLogin).toHaveBeenCalledWith(
      SocialProvider.GOOGLE,
      'google-id-token',
    );
    expect(result).toEqual(TOKEN_RESPONSE);
  });

  it('refresh delegates to authService.refreshTokens', async () => {
    const result = await controller.refresh({ refreshToken: 'rt' });

    expect(authServiceMock.refreshTokens).toHaveBeenCalledWith('rt');
    expect(result).toEqual(TOKEN_RESPONSE);
  });

  it('me returns the canonical current-user projection', async () => {
    const req = { user: { sub: 'user-uuid-1', type: 'access' } } as never;

    await expect(controller.me(req)).resolves.toEqual(CURRENT_USER);
    expect(authServiceMock.getCurrentUser).toHaveBeenCalledWith('user-uuid-1');
  });

  it('completeOnboarding delegates with the authenticated user', async () => {
    const req = { user: { sub: 'user-uuid-1', type: 'access' } } as never;

    await expect(controller.completeOnboarding(req)).resolves.toEqual(
      CURRENT_USER,
    );
    expect(authServiceMock.completeOnboarding).toHaveBeenCalledWith(
      'user-uuid-1',
    );
  });
});
