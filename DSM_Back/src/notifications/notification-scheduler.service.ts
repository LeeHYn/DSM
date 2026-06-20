import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import {
  type NotificationSchedule,
  type Task,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FcmAdminService } from './fcm-admin.service';
import { NotificationsService } from './notifications.service';
import {
  NOTIFICATION_FAILURE_REASON,
  NOTIFICATION_EVENTS,
  NOTIFICATION_SCHEDULE_STATUS,
} from './notification-events';

type DueSchedule = NotificationSchedule & { task: Task };

export type ProcessDueSchedulesResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
};

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly fcmAdminService: FcmAdminService,
    private readonly events: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  @Cron('*/1 * * * *')
  async processDueSchedulesCron(): Promise<void> {
    const result = await this.processDueSchedules();
    if (result.processed > 0) {
      this.logger.log(
        `Processed ${result.processed} notification schedules: sent=${result.sent}, failed=${result.failed}`,
      );
    }
  }

  async processDueSchedules(
    now = new Date(),
    take?: number,
  ): Promise<ProcessDueSchedulesResult> {
    await this.recoverStaleProcessingSchedules(now);

    const result: ProcessDueSchedulesResult = {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    };

    const schedules = await this.prisma.notificationSchedule.findMany({
      where: {
        scheduledAt: { lte: now },
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        user: { notificationEnabled: true },
        task: {
          deletedAt: null,
          notificationEnabled: true,
          status: TaskStatus.PENDING,
        },
      },
      include: { task: true },
      orderBy: { scheduledAt: 'asc' },
      take:
        take ??
        this.getPositiveIntegerConfig('NOTIFICATION_DUE_BATCH_SIZE', 50),
    });

    for (const schedule of schedules as DueSchedule[]) {
      const locked = await this.markProcessing(schedule.id);
      if (!locked) {
        continue;
      }

      result.processed += 1;
      const tokens = await this.notificationsService.findActiveTokens(
        schedule.userId,
      );

      if (tokens.length === 0) {
        const markedFailed = await this.markFailed(
          schedule.id,
          NOTIFICATION_FAILURE_REASON.NO_ACTIVE_FCM_TOKEN,
        );
        if (markedFailed) {
          result.failed += 1;
          result.skipped += 1;
        }
        continue;
      }

      try {
        const sendResult = await this.fcmAdminService.sendTaskReminder(
          tokens,
          schedule.task,
        );
        await this.revokeInvalidTokens(
          schedule.userId,
          sendResult.invalidTokens,
        );

        if (sendResult.successCount === 0 && sendResult.failureCount > 0) {
          const markedFailed = await this.markFailed(
            schedule.id,
            'FCM_SEND_FAILED',
          );
          if (markedFailed) {
            result.failed += 1;
          }
          continue;
        }

        const markedSent = await this.markSent(
          schedule.id,
          sendResult.failureCount > 0
            ? `PARTIAL_FCM_FAILURE:${sendResult.failureCount}`
            : null,
        );
        if (markedSent) {
          result.sent += 1;
          this.emitNotificationDue(schedule);
        }
      } catch (error) {
        const markedFailed = await this.markFailed(
          schedule.id,
          this.getFailureReason(error),
        );
        if (markedFailed) {
          result.failed += 1;
        }
      }
    }

    return result;
  }

  private async recoverStaleProcessingSchedules(now: Date): Promise<number> {
    const timeoutSeconds = this.getPositiveIntegerConfig(
      'NOTIFICATION_PROCESSING_TIMEOUT_SECONDS',
      300,
    );
    const staleBefore = new Date(now.getTime() - timeoutSeconds * 1000);

    const result = await this.prisma.notificationSchedule.updateMany({
      where: {
        status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        failureReason: 'RECOVERED_STALE_PROCESSING',
      },
    });

    return result.count;
  }

  private getPositiveIntegerConfig(key: string, fallback: number): number {
    const value = this.configService.get<number | string>(key);
    const parsed = typeof value === 'number' ? value : Number(value);

    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }

    return fallback;
  }

  private async markProcessing(scheduleId: string): Promise<boolean> {
    const result = await this.prisma.notificationSchedule.updateMany({
      where: {
        id: scheduleId,
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        user: { notificationEnabled: true },
        task: {
          deletedAt: null,
          notificationEnabled: true,
          status: TaskStatus.PENDING,
        },
      },
      data: { status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING },
    });

    return result.count === 1;
  }

  private markSent(
    scheduleId: string,
    failureReason: string | null,
  ): Promise<boolean> {
    return this.prisma.notificationSchedule
      .updateMany({
        where: {
          id: scheduleId,
          status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        },
        data: {
          status: NOTIFICATION_SCHEDULE_STATUS.SENT,
          sentAt: new Date(),
          failureReason,
        },
      })
      .then((result) => result.count === 1);
  }

  private markFailed(
    scheduleId: string,
    failureReason: string,
  ): Promise<boolean> {
    return this.prisma.notificationSchedule
      .updateMany({
        where: {
          id: scheduleId,
          status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        },
        data: {
          status: NOTIFICATION_SCHEDULE_STATUS.FAILED,
          failureReason,
        },
      })
      .then((result) => result.count === 1);
  }

  private getFailureReason(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'FCM_SEND_FAILED';
  }

  private async revokeInvalidTokens(
    userId: string,
    tokens: string[],
  ): Promise<void> {
    if (tokens.length === 0) {
      return;
    }

    await this.prisma.fcmToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        token: { in: tokens },
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  private emitNotificationDue(schedule: DueSchedule): void {
    this.events.emit(NOTIFICATION_EVENTS.DUE, {
      userId: schedule.userId,
      taskId: schedule.taskId,
      scheduleId: schedule.id,
      scheduledAt: schedule.scheduledAt.toISOString(),
      task: {
        id: schedule.task.id,
        title: schedule.task.title,
        startAt: schedule.task.startAt.toISOString(),
      },
    });
  }
}
