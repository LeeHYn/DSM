import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationMode, type Task } from '@prisma/client';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export type FcmSendResult = {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
};

@Injectable()
export class FcmAdminService {
  private readonly logger = new Logger(FcmAdminService.name);
  private app: App | null = null;

  constructor(private readonly configService: ConfigService) {}

  async sendTaskReminder(
    tokens: string[],
    task: Task,
    notificationMode: NotificationMode,
  ): Promise<FcmSendResult> {
    if (tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const app = this.getApp();
    if (!app) {
      this.logger.warn('Firebase Admin credentials are not configured');
      throw new Error('FCM credentials are not configured');
    }

    const response = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: {
        title: 'Task reminder',
        body: task.title,
      },
      data: {
        type: 'TASK_REMINDER',
        taskId: task.id,
        notificationMode,
      },
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens: response.responses
        .map((item, index) =>
          this.isInvalidTokenError(item.error?.code) ? tokens[index] : null,
        )
        .filter((token): token is string => token !== null),
    };
  }

  private getApp(): App | null {
    if (this.app) {
      return this.app;
    }

    const apps = getApps();
    if (apps.length > 0) {
      this.app = apps[0] ?? null;
      return this.app;
    }

    const projectId = this.configService.get<string>('FCM_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FCM_CLIENT_EMAIL');
    const privateKey = this.configService
      .get<string>('FCM_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      return null;
    }

    this.app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

    return this.app;
  }

  private isInvalidTokenError(code: string | undefined): boolean {
    return (
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered'
    );
  }
}
