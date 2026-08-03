import { HttpStatus } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsController } from './notifications.controller';
import { NotificationsModule } from './notifications.module';
import { NotificationsService } from './notifications.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import { RevokeFcmTokenDto } from './dto/revoke-fcm-token.dto';

const REGISTERED_FCM_TOKEN = {
  id: 'fcm-token-uuid-1',
  platform: 'android' as const,
  deviceId: 'device-1',
  lastSeenAt: new Date('2026-08-02T00:00:00Z'),
  revokedAt: null,
};

const makeNotificationsServiceMock = () => ({
  registerFcmToken: jest.fn().mockResolvedValue(REGISTERED_FCM_TOKEN),
  revokeFcmToken: jest.fn().mockResolvedValue(undefined),
});

const makeAuthRequest = (userId = 'user-uuid-1') =>
  ({ user: { sub: userId, type: 'access' } }) as never;

describe('RegisterFcmTokenDto', () => {
  it('accepts a valid Android payload', async () => {
    const dto = plainToInstance(RegisterFcmTokenDto, {
      token: 'fcm-token',
      platform: 'android',
      deviceId: 'device-1',
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    ['whitespace token', { token: '   ', platform: 'android' }],
    ['4097-character token', { token: 't'.repeat(4097), platform: 'android' }],
    ['invalid platform', { token: 'fcm-token', platform: 'web' }],
    [
      'whitespace deviceId',
      { token: 'fcm-token', platform: 'android', deviceId: '   ' },
    ],
    [
      '256-character deviceId',
      { token: 'fcm-token', platform: 'android', deviceId: 'd'.repeat(256) },
    ],
    [
      'null deviceId',
      { token: 'fcm-token', platform: 'android', deviceId: null },
    ],
  ])('rejects %s', async (_caseName, payload) => {
    const dto = plainToInstance(RegisterFcmTokenDto, payload);

    expect(await validate(dto)).not.toHaveLength(0);
  });
});

describe('RevokeFcmTokenDto', () => {
  it('accepts a valid token', async () => {
    const dto = plainToInstance(RevokeFcmTokenDto, {
      token: 'fcm-token',
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    ['whitespace token', { token: '   ' }],
    ['4097-character token', { token: 't'.repeat(4097) }],
  ])('rejects %s', async (_caseName, payload) => {
    const dto = plainToInstance(RevokeFcmTokenDto, payload);

    expect(await validate(dto)).not.toHaveLength(0);
  });
});

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

  it('registerFcmToken delegates the authenticated user and returns the service result', async () => {
    const dto = {
      token: 'fcm-token',
      platform: 'android' as const,
      deviceId: 'device-1',
    };

    const result = await controller.registerFcmToken(makeAuthRequest(), dto);

    expect(notificationsServiceMock.registerFcmToken).toHaveBeenCalledWith(
      'user-uuid-1',
      dto,
    );
    expect(result).toEqual(REGISTERED_FCM_TOKEN);
  });

  it('revokeFcmToken delegates the authenticated user and returns no body', async () => {
    const dto = { token: 'fcm-token' };

    const result = await controller.revokeFcmToken(makeAuthRequest(), dto);

    expect(notificationsServiceMock.revokeFcmToken).toHaveBeenCalledWith(
      'user-uuid-1',
      dto,
    );
    expect(result).toBeUndefined();
  });

  it('uses the notifications route, JWT guard, and 204 DELETE response metadata', () => {
    expect(Reflect.getMetadata(PATH_METADATA, NotificationsController)).toBe(
      'notifications',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, NotificationsController),
    ).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        // Metadata is attached to the prototype method; the reference is not invoked.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        NotificationsController.prototype.revokeFcmToken,
      ),
    ).toBe(HttpStatus.NO_CONTENT);
  });
});

describe('NotificationsModule', () => {
  it('compiles and resolves its controller and service', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [NotificationsModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    expect(module.get(NotificationsController)).toBeInstanceOf(
      NotificationsController,
    );
    expect(module.get(NotificationsService)).toBeInstanceOf(
      NotificationsService,
    );
  });
});

describe('AppModule', () => {
  it('imports NotificationsModule exactly once', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as readonly unknown[];

    expect(imports).toContain(NotificationsModule);
    expect(
      imports.filter((module) => module === NotificationsModule),
    ).toHaveLength(1);
  });
});
