import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, TaskStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { SendResponse } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseMessagingProvider } from './firebase-messaging.provider';
import {
  NOTIFICATION_DELIVERY_STATUS,
  NOTIFICATION_NONTERMINAL_STATUSES,
  NOTIFICATION_SCHEDULE_STATUS,
} from './notification-schedule.constants';

const MAX_SERIALIZABLE_TRANSACTION_RETRIES = 2;
const MAX_SCHEDULES_MATERIALIZED_PER_TICK = 100;
const MAX_DELIVERIES_PER_BATCH = 500;
const MAX_DELIVERY_ATTEMPTS = 3;
const DELIVERY_LEASE_MS = 5 * 60 * 1000;
const DELIVERY_HEARTBEAT_MS = 60 * 1000;
const BASE_RETRY_DELAY_MS = 60 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const NOTIFICATION_DISPATCH_CRON_NAME = 'notification-dispatcher';

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

const TRANSIENT_FAILURE_CODES = new Set([
  'messaging/device-message-rate-exceeded',
  'messaging/internal-error',
  'messaging/message-rate-exceeded',
  'messaging/quota-exceeded',
  'messaging/server-unavailable',
  'messaging/topics-message-rate-exceeded',
  'messaging/unavailable',
  'messaging/unknown-error',
]);

const ALLOWED_FAILURE_CODES = new Set([
  ...INVALID_TOKEN_CODES,
  ...TRANSIENT_FAILURE_CODES,
  'messaging/authentication-error',
  'messaging/invalid-argument',
  'messaging/mismatched-credential',
  'messaging/sender-id-mismatch',
  'messaging/third-party-auth-error',
]);

const UNKNOWN_FAILURE_CODE = 'messaging/unknown-error';
const MAX_ATTEMPTS_FAILURE_CODE = 'messaging/max-attempts-exceeded';
const AMBIGUOUS_DELIVERY_OUTCOME_REASON = 'ambiguous-delivery-outcome';
const NO_ACTIVE_DEVICE_REASON = 'no-active-device';
const ALL_DELIVERIES_FAILED_REASON = 'all-deliveries-failed';
const REMINDER_SYNC_COLLAPSE_KEY = 'reminder-sync';

interface DeliveryCandidate {
  id: string;
  scheduleId: string;
  fcmTokenId: string;
  tokenUpdatedAt: Date;
  attemptCount: number;
  fcmToken: {
    token: string;
    userId: string;
    updatedAt: Date;
    revokedAt: Date | null;
  };
  schedule: {
    id: string;
    taskId: string;
    userId: string;
    scheduledAt: Date;
    status: string;
    user: {
      notificationEnabled: boolean;
    };
    task: {
      userId: string;
      startAt: Date;
      status: TaskStatus;
      notificationEnabled: boolean;
      deletedAt: Date | null;
    };
  };
}

interface ClaimedDelivery extends DeliveryCandidate {
  claimId: string;
}

interface LeaseHeartbeat {
  stop(): Promise<boolean>;
}

class SendStartClaimMismatchError extends Error {}

@Injectable()
export class NotificationDispatcherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseMessagingProvider,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS, {
    name: NOTIFICATION_DISPATCH_CRON_NAME,
    waitForCompletion: true,
  })
  async dispatchDueNotifications(): Promise<void> {
    if (!this.firebase.isEnabled()) {
      return;
    }

    const now = new Date();
    await this.recoverStaleDeliveryLeases(now);
    await this.materializeDueSchedules(now);

    const claimed = await this.claimDueDeliveryBatch(now);
    if (claimed.length === 0) {
      return;
    }

    const active = await this.revalidateClaimedBatch(claimed, new Date());
    if (active.length === 0) {
      await this.aggregateSchedules([
        ...new Set(claimed.map((delivery) => delivery.scheduleId)),
      ]);
      return;
    }

    const sendStarted = await this.markSendStarted(active, new Date());
    if (!sendStarted) {
      return;
    }

    const heartbeat = this.startLeaseHeartbeat(
      active.map((delivery) => delivery.id),
      active[0].claimId,
    );

    let responses: SendResponse[];
    try {
      const batchResponse = await this.firebase.sendEachForMulticast({
        tokens: active.map((delivery) => delivery.fcmToken.token),
        data: {
          type: 'REMINDER_SYNC',
          version: '1',
        },
        android: {
          ttl: 0,
          collapseKey: REMINDER_SYNC_COLLAPSE_KEY,
          priority: 'high',
        },
        apns: {
          headers: {
            'apns-expiration': '0',
            'apns-push-type': 'background',
            'apns-priority': '5',
            'apns-collapse-id': REMINDER_SYNC_COLLAPSE_KEY,
          },
          payload: {
            aps: {
              contentAvailable: true,
            },
          },
        },
      });
      responses = batchResponse.responses;
    } catch {
      await heartbeat.stop();
      await this.terminalizeAmbiguousDeliveries(active);
      await this.aggregateSchedules([
        ...new Set(active.map((delivery) => delivery.scheduleId)),
      ]);
      return;
    }

    const leaseStillOwned = await heartbeat.stop();
    if (!leaseStillOwned) {
      await this.terminalizeAmbiguousDeliveries(active);
      await this.aggregateSchedules([
        ...new Set(active.map((delivery) => delivery.scheduleId)),
      ]);
      return;
    }

    const responseCount = Math.min(active.length, responses.length);
    let persistedResponseCount = 0;
    try {
      for (let index = 0; index < responseCount; index += 1) {
        await this.persistSendResponse(
          active[index],
          responses[index],
          new Date(),
        );
        persistedResponseCount = index + 1;
      }
    } catch (error) {
      await this.terminalizeAmbiguousDeliveries(
        active.slice(persistedResponseCount),
      );
      await this.aggregateSchedules([
        ...new Set(active.map((delivery) => delivery.scheduleId)),
      ]);
      throw error;
    }

    if (responseCount < active.length) {
      await this.terminalizeAmbiguousDeliveries(active.slice(responseCount));
    }

    await this.aggregateSchedules([
      ...new Set(active.map((delivery) => delivery.scheduleId)),
    ]);
  }

  private async recoverStaleDeliveryLeases(now: Date): Promise<void> {
    const staleBefore = new Date(now.getTime() - DELIVERY_LEASE_MS);
    await this.prisma.notificationDelivery.updateMany({
      where: {
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        processingStartedAt: { lt: staleBefore },
        sendStartedAt: { not: null },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.UNKNOWN,
        failureReason: AMBIGUOUS_DELIVERY_OUTCOME_REASON,
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
    await this.prisma.notificationDelivery.updateMany({
      where: {
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        processingStartedAt: { lt: staleBefore },
        sendStartedAt: null,
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.PENDING,
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
    await this.prisma.notificationDelivery.updateMany({
      where: {
        status: NOTIFICATION_DELIVERY_STATUS.PENDING,
        sendStartedAt: { not: null },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.UNKNOWN,
        failureReason: AMBIGUOUS_DELIVERY_OUTCOME_REASON,
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
    await this.prisma.notificationDelivery.updateMany({
      where: {
        status: NOTIFICATION_DELIVERY_STATUS.PENDING,
        attemptCount: { gte: MAX_DELIVERY_ATTEMPTS },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.FAILED,
        failureReason: MAX_ATTEMPTS_FAILURE_CODE,
        claimId: null,
        processingStartedAt: null,
        sendStartedAt: null,
        nextAttemptAt: null,
      },
    });
  }

  private async materializeDueSchedules(now: Date): Promise<void> {
    const schedules = await this.prisma.notificationSchedule.findMany({
      where: {
        status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
        scheduledAt: { lte: now },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      take: MAX_SCHEDULES_MATERIALIZED_PER_TICK,
      select: { id: true },
    });

    for (const { id } of schedules) {
      await this.runSerializableTransaction(async (client) => {
        const claimed = await client.notificationSchedule.updateMany({
          where: {
            id,
            status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
            scheduledAt: { lte: now },
          },
          data: { status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING },
        });
        if (claimed.count !== 1) {
          return;
        }

        const schedule = await client.notificationSchedule.findUnique({
          where: { id },
          select: {
            id: true,
            taskId: true,
            userId: true,
            scheduledAt: true,
            user: { select: { notificationEnabled: true } },
            task: {
              select: {
                userId: true,
                startAt: true,
                status: true,
                notificationEnabled: true,
                deletedAt: true,
              },
            },
          },
        });

        if (
          !schedule ||
          !schedule.user.notificationEnabled ||
          schedule.task.userId !== schedule.userId ||
          schedule.scheduledAt.getTime() !== schedule.task.startAt.getTime() ||
          schedule.task.status !== TaskStatus.PENDING ||
          !schedule.task.notificationEnabled ||
          schedule.task.deletedAt !== null
        ) {
          await client.notificationSchedule.updateMany({
            where: {
              id,
              status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
            },
            data: {
              status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED,
              failureReason: null,
            },
          });
          return;
        }

        const tokens = await client.fcmToken.findMany({
          where: { userId: schedule.userId, revokedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true, updatedAt: true },
        });
        const uniqueTokens = [
          ...new Map(tokens.map((token) => [token.id, token])).values(),
        ];

        if (uniqueTokens.length === 0) {
          await client.notificationSchedule.updateMany({
            where: {
              id,
              status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
            },
            data: {
              status: NOTIFICATION_SCHEDULE_STATUS.FAILED,
              failureReason: NO_ACTIVE_DEVICE_REASON,
            },
          });
          return;
        }

        await client.notificationDelivery.createMany({
          data: uniqueTokens.map((token) => ({
            scheduleId: schedule.id,
            fcmTokenId: token.id,
            tokenUpdatedAt: token.updatedAt,
            status: NOTIFICATION_DELIVERY_STATUS.PENDING,
          })),
          skipDuplicates: true,
        });
      });
    }
  }

  private claimDueDeliveryBatch(now: Date): Promise<ClaimedDelivery[]> {
    const claimId = randomUUID();

    return this.runSerializableTransaction(async (client) => {
      const first = await client.notificationDelivery.findFirst({
        where: {
          status: NOTIFICATION_DELIVERY_STATUS.PENDING,
          attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
          sendStartedAt: null,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        select: { scheduleId: true },
      });
      if (!first) {
        return [];
      }

      const candidates = (
        await client.notificationDelivery.findMany({
          where: {
            scheduleId: first.scheduleId,
            status: NOTIFICATION_DELIVERY_STATUS.PENDING,
            attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
            sendStartedAt: null,
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
          take: MAX_DELIVERIES_PER_BATCH,
          select: this.deliveryCandidateSelect(),
        })
      ).slice(0, MAX_DELIVERIES_PER_BATCH) as DeliveryCandidate[];

      const claimedDeliveries: ClaimedDelivery[] = [];
      for (const candidate of candidates) {
        if (candidate.attemptCount >= MAX_DELIVERY_ATTEMPTS) {
          await client.notificationDelivery.updateMany({
            where: {
              id: candidate.id,
              status: NOTIFICATION_DELIVERY_STATUS.PENDING,
              attemptCount: { gte: MAX_DELIVERY_ATTEMPTS },
            },
            data: {
              status: NOTIFICATION_DELIVERY_STATUS.FAILED,
              failureReason: MAX_ATTEMPTS_FAILURE_CODE,
              claimId: null,
              processingStartedAt: null,
              sendStartedAt: null,
              nextAttemptAt: null,
            },
          });
          continue;
        }

        if (!this.isCandidateValid(candidate, now)) {
          await client.notificationDelivery.updateMany({
            where: {
              id: candidate.id,
              status: NOTIFICATION_DELIVERY_STATUS.PENDING,
            },
            data: {
              status: NOTIFICATION_DELIVERY_STATUS.CANCELLED,
              claimId: null,
              processingStartedAt: null,
              sendStartedAt: null,
              nextAttemptAt: null,
            },
          });
          continue;
        }

        const claimed = await client.notificationDelivery.updateMany({
          where: this.activeDeliveryWhere(candidate, {
            status: NOTIFICATION_DELIVERY_STATUS.PENDING,
          }),
          data: {
            status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
            claimId,
            processingStartedAt: now,
          },
        });
        if (claimed.count === 1) {
          claimedDeliveries.push({ ...candidate, claimId });
        }
      }

      return claimedDeliveries;
    });
  }

  private revalidateClaimedBatch(
    claimed: ClaimedDelivery[],
    now: Date,
  ): Promise<ClaimedDelivery[]> {
    return this.runSerializableTransaction(async (client) => {
      const validRows = (await client.notificationDelivery.findMany({
        where: {
          id: { in: claimed.map((delivery) => delivery.id) },
          status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
          attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
          claimId: claimed[0].claimId,
          sendStartedAt: null,
          schedule: {
            is: {
              status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
              scheduledAt: {
                equals: claimed[0].schedule.scheduledAt,
                lte: now,
              },
              user: { is: { notificationEnabled: true } },
              task: {
                is: {
                  status: TaskStatus.PENDING,
                  startAt: claimed[0].schedule.scheduledAt,
                  notificationEnabled: true,
                  deletedAt: null,
                },
              },
            },
          },
          fcmToken: { is: { revokedAt: null } },
        },
        select: { id: true, tokenUpdatedAt: true, fcmToken: true },
      })) as Array<{
        id: string;
        tokenUpdatedAt: Date;
        fcmToken: {
          userId: string;
          updatedAt: Date;
        };
      }>;

      const validIds = new Set(
        validRows
          .filter((row) => {
            const original = claimed.find((delivery) => delivery.id === row.id);
            return (
              original !== undefined &&
              row.fcmToken.userId === original.schedule.userId &&
              row.tokenUpdatedAt.getTime() ===
                row.fcmToken.updatedAt.getTime() &&
              row.tokenUpdatedAt.getTime() === original.tokenUpdatedAt.getTime()
            );
          })
          .map((row) => row.id),
      );
      const invalidIds = claimed
        .filter((delivery) => !validIds.has(delivery.id))
        .map((delivery) => delivery.id);

      if (invalidIds.length > 0) {
        await client.notificationDelivery.updateMany({
          where: {
            id: { in: invalidIds },
            status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
            claimId: claimed[0].claimId,
          },
          data: {
            status: NOTIFICATION_DELIVERY_STATUS.CANCELLED,
            claimId: null,
            processingStartedAt: null,
            sendStartedAt: null,
            nextAttemptAt: null,
          },
        });
      }

      return claimed.filter((delivery) => validIds.has(delivery.id));
    });
  }

  private startLeaseHeartbeat(
    deliveryIds: string[],
    claimId: string,
  ): LeaseHeartbeat {
    let stopped = false;
    let failed = false;
    let inFlight: Promise<void> | null = null;

    const heartbeat = (): void => {
      if (stopped || failed || inFlight) {
        return;
      }

      inFlight = this.prisma.notificationDelivery
        .updateMany({
          where: {
            id: { in: deliveryIds },
            status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
            claimId,
            sendStartedAt: { not: null },
          },
          data: { processingStartedAt: new Date() },
        })
        .then((result) => {
          if (result.count !== deliveryIds.length) {
            failed = true;
          }
        })
        .catch(() => {
          failed = true;
        })
        .finally(() => {
          inFlight = null;
        });
    };

    const timer = setInterval(heartbeat, DELIVERY_HEARTBEAT_MS);
    return {
      stop: async () => {
        stopped = true;
        clearInterval(timer);
        if (inFlight) {
          await inFlight;
        }
        return !failed;
      },
    };
  }

  private async persistSendResponse(
    delivery: ClaimedDelivery,
    response: SendResponse,
    now: Date,
  ): Promise<void> {
    if (response.success) {
      await this.prisma.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
          claimId: delivery.claimId,
          sendStartedAt: { not: null },
        },
        data: {
          status: NOTIFICATION_DELIVERY_STATUS.SENT,
          sentAt: now,
          failureReason: null,
          claimId: null,
          processingStartedAt: null,
          nextAttemptAt: null,
        },
      });
      return;
    }

    const explicitFailureCode = this.failureCode(response.error);
    const failureCode = this.sanitizeFailureCode(response.error);
    const nextAttemptCount = delivery.attemptCount + 1;
    const isInvalidToken =
      explicitFailureCode !== null &&
      INVALID_TOKEN_CODES.has(explicitFailureCode);
    const shouldRetry =
      explicitFailureCode !== null &&
      TRANSIENT_FAILURE_CODES.has(explicitFailureCode) &&
      nextAttemptCount < MAX_DELIVERY_ATTEMPTS;
    const data: Prisma.NotificationDeliveryUpdateManyMutationInput = {
      status: shouldRetry
        ? NOTIFICATION_DELIVERY_STATUS.PENDING
        : NOTIFICATION_DELIVERY_STATUS.FAILED,
      attemptCount: { increment: 1 },
      nextAttemptAt: shouldRetry
        ? this.retryAt(response.error, now, nextAttemptCount)
        : null,
      failureReason: failureCode,
      claimId: null,
      processingStartedAt: null,
      ...(shouldRetry && { sendStartedAt: null }),
    };

    if (isInvalidToken) {
      await this.runSerializableTransaction(async (client) => {
        const updated = await client.notificationDelivery.updateMany({
          where: {
            id: delivery.id,
            status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
            claimId: delivery.claimId,
            sendStartedAt: { not: null },
          },
          data,
        });
        if (updated.count !== 1) {
          return;
        }

        await client.fcmToken.updateMany({
          where: {
            id: delivery.fcmTokenId,
            userId: delivery.schedule.userId,
            revokedAt: null,
            updatedAt: delivery.tokenUpdatedAt,
          },
          data: { revokedAt: now },
        });
      });
      return;
    }

    await this.prisma.notificationDelivery.updateMany({
      where: {
        id: delivery.id,
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: delivery.claimId,
        sendStartedAt: { not: null },
      },
      data,
    });
  }

  private async markSendStarted(
    deliveries: ClaimedDelivery[],
    sendStartedAt: Date,
  ): Promise<boolean> {
    try {
      await this.runSerializableTransaction(async (client) => {
        const marked = await client.notificationDelivery.updateMany({
          where: {
            id: { in: deliveries.map((delivery) => delivery.id) },
            status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
            claimId: deliveries[0].claimId,
            sendStartedAt: null,
          },
          data: { sendStartedAt },
        });
        if (marked.count !== deliveries.length) {
          throw new SendStartClaimMismatchError();
        }
      });
      return true;
    } catch (error) {
      if (error instanceof SendStartClaimMismatchError) {
        return false;
      }
      throw error;
    }
  }

  private async terminalizeAmbiguousDeliveries(
    deliveries: ClaimedDelivery[],
  ): Promise<void> {
    if (deliveries.length === 0) {
      return;
    }

    await this.prisma.notificationDelivery.updateMany({
      where: {
        id: { in: deliveries.map((delivery) => delivery.id) },
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
        claimId: deliveries[0].claimId,
        sendStartedAt: { not: null },
      },
      data: {
        status: NOTIFICATION_DELIVERY_STATUS.UNKNOWN,
        failureReason: AMBIGUOUS_DELIVERY_OUTCOME_REASON,
        claimId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
  }

  private async aggregateSchedules(scheduleIds: string[]): Promise<void> {
    for (const scheduleId of scheduleIds) {
      const deliveries = await this.prisma.notificationDelivery.findMany({
        where: { scheduleId },
        select: { status: true },
      });
      if (
        deliveries.length === 0 ||
        deliveries.some((delivery) =>
          NOTIFICATION_NONTERMINAL_STATUSES.includes(
            delivery.status as (typeof NOTIFICATION_NONTERMINAL_STATUSES)[number],
          ),
        )
      ) {
        continue;
      }

      const sent = deliveries.some(
        (delivery) => delivery.status === NOTIFICATION_DELIVERY_STATUS.SENT,
      );
      await this.prisma.notificationSchedule.updateMany({
        where: {
          id: scheduleId,
          status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
        },
        data: sent
          ? {
              status: NOTIFICATION_SCHEDULE_STATUS.SENT,
              sentAt: new Date(),
              failureReason: null,
            }
          : {
              status: NOTIFICATION_SCHEDULE_STATUS.FAILED,
              failureReason: ALL_DELIVERIES_FAILED_REASON,
            },
      });
    }
  }

  private deliveryCandidateSelect() {
    return {
      id: true,
      scheduleId: true,
      fcmTokenId: true,
      tokenUpdatedAt: true,
      attemptCount: true,
      fcmToken: {
        select: {
          token: true,
          userId: true,
          updatedAt: true,
          revokedAt: true,
        },
      },
      schedule: {
        select: {
          id: true,
          taskId: true,
          userId: true,
          scheduledAt: true,
          status: true,
          user: { select: { notificationEnabled: true } },
          task: {
            select: {
              userId: true,
              startAt: true,
              status: true,
              notificationEnabled: true,
              deletedAt: true,
            },
          },
        },
      },
    } as const;
  }

  private isCandidateValid(candidate: DeliveryCandidate, now: Date): boolean {
    return (
      candidate.schedule.status === NOTIFICATION_SCHEDULE_STATUS.PROCESSING &&
      candidate.schedule.scheduledAt.getTime() <= now.getTime() &&
      candidate.schedule.scheduledAt.getTime() ===
        candidate.schedule.task.startAt.getTime() &&
      candidate.schedule.user.notificationEnabled &&
      candidate.schedule.task.userId === candidate.schedule.userId &&
      candidate.schedule.task.status === TaskStatus.PENDING &&
      candidate.schedule.task.notificationEnabled &&
      candidate.schedule.task.deletedAt === null &&
      candidate.fcmToken.userId === candidate.schedule.userId &&
      candidate.fcmToken.revokedAt === null &&
      candidate.fcmToken.updatedAt.getTime() ===
        candidate.tokenUpdatedAt.getTime()
    );
  }

  private activeDeliveryWhere(
    candidate: DeliveryCandidate,
    state: {
      status: string;
      claimId?: string;
    },
  ): Prisma.NotificationDeliveryWhereInput {
    return {
      id: candidate.id,
      status: state.status,
      attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
      sendStartedAt: null,
      ...(state.claimId !== undefined && { claimId: state.claimId }),
      schedule: {
        is: {
          id: candidate.scheduleId,
          userId: candidate.schedule.userId,
          status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
          taskId: candidate.schedule.taskId,
          scheduledAt: candidate.schedule.scheduledAt,
          user: { is: { notificationEnabled: true } },
          task: {
            is: {
              userId: candidate.schedule.userId,
              startAt: candidate.schedule.scheduledAt,
              status: TaskStatus.PENDING,
              notificationEnabled: true,
              deletedAt: null,
            },
          },
        },
      },
      fcmToken: {
        is: {
          id: candidate.fcmTokenId,
          userId: candidate.schedule.userId,
          revokedAt: null,
          updatedAt: candidate.tokenUpdatedAt,
        },
      },
    };
  }

  private sanitizeFailureCode(error: unknown): string {
    const code = this.failureCode(error);
    if (code !== null && ALLOWED_FAILURE_CODES.has(code)) {
      return code;
    }
    return UNKNOWN_FAILURE_CODE;
  }

  private failureCode(error: unknown): string | null {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      return error.code;
    }
    return null;
  }

  private retryDelayMs(attemptCount: number): number {
    return Math.min(
      BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attemptCount - 1),
      MAX_RETRY_DELAY_MS,
    );
  }

  private retryAt(error: unknown, now: Date, attemptCount: number): Date {
    const exposedRetryAt = this.parseRetryAfter(error, now);
    if (exposedRetryAt) {
      return exposedRetryAt;
    }
    return new Date(now.getTime() + this.retryDelayMs(attemptCount));
  }

  private parseRetryAfter(error: unknown, now: Date): Date | null {
    if (!this.isRecord(error)) {
      return null;
    }

    const direct = this.parseRetryAfterValue(error.retryAfter, now);
    if (direct) {
      return direct;
    }

    if (
      typeof error.retryAfterMs === 'number' &&
      Number.isFinite(error.retryAfterMs) &&
      error.retryAfterMs > 0
    ) {
      return this.futureRetryDate(now.getTime() + error.retryAfterMs, now);
    }

    const directHeader = this.retryAfterHeader(error.headers);
    if (directHeader !== undefined) {
      const parsedHeader = this.parseRetryAfterValue(directHeader, now);
      if (parsedHeader) {
        return parsedHeader;
      }
    }

    if (this.isRecord(error.response)) {
      const responseHeader = this.retryAfterHeader(error.response.headers);
      if (responseHeader !== undefined) {
        const parsedHeader = this.parseRetryAfterValue(responseHeader, now);
        if (parsedHeader) {
          return parsedHeader;
        }
      }
    }

    return null;
  }

  private retryAfterHeader(headers: unknown): unknown {
    if (!this.isRecord(headers)) {
      return undefined;
    }
    return headers['retry-after'] ?? headers['Retry-After'];
  }

  private parseRetryAfterValue(value: unknown, now: Date): Date | null {
    if (value instanceof Date) {
      return this.futureRetryDate(value.getTime(), now);
    }

    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return this.futureRetryDate(now.getTime() + value * 1000, now);
    }

    if (typeof value !== 'string' || value.trim() === '') {
      return null;
    }

    const normalized = value.trim();
    if (/^\d+$/.test(normalized)) {
      return this.futureRetryDate(
        now.getTime() + Number(normalized) * 1000,
        now,
      );
    }
    return this.futureRetryDate(Date.parse(normalized), now);
  }

  private futureRetryDate(timestamp: number, now: Date): Date | null {
    if (!Number.isFinite(timestamp) || timestamp <= now.getTime()) {
      return null;
    }
    const retryAt = new Date(timestamp);
    return Number.isFinite(retryAt.getTime()) ? retryAt : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private async runSerializableTransaction<T>(
    operation: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let retry = 0; ; retry += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !this.isRetryableTransactionConflict(error) ||
          retry >= MAX_SERIALIZABLE_TRANSACTION_RETRIES
        ) {
          throw error;
        }
      }
    }
  }

  private isRetryableTransactionConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }
}
