import { ConfigService } from '@nestjs/config';
import {
  NotificationMode,
  TaskDifficulty,
  TaskStatus,
  type Task,
} from '@prisma/client';
import { FcmAdminService } from './fcm-admin.service';

const mockSendEachForMulticast = jest.fn();
let mockApps: Array<{ name: string }> = [];

jest.mock('firebase-admin/app', () => ({
  cert: jest.fn((credential: unknown) => credential),
  getApps: (): Array<{ name: string }> => mockApps,
  initializeApp: jest.fn(() => ({ name: 'initialized-app' })),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({
    sendEachForMulticast: mockSendEachForMulticast,
  })),
}));

const MOCK_TASK: Task = {
  id: 'task-uuid-1',
  title: 'Morning run',
  description: null,
  startAt: new Date('2026-06-20T06:00:00Z'),
  endAt: new Date('2026-06-20T07:00:00Z'),
  completedAt: null,
  difficulty: TaskDifficulty.MEDIUM,
  status: TaskStatus.PENDING,
  notificationEnabled: true,
  userId: 'user-uuid-1',
  categoryId: null,
  createdAt: new Date('2026-06-20T00:00:00Z'),
  updatedAt: new Date('2026-06-20T00:00:00Z'),
  deletedAt: null,
};

const makeConfigMock = () =>
  ({
    get: jest.fn(),
  }) as unknown as ConfigService;

describe('FcmAdminService', () => {
  beforeEach(() => {
    mockApps = [{ name: 'existing-app' }];
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('includes notification mode in task reminder data payload', async () => {
    const service = new FcmAdminService(makeConfigMock());

    await service.sendTaskReminder(
      ['fcm-token-1'],
      MOCK_TASK,
      NotificationMode.VIBRATE,
    );

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          type: 'TASK_REMINDER',
          taskId: MOCK_TASK.id,
          notificationMode: NotificationMode.VIBRATE,
        },
      }),
    );
  });
});
