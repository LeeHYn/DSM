import { Injectable, Logger } from '@nestjs/common';
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
    take = 50,
  ): Promise<ProcessDueSchedulesResult> {
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
      take,
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
        result.failed += 1;
        result.skipped += 1;
        await this.markFailed(
          schedule.id,
          NOTIFICATION_FAILURE_REASON.NO_ACTIVE_FCM_TOKEN,
        );
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
          result.failed += 1;
          await this.markFailed(schedule.id, 'FCM_SEND_FAILED');
          continue;
        }

        result.sent += 1;
        await this.markSent(
          schedule.id,
          sendResult.failureCount > 0
            ? `PARTIAL_FCM_FAILURE:${sendResult.failureCount}`
            : null,
        );
        this.emitNotificationDue(schedule);
      } catch (error) {
        result.failed += 1;
        await this.markFailed(schedule.id, this.getFailureReason(error));
      }
    }

    return result;
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
  ): Promise<NotificationSchedule> {
    return this.prisma.notificationSchedule.update({
      where: { id: scheduleId },
      data: {
        status: NOTIFICATION_SCHEDULE_STATUS.SENT,
        sentAt: new Date(),
        failureReason,
      },
    });
  }

  private markFailed(
    scheduleId: string,
    failureReason: string,
  ): Promise<NotificationSchedule> {
    return this.prisma.notificationSchedule.update({
      where: { id: scheduleId },
      data: {
        status: NOTIFICATION_SCHEDULE_STATUS.FAILED,
        failureReason,
      },
    });
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
      data: { revokedAt: new Date() },
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
