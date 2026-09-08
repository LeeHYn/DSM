import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import HomeScreen from '../../../app/(tabs)/index';
import RankingScreen from '../../../app/(tabs)/ranking';
import { TaskSheets } from '../../../components/dailyup/task-sheets';
import { ProductStore } from '../../../features/product/product-store';
import { createProductApi } from '../../../features/product/product-api';

const mockStore = new ProductStore(
  createProductApi({ request: jest.fn() }),
  'u',
  '2026-09-04',
);
const mockProduct = {
  store: mockStore,
  snapshot: mockStore.getSnapshot(),
  tasks: [],
  openNewTask: jest.fn(),
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
  await fireEvent.press(screen.getByRole('button', { name: '새 일과 추가' }));
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
