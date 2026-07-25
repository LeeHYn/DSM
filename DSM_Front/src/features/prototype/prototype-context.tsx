import React, {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { dailyupMotion, type ThemeMode } from '@/constants/dailyup-theme';
import {
  initialTasks,
  type PrototypeScreenState,
  type PrototypeTask,
} from '@/features/prototype/prototype-data';

export type NewTaskInput = Omit<PrototypeTask, 'completed' | 'id' | 'shouldFailOnce'>;

type PrototypeContextValue = {
  addTask: (input: NewTaskInput) => void;
  closeNewTask: () => void;
  closeTaskDetail: () => void;
  deleteTask: (taskId: string) => void;
  isNewTaskOpen: boolean;
  openNewTask: () => void;
  openTaskDetail: (taskId: string) => void;
  resetPrototype: () => void;
  screenState: PrototypeScreenState;
  selectedTask: PrototypeTask | null;
  setScreenState: (state: PrototypeScreenState) => void;
  setTheme: (mode: ThemeMode) => void;
  showToast: (message: string) => void;
  tasks: PrototypeTask[];
  theme: ThemeMode;
  toastMessage: string | null;
  toggleTask: (taskId: string) => void;
};

const PrototypeContext = createContext<PrototypeContextValue | null>(null);

export function PrototypeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [tasks, setTasks] = useState<PrototypeTask[]>(() => initialTasks.map((task) => ({ ...task })));
  const [screenState, setScreenState] = useState<PrototypeScreenState>('normal');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, dailyupMotion.toast);
  }, []);

  const openNewTask = useCallback(() => {
    if (screenState === 'offline') {
      showToast('오프라인에서는 일과를 추가할 수 없어요.');
      return;
    }
    setIsNewTaskOpen(true);
  }, [screenState, showToast]);

  const closeNewTask = useCallback(() => setIsNewTaskOpen(false), []);

  const openTaskDetail = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  const closeTaskDetail = useCallback(() => setSelectedTaskId(null), []);

  const addTask = useCallback(
    (input: NewTaskInput) => {
      const task: PrototypeTask = {
        ...input,
        completed: false,
        id: `task-${Date.now()}`,
      };
      setTasks((current) => [...current, task]);
      setIsNewTaskOpen(false);
      showToast('새 일과를 추가했어요.');
    },
    [showToast],
  );

  const toggleTask = useCallback(
    (taskId: string) => {
      if (screenState === 'offline') {
        showToast('오프라인 상태입니다. 연결 후 다시 시도해 주세요.');
        return;
      }

      const currentTask = tasks.find((task) => task.id === taskId);
      if (!currentTask) {
        showToast('일과를 찾을 수 없어요.');
        return;
      }

      setTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, completed: !task.completed } : task,
        ),
      );

      if (currentTask.shouldFailOnce) {
        setTimeout(() => {
          setTasks((current) =>
            current.map((task) =>
              task.id === taskId
                ? { ...task, completed: currentTask.completed, shouldFailOnce: false }
                : task,
            ),
          );
          showToast('완료 처리에 실패해 이전 상태로 되돌렸어요.');
        }, 420);
        return;
      }

      showToast(currentTask.completed ? '완료를 취소했어요.' : '일과를 완료했어요.');
    },
    [screenState, showToast, tasks],
  );

  const deleteTask = useCallback(
    (taskId: string) => {
      setTasks((current) => current.filter((task) => task.id !== taskId));
      setSelectedTaskId(null);
      showToast('일과를 삭제했어요.');
    },
    [showToast],
  );

  const resetPrototype = useCallback(() => {
    setTheme('dark');
    setTasks(initialTasks.map((task) => ({ ...task })));
    setScreenState('normal');
    setIsNewTaskOpen(false);
    setSelectedTaskId(null);
    setToastMessage(null);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  const value = useMemo<PrototypeContextValue>(
    () => ({
      addTask,
      closeNewTask,
      closeTaskDetail,
      deleteTask,
      isNewTaskOpen,
      openNewTask,
      openTaskDetail,
      resetPrototype,
      screenState,
      selectedTask,
      setScreenState,
      setTheme,
      showToast,
      tasks,
      theme,
      toastMessage,
      toggleTask,
    }),
    [
      addTask,
      closeNewTask,
      closeTaskDetail,
      deleteTask,
      isNewTaskOpen,
      openNewTask,
      openTaskDetail,
      resetPrototype,
      screenState,
      selectedTask,
      showToast,
      tasks,
      theme,
      toastMessage,
      toggleTask,
    ],
  );

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>;
}

export function usePrototype() {
  const context = useContext(PrototypeContext);
  if (!context) {
    throw new Error('usePrototype must be used inside PrototypeProvider');
  }
  return context;
}
