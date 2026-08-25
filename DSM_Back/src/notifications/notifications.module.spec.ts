import type { Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseMessagingProvider } from './firebase-messaging.provider';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsModule } from './notifications.module';
import { NotificationsService } from './notifications.service';

jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(),
  getApps: jest.fn(),
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(),
}));

describe('NotificationsModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps its existing module graph and registers each notification provider once', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      NotificationsModule,
    ) as unknown[];
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      NotificationsModule,
    ) as unknown[];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      NotificationsModule,
    ) as Provider[];

    expect(imports).toEqual([AuthModule, PrismaModule]);
    expect(controllers).toEqual([NotificationsController]);
    expect(providers).toEqual([
      NotificationsService,
      FirebaseMessagingProvider,
      NotificationDispatcherService,
    ]);
  });

  it('constructs the registered providers with dispatch disabled without Firebase access', async () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      NotificationsModule,
    ) as Provider[];
    const configService = {
      get: jest.fn((key: string) =>
        key === 'FCM_DISPATCH_ENABLED' ? false : undefined,
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ...providers,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    expect(moduleRef.get(NotificationsService)).toBeDefined();
    expect(moduleRef.get(NotificationDispatcherService)).toBeDefined();
    expect(moduleRef.get(FirebaseMessagingProvider).isEnabled()).toBe(false);
    expect(configService.get).toHaveBeenCalledWith('FCM_DISPATCH_ENABLED');
    expect(getApps).not.toHaveBeenCalled();
    expect(applicationDefault).not.toHaveBeenCalled();
    expect(initializeApp).not.toHaveBeenCalled();
    expect(getMessaging).not.toHaveBeenCalled();
  });
});
