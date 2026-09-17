import React from 'react';
import { AccessibilityInfo, Alert, StyleSheet, type View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import HomeScreen from '../../../app/(tabs)/index';
import RankingScreen from '../../../app/(tabs)/ranking';
import { TaskSheets } from '../../../components/dailyup/task-sheets';
import { ProductStore } from '../../../features/product/product-store';
import { createProductApi } from '../../../features/product/product-api';
import { taskView, type TaskView } from '../../../features/product/product-context';
import type { Leader, Task } from '../../../features/product/product-contracts';

jest.mock('@/components/dailyup/calendar-panel', () => ({ CalendarPanel: () => null }));
const mockRealtime = { status: 'connected', restFailed: false };
jest.mock('@/features/realtime/realtime-context', () => ({ useRealtime: () => mockRealtime, RealtimeProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/features/auth/session-context', () => ({ useSession: () => ({ state: { status: 'authenticated' } }) }));

it('explains ranking batch delay and realtime reconnection without claiming fresh data', async () => {
  const view = await render(<RankingScreen />);
  expect(screen.getByText('자동 갱신 연결됨 · 순위 반영에는 약 1분이 걸릴 수 있습니다')).toBeOnTheScreen();
  mockRealtime.status = 'backoff';
  await view.rerender(<RankingScreen />);
  expect(screen.getByText('자동 갱신 재연결 중 · 새로고침으로 최신 순위를 확인하세요')).toBeOnTheScreen();
  mockRealtime.status = 'connected';
  mockRealtime.restFailed = true;
  await view.rerender(<RankingScreen />);
  expect(screen.getByText('최신 순위를 가져오지 못했습니다 · 새로고침해 주세요')).toBeOnTheScreen();
});

const mockStore = new ProductStore(
  createProductApi({ request: jest.fn() }),
  'u',
  '2026-09-04',
);
const mockProduct = {
  store: mockStore,
  snapshot: mockStore.getSnapshot(),
  tasks: [] as TaskView[],
  openNewTask: jest.fn(),
  openTaskDetail: jest.fn(),
  rememberTaskSheetReturnFocus: jest.fn(),
  taskSheetReturnFocusRef: {
    current: null as {
      targetRef: React.RefObject<View | null>;
    } | null,
  },
  isNewTaskOpen: false,
  editingTask: null,
  selectedTask: null,
  closeNewTask: jest.fn(),
};
jest.mock('@/features/product/product-context', () => ({
  ...jest.requireActual('@/features/product/product-context'),
  useProduct: () => mockProduct,
}));
jest.mock('@/features/prototype/prototype-context', () => ({
  usePrototype: () => ({ theme: 'dark' }),
}));

const task: Task = {
  id: 'task-1',
  userId: 'u',
  title: '보존된 일과',
  description: null,
  startAt: '2026-09-04T09:00:00Z',
  endAt: '2026-09-04T10:00:00Z',
  difficulty: 'LOW',
  status: 'PENDING',
  categoryId: null,
  completedAt: null,
  notificationEnabled: false,
};

beforeEach(() => {
  mockRealtime.status = 'connected';
  mockRealtime.restFailed = false;
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  mockProduct.store = mockStore;
  mockProduct.snapshot = mockStore.getSnapshot();
  mockProduct.tasks = [];
  mockProduct.isNewTaskOpen = false;
  mockProduct.taskSheetReturnFocusRef.current = null;
});
afterEach(() => jest.restoreAllMocks());

test.each(['idle', 'loading'] as const)('home shows a skeleton for initial %s without false zero or empty data', async (status) => {
  mockProduct.snapshot = {
    ...mockStore.getSnapshot(),
    tasks: { status, data: null, error: null },
    score: { status, data: null, error: null },
  };
  await render(<HomeScreen />);
  expect(screen.getByLabelText('일과를 불러오는 중')).toBeOnTheScreen();
  expect(screen.queryByText('0')).toBeNull();
  expect(screen.queryByText('등록된 일과가 없습니다.')).toBeNull();
  expect(screen.queryByText('일과 조회 중…')).toBeNull();
});

test('home distinguishes durable pending changes from server scores and exposes sync retry', async () => {
  const retry = jest.spyOn(mockStore, 'retrySync').mockResolvedValue();
  mockProduct.snapshot = { ...mockStore.getSnapshot(),
    sync: { pendingCount: 3, draining: false, error: '동기화 연결 오류' } };
  await render(<HomeScreen />);
  expect(screen.getByText('동기화 대기 3건')).toBeOnTheScreen();
  expect(screen.getByText('변경사항은 기기에 저장됐습니다. 점수와 랭킹은 서버 반영 후 갱신됩니다.')).toBeOnTheScreen();
  expect(screen.getByText('동기화 연결 오류')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '동기화 다시 시도' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test('cancelling rejected local changes requires confirmation and identifies the affected task', async () => {
  jest.spyOn(mockStore, 'blockedTasks').mockReturnValue([{ taskId: 'blocked-id', title: '거절된 일과' }]);
  const discard = jest.spyOn(mockStore, 'discardBlocked').mockResolvedValue(true);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockProduct.snapshot = { ...mockStore.getSnapshot(), sync: { pendingCount: 2, draining: false, error: '입력 오류' } };
  await render(<HomeScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '거절된 일과의 미전송 변경 취소' }));
  expect(discard).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('이 기기의 변경을 취소할까요?', expect.stringContaining('서버의 일과는 삭제하지 않습니다.'), expect.any(Array));
  await act(async () => { await alert.mock.calls[0][2]![1].onPress!(); });
  expect(discard).toHaveBeenCalledWith('blocked-id');
});

test.each(['loading', 'error'] as const)('home keeps score and task content during a cached %s', async (status) => {
  const score = { userId: 'u', scoreDate: '2026-09-04T00:00:00Z', cappedScore: 321, achievementRate: 50 };
  mockProduct.tasks = [taskView(task, [])];
  mockProduct.snapshot = {
    ...mockStore.getSnapshot(),
    tasks: { status: 'ready', data: [task], error: null },
    score: { status: 'ready', data: score, error: null },
  };
  const view = await render(<HomeScreen />);
  expect(screen.getByText('321')).toBeOnTheScreen();
  mockProduct.snapshot = {
    ...mockProduct.snapshot,
    tasks: { status, data: [task], error: status === 'error' ? '일과 연결 오류' : null },
    score: { status, data: score, error: status === 'error' ? '점수 연결 오류' : null },
  };
  await view.rerender(<HomeScreen />);
  expect(screen.getByText('321')).toBeOnTheScreen();
  expect(screen.getByText('보존된 일과')).toBeOnTheScreen();
  expect(screen.queryByLabelText('일과를 불러오는 중')).toBeNull();
  if (status === 'error') {
    expect(screen.getByText('일과 연결 오류')).toBeOnTheScreen();
    expect(screen.getByText('점수 연결 오류')).toBeOnTheScreen();
  }
});

test.each(['loading', 'error'] as const)('home preserves a confirmed empty list during cached %s', async (status) => {
  mockProduct.snapshot = {
    ...mockStore.getSnapshot(),
    tasks: { status, data: [], error: status === 'error' ? '일과 연결 오류' : null },
  };
  await render(<HomeScreen />);
  expect(screen.getByText('등록된 일과가 없습니다.')).toBeOnTheScreen();
  expect(screen.queryByLabelText('일과를 불러오는 중')).toBeNull();
  if (status === 'error') expect(screen.getByText('일과 연결 오류')).toBeOnTheScreen();
});

test('cancelled tasks are labelled and cannot toggle while their details remain available', async () => {
  const cancelled: Task = { ...task, status: 'CANCELLED' };
  mockProduct.tasks = [taskView(cancelled, [])];
  mockProduct.snapshot = {
    ...mockStore.getSnapshot(),
    tasks: { status: 'ready', data: [cancelled], error: null },
  };
  const toggle = jest.spyOn(mockStore, 'toggle').mockResolvedValue(false);
  await render(<HomeScreen />);
  expect(screen.getByText('취소됨')).toBeOnTheScreen();
  const checkbox = screen.getByRole('checkbox', { name: '보존된 일과 취소된 일과' });
  expect(checkbox).toBeDisabled();
  await fireEvent.press(checkbox);
  expect(toggle).not.toHaveBeenCalled();
  expect(mockProduct.openTaskDetail).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '보존된 일과 상세 보기' }));
  expect(mockProduct.rememberTaskSheetReturnFocus).toHaveBeenCalledWith(
    expect.anything(),
  );
  expect(mockProduct.openTaskDetail).toHaveBeenCalledWith('task-1');
});

test('task completion has a real 44 by 44 touch area and its own action', async () => {
  mockProduct.tasks = [taskView(task, [])];
  mockProduct.snapshot = {
    ...mockStore.getSnapshot(),
    tasks: { status: 'ready', data: [task], error: null },
  };
  const toggle = jest.spyOn(mockStore, 'toggle').mockResolvedValue(true);
  await render(<HomeScreen />);
  const checkbox = screen.getByRole('checkbox', { name: '보존된 일과 완료' });
  const style = StyleSheet.flatten(checkbox.props.style);
  expect(style.width).toBeGreaterThanOrEqual(44);
  expect(style.height).toBeGreaterThanOrEqual(44);
  await fireEvent.press(checkbox);
  expect(toggle).toHaveBeenCalledWith('task-1');
  expect(mockProduct.openTaskDetail).not.toHaveBeenCalled();
});
test('home displays server scores and UTC date, not prototype identity or developer controls', async () => {
  mockProduct.snapshot = {
    ...mockStore.getSnapshot(),
    summary: {
      status: 'ready',
      data: { totalScore: 432, tier: 'SILVER' },
      error: null,
    },
    score: { status: 'ready', data: null, error: null },
    tasks: { status: 'ready', data: [], error: null },
  };
  await render(<HomeScreen />);
  expect(screen.getByText('안녕하세요')).toBeOnTheScreen();
  expect(screen.getByText(/432점/)).toBeOnTheScreen();
  expect(screen.getByText(/2026-09-04.*UTC/)).toBeOnTheScreen();
  expect(screen.queryByText(/지민/)).toBeNull();
  expect(screen.getByText(/등록된 일과가 없습니다/)).toBeOnTheScreen();
  expect(screen.getByText('0')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '새 일과 추가' }));
  expect(mockProduct.rememberTaskSheetReturnFocus).toHaveBeenCalledWith(
    expect.objectContaining({ current: expect.anything() }),
  );
  expect(mockProduct.openNewTask).toHaveBeenCalled();
});

test('task form keeps input on rejected save and sends UTC timestamps with an actual category ID', async () => {
  mockProduct.isNewTaskOpen = true;
  mockProduct.snapshot = {
    ...mockStore.getSnapshot(),
    categories: {
      status: 'ready',
      data: [
        {
          id: 'real-category',
          name: '실제 카테고리',
          color: '#fff',
          isDefault: true,
          userId: null,
        },
      ],
      error: null,
    },
  };
  const create = jest.spyOn(mockStore, 'create').mockResolvedValue(false);
  const view = await render(<TaskSheets />);
  await fireEvent.changeText(screen.getByLabelText('일과 제목'), '입력 보존');
  await fireEvent.press(screen.getByText('실제 카테고리'));
  await fireEvent.press(screen.getByText('저장'));
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      title: '입력 보존',
      categoryId: 'real-category',
      startAt: '2026-09-04T09:00:00.000Z',
      endAt: '2026-09-04T10:00:00.000Z',
    }),
  );
  expect(screen.getByLabelText('일과 제목')).toHaveProp('value', '입력 보존');
  expect(mockProduct.closeNewTask).not.toHaveBeenCalled();
  create.mockResolvedValue(true);
  await fireEvent.press(screen.getByText('저장'));
  expect(mockProduct.closeNewTask).toHaveBeenCalled();
  await view.unmount();
  create.mockRestore();
  mockProduct.isNewTaskOpen = false;
});
test('ranking uses selected period server state and provides retry on errors', async () => {
  mockProduct.snapshot = {
    ...mockStore.getSnapshot(),
    ranking: {
      status: 'ready',
      data: {
        period: 'DAILY',
        score: 42,
        rank: 7,
        percentile: 35,
        totalUsers: 20,
      },
      error: null,
    },
    leaderboard: { status: 'error', data: null, error: '다시 확인' },
  };
  const period = jest
    .spyOn(mockStore, 'setPeriod')
    .mockResolvedValue(undefined);
  await render(<RankingScreen />);
  expect(screen.getByText('7위')).toBeOnTheScreen();
  expect(screen.getByText('다시 확인')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('주간'));
  expect(period).toHaveBeenCalledWith('WEEKLY');
  period.mockRestore();
});

const leaders: Leader[] = Array.from({ length: 100 }, (_, index) => ({
  userId: index === 1 ? 'u' : `user-${index}`,
  nickname: `회원 ${String(index + 1).padStart(3, '0')}`,
  rank: index + 1,
  score: 1000 - index,
  tier: 'SILVER',
  profileImageUrl: null,
}));

test('ranking mounts a bounded first batch of a 100-person leaderboard', async () => {
  mockProduct.snapshot = {
    ...mockStore.getSnapshot(),
    leaderboard: { status: 'ready', data: leaders, error: null },
  };
  await render(<RankingScreen />);
  const mounted = screen.getAllByText(/^회원 \d{3}$/);
  expect(mounted.length).toBeGreaterThan(0);
  expect(mounted.length).toBeLessThan(100);
  expect(screen.queryByText('회원 100')).toBeNull();
  expect(screen.getByRole('tab', { name: '일간', selected: true })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '랭킹 새로고침' })).toBeOnTheScreen();
});

test('ranking marks only the current account and updates with unchanged leaderboard data', async () => {
  mockProduct.snapshot = {
    ...mockStore.getSnapshot(),
    leaderboard: { status: 'ready', data: leaders.slice(0, 3), error: null },
  };
  const view = await render(<RankingScreen />);
  const ownRow = screen.getByLabelText('2위, 회원 002, 나, SILVER, 999점');
  const otherRow = screen.getByLabelText('1위, 회원 001, SILVER, 1,000점');
  expect(ownRow).toHaveProp('accessible', true);
  expect(StyleSheet.flatten(ownRow.props.style).backgroundColor)
    .not.toBe(StyleSheet.flatten(otherRow.props.style).backgroundColor);
  expect(screen.getAllByText('나')).toHaveLength(1);

  mockProduct.store = new ProductStore(createProductApi({ request: jest.fn() }), 'user-0', '2026-09-04');
  await view.rerender(<RankingScreen />);
  expect(screen.getByLabelText('1위, 회원 001, 나, SILVER, 1,000점')).toBeOnTheScreen();
  expect(screen.queryByLabelText('2위, 회원 002, 나, SILVER, 999점')).toBeNull();
  expect(screen.getAllByText('나')).toHaveLength(1);

  mockProduct.store = new ProductStore(createProductApi({ request: jest.fn() }), 'unlisted', '2026-09-04');
  await view.rerender(<RankingScreen />);
  expect(screen.queryByText('나')).toBeNull();
});

test('ranking preserves cached rows on errors and replaces them on period changes', async () => {
  mockProduct.snapshot = {
    ...mockStore.getSnapshot(),
    leaderboard: { status: 'ready', data: leaders.slice(0, 3), error: null },
  };
  const view = await render(<RankingScreen />);
  mockProduct.snapshot = {
    ...mockProduct.snapshot,
    leaderboard: { status: 'error', data: leaders.slice(0, 3), error: '순위 연결 오류' },
  };
  await view.rerender(<RankingScreen />);
  expect(screen.getByLabelText('2위, 회원 002, 나, SILVER, 999점')).toBeOnTheScreen();
  expect(screen.getByText('순위 연결 오류')).toBeOnTheScreen();
  const retry = jest.spyOn(mockStore, 'loadRanking').mockResolvedValue(undefined);
  await fireEvent.press(screen.getByRole('button', { name: '랭킹 새로고침' }));
  expect(retry).toHaveBeenCalledTimes(1);

  mockProduct.snapshot = {
    ...mockProduct.snapshot,
    period: 'WEEKLY',
    leaderboard: { status: 'loading', data: null, error: null },
  };
  await view.rerender(<RankingScreen />);
  expect(screen.getByRole('tab', { name: '주간', selected: true })).toBeOnTheScreen();
  expect(screen.queryByText('회원 002')).toBeNull();
  expect(screen.getByText('랭킹 조회 중…')).toBeOnTheScreen();
  expect(screen.queryByText('표시할 순위가 없습니다.')).toBeNull();

  mockProduct.snapshot = {
    ...mockProduct.snapshot,
    leaderboard: { status: 'ready', data: [{ ...leaders[1], rank: 1, score: 2000 }], error: null },
  };
  await view.rerender(<RankingScreen />);
  expect(screen.getByLabelText('1위, 회원 002, 나, SILVER, 2,000점')).toBeOnTheScreen();
  mockProduct.snapshot = {
    ...mockProduct.snapshot,
    leaderboard: { status: 'ready', data: [], error: null },
  };
  await view.rerender(<RankingScreen />);
  expect(screen.getByText('표시할 순위가 없습니다.')).toBeOnTheScreen();
  expect(screen.queryByText('나')).toBeNull();
});
