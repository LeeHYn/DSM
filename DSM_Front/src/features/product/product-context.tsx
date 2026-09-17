import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AppState, type View } from 'react-native';
import { useAuthenticatedClient, useSession } from '../auth/session-context';
import { createProductApi } from './product-api';
import { ProductStore } from './product-store';
import { createTaskSyncApi, OfflineTaskSync } from './task-sync';
import { RealtimeProvider } from '../realtime/realtime-context';
import type { Task, Category } from './product-contracts';

export const difficultyLabels = {
  LOW: '낮음',
  MEDIUM: '보통',
  HIGH: '높음',
} as const;
export function taskView(task: Task, categories: Category[]) {
  return {
    ...task,
    completed: task.status === 'COMPLETED',
    startTime: new Date(task.startAt).toISOString().slice(11, 16),
    endTime: new Date(task.endAt).toISOString().slice(11, 16),
    category:
      categories.find((item) => item.id === task.categoryId)?.name ??
      (task.categoryId ? '카테고리 조회 필요' : '미분류'),
    difficultyLabel: difficultyLabels[task.difficulty],
  };
}
export type TaskView = ReturnType<typeof taskView>;
function useProductValue(store: ProductStore) {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [isNewTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<TaskView | null>(null);
  const taskSheetReturnFocusRef = useRef<{
    targetRef: React.RefObject<View | null>;
  } | null>(null);
  const tasks = useMemo(
    () =>
      (snapshot.tasks.data ?? []).map((task) =>
        taskView(task, snapshot.categories.data ?? []),
      ),
    [snapshot.tasks.data, snapshot.categories.data],
  );
  const closeNewTask = () => {
    if (!store.getSnapshot().mutating) {
      setNewTaskOpen(false);
      setEditingTask(null);
    }
  };
  return {
    store,
    snapshot,
    tasks,
    isNewTaskOpen,
    selectedTask: tasks.find((task) => task.id === selectedId) ?? null,
    editingTask,
    taskSheetReturnFocusRef,
    rememberTaskSheetReturnFocus: (
      returnFocusRef: React.RefObject<View | null>,
    ) => {
      taskSheetReturnFocusRef.current = { targetRef: returnFocusRef };
    },
    openNewTask: () => {
      setEditingTask(null);
      setSelectedId(null);
      setNewTaskOpen(true);
    },
    closeNewTask,
    openTaskDetail: (id: string) => {
      setSelectedId(id);
    },
    closeTaskDetail: () => {
      if (!store.getSnapshot().mutating) setSelectedId(null);
    },
    editTask: (id: string) => {
      const task = tasks.find(item => item.id === id);
      if (!task) return;
      setEditingTask(task);
      setSelectedId(null);
      setNewTaskOpen(true);
    },
  };
}
const ProductContext = createContext<ReturnType<typeof useProductValue> | null>(
  null,
);
function ScopedProductProvider({
  children,
  userId,
  online,
}: PropsWithChildren<{ userId: string; online: boolean }>) {
  const client = useAuthenticatedClient();
  const store = useMemo(
    () => new ProductStore(createProductApi(client), userId, undefined, () => {
      // Native storage is initialized only inside an active account's effect.
      const native: typeof import('./task-offline-native') = require('./task-offline-native');
      const storage = native.getOfflineTaskStorage(userId);
      return { storage, engine: new OfflineTaskSync(storage, createTaskSyncApi(client, userId), { uuid: native.createTaskMutationId }) };
    }),
    [client, userId],
  );
  const value = useProductValue(store);
  const onlineRef = useRef(online);
  onlineRef.current = online;
  useEffect(() => {
    store.setOnline(onlineRef.current);
    store.activate();
    void store.refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void store.refresh();
    });
    return () => {
      subscription.remove();
      store.dispose();
    };
  }, [store]);
  const previousOnline = useRef(online);
  useEffect(() => {
    if (previousOnline.current === online) return;
    previousOnline.current = online;
    store.setOnline(online);
    void store.refresh();
  }, [online, store]);
  return (
    <ProductContext.Provider value={value}><RealtimeProvider store={store}>{children}</RealtimeProvider></ProductContext.Provider>
  );
}
export function ProductProvider({ children }: PropsWithChildren) {
  const { state, action, epoch } = useSession();
  if (
    (state.status !== 'authenticated' && state.status !== 'offline-workspace') ||
    action === 'logging-out' ||
    action === 'deleting-account'
  ) {
    return null;
  }
  return (
    <ScopedProductProvider
      key={`${state.userId}:${epoch}`}
      userId={state.userId}
      online={state.status === 'authenticated'}>
      {children}
    </ScopedProductProvider>
  );
}
export function useProduct() {
  const value = useContext(ProductContext);
  if (!value) throw new Error('useProduct must be used inside ProductProvider');
  return value;
}
