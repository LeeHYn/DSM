const mockPost = jest.fn();
const mockSend = jest.fn();
jest.mock('node:worker_threads', () => ({
  parentPort: { postMessage: mockPost },
  workerData: { projectId: 'synthetic', message: { tokens: ['synthetic'] } },
}));
jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(),
  initializeApp: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEachForMulticast: mockSend }),
}));

test('worker retains only retry delay and classification from SDK failures', async () => {
  mockSend.mockResolvedValue({
    successCount: 0,
    failureCount: 1,
    responses: [
      {
        success: false,
        error: {
          code: 'messaging/server-unavailable',
          retryAfter: '7200',
          message: 'synthetic private details',
          headers: { authorization: 'synthetic' },
        },
      },
    ],
  });
  jest.isolateModules(() => {
    // The worker is an entry point; importing it starts its single job.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./firebase-messaging.worker');
  });
  await Promise.resolve();
  expect(mockPost).toHaveBeenCalledWith({
    ok: true,
    response: {
      successCount: 0,
      failureCount: 1,
      responses: [
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
});
