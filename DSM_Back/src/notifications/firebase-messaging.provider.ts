import { Injectable } from '@nestjs/common';
import { firebaseRetryAfterMs } from './firebase-retry-after';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
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
const WORKER_DEADLINE_MS = 25_000;
const MAX_WORKERS = 2;
const WORKER_FAILURE = 'Firebase messaging worker failed';

@Injectable()
export class FirebaseMessagingProvider {
  private readonly messaging: Messaging | null;
  private readonly projectId: string | null;
  private activeWorkers = 0;

  constructor(private readonly configService: ConfigService) {
    const enabled =
      this.configService.get<boolean>('FCM_DISPATCH_ENABLED') ?? false;

    if (!enabled) {
      this.messaging = null;
      this.projectId = null;
      return;
    }

    const projectId = this.configService.getOrThrow<string>('FCM_PROJECT_ID');
    this.projectId = projectId;
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

    if (this.activeWorkers >= MAX_WORKERS) {
      return Promise.reject(
        new Error('Firebase messaging worker capacity exceeded'),
      );
    }

    let worker: Worker;
    try {
      worker = new Worker(join(__dirname, 'firebase-messaging.worker.js'), {
        workerData: { projectId: this.projectId, message, dryRun },
        stdout: true,
        stderr: true,
      });
    } catch {
      return Promise.reject(new Error(WORKER_FAILURE));
    }
    this.activeWorkers++;
    const expectedCount = message.tokens.length;

    return new Promise<BatchResponse>((resolve, reject) => {
      let outcome: BatchResponse | Error | undefined;
      let stopping = false;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.activeWorkers--;
        if (!outcome || outcome instanceof Error) {
          reject(outcome ?? new Error(WORKER_FAILURE));
        } else {
          resolve(outcome);
        }
      };
      const stop = (result: BatchResponse | Error) => {
        if (stopping || finished) return;
        stopping = true;
        outcome = result;
        clearTimeout(timer);
        // terminate() fulfills only after exit. Keep capacity if termination
        // fails; the exit listener remains the authoritative cleanup signal.
        void worker.terminate().then(finish, () => {
          if (!finished) outcome = new Error(WORKER_FAILURE);
        });
      };
      const timer = setTimeout(
        () => stop(new Error('Firebase messaging worker timed out')),
        WORKER_DEADLINE_MS,
      );
      worker.on('message', (reply: unknown) => {
        if (stopping || finished) return;
        stop(
          this.readWorkerResponse(reply, expectedCount) ??
            new Error(WORKER_FAILURE),
        );
      });
      worker.on('error', () => stop(new Error(WORKER_FAILURE)));
      worker.on('messageerror', () => stop(new Error(WORKER_FAILURE)));
      worker.once('exit', finish);
      // Consume SDK output without forwarding credentials or token details.
      worker.stdout.resume();
      worker.stderr.resume();
    });
  }

  private readWorkerResponse(
    reply: unknown,
    expectedCount: number,
  ): BatchResponse | null {
    if (!this.isRecord(reply) || reply.ok !== true) return null;
    const batch = reply.response;
    if (
      !this.isRecord(batch) ||
      !Array.isArray(batch.responses) ||
      batch.responses.length !== expectedCount
    ) {
      return null;
    }
    const responses: BatchResponse['responses'] = [];
    for (const item of batch.responses as unknown[]) {
      if (!this.isRecord(item)) return null;
      if (item.success === true && typeof item.messageId === 'string') {
        responses.push({ success: true, messageId: item.messageId });
      } else if (
        item.success === false &&
        this.isRecord(item.error) &&
        typeof item.error.code === 'string' &&
        /^messaging\/[a-z-]{1,100}$/.test(item.error.code)
      ) {
        const code = item.error.code;
        const message = WORKER_FAILURE;
        const retryAfterMs = firebaseRetryAfterMs({
          retryAfterMs: item.error.retryAfterMs,
        });
        responses.push({
          success: false,
          error: {
            name: 'FirebaseError',
            code,
            message,
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
            hasCode: (candidate: string) =>
              candidate === code || `messaging/${candidate}` === code,
            toJSON: () => ({ code, message }),
          },
        });
      } else {
        return null;
      }
    }
    const successCount = responses.filter((item) => item.success).length;
    const failureCount = responses.length - successCount;
    if (
      batch.successCount !== successCount ||
      batch.failureCount !== failureCount
    ) {
      return null;
    }
    return { successCount, failureCount, responses };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private findDefaultApp(): App | undefined {
    return getApps().find((app) => app.name === DEFAULT_FIREBASE_APP_NAME);
  }
}
