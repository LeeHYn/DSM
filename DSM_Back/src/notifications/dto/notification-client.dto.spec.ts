import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '../../app.bootstrap';
import {
  ReminderQueryDto,
  UpdateNotificationSettingsDto,
} from './notification-client.dto';

describe('Notification client DTOs with production validation', () => {
  let app: INestApplication;
  let pipe: ValidationPipe;

  beforeAll(async () => {
    const module = await Test.createTestingModule({}).compile();
    app = module.createNestApplication();
    const install = jest.spyOn(app, 'useGlobalPipes');
    configureApp(app);
    const configured = install.mock.calls[0][0];
    if (!(configured instanceof ValidationPipe)) {
      throw new Error('Production validation pipe was not installed');
    }
    pipe = configured;
  });

  afterAll(async () => app.close());

  const settings = (value: unknown) =>
    pipe.transform(value, {
      type: 'body',
      metatype: UpdateNotificationSettingsDto,
    }) as Promise<UpdateNotificationSettingsDto>;
  const query = (value: unknown) =>
    pipe.transform(value, {
      type: 'query',
      metatype: ReminderQueryDto,
    }) as Promise<ReminderQueryDto>;

  it.each([true, false])(
    'preserves required boolean %s',
    async (notificationEnabled) => {
      const result = await settings({ notificationEnabled });
      expect(result).toBeInstanceOf(UpdateNotificationSettingsDto);
      expect(result.notificationEnabled).toBe(notificationEnabled);
    },
  );

  it.each(['true', 'false', '', 0, 1, null, undefined, [], {}])(
    'rejects notificationEnabled=%j without implicit coercion',
    async (notificationEnabled) => {
      await expect(settings({ notificationEnabled })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it.each([{}, null, [], { notificationEnabled: true, userId: 'other' }])(
    'rejects missing settings or unknown body fields %j',
    async (body) => {
      await expect(settings(body)).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('preserves omitted query fields', async () => {
    const result = await query({});
    expect(result).toBeInstanceOf(ReminderQueryDto);
    expect(result.limit).toBeUndefined();
    expect(result.cursor).toBeUndefined();
  });

  it.each([1, 100, '1', '100'])(
    'converts valid limit=%j to a number',
    async (limit) => {
      expect((await query({ limit })).limit).toBe(Number(limit));
    },
  );

  it.each([
    0,
    101,
    -1,
    1.5,
    '0',
    '101',
    '-1',
    '1.5',
    '',
    'true',
    true,
    false,
    null,
    [],
    {},
    'Infinity',
  ])('rejects invalid limit=%j', async (limit) => {
    await expect(query({ limit })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['schedule-id', 'a'.repeat(255)])(
    'preserves an opaque cursor of valid length',
    async (cursor) => {
      expect((await query({ cursor })).cursor).toBe(cursor);
    },
  );

  it.each(['', ' \t\n', 'a'.repeat(256), null, true, 123, [], {}])(
    'rejects invalid cursor=%j without string coercion',
    async (cursor) => {
      await expect(query({ cursor })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it.each([
    { userId: 'other' },
    { now: '2099-01-01T00:00:00.000Z' },
    { notificationEnabled: true },
  ])('rejects unknown query fields %j', async (value) => {
    await expect(query(value)).rejects.toBeInstanceOf(BadRequestException);
  });
});
