import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RealtimeBusService } from './realtime-bus.service';

@Injectable()
export class ReminderSignalService implements OnModuleDestroy {
  private pending: Promise<void> | undefined;
  private disposed = false;

  constructor(private readonly bus: RealtimeBusService) {}

  @Cron(CronExpression.EVERY_30_SECONDS, {
    name: 'realtime-reminder-signal',
    waitForCompletion: true,
  })
  signal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.pending) return this.pending;
    const operation = Promise.resolve()
      .then(() => {
        if (!this.disposed) {
          return this.bus.publishInvalidation({ kind: 'all' }, ['reminders']);
        }
      })
      .catch(() => {
        // The next tick and client REST fallback recover missed signals.
      })
      .finally(() => {
        if (this.pending === operation) this.pending = undefined;
      });
    this.pending = operation;
    return operation;
  }

  onModuleDestroy(): void {
    // RealtimeBusService bounds work already started; this does not cancel it.
    this.disposed = true;
  }
}
