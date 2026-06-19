import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type SocialProvider, type User, Prisma } from '@prisma/client';
import { NOTIFICATION_SCHEDULE_STATUS } from '../notifications/notification-events';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';

export type SocialAccountProvider = {
  provider: SocialProvider;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.nickname !== undefined && { nickname: dto.nickname }),
          ...(dto.profileImageUrl !== undefined && {
            profileImageUrl: dto.profileImageUrl,
          }),
        },
      });
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  async updateNotificationSettings(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ): Promise<User> {
    try {
      const userUpdate = this.prisma.user.update({
        where: { id: userId },
        data: { notificationEnabled: dto.notificationEnabled },
      });

      if (dto.notificationEnabled) {
        return await userUpdate;
      }

      const [user] = await this.prisma.$transaction([
        userUpdate,
        this.prisma.notificationSchedule.updateMany({
          where: {
            userId,
            status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
          },
          data: {
            status: NOTIFICATION_SCHEDULE_STATUS.CANCELLED,
            failureReason: null,
          },
        }),
      ]);

      return user;
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  getSocialAccounts(userId: string): Promise<SocialAccountProvider[]> {
    return this.prisma.socialAccount.findMany({
      where: { userId },
      select: { provider: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private mapKnownError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException('Nickname already exists');
      }
      if (error.code === 'P2025') {
        return new NotFoundException('User not found');
      }
    }
    return error;
  }
}
