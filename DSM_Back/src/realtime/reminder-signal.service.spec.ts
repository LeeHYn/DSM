import { CronExpression } from '@nestjs/schedule';
import { RealtimeBusService } from './realtime-bus.service';
import { ReminderSignalService } from './reminder-signal.service';

describe('ReminderSignalService', () => {
  const publishInvalidation = jest.fn<Promise<void>, [unknown, unknown]>();
  let service: ReminderSignalService;

  beforeEach(() => {
    publishInvalidation.mockReset().mockResolvedValue(undefined);
    service = new ReminderSignalService({
      publishInvalidation,
    } as unknown as RealtimeBusService);
  });

  afterEach(() => service.onModuleDestroy());

  it('publishes only the global neutral reminder invalidation', async () => {
    await service.signal();
    expect(publishInvalidation.mock.calls).toEqual([
      [{ kind: 'all' }, ['reminders']],
    ]);
  });

  it('coalesces overlapping direct calls until the existing bus call settles', async () => {
    let complete!: () => void;
    publishInvalidation.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    const first = service.signal();
    const second = service.signal();
    expect(second).toBe(first);
    await Promise.resolve();
    expect(publishInvalidation).toHaveBeenCalledTimes(1);
    complete();
    await Promise.all([first, second]);
    await service.signal();
    expect(publishInvalidation).toHaveBeenCalledTimes(2);
  });

  it('absorbs rejected transport work and allows the next scheduled retry', async () => {
    publishInvalidation.mockRejectedValueOnce(new Error('private transport'));
    await expect(service.signal()).resolves.toBeUndefined();
    await service.signal();
    expect(publishInvalidation).toHaveBeenCalledTimes(2);
  });

  it('absorbs a synchronous transport throw without exposing it', async () => {
    publishInvalidation.mockImplementationOnce(() => {
      throw new Error('private transport');
    });
    await expect(service.signal()).resolves.toBeUndefined();
    await expect(service.signal()).resolves.toBeUndefined();
    expect(publishInvalidation).toHaveBeenCalledTimes(2);
  });

  it('lets an already started bounded bus call settle but never publishes after destroy', async () => {
    let complete!: () => void;
    publishInvalidation.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    const pending = service.signal();
    await Promise.resolve();
    service.onModuleDestroy();
    await service.signal();
    expect(publishInvalidation).toHaveBeenCalledTimes(1);
    complete();
    await pending;
    await service.signal();
    expect(publishInvalidation).toHaveBeenCalledTimes(1);
  });

  it('does not begin queued work when destroyed before its microtask starts', async () => {
    const pending = service.signal();
    service.onModuleDestroy();
    await pending;
    expect(publishInvalidation).not.toHaveBeenCalled();
  });

  it('declares the actual 30-second named Cron with completion exclusion', () => {
    const method = Object.getOwnPropertyDescriptor(
      ReminderSignalService.prototype,
      'signal',
    )!.value as object;
    const metadata: unknown = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      method,
    );
    expect(metadata).toEqual({
      cronTime: CronExpression.EVERY_30_SECONDS,
      name: 'realtime-reminder-signal',
      waitForCompletion: true,
    });
    expect(Reflect.getMetadata('SCHEDULER_NAME', method)).toBe(
      'realtime-reminder-signal',
    );
  });
});
