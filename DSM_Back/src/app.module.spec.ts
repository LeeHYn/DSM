import type { DynamicModule, Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { Test, type TestingModule } from '@nestjs/testing';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FirebaseMessagingProvider } from './notifications/firebase-messaging.provider';
import { PrismaModule } from './prisma/prisma.module';
import { RankingsModule } from './rankings/rankings.module';
import { ScoresModule } from './scores/scores.module';
import { TasksModule } from './tasks/tasks.module';

jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(),
  getApps: jest.fn(),
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(),
}));

describe('AppModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers one scheduler root and retains the application modules', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as Array<Type<unknown> | DynamicModule>;
    const schedulerRoots = imports.filter(
      (entry): entry is DynamicModule =>
        typeof entry === 'object' && entry.module === ScheduleModule,
    );
    const staticModules = imports.filter(
      (entry): entry is Type<unknown> => typeof entry === 'function',
    );
    const taskImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      TasksModule,
    ) as Type<unknown>[];

    expect(schedulerRoots).toHaveLength(1);
    expect(schedulerRoots[0]).toMatchObject({
      global: true,
      module: ScheduleModule,
    });
    expect(imports.filter((entry) => entry === ScheduleModule)).toHaveLength(0);
    expect(staticModules).toEqual([
      PrismaModule,
      HealthModule,
      AuthModule,
      TasksModule,
      CategoriesModule,
      ScoresModule,
      RankingsModule,
      NotificationsModule,
    ]);
    expect(
      imports.filter((entry) => entry === NotificationsModule),
    ).toHaveLength(1);
    expect(taskImports).toEqual([AuthModule, PrismaModule, ScoresModule]);
  });

  it('compiles and closes the root module graph with dispatch disabled', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    try {
      const configService = moduleFixture.get(ConfigService);

      expect(configService.get<boolean>('FCM_DISPATCH_ENABLED')).toBe(false);
      expect(getApps).not.toHaveBeenCalled();
      expect(applicationDefault).not.toHaveBeenCalled();
      expect(initializeApp).not.toHaveBeenCalled();
      expect(getMessaging).not.toHaveBeenCalled();
    } finally {
      await moduleFixture.close();
    }
  });

  it('keeps notification dispatch inert without database or Firebase access', () => {
    const getConfig = jest.fn((key: string) =>
      key === 'FCM_DISPATCH_ENABLED' ? false : undefined,
    );
    const configService = {
      get: getConfig,
    } as unknown as ConfigService;
    const provider = new FirebaseMessagingProvider(configService);

    expect(provider.isEnabled()).toBe(false);
    expect(getConfig).toHaveBeenCalledWith('FCM_DISPATCH_ENABLED');
    expect(getApps).not.toHaveBeenCalled();
    expect(applicationDefault).not.toHaveBeenCalled();
    expect(initializeApp).not.toHaveBeenCalled();
    expect(getMessaging).not.toHaveBeenCalled();
  });
});
