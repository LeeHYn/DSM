import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type FcmToken } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import type { RevokeFcmTokenDto } from './dto/revoke-fcm-token.dto';

const MAX_SERIALIZABLE_TRANSACTION_RETRIES = 2;

export type RegisteredFcmToken = Pick<
  FcmToken,
  'id' | 'platform' | 'deviceId' | 'lastSeenAt' | 'revokedAt'
>;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  register(
    userId: string,
    dto: RegisterFcmTokenDto,
  ): Promise<RegisteredFcmToken> {
    const now = new Date();
    const deviceId = dto.deviceId ?? null;

    return this.runSerializableTransaction(async (client) => {
      const existing = await client.fcmToken.findUnique({
        where: { token: dto.token },
        select: { userId: true },
      });

      if (existing && existing.userId !== userId) {
        throw new ConflictException(
          'FCM token is already registered to another user',
        );
      }

      return client.fcmToken.upsert({
        where: { token: dto.token },
        create: {
          token: dto.token,
          userId,
          platform: dto.platform,
          deviceId,
          lastSeenAt: now,
          revokedAt: null,
        },
        update: {
          platform: dto.platform,
          deviceId,
          lastSeenAt: now,
          revokedAt: null,
        },
        select: {
          id: true,
          platform: true,
          deviceId: true,
          lastSeenAt: true,
          revokedAt: true,
        },
      });
    });
  }

  async revoke(userId: string, dto: RevokeFcmTokenDto): Promise<void> {
    await this.prisma.fcmToken.updateMany({
      where: {
        token: dto.token,
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Runs DB-only mutations at Serializable isolation. A P2034 conflict reruns
   * the complete callback at most twice (three total attempts).
   */
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
