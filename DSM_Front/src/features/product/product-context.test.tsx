import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ProductProvider, useProduct } from './product-context';
import HomeScreen from '../../app/(tabs)/index';
import { TaskSheets } from '../../components/dailyup/task-sheets';
import { createHttpClient } from '../../lib/api/http-client';
import type { Task } from './product-contracts';
import { ProductStore } from './product-store';
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

test('real provider, store, parser and screens create, edit, complete, undo and delete through REST', async () => {
  let tasks: Task[] = [];
  const createdId = '123e4567-e89b-42d3-a456-426614174000';
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const input = init?.body ? JSON.parse(String(init.body)) : {};
    let response: unknown = [];
    if (path === '/tasks/client-mutation-ids' && init?.method === 'POST') {
      response = { clientMutationId: createdId };
    } else if (path === '/tasks' && init?.method === 'POST') {
      tasks = [{ ...input, id: createdId, userId: 'u', status: 'PENDING', completedAt: null, categoryId: input.categoryId ?? null, description: input.description ?? null }];
      response = tasks[0];
    } else if (path === `/tasks/${createdId}` && init?.method === 'PATCH') {
      tasks = [{ ...tasks[0], ...input }]; response = tasks[0];
    } else if (path === `/tasks/${createdId}/complete`) {
      tasks = [{ ...tasks[0], status: 'COMPLETED', completedAt: new Date().toISOString() }]; response = tasks[0];
    } else if (path === `/tasks/${createdId}` && init?.method === 'DELETE') {
      tasks = []; return { ok: true, status: 204, text: async () => '' } as Response;
    } else if (path === '/tasks') response = tasks;
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
