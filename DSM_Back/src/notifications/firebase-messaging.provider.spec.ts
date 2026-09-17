import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
  type Credential,
} from 'firebase-admin/app';
import {
  getMessaging,
  type BatchResponse,
  type Messaging,
  type MulticastMessage,
} from 'firebase-admin/messaging';
import { FirebaseMessagingProvider } from './firebase-messaging.provider';

jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(),
  getApps: jest.fn(),
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(),
}));

jest.mock('node:worker_threads', () => ({ Worker: jest.fn() }));

class SendWorkerMock extends EventEmitter {
  readonly stdout = { resume: jest.fn() };
  readonly stderr = { resume: jest.fn() };
  private resolveTermination?: (code: number) => void;
  readonly terminate = jest.fn(
    () =>
      new Promise<number>((resolve) => {
        this.resolveTermination = resolve;
      }),
  );

  exit(code = 1) {
    this.emit('exit', code);
    this.resolveTermination?.(code);
  }
}

const applicationDefaultMock = jest.mocked(applicationDefault);
const getAppsMock = jest.mocked(getApps);
const initializeAppMock = jest.mocked(initializeApp);
const getMessagingMock = jest.mocked(getMessaging);

const projectId = 'test-firebase-project';
const credential = {
  getAccessToken: jest.fn(),
} as unknown as Credential;

const makeApp = (
  appProjectId: string | undefined,
  name = '[DEFAULT]',
): App => ({
  name,
  options: { projectId: appProjectId },
});

const makeConfigMock = (
  enabled: boolean,
  configuredProjectId: string | null = projectId,
) => ({
  get: jest.fn((key: string) =>
    key === 'FCM_DISPATCH_ENABLED' ? enabled : undefined,
  ),
  getOrThrow: jest.fn((key: string) => {
    if (key === 'FCM_PROJECT_ID' && configuredProjectId !== null) {
      return configuredProjectId;
    }

    throw new Error(`Missing configuration: ${key}`);
  }),
});

describe('FirebaseMessagingProvider', () => {
  let workers: SendWorkerMock[];
  let messagingMock: {
    sendEachForMulticast: jest.MockedFunction<
      (message: MulticastMessage, dryRun?: boolean) => Promise<BatchResponse>
    >;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    workers = [];
    jest.mocked(Worker).mockImplementation(() => {
      const worker = new SendWorkerMock();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    messagingMock = {
      sendEachForMulticast: jest.fn(),
    };
    applicationDefaultMock.mockReturnValue(credential);
    getAppsMock.mockReturnValue([]);
    initializeAppMock.mockReturnValue(makeApp(projectId));
    getMessagingMock.mockReturnValue(messagingMock as unknown as Messaging);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('stays disabled without touching Firebase app, credentials, or messaging', () => {
    const config = makeConfigMock(false);
    const provider = new FirebaseMessagingProvider(
      config as unknown as ConfigService,
    );

    expect(provider.isEnabled()).toBe(false);
    expect(config.getOrThrow).not.toHaveBeenCalled();
    expect(getAppsMock).not.toHaveBeenCalled();
    expect(applicationDefaultMock).not.toHaveBeenCalled();
    expect(initializeAppMock).not.toHaveBeenCalled();
    expect(getMessagingMock).not.toHaveBeenCalled();
    expect(() =>
      provider.sendEachForMulticast({ tokens: ['device-token'] }),
    ).toThrow('Firebase messaging dispatch is disabled');
  });

  it('initializes the default app once with ADC and the configured project ID', () => {
    const config = makeConfigMock(true);
    const initializedApp = makeApp(projectId);
    initializeAppMock.mockReturnValue(initializedApp);

    const provider = new FirebaseMessagingProvider(
      config as unknown as ConfigService,
    );

    expect(provider.isEnabled()).toBe(true);
    expect(config.getOrThrow).toHaveBeenCalledTimes(1);
    expect(config.getOrThrow).toHaveBeenCalledWith('FCM_PROJECT_ID');
    expect(applicationDefaultMock).toHaveBeenCalledTimes(1);
    expect(initializeAppMock).toHaveBeenCalledTimes(1);
    expect(initializeAppMock).toHaveBeenCalledWith({
      credential,
      projectId,
    });
    expect(getMessagingMock).toHaveBeenCalledTimes(1);
    expect(getMessagingMock).toHaveBeenCalledWith(initializedApp);
  });

  it('reuses a matching default app without creating credentials or another app', () => {
    const matchingDefaultApp = makeApp(projectId);
    getAppsMock.mockReturnValue([
      makeApp('named-project', 'named-app'),
      matchingDefaultApp,
    ]);

    const provider = new FirebaseMessagingProvider(
      makeConfigMock(true) as unknown as ConfigService,
    );

    expect(provider.isEnabled()).toBe(true);
    expect(applicationDefaultMock).not.toHaveBeenCalled();
    expect(initializeAppMock).not.toHaveBeenCalled();
    expect(getMessagingMock).toHaveBeenCalledTimes(1);
    expect(getMessagingMock).toHaveBeenCalledWith(matchingDefaultApp);
  });

  it('fails startup when the default app belongs to another project', () => {
    getAppsMock.mockReturnValue([makeApp('different-project')]);

    expect(
      () =>
        new FirebaseMessagingProvider(
          makeConfigMock(true) as unknown as ConfigService,
        ),
    ).toThrow('Firebase default app project ID does not match FCM_PROJECT_ID');
    expect(applicationDefaultMock).not.toHaveBeenCalled();
    expect(initializeAppMock).not.toHaveBeenCalled();
    expect(getMessagingMock).not.toHaveBeenCalled();
  });

  it('fails startup before Firebase initialization when the project ID is missing', () => {
    expect(
      () =>
        new FirebaseMessagingProvider(
          makeConfigMock(true, null) as unknown as ConfigService,
        ),
    ).toThrow('Missing configuration: FCM_PROJECT_ID');
    expect(getAppsMock).not.toHaveBeenCalled();
    expect(applicationDefaultMock).not.toHaveBeenCalled();
    expect(initializeAppMock).not.toHaveBeenCalled();
    expect(getMessagingMock).not.toHaveBeenCalled();
  });

  it('preserves initialization failures', () => {
    const initializationError = new Error('ADC initialization failed');
    initializeAppMock.mockImplementation(() => {
      throw initializationError;
    });

    expect(
      () =>
        new FirebaseMessagingProvider(
          makeConfigMock(true) as unknown as ConfigService,
        ),
    ).toThrow(initializationError);
    expect(getMessagingMock).not.toHaveBeenCalled();
  });

  it('sends in an isolated worker and releases the response only after exit', async () => {
    const response: BatchResponse = {
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true, messageId: 'message-id' }],
    };
    const message: MulticastMessage = {
      tokens: ['device-token'],
      notification: {
        title: 'Reminder',
        body: 'You have a scheduled task.',
      },
    };
    const provider = new FirebaseMessagingProvider(
      makeConfigMock(true) as unknown as ConfigService,
    );
    const settled = jest.fn();
    const pending = provider.sendEachForMulticast(message, true);
    void pending.then(settled);
    expect(Worker).toHaveBeenCalledWith(
      join(__dirname, 'firebase-messaging.worker.js'),
      {
        workerData: { projectId, message, dryRun: true },
        stdout: true,
        stderr: true,
      },
    );
    expect(messagingMock.sendEachForMulticast).not.toHaveBeenCalled();
    expect(workers[0].stdout.resume).toHaveBeenCalledTimes(1);
    expect(workers[0].stderr.resume).toHaveBeenCalledTimes(1);
    workers[0].emit('message', { ok: true, response });
    await Promise.resolve();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    workers[0].exit();
    await expect(pending).resolves.toEqual(response);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['error', 'messageerror', 'failure reply'])(
    'sanitizes %s and waits for worker exit without logging token data',
    async (event) => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const consoleWarn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const message: MulticastMessage = {
        tokens: ['sensitive-device-token'],
      };
      const provider = new FirebaseMessagingProvider(
        makeConfigMock(true) as unknown as ConfigService,
      );
      const pending = provider.sendEachForMulticast(message);
      const rejected = expect(pending).rejects.toThrow(
        'Firebase messaging worker failed',
      );
      if (event === 'failure reply') {
        workers[0].emit('message', {
          ok: false,
          error: 'sensitive-device-token',
        });
      } else {
        workers[0].emit(event, new Error('sensitive-device-token'));
      }
      expect(workers[0].terminate).toHaveBeenCalledTimes(1);
      workers[0].exit();
      await rejected;
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();

      consoleError.mockRestore();
      consoleWarn.mockRestore();
    },
  );

  it('terminates two hung sends at 25 seconds and restores capacity only after exit', async () => {
    const provider = new FirebaseMessagingProvider(
      makeConfigMock(true) as unknown as ConfigService,
    );
    const message = { tokens: ['synthetic-token'] };
    const first = provider.sendEachForMulticast(message);
    const second = provider.sendEachForMulticast(message);
    const rejected = Promise.all([
      expect(first).rejects.toThrow('Firebase messaging worker timed out'),
      expect(second).rejects.toThrow('Firebase messaging worker timed out'),
    ]);
    await expect(provider.sendEachForMulticast(message)).rejects.toThrow(
      'Firebase messaging worker capacity exceeded',
    );
    expect(workers).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(24_999);
    expect(workers[0].terminate).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(workers[1].terminate).toHaveBeenCalledTimes(1);
    await expect(provider.sendEachForMulticast(message)).rejects.toThrow(
      'Firebase messaging worker capacity exceeded',
    );
    workers[0].exit();
    workers[1].exit();
    await rejected;
    const next = provider.sendEachForMulticast(message);
    expect(workers).toHaveLength(3);
    workers[2].emit('message', {
      ok: true,
      response: {
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true, messageId: 'id' }],
      },
    });
    workers[2].exit();
    await expect(next).resolves.toMatchObject({ successCount: 1 });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ignores a late response after timeout and completes only once', async () => {
    const provider = new FirebaseMessagingProvider(
      makeConfigMock(true) as unknown as ConfigService,
    );
    const pending = provider.sendEachForMulticast({
      tokens: ['synthetic-token'],
    });
    const rejected = expect(pending).rejects.toThrow(
      'Firebase messaging worker timed out',
    );
    await jest.advanceTimersByTimeAsync(25_000);
    workers[0].emit('message', {
      ok: true,
      response: {
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true, messageId: 'id' }],
      },
    });
    workers[0].emit('error', new Error('late error'));
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    workers[0].exit();
    await rejected;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('retains capacity after termination rejects until the worker actually exits', async () => {
    const provider = new FirebaseMessagingProvider(
      makeConfigMock(true) as unknown as ConfigService,
    );
    const message = { tokens: ['synthetic-token'] };
    const first = provider.sendEachForMulticast(message);
    const second = provider.sendEachForMulticast(message);
    const rejected = Promise.all([
      expect(first).rejects.toThrow('Firebase messaging worker failed'),
      expect(second).rejects.toThrow('Firebase messaging worker failed'),
    ]);
    workers[0].terminate.mockRejectedValueOnce(new Error('termination failed'));
    workers[0].emit('error', new Error('worker error'));
    await Promise.resolve();
    await expect(provider.sendEachForMulticast(message)).rejects.toThrow(
      'Firebase messaging worker capacity exceeded',
    );
    expect(workers).toHaveLength(2);
    workers[0].exit();
    workers[1].exit();
    await rejected;
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([0, 1])(
    'rejects unexpected exit %s without a response',
    async (exitCode) => {
      const provider = new FirebaseMessagingProvider(
        makeConfigMock(true) as unknown as ConfigService,
      );
      const pending = provider.sendEachForMulticast({
        tokens: ['synthetic-token'],
      });
      const rejected = expect(pending).rejects.toThrow(
        'Firebase messaging worker failed',
      );
      workers[0].exit(exitCode);
      await rejected;
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('preserves per-device failure codes but discards raw SDK details', async () => {
    const provider = new FirebaseMessagingProvider(
      makeConfigMock(true) as unknown as ConfigService,
    );
    const pending = provider.sendEachForMulticast({
      tokens: ['synthetic-success', 'synthetic-invalid', 'synthetic-retry'],
    });
    workers[0].emit('message', {
      ok: true,
      response: {
        successCount: 1,
        failureCount: 2,
        responses: [
          { success: true, messageId: 'synthetic-message-id' },
          {
            success: false,
            error: {
              code: 'messaging/registration-token-not-registered',
              message: 'sensitive-device-token',
            },
          },
          {
            success: false,
            error: {
              code: 'messaging/server-unavailable',
              retryAfterMs: 7_200_000,
            },
          },
        ],
      },
    });
    workers[0].exit();
    const response = await pending;
    expect(response.responses[0].messageId).toBe('synthetic-message-id');
    expect(response.responses[1].error?.code).toBe(
      'messaging/registration-token-not-registered',
    );
    expect(response.responses[2].error?.code).toBe(
      'messaging/server-unavailable',
    );
    expect(response.responses[2].error).toHaveProperty(
      'retryAfterMs',
      7_200_000,
    );
    expect(JSON.stringify(response)).not.toContain('sensitive-device-token');
  });

  it('sanitizes synchronous worker startup failure and returns its capacity', async () => {
    jest.mocked(Worker).mockImplementationOnce(() => {
      throw new Error('sensitive startup detail');
    });
    const provider = new FirebaseMessagingProvider(
      makeConfigMock(true) as unknown as ConfigService,
    );
    await expect(
      provider.sendEachForMulticast({ tokens: ['synthetic-token'] }),
    ).rejects.toThrow('Firebase messaging worker failed');
    const pending = provider.sendEachForMulticast({
      tokens: ['synthetic-token'],
    });
    const rejected = expect(pending).rejects.toThrow(
      'Firebase messaging worker failed',
    );
    workers[0].exit();
    await rejected;
  });

  it.each([
    null,
    { ok: true },
    { ok: true, response: { successCount: 0, failureCount: 0, responses: [] } },
  ])('rejects malformed worker response %j', async (reply) => {
    const provider = new FirebaseMessagingProvider(
      makeConfigMock(true) as unknown as ConfigService,
    );
    const pending = provider.sendEachForMulticast({
      tokens: ['synthetic-token'],
    });
    const rejected = expect(pending).rejects.toThrow(
      'Firebase messaging worker failed',
    );
    workers[0].emit('message', reply);
    workers[0].exit();
    await rejected;
  });
});
