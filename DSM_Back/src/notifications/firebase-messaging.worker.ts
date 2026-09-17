import { parentPort, workerData } from 'node:worker_threads';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getMessaging, type MulticastMessage } from 'firebase-admin/messaging';
import { firebaseRetryAfterMs } from './firebase-retry-after';

interface SendJob {
  projectId: string;
  message: MulticastMessage;
  dryRun?: boolean;
}

async function send(): Promise<void> {
  const job = workerData as SendJob;
  try {
    const app = initializeApp({
      credential: applicationDefault(),
      projectId: job.projectId,
    });
    const result = await getMessaging(app).sendEachForMulticast(
      job.message,
      job.dryRun,
    );
    // Transfer status, classification and a numeric retry delay only. Raw SDK
    // messages can include request details and must never cross this boundary.
    parentPort?.postMessage({
      ok: true,
      response: {
        successCount: result.successCount,
        failureCount: result.failureCount,
        responses: result.responses.map((response) => ({
          success: response.success,
          ...(response.messageId ? { messageId: response.messageId } : {}),
          ...(response.error
            ? {
                error: {
                  code: response.error.code,
                  retryAfterMs: firebaseRetryAfterMs(response.error),
                },
              }
            : {}),
        })),
      },
    });
  } catch {
    parentPort?.postMessage({ ok: false });
  }
}

void send();
