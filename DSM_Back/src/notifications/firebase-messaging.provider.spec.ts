import { ConfigService } from '@nestjs/config';
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
  let messagingMock: {
    sendEachForMulticast: jest.MockedFunction<
      (message: MulticastMessage, dryRun?: boolean) => Promise<BatchResponse>
    >;
  };

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('forwards multicast sends and dry-run mode to the SDK', async () => {
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
    messagingMock.sendEachForMulticast.mockResolvedValue(response);
    const provider = new FirebaseMessagingProvider(
      makeConfigMock(true) as unknown as ConfigService,
    );

    await expect(provider.sendEachForMulticast(message, true)).resolves.toBe(
      response,
    );
    expect(messagingMock.sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(messagingMock.sendEachForMulticast).toHaveBeenCalledWith(
      message,
      true,
    );
  });

  it('preserves SDK send failures without logging token data', async () => {
    const sdkError = new Error('SDK send failed');
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const consoleWarn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const message: MulticastMessage = {
      tokens: ['sensitive-device-token'],
    };
    messagingMock.sendEachForMulticast.mockRejectedValue(sdkError);
    const provider = new FirebaseMessagingProvider(
      makeConfigMock(true) as unknown as ConfigService,
    );

    await expect(provider.sendEachForMulticast(message)).rejects.toBe(sdkError);
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();

    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});
