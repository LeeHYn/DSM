import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import { RevokeFcmTokenDto } from './dto/revoke-fcm-token.dto';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

const REGISTERED_TOKEN = {
  id: 'fcm-token-uuid-1',
  platform: 'ios',
  deviceId: 'device-1',
  lastSeenAt: new Date('2026-07-15T00:00:00.000Z'),
  revokedAt: null,
} as const;

const makeNotificationsServiceMock = () => ({
  register: jest.fn().mockResolvedValue(REGISTERED_TOKEN),
  revoke: jest.fn().mockResolvedValue(undefined),
});
const makeAuthRequest = (userId = 'user-uuid-1') =>
  ({ user: { sub: userId, sid: 'session-1', type: 'access' } }) as never;

const getControllerHandler = (methodName: 'register' | 'revoke'): object => {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    NotificationsController.prototype,
    methodName,
  )?.value;

  if (typeof handler !== 'function') {
    throw new TypeError(`Missing controller handler: ${methodName}`);
  }

  return handler;
};

const expectValidationError = async (
  dto: object,
  property: string,
): Promise<void> => {
  const errors = await validate(dto);

  expect(errors.map((error) => error.property)).toContain(property);
};

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
        {
          provide: PrismaService,
          useValue: { refreshToken: { findFirst: jest.fn() } },
        },
        JwtAuthGuard,
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('uses the notifications path and JWT guard at class level', () => {
    expect(Reflect.getMetadata(PATH_METADATA, NotificationsController)).toBe(
      'notifications',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, NotificationsController),
    ).toEqual([JwtAuthGuard]);
  });

  it('register exposes PUT fcm-tokens with the default 200 status', () => {
    const handler = getControllerHandler('register');

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('fcm-tokens');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.PUT,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBeUndefined();
  });

  it('register delegates the authenticated user and returns the service result', async () => {
    const dto = {
      token: 'fcm-token',
      platform: 'ios' as const,
      deviceId: 'device-1',
    };

    const result = await controller.register(makeAuthRequest(), dto);

    expect(notificationsServiceMock.register).toHaveBeenCalledWith(
      'user-uuid-1',
      dto,
    );
    expect(result).toBe(REGISTERED_TOKEN);
  });

  it('revoke exposes DELETE fcm-tokens with a 204 status', () => {
    const handler = getControllerHandler('revoke');

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('fcm-tokens');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.DELETE,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.NO_CONTENT,
    );
  });

  it('revoke delegates the authenticated user and returns no content', async () => {
    const dto = { token: 'fcm-token' };

    await expect(
      controller.revoke(makeAuthRequest(), dto),
    ).resolves.toBeUndefined();
    expect(notificationsServiceMock.revoke).toHaveBeenCalledWith(
      'user-uuid-1',
      dto,
    );
  });
});

describe('Notification DTO validation', () => {
  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['over 4096 characters', 'x'.repeat(4097)],
  ])('register rejects an %s token', async (_label, token) => {
    const dto = Object.assign(new RegisterFcmTokenDto(), {
      token,
      platform: 'ios',
    });

    await expectValidationError(dto, 'token');
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['over 4096 characters', 'x'.repeat(4097)],
  ])('revoke rejects an %s token', async (_label, token) => {
    const dto = Object.assign(new RevokeFcmTokenDto(), { token });

    await expectValidationError(dto, 'token');
  });

  it('register rejects a platform outside the allowlist', async () => {
    const dto = Object.assign(new RegisterFcmTokenDto(), {
      token: 'fcm-token',
      platform: 'web',
    });

    await expectValidationError(dto, 'platform');
  });

  it('register rejects a deviceId over 255 characters', async () => {
    const dto = Object.assign(new RegisterFcmTokenDto(), {
      token: 'fcm-token',
      platform: 'android',
      deviceId: 'd'.repeat(256),
    });

    await expectValidationError(dto, 'deviceId');
  });

  it('accepts valid register and revoke DTOs', async () => {
    const registerDto = Object.assign(new RegisterFcmTokenDto(), {
      token: 'valid-fcm-token',
      platform: 'android',
      deviceId: 'device-1',
    });
    const revokeDto = Object.assign(new RevokeFcmTokenDto(), {
      token: 'valid-fcm-token',
    });

    await expect(validate(registerDto)).resolves.toEqual([]);
    await expect(validate(revokeDto)).resolves.toEqual([]);
  });
});
