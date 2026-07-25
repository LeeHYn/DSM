import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import {
  getMessaging,
  type BatchResponse,
  type Messaging,
  type MulticastMessage,
} from 'firebase-admin/messaging';

const DEFAULT_FIREBASE_APP_NAME = '[DEFAULT]';

@Injectable()
export class FirebaseMessagingProvider {
  private readonly messaging: Messaging | null;

  constructor(private readonly configService: ConfigService) {
    const enabled =
      this.configService.get<boolean>('FCM_DISPATCH_ENABLED') ?? false;

    if (!enabled) {
      this.messaging = null;
      return;
    }

    const projectId = this.configService.getOrThrow<string>('FCM_PROJECT_ID');
    const defaultApp = this.findDefaultApp();

    if (defaultApp && defaultApp.options.projectId !== projectId) {
      throw new Error(
        'Firebase default app project ID does not match FCM_PROJECT_ID',
      );
    }

    const app =
      defaultApp ??
      initializeApp({
        credential: applicationDefault(),
        projectId,
      });

    this.messaging = getMessaging(app);
  }

  isEnabled(): boolean {
    return this.messaging !== null;
  }

  sendEachForMulticast(
    message: MulticastMessage,
    dryRun?: boolean,
  ): Promise<BatchResponse> {
    if (!this.messaging) {
      throw new Error('Firebase messaging dispatch is disabled');
    }

    return this.messaging.sendEachForMulticast(message, dryRun);
  }

  private findDefaultApp(): App | undefined {
    return getApps().find((app) => app.name === DEFAULT_FIREBASE_APP_NAME);
  }
}
