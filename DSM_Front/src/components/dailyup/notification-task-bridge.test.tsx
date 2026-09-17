import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createHttpClient } from '@/lib/api/http-client';
import { NotificationTaskBridge } from './notification-task-bridge';
const mockFetch = jest.fn();
const mockOpen = jest.fn();
const mockClear = jest.fn();
const mockDismiss = jest.fn();
const task = { id: 'task', userId: 'owner', title: '검증된 일정', description: null, startAt: '2026-09-11T12:00:00.000Z', endAt: '2026-09-11T13:00:00.000Z', difficulty: 'LOW', categoryId: null, notificationEnabled: true, completedAt: null, status: 'PENDING' };
const payload = { type: 'TASK_REMINDER', userId: 'owner', taskId: 'task', scheduleId: 'schedule', startAt: task.startAt };
let mockSession = { state: { status: 'authenticated', userId: 'owner' }, epoch: 1 };
let mockSnapshot = { date: '2026-09-11', mutating: false, tasks: { data: [task] } };
const mockSetDate = jest.fn(async (date: string) => { mockSnapshot = { ...mockSnapshot, date }; });
const mockStore = { userId: 'owner', getSnapshot: () => mockSnapshot, setDate: mockSetDate };
let mockFormOpen = false;
let mockTap: unknown = payload;
let mockReminder: typeof task & { taskId: string; expiresAt: string } | null = null;
const mockClient = createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl: mockFetch });
jest.mock('@/features/auth/session-context', () => ({ useSession: () => mockSession, useAuthenticatedClient: () => mockClient }));
jest.mock('@/features/product/product-context', () => ({ useProduct: () => ({ store: mockStore, snapshot: mockSnapshot, isNewTaskOpen: mockFormOpen, editingTask: null, openTaskDetail: mockOpen }) }));
jest.mock('@/features/notifications/notification-context', () => ({ useNotifications: () => ({ tap: mockTap, reminder: mockReminder, clearTap: mockClear, dismissReminder: mockDismiss }) }));
jest.mock('@/features/prototype/prototype-context', () => ({ usePrototype: () => ({ theme: 'dark' }) }));
beforeEach(() => {
  jest.clearAllMocks(); mockTap = { ...payload }; mockFormOpen = false; mockReminder = null;
  mockSession = { state: { status: 'authenticated', userId: 'owner' }, epoch: 1 };
  mockSnapshot = { date: '2026-09-11', mutating: false, tasks: { data: [task] } };
  mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(task) });
});
test('fetches current owned task before reloading its date and opening detail', async () => {
  await render(<NotificationTaskBridge />);
  await act(async () => {});
  expect(mockFetch).toHaveBeenCalledWith('https://api.example.invalid/tasks/task', expect.anything());
  expect(mockSetDate).toHaveBeenCalledWith('2026-09-11');
  expect(mockOpen).toHaveBeenCalledWith('task');
  expect(mockClear).toHaveBeenCalledWith(mockTap);
});
test.each([{ ...payload, userId: 'other' }, { ...payload, url: 'https://example.invalid' }, { ...payload, startAt: '0000-01-01T00:00:00.000Z' }, { type: 'OTHER' }])('rejects invalid or foreign tap without network access', async invalid => {
  mockTap = invalid; await render(<NotificationTaskBridge />);
  expect(mockFetch).not.toHaveBeenCalled(); expect(mockOpen).not.toHaveBeenCalled();
  expect(await screen.findByText('이 알림의 일과를 열 수 없습니다.')).toBeOnTheScreen();
});
test('does not discard an open task form or make a request until it closes', async () => {
  mockFormOpen = true; const view = await render(<NotificationTaskBridge />);
  expect(mockFetch).not.toHaveBeenCalled();
  expect(screen.getByText(/작성 중인 내용을 마친 뒤/)).toBeOnTheScreen();
  mockFormOpen = false; await view.rerender(<NotificationTaskBridge />);
  await act(async () => {}); expect(mockOpen).toHaveBeenCalledWith('task');
});
test('late task response after account epoch change cannot open or change the date', async () => {
  let resolve!: (response: Response) => void;
  mockFetch.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
  const view = await render(<NotificationTaskBridge />);
  mockSession = { state: { status: 'authenticated', userId: 'other' }, epoch: 2 };
  await view.rerender(<NotificationTaskBridge />);
  await act(() => resolve({ ok: true, status: 200, text: async () => JSON.stringify(task) } as Response));
  expect(mockOpen).not.toHaveBeenCalled(); expect(mockSetDate).not.toHaveBeenCalled();
});
test('offline workspace never uses a tap to make an authenticated request', async () => {
  mockSession.state.status = 'offline-workspace'; await render(<NotificationTaskBridge />);
  expect(mockFetch).not.toHaveBeenCalled(); expect(mockClear).not.toHaveBeenCalled();
});
test('foreground banner requires an explicit open action', async () => {
  mockTap = null; mockReminder = { ...task, taskId: task.id, expiresAt: '2026-09-11T12:05:00.000Z' };
  await render(<NotificationTaskBridge />);
  expect(screen.getByText('검증된 일정')).toBeOnTheScreen(); expect(mockFetch).not.toHaveBeenCalled();
  await act(() => fireEvent.press(screen.getByText('일과 열기')));
  expect(mockOpen).toHaveBeenCalledWith('task');
});
