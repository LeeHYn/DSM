import React from 'react';
import { AccessibilityInfo, Alert, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { TaskSheets } from './task-sheets';
import { ProductStore } from '@/features/product/product-store';
import { createProductApi } from '@/features/product/product-api';
import { taskView, type TaskView } from '@/features/product/product-context';
import type { Task } from '@/features/product/product-contracts';

const mockStore = new ProductStore(
  createProductApi({ request: jest.fn() }), 'u', '2026-09-04',
);
const mockProduct = {
  store: mockStore,
  snapshot: mockStore.getSnapshot(),
  isNewTaskOpen: true,
  editingTask: null as TaskView | null,
  selectedTask: null as TaskView | null,
  closeNewTask: jest.fn(),
  closeTaskDetail: jest.fn(),
  editTask: jest.fn(),
  taskSheetReturnFocusRef: {
    current: null as {
      targetRef: React.RefObject<View | null>;
    } | null,
  },
};
jest.mock('@/features/product/product-context', () => ({
  ...jest.requireActual('@/features/product/product-context'),
  useProduct: () => mockProduct,
}));
jest.mock('@/features/prototype/prototype-context', () => ({
  usePrototype: () => ({ theme: 'dark' }),
}));

const task: Task = {
  id: 'task-1', userId: 'u', title: '기존 일과', description: '기존 설명',
  startAt: '2026-09-04T09:00:00Z', endAt: '2026-09-04T10:00:00Z',
  difficulty: 'MEDIUM', status: 'PENDING', categoryId: null,
  completedAt: null, notificationEnabled: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  mockProduct.snapshot = mockStore.getSnapshot();
  mockProduct.isNewTaskOpen = true;
  mockProduct.editingTask = null;
  mockProduct.selectedTask = null;
  mockProduct.taskSheetReturnFocusRef.current = null;
});
afterEach(() => jest.restoreAllMocks());

async function requestClose(path: 'Back' | 'backdrop' | 'icon') {
  if (path === 'Back') {
    await fireEvent(screen.getByTestId('task-sheet-modal'), 'requestClose');
  } else {
    await fireEvent.press(screen.getByLabelText(path === 'icon' ? '새 일과 닫기' : '시트 닫기'));
  }
}

async function chooseAlertButton(style: 'cancel' | 'destructive') {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  const button = buttons?.find(item => item.style === style);
  expect(button).toBeDefined();
  await act(() => button?.onPress?.());
}

test('opens a named native modal with an accessible heading and Android Back close', async () => {
  await render(<TaskSheets />);
  const modal = screen.getByTestId('task-sheet-modal');
  expect(modal.props.transparent).toBe(true);
  expect(modal.props.accessibilityLabel).toBe('새 일과 추가');
  expect(screen.getByRole('header', { name: '새 일과 추가' })).toBeOnTheScreen();
  await fireEvent(modal, 'show');
  await act(() => new Promise(resolve => setTimeout(resolve, 340)));
  expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(
    expect.anything(),
    'focus',
  );
  await requestClose('Back');
  expect(mockProduct.closeNewTask).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('restores accessibility focus to the trigger after every task sheet closes', async () => {
  const triggerRef = React.createRef<View>();
  const view = await render(
    <>
      <View ref={triggerRef} />
      <TaskSheets key="sheets" />
    </>,
  );
  const trigger = triggerRef.current;
  mockProduct.taskSheetReturnFocusRef.current = { targetRef: triggerRef };
  mockProduct.isNewTaskOpen = false;
  await view.rerender(
    <>
      <View ref={triggerRef} />
      <TaskSheets key="sheets" />
    </>,
  );
  await act(() => new Promise(resolve => setTimeout(resolve, 1520)));
  expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(
    trigger,
    'focus',
  );
  expect(mockProduct.taskSheetReturnFocusRef.current).toBeNull();
});

test('does not focus a task row that unmounts before the sheet closes', async () => {
  const triggerRef = React.createRef<View>();
  const view = await render(
    <>
      <View ref={triggerRef} />
      <TaskSheets key="sheets" />
    </>,
  );
  mockProduct.taskSheetReturnFocusRef.current = { targetRef: triggerRef };
  mockProduct.isNewTaskOpen = false;
  await view.rerender(<TaskSheets key="sheets" />);
  await act(() => new Promise(resolve => setTimeout(resolve, 1520)));
  expect(triggerRef.current).toBeNull();
  expect(AccessibilityInfo.setAccessibilityFocus).not.toHaveBeenCalled();
  expect(AccessibilityInfo.sendAccessibilityEvent).not.toHaveBeenCalled();
  expect(mockProduct.taskSheetReturnFocusRef.current).toBeNull();
});

test('cancels an old restore without clearing a newly opened sheet trigger', async () => {
  const triggerRef = React.createRef<View>();
  const view = await render(
    <>
      <View ref={triggerRef} />
      <TaskSheets />
    </>,
  );
  const trigger = triggerRef.current;
  const oldRequest = { targetRef: triggerRef };
  mockProduct.taskSheetReturnFocusRef.current = oldRequest;
  mockProduct.isNewTaskOpen = false;
  await view.rerender(
    <>
      <View ref={triggerRef} />
      <TaskSheets />
    </>,
  );

  const newRequest = { targetRef: triggerRef };
  mockProduct.taskSheetReturnFocusRef.current = newRequest;
  mockProduct.isNewTaskOpen = true;
  await view.rerender(
    <>
      <View ref={triggerRef} />
      <TaskSheets />
    </>,
  );
  expect(mockProduct.taskSheetReturnFocusRef.current).toBe(newRequest);

  mockProduct.isNewTaskOpen = false;
  await view.rerender(
    <>
      <View ref={triggerRef} />
      <TaskSheets />
    </>,
  );
  await act(() => new Promise(resolve => setTimeout(resolve, 1520)));
  expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(
    trigger,
    'focus',
  );
  expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledTimes(1);
  expect(mockProduct.taskSheetReturnFocusRef.current).toBeNull();
});

test('restores once after moving from task detail to edit and then closing', async () => {
  const triggerRef = React.createRef<View>();
  mockProduct.isNewTaskOpen = false;
  mockProduct.selectedTask = taskView(task, []);
  const view = await render(
    <>
      <View ref={triggerRef} />
      <TaskSheets />
    </>,
  );
  const trigger = triggerRef.current;
  mockProduct.taskSheetReturnFocusRef.current = { targetRef: triggerRef };

  await fireEvent.press(screen.getByText('수정'));
  expect(mockProduct.editTask).toHaveBeenCalledWith('task-1');
  mockProduct.selectedTask = null;
  mockProduct.editingTask = taskView(task, []);
  mockProduct.isNewTaskOpen = true;
  await view.rerender(
    <>
      <View ref={triggerRef} />
      <TaskSheets />
    </>,
  );
  expect(AccessibilityInfo.sendAccessibilityEvent).not.toHaveBeenCalled();

  mockProduct.isNewTaskOpen = false;
  await view.rerender(
    <>
      <View ref={triggerRef} />
      <TaskSheets />
    </>,
  );
  await act(() => new Promise(resolve => setTimeout(resolve, 1520)));
  expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledTimes(1);
  expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(
    trigger,
    'focus',
  );
  expect(mockProduct.taskSheetReturnFocusRef.current).toBeNull();
});

test.each(['backdrop', 'icon'] as const)('clean form closes through %s without a prompt', async path => {
  await render(<TaskSheets />);
  await requestClose(path);
  expect(mockProduct.closeNewTask).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test.each(['Back', 'backdrop', 'icon'] as const)('dirty form can keep input or discard through %s', async path => {
  await render(<TaskSheets />);
  await fireEvent.changeText(screen.getByLabelText('일과 제목'), '보존할 입력');
  await requestClose(path);
  expect(mockProduct.closeNewTask).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  await chooseAlertButton('cancel');
  expect(screen.getByLabelText('일과 제목')).toHaveProp('value', '보존할 입력');
  expect(mockProduct.closeNewTask).not.toHaveBeenCalled();
  await requestClose(path);
  await chooseAlertButton('destructive');
  expect(mockProduct.closeNewTask).toHaveBeenCalledTimes(1);
});

test('restoring the original edit field removes the discard prompt', async () => {
  mockProduct.editingTask = taskView(task, []);
  await render(<TaskSheets />);
  await fireEvent.changeText(screen.getByLabelText('일과 제목'), '수정 중');
  await fireEvent.changeText(screen.getByLabelText('일과 제목'), '기존 일과');
  await requestClose('icon');
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockProduct.closeNewTask).toHaveBeenCalledTimes(1);
});

test('foreground UTC day changes do not remount or discard an open form', async () => {
  const view = await render(<TaskSheets />);
  await fireEvent.changeText(screen.getByLabelText('일과 제목'), '자정에도 보존');
  mockProduct.snapshot = { ...mockProduct.snapshot, date: '2026-09-05' };
  await view.rerender(<TaskSheets />);
  expect(screen.getByLabelText('일과 제목')).toHaveProp('value', '자정에도 보존');
  expect(screen.getByLabelText('시작 날짜 YYYY-MM-DD')).toHaveProp('value', '2026-09-04');
  await requestClose('icon');
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(mockProduct.closeNewTask).not.toHaveBeenCalled();
});

test.each([
  ['일과에 대한 설명', '새 설명'],
  ['시작 날짜 YYYY-MM-DD', '2026-09-05'],
  ['종료 날짜 YYYY-MM-DD', '2026-09-05'],
  ['09:00', '08:00'],
  ['10:00', '11:00'],
])('tracks changes to %s independently of title', async (label, value) => {
  await render(<TaskSheets />);
  await fireEvent.changeText(screen.getByLabelText(label), value);
  await requestClose('icon');
  expect(mockProduct.closeNewTask).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

test.each(['난이도', '알림', '카테고리'])('tracks the %s choice as dirty', async field => {
  mockProduct.snapshot = {
    ...mockStore.getSnapshot(),
    categories: { status: 'ready', error: null, data: [
      { id: 'cat', name: '새 카테고리', color: '#fff', isDefault: true, userId: null },
    ] },
  };
  await render(<TaskSheets />);
  await fireEvent.press(field === '알림'
    ? screen.getByLabelText('시작 알림')
    : screen.getByText(field === '난이도' ? '높음' : '새 카테고리'));
  await requestClose('icon');
  expect(mockProduct.closeNewTask).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

test.each(['Back', 'backdrop', 'icon'] as const)('blocks %s using live mutation state before rerender', async path => {
  await render(<TaskSheets />);
  jest.spyOn(mockStore, 'getSnapshot').mockReturnValue({ ...mockProduct.snapshot, mutating: true });
  await requestClose(path);
  expect(mockProduct.closeNewTask).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('rechecks pending state when discard is confirmed and avoids duplicate alerts', async () => {
  await render(<TaskSheets />);
  await fireEvent.changeText(screen.getByLabelText('일과 제목'), '수정');
  await requestClose('icon');
  await requestClose('backdrop');
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  jest.spyOn(mockStore, 'getSnapshot').mockReturnValue({ ...mockProduct.snapshot, mutating: true });
  await chooseAlertButton('destructive');
  expect(mockProduct.closeNewTask).not.toHaveBeenCalled();
});

test('successful save closes directly while rejected save preserves dirty input', async () => {
  const create = jest.spyOn(mockStore, 'create').mockResolvedValue(false);
  await render(<TaskSheets />);
  await fireEvent.changeText(screen.getByLabelText('일과 제목'), '저장할 입력');
  await fireEvent.press(screen.getByText('저장'));
  expect(mockProduct.closeNewTask).not.toHaveBeenCalled();
  expect(screen.getByLabelText('일과 제목')).toHaveProp('value', '저장할 입력');
  create.mockResolvedValue(true);
  await fireEvent.press(screen.getByText('저장'));
  expect(mockProduct.closeNewTask).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('cancelled details show their status, prevent completion and retain edit/delete', async () => {
  mockProduct.isNewTaskOpen = false;
  mockProduct.selectedTask = taskView({ ...task, status: 'CANCELLED' }, []);
  const toggle = jest.spyOn(mockStore, 'toggle').mockResolvedValue(false);
  await render(<TaskSheets />);
  expect(screen.getByText('취소됨')).toBeOnTheScreen();
  const completion = screen.getByRole('button', { name: /취소된 일과/ });
  expect(completion).toBeDisabled();
  await fireEvent.press(completion);
  expect(toggle).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '수정' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '삭제' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: '수정' }));
  expect(mockProduct.editTask).toHaveBeenCalledWith('task-1');
});

test('detail Android Back closes, but a pending mutation blocks it', async () => {
  mockProduct.isNewTaskOpen = false;
  mockProduct.selectedTask = taskView(task, []);
  await render(<TaskSheets />);
  await fireEvent(screen.getByTestId('task-sheet-modal'), 'requestClose');
  expect(mockProduct.closeTaskDetail).toHaveBeenCalledTimes(1);
  jest.spyOn(mockStore, 'getSnapshot').mockReturnValue({ ...mockProduct.snapshot, mutating: true });
  await fireEvent(screen.getByTestId('task-sheet-modal'), 'requestClose');
  await fireEvent.press(screen.getByLabelText('일과 상세 닫기'));
  await fireEvent.press(screen.getByLabelText('시트 닫기'));
  expect(mockProduct.closeTaskDetail).toHaveBeenCalledTimes(1);
});
