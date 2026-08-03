import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import { RevokeFcmTokenDto } from './dto/revoke-fcm-token.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerFcmToken(userId: string, dto: RegisterFcmTokenDto) {
    const now = new Date();

    return this.prisma.fcmToken.upsert({
      where: { token: dto.token },
      create: {
        token: dto.token,
        userId,
        platform: dto.platform,
        deviceId: dto.deviceId ?? null,
        lastSeenAt: now,
        revokedAt: null,
      },
      update: {
        userId,
        platform: dto.platform,
        deviceId: dto.deviceId ?? null,
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
  }

  async revokeFcmToken(userId: string, dto: RevokeFcmTokenDto): Promise<void> {
    const now = new Date();

    await this.prisma.fcmToken.updateMany({
      where: { token: dto.token, userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
