import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ProductProvider, useProduct } from './product-context';
import HomeScreen from '../../app/(tabs)/index';
import { TaskSheets } from '../../components/dailyup/task-sheets';
import { createHttpClient } from '../../lib/api/http-client';
import type { Task } from './product-contracts';
import { ProductStore } from './product-store';
jest.mock('../realtime/realtime-context', () => ({ RealtimeProvider: ({ children }: { children: React.ReactNode }) => children }));
const mockOfflineStores = new Map();
let mockMutationSequence = 0;
jest.mock('./task-offline-native', () => ({
  getOfflineTaskStorage: (userId: string) => {
    if (!mockOfflineStores.has(userId)) {
      const { OfflineTaskStorage } = jest.requireActual('./task-offline-storage');
      const values = new Map<string, string>();
      mockOfflineStores.set(userId, new OfflineTaskStorage({
        getItem: async (key: string) => values.get(key) ?? null,
        setItem: async (key: string, value: string) => { values.set(key, value); },
        removeItem: async (key: string) => { values.delete(key); },
      }, userId));
    }
    return mockOfflineStores.get(userId);
  },
  createTaskMutationId: () => `00000000-0000-4000-8000-${String(++mockMutationSequence).padStart(12, '0')}`,
}));
beforeEach(() => { mockOfflineStores.clear(); mockMutationSequence = 0; });
const mockSession = {
  state: { status: 'authenticated', userId: 'u' },
  action: 'idle',
  epoch: 1,
};
const mockClient = {
  request: jest.fn().mockImplementation(async ({ path }: { path: string }) => {
    if (path === '/scores/summary') return { totalScore: 456, tier: 'GOLD' };
    if (path.startsWith('/scores')) return null;
    if (path.startsWith('/rankings?'))
      return {
        period: 'DAILY',
        score: 0,
        rank: 0,
        percentile: 0,
        totalUsers: 0,
      };
    return [];
  }),
};
jest.mock('../auth/session-context', () => ({
  useSession: () => mockSession,
  useAuthenticatedClient: () => mockClient,
}));
jest.mock('../prototype/prototype-context', () => ({ usePrototype: () => ({ theme: 'dark' }) }));
function Probe() {
  const { snapshot, openNewTask, isNewTaskOpen } = useProduct();
  return (
    <Text
      onPress={
        openNewTask
      }>{`${snapshot.summary.data?.totalScore ?? 'loading'}:${isNewTaskOpen}`}</Text>
  );
}

test('retains the same user store and open form when the session enters its offline workspace', async () => {
  let context!: ReturnType<typeof useProduct>;
  function LocalProbe() { context = useProduct(); return <Probe />; }
  const view = await render(<ProductProvider><LocalProbe /></ProductProvider>);
  await waitFor(() => expect(context.snapshot.summary.data?.totalScore).toBe(456));
  const originalStore = context.store;
  await act(() => context.openNewTask());
  mockSession.state = { status: 'offline-workspace', userId: 'u' };
  await view.rerender(<ProductProvider><LocalProbe /></ProductProvider>);
  expect(screen.getByText('456:true')).toBeOnTheScreen();
  expect(context.store).toBe(originalStore);
  mockClient.request.mockClear();
  await act(async () => { await context.store.create({ title: '연결 없이 저장',
    startAt: `${context.snapshot.date}T09:00:00Z`, endAt: `${context.snapshot.date}T10:00:00Z`,
    difficulty: 'LOW', notificationEnabled: false }); });
  expect(context.tasks[0].title).toBe('연결 없이 저장');
  expect(context.snapshot.sync.pendingCount).toBe(1);
  expect(mockClient.request).not.toHaveBeenCalled();
  await view.unmount();
  mockSession.state = { status: 'authenticated', userId: 'u' };
});

test('preserves the editing snapshot and dirty form when a date refresh clears the task list', async () => {
  let context!: ReturnType<typeof useProduct>;
  const today = new Date().toISOString().slice(0, 10);
  const task: Task = { id: '00000000-0000-4000-8000-999999999999', userId: 'u', title: '기존 편집 일과', description: null,
    startAt: `${today}T09:00:00Z`, endAt: `${today}T10:00:00Z`, difficulty: 'LOW',
    status: 'PENDING', completedAt: null, categoryId: null, notificationEnabled: false };
  const original = mockClient.request.getMockImplementation()!;
  mockClient.request.mockImplementation(async ({ path }: { path: string }) =>
    path.startsWith('/tasks/sync?') ? (path.includes(today) ? [{ task, logicalTime: 0, mutationId: '' }] : []) : original({ path }),
  );
  function EditProbe() { context = useProduct(); return <TaskSheets />; }
  const view = await render(<ProductProvider><EditProbe /></ProductProvider>);
  await waitFor(() => expect(context.tasks).toHaveLength(1));
  await act(() => context.editTask(task.id));
  await fireEvent.changeText(screen.getByLabelText('일과 제목'), '저장 전 편집 내용');
  await act(async () => { await context.store.setDate('2030-01-02'); });
  expect(context.tasks).toHaveLength(0);
  expect(context.editingTask?.id).toBe(task.id);
  expect(screen.getByLabelText('일과 제목')).toHaveProp('value', '저장 전 편집 내용');
  await view.unmount();
  mockClient.request.mockImplementation(original);
});
test('loads actual data, survives strict effect reconnect and clears account-scoped UI on logout', async () => {
  const view = await render(
    <React.StrictMode>
      <ProductProvider>
        <Probe />
      </ProductProvider>
    </React.StrictMode>,
  );
  expect(await screen.findByText('456:false')).toBeOnTheScreen();
  await act(() => {
    mockSession.action = 'logging-out';
  });
  await view.rerender(
    <React.StrictMode>
      <ProductProvider>
        <Probe />
      </ProductProvider>
    </React.StrictMode>,
  );
  expect(screen.queryByText('456:false')).toBeNull();
  mockSession.action = 'idle';
  mockSession.epoch++;
  await view.rerender(
    <ProductProvider>
      <Probe />
    </ProductProvider>,
  );
  expect(await screen.findByText('456:false')).toBeOnTheScreen();
});

test('unmounts and disposes account-scoped state while account deletion is pending', async () => {
  const dispose = jest.spyOn(ProductStore.prototype, 'dispose');
  const view = await render(
    <ProductProvider>
      <Probe />
    </ProductProvider>,
  );
  expect(await screen.findByText('456:false')).toBeOnTheScreen();

  await act(() => {
    mockSession.action = 'deleting-account';
  });
  await view.rerender(
    <ProductProvider>
      <Probe />
    </ProductProvider>,
  );

  expect(screen.queryByText('456:false')).toBeNull();
  expect(dispose).toHaveBeenCalledTimes(1);
  mockSession.action = 'idle';
  dispose.mockRestore();
});

test('real provider, durable store, parser and screens synchronize create, edit, complete, undo and delete', async () => {
  let tasks: Task[] = [];
  let version = { syncUpdatedAt: new Date().toISOString(), syncMutationId: '' };
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const input = init?.body ? JSON.parse(String(init.body)) : {};
    let response: unknown = [];
    if (path === '/tasks/sync' && init?.method === 'POST') {
      const result = input.kind === 'delete' ? tasks[0] : { ...input.task, id: input.taskId, userId: 'u',
        completedAt: input.task.status === 'COMPLETED' ? new Date().toISOString() : null };
      version = { syncUpdatedAt: input.updatedAt, syncMutationId: input.mutationId };
      tasks = input.kind === 'delete' ? [] : [result];
      response = { mutationId: input.mutationId, outcome: input.kind === 'delete' ? 'deleted' : 'applied',
        task: { ...result, ...version }, serverTime: new Date().toISOString() };
    } else if (path === '/tasks/sync') response = tasks.map(task => ({ ...task, ...version }));
    else if (path === '/scores/summary') response = { totalScore: tasks.some(task => task.status === 'COMPLETED') ? 789 : 456, tier: 'GOLD' };
    else if (path === '/scores') response = null;
    else if (path === '/rankings') response = { period: 'DAILY', score: 0, rank: 0, percentile: 0, totalUsers: 0 };
    return { ok: true, status: 200, text: async () => JSON.stringify(response) } as Response;
  });
  const http = createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl });
  mockClient.request.mockImplementation(http.request);
  const view = await render(<ProductProvider><HomeScreen /><TaskSheets /></ProductProvider>);
  await screen.findByText('등록된 일과가 없습니다.');
  await fireEvent.press(screen.getByRole('button', { name: '새 일과 추가' }));
  await fireEvent.changeText(screen.getByLabelText('일과 제목'), '새 서버 일과');
  await fireEvent.press(screen.getByText('저장'));
  await waitFor(() => expect(screen.queryByLabelText('일과 제목')).toBeNull());
  await fireEvent.press(screen.getByRole('button', { name: '새 서버 일과 상세 보기' }));
  await fireEvent.press(screen.getByText('수정'));
  expect(screen.getByLabelText('일과 제목')).toHaveProp('value', '새 서버 일과');
  await fireEvent.changeText(screen.getByLabelText('일과 제목'), '수정 서버 일과');
  await fireEvent.press(screen.getByText('저장'));
  await waitFor(() => expect(screen.queryByLabelText('일과 제목')).toBeNull());
  await fireEvent.press(screen.getByRole('checkbox', { name: '수정 서버 일과 완료' }));
  await screen.findByText('누적 점수 789점');
  expect(tasks[0].status).toBe('COMPLETED');
  await fireEvent.press(screen.getByRole('checkbox', { name: '수정 서버 일과 완료 취소' }));
  await screen.findByText('누적 점수 456점');
  expect(tasks[0].status).toBe('PENDING');
  await fireEvent.press(screen.getByRole('button', { name: '수정 서버 일과 상세 보기' }));
  await fireEvent.press(screen.getByText('삭제'));
  await screen.findByText('이 일과를 삭제할까요?');
  await fireEvent.press(screen.getByText('삭제'));
  await screen.findByText('등록된 일과가 없습니다.');
  expect(tasks).toEqual([]);
  await view.unmount();
}, 30_000);
