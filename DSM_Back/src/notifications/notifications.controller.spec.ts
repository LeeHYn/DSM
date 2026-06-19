import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const makeNotificationsServiceMock = () => ({
  registerToken: jest.fn().mockResolvedValue({
    id: 'fcm-token-uuid-1',
    token: 'fcm-token-1',
    platform: 'ios',
    deviceId: 'device-1',
    userId: 'user-uuid-1',
    lastSeenAt: new Date('2026-06-20T03:00:00Z'),
    revokedAt: null,
    createdAt: new Date('2026-06-20T03:00:00Z'),
    updatedAt: new Date('2026-06-20T03:00:00Z'),
  }),
  revokeToken: jest.fn().mockResolvedValue({ revokedCount: 1 }),
});

const makeAuthRequest = (userId = 'user-uuid-1') =>
  ({ user: { sub: userId, type: 'access' } }) as never;

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsServiceMock: ReturnType<typeof makeNotificationsServiceMock>;

  beforeEach(async () => {
    notificationsServiceMock = makeNotificationsServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: notificationsServiceMock },
        {
          provide: JwtService,
          useValue: { verify: jest.fn(), sign: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        JwtAuthGuard,
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('registerFcmToken delegates to notificationsService.registerToken', async () => {
    const dto = {
      token: 'fcm-token-1',
      platform: 'ios',
      deviceId: 'device-1',
    };

    const result = await controller.registerFcmToken(makeAuthRequest(), dto);

    expect(notificationsServiceMock.registerToken).toHaveBeenCalledWith(
      'user-uuid-1',
      dto,
    );
    expect(result.token).toBe('fcm-token-1');
  });

  it('revokeFcmToken delegates to notificationsService.revokeToken', async () => {
    const dto = { token: 'fcm-token-1' };

    const result = await controller.revokeFcmToken(makeAuthRequest(), dto);

    expect(notificationsServiceMock.revokeToken).toHaveBeenCalledWith(
      'user-uuid-1',
      dto,
    );
    expect(result).toEqual({ revokedCount: 1 });
  });
});
