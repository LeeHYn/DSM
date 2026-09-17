import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StatisticsPanel } from './statistics-panel';
const mockClient = {};
const mockCalendar = jest.fn();
const mockCategories = jest.fn();
jest.mock('@/features/auth/session-context', () => ({ useAuthenticatedClient: () => mockClient }));
jest.mock('@/features/product/analytics-api', () => ({
  ...jest.requireActual('@/features/product/analytics-api'),
  createAnalyticsApi: () => ({ calendar: mockCalendar, categories: mockCategories }),
}));
jest.mock('@/features/prototype/prototype-context', () => ({ usePrototype: () => ({ theme: 'dark' }) }));
beforeEach(() => {
  jest.clearAllMocks();
  mockCalendar.mockResolvedValue([{ date: '2026-09-11', cappedScore: 30, registeredTaskCount: 1, completedTaskCount: 1, achievementRate: 100 }]);
  mockCategories.mockResolvedValue([{ categoryId: null, name: '미분류', color: '#888888', registeredTaskCount: 50, completedTaskCount: 40, achievementRate: 80, rawScore: 1200 }]);
});
test('shows seven-day scores and uncapped category statistics with text alternatives', async () => {
  await render(<StatisticsPanel userId="u" date="2026-09-11" />);
  expect(mockCalendar).toHaveBeenCalledWith('2026-09-05', '2026-09-11');
  expect(mockCategories).toHaveBeenCalledWith('2026-09-05', '2026-09-11');
  await screen.findByLabelText('2026-09-11, 30점, 달성률 100%');
  expect(screen.getByText('기본 점수 1200점 · 달성률 80%')).toBeOnTheScreen();
});
test('shows a retry on failure without displaying partial statistics', async () => {
  mockCalendar.mockRejectedValueOnce(new Error('network'));
  await render(<StatisticsPanel userId="u" date="2026-09-11" />);
  await screen.findByText('통계를 불러오지 못했습니다.');
  expect(screen.queryByText('미분류')).toBeNull();
  await fireEvent.press(screen.getByText('통계 다시 시도'));
  await screen.findByText('미분류');
});
test('shows a meaningful empty category state', async () => {
  mockCategories.mockResolvedValue([]);
  await render(<StatisticsPanel userId="u" date="2026-09-11" />);
  await screen.findByText('이 기간에 등록한 일과가 없습니다.');
});
