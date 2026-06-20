import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type FcmToken,
  type NotificationSchedule,
  Prisma,
  type Task,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import type { RevokeFcmTokenDto } from './dto/revoke-fcm-token.dto';
import { NOTIFICATION_SCHEDULE_STATUS } from './notification-events';

const ACTIVE_SCHEDULE_STATUSES = [
  NOTIFICATION_SCHEDULE_STATUS.PENDING,
  NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
];

export type RevokeFcmTokenResult = {
  revokedCount: number;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerToken(
    userId: string,
    dto: RegisterFcmTokenDto,
  ): Promise<FcmToken> {
    return this.prisma.fcmToken.upsert({
      where: { token: dto.token },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
        deviceId: dto.deviceId,
        revokedAt: null,
      },
      update: {
        userId,
        platform: dto.platform,
        deviceId: dto.deviceId,
        lastSeenAt: new Date(),
        revokedAt: null,
      },
    });
  }

  async revokeToken(
    userId: string,
    dto: RevokeFcmTokenDto,
  ): Promise<RevokeFcmTokenResult> {
    if (!dto.token && !dto.deviceId) {
      throw new BadRequestException('token or deviceId is required');
    }

    const result = await this.prisma.fcmToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(dto.token !== undefined && { token: dto.token }),
        ...(dto.deviceId !== undefined && { deviceId: dto.deviceId }),
      },
      data: { revokedAt: new Date() },
    });

    return { revokedCount: result.count };
  }

  async findActiveTokens(userId: string): Promise<string[]> {
    const tokens = await this.prisma.fcmToken.findMany({
      where: { userId, revokedAt: null },
      select: { token: true },
      orderBy: { lastSeenAt: 'desc' },
    });

    return tokens.map(({ token }) => token);
  }

  async upsertTaskSchedule(
    task: Pick<
      Task,
      | 'id'
      | 'userId'
      | 'startAt'
      | 'notificationEnabled'
      | 'deletedAt'
      | 'status'
    >,
  ): Promise<NotificationSchedule | null> {
    if (
      !task.notificationEnabled ||
      task.deletedAt ||
      task.status !== TaskStatus.PENDING
    ) {
      await this.cancelTaskSchedule(task.userId, task.id);
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: task.userId },
      select: { notificationEnabled: true },
    });
    if (user?.notificationEnabled === false) {
      await this.cancelTaskSchedule(task.userId, task.id);
      return null;
    }

    const data = {
      scheduledAt: task.startAt,
      status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
      sentAt: null,
      failureReason: null,
    };

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await this.findActiveTaskSchedule(
            tx,
            task.userId,
            task.id,
          );

          if (existing) {
            return tx.notificationSchedule.update({
              where: { id: existing.id },
              data,
            });
          }

          return tx.notificationSchedule.create({
            data: {
              ...data,
              userId: task.userId,
              taskId: task.id,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!this.isUniqueConflict(error)) {
        throw error;
      }

      return this.prisma.$transaction(
        async (tx) => {
          const conflicted = await this.findActiveTaskSchedule(
            tx,
            task.userId,
            task.id,
          );
          if (!conflicted) {
            throw error;
          }

          return tx.notificationSchedule.update({
            where: { id: conflicted.id },
            data,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }
  }

  async cancelTaskSchedule(userId: string, taskId: string): Promise<number> {
    const result = await this.prisma.notificationSchedule.updateMany({
      where: {
        userId,
        taskId,
        status: { in: ACTIVE_SCHEDULE_STATUSES },
      },
      data: {
        status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED,
        failureReason: null,
      },
    });

    return result.count;
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private findActiveTaskSchedule(
    tx: Prisma.TransactionClient,
    userId: string,
    taskId: string,
  ) {
    return tx.notificationSchedule.findFirst({
      where: {
        userId,
        taskId,
        status: { in: ACTIVE_SCHEDULE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
