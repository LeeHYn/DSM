import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CalendarPanel } from './calendar-panel';
import { shiftDay } from '@/features/product/analytics-api';

const mockCalendar = jest.fn(async (from: string, to: string) => {
  const days = [];
  for (let date = from; date <= to; date = shiftDay(date, 1)) {
    days.push({ date, registeredTaskCount: 2, completedTaskCount: 1, achievementRate: 50, cappedScore: 20 });
  }
  return days;
});
const mockClient = {};
jest.mock('@/features/auth/session-context', () => ({ useAuthenticatedClient: () => mockClient }));
jest.mock('@/features/product/analytics-api', () => ({
  ...jest.requireActual('@/features/product/analytics-api'),
  createAnalyticsApi: () => ({ calendar: mockCalendar }),
}));
jest.mock('@/features/prototype/prototype-context', () => ({ usePrototype: () => ({ theme: 'dark' }) }));
const onSelect = jest.fn();
beforeEach(() => { jest.clearAllMocks(); });
const props = { date: '2026-09-11', userId: 'u', onSelect };
test('shows a UTC week with registration and achievement indicators', async () => {
  await render(<CalendarPanel {...props} />);
  expect(mockCalendar).toHaveBeenCalledWith('2026-09-06', '2026-09-12');
  await screen.findByLabelText('2026-09-11, 등록 2개, 달성률 50%');
  await fireEvent.press(screen.getByLabelText('2026-09-10, 등록 2개, 달성률 50%'));
  expect(onSelect).toHaveBeenCalledWith('2026-09-10');
});
test('switches month and moves across its boundary', async () => {
  await render(<CalendarPanel {...props} />);
  await fireEvent.press(screen.getByRole('button', { name: '월간' }));
  expect(mockCalendar).toHaveBeenLastCalledWith('2026-09-01', '2026-09-30');
  await fireEvent.press(screen.getByLabelText('다음 달'));
  expect(onSelect).toHaveBeenLastCalledWith('2026-10-01');
});
test('offers retry after a failed range request', async () => {
  mockCalendar.mockRejectedValueOnce(new Error('network'));
  await render(<CalendarPanel {...props} />);
  await screen.findByText('달력을 불러오지 못했습니다.');
  await fireEvent.press(screen.getByText('달력 다시 시도'));
  await screen.findByLabelText('2026-09-11, 등록 2개, 달성률 50%');
});
test('ignores an old response after the selected range changes', async () => {
  let settle!: (value: Awaited<ReturnType<typeof mockCalendar>>) => void;
  mockCalendar.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }));
  const view = await render(<CalendarPanel {...props} />);
  await view.rerender(<CalendarPanel {...props} date="2026-09-21" />);
  await screen.findByLabelText('2026-09-21, 등록 2개, 달성률 50%');
  await act(() => settle([]));
  expect(screen.getByLabelText('2026-09-21, 등록 2개, 달성률 50%')).toBeOnTheScreen();
});
test('disables date changes during a mutation', async () => {
  await render(<CalendarPanel {...props} disabled />);
  const cell = await screen.findByLabelText('2026-09-11, 등록 2개, 달성률 50%');
  await fireEvent.press(cell);
  expect(onSelect).not.toHaveBeenCalled();
});
