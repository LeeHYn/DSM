import { ApiError } from '../../lib/api/api-error';
import type { ProductApi } from './product-api';
import type { OfflineTaskStorage, TaskSyncFields } from './task-offline-storage';
import type { OfflineTaskSync, TaskSyncSnapshot } from './task-sync';
import {
  utcDay,
  utcTimestamp,
  type Task,
  type TaskInput,
  type Category,
  type Score,
  type Summary,
  type Ranking,
  type Leader,
  type Period,
} from './product-contracts';

export type Resource<T> = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T | null;
  error: string | null;
};
const empty = <T>(): Resource<T> => ({
  status: 'idle',
  data: null,
  error: null,
});
type Resources = {
  tasks: Task[];
  categories: Category[];
  score: Score | null;
  summary: Summary;
  ranking: Ranking;
  leaderboard: Leader[];
};
export type ProductSnapshot = {
  [K in keyof Resources]: Resource<Resources[K]>;
} & {
  date: string;
  period: Period;
  mutating: boolean;
  mutationError: string | null;
  sync: TaskSyncSnapshot;
};
type OfflineScope = { storage: OfflineTaskStorage; engine: OfflineTaskSync };
export type ProductRealtimeScope = 'scores' | 'rankings';
function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'TASK_DAILY_LIMIT')
      return '하루 일과 등록 한도에 도달했습니다.';
    if (error.code === 'CATEGORY_NAME_CONFLICT')
      return '같은 이름의 카테고리가 있습니다. 다른 이름을 입력해 주세요.';
    if (error.code === 'INVALID_TIME_RANGE')
      return '종료 일시는 시작 일시보다 뒤여야 합니다.';
    if (error.kind === 'network' || error.kind === 'timeout')
      return '연결을 확인하고 다시 시도해 주세요.';
    if (error.status === 409)
      return '일과 제한 또는 상태 충돌입니다. 새로고침 후 확인해 주세요.';
    if (error.status === 400) return '입력값과 날짜를 확인해 주세요.';
    if (error.kind === 'unauthorized')
      return '세션이 만료되었습니다. 다시 로그인해 주세요.';
  }
  return '데이터를 처리하지 못했습니다. 다시 시도해 주세요.';
}

function isAmbiguousMutationError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    ['network', 'timeout', 'protocol'].includes(error.kind)
  );
}

function isRecoverableReadError(error: unknown): boolean {
  return error instanceof ApiError && (
    error.kind === 'network' || error.kind === 'timeout' || (
      error.kind === 'http' &&
      error.status !== undefined && error.status >= 500 && error.status < 600
    )
  );
}

function taskInputKey(input: TaskInput): string {
  return JSON.stringify([
    input.title,
    input.description ?? null,
    input.startAt,
    input.endAt,
    input.difficulty,
    input.categoryId ?? null,
    input.notificationEnabled,
  ]);
}

export class ProductStore {
  private snapshot: ProductSnapshot;
  private listeners = new Set<() => void>();
  private revisions: Record<keyof Resources, number> = {
    tasks: 0,
    categories: 0,
    score: 0,
    summary: 0,
    ranking: 0,
    leaderboard: 0,
  };
  private active = true;
  private lifetime = 0;
  private createMutationIds = new Map<string, string>();
  private followsToday: boolean;
  private rankingDay: string;
  private online = true;
  private offline: OfflineScope | null = null;
  private unsubscribeSync: (() => void) | null = null;
  private realtimeFlight: Promise<void> | null = null;
  private realtimeGeneration = 0;
  private readonly realtimePending = new Set<ProductRealtimeScope>();
  constructor(
    private api: ProductApi,
    readonly userId: string,
    date?: string,
    private readonly offlineFactory?: () => OfflineScope,
  ) {
    const today = utcDay();
    const selectedDate = date ?? today;
    utcTimestamp(selectedDate, '00:00');
    this.followsToday = selectedDate === today;
    this.rankingDay = today;
    this.snapshot = {
      tasks: empty(),
      categories: empty(),
      score: empty(),
      summary: empty(),
      ranking: empty(),
      leaderboard: empty(),
      date: selectedDate,
      period: 'DAILY',
      mutating: false,
      mutationError: null,
      sync: { pendingCount: 0, draining: false, error: null },
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<ProductSnapshot>) {
    if (!this.active) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  // React StrictMode may reconnect the same mounted store after effect cleanup.
  activate() {
    this.active = true;
    if (this.offlineFactory && !this.offline) {
      try {
        const scope = this.offlineFactory();
        this.offline = scope;
        this.unsubscribeSync = scope.engine.subscribe(() => {
          if (!this.active || this.offline !== scope) return;
          const previous = this.snapshot.sync.pendingCount;
          const sync = scope.engine.getSnapshot();
          this.publishLocal(scope);
          if (this.online && sync.pendingCount < previous) void this.loadServerMetrics();
        });
        scope.engine.setOnline(this.online);
      } catch {
        this.publish({ sync: { pendingCount: 0, draining: false, error: '기기 저장소를 열지 못했습니다. 다시 시도해 주세요.' } });
      }
    }
  }
  setOnline(online: boolean) {
    if (online !== this.online) {
      this.clearRealtimePending();
      Object.keys(this.revisions).forEach(key => this.revisions[key as keyof Resources]++);
    }
    this.online = online;
    this.offline?.engine.setOnline(online);
  }
  dispose() {
    this.active = false;
    this.lifetime++;
    this.clearRealtimePending();
    this.createMutationIds.clear();
    this.unsubscribeSync?.();
    this.unsubscribeSync = null;
    this.offline?.engine.dispose();
    this.offline = null;
    Object.keys(this.revisions).forEach(
      (key) => this.revisions[key as keyof Resources]++,
    );
  }
  private async read<K extends keyof Resources>(
    key: K,
    load: () => Promise<Resources[K]>,
  ) {
    if (!this.active) return false;
    const revision = ++this.revisions[key];
    this.publish({
      [key]: { status: 'loading', data: this.snapshot[key].data, error: null },
    });
    try {
      const data = await load();
      if (revision === this.revisions[key])
        this.publish({ [key]: { status: 'ready', data, error: null } });
      return true;
    } catch (error) {
      if (revision === this.revisions[key])
        this.publish({
          [key]: {
            status: 'error',
            data: isRecoverableReadError(error) ? this.snapshot[key].data : null,
            error: message(error),
          },
        });
      return false;
    }
  }
  private clearRealtimePending() {
    this.realtimeGeneration++;
    this.realtimePending.clear();
  }
  applyRealtime = (scopes: readonly ProductRealtimeScope[]): Promise<void> => {
    if (!this.active || !this.online) return Promise.resolve();
    for (const scope of scopes) {
      if (scope === 'scores' || scope === 'rankings') this.realtimePending.add(scope);
    }
    if (this.realtimeFlight) return this.realtimeFlight;
    if (!this.realtimePending.size || this.snapshot.mutating) return Promise.resolve();
    // Install the flight before a read can synchronously notify a subscriber.
    const operation = Promise.resolve().then(async () => {
      while (this.active && this.online && !this.snapshot.mutating && this.realtimePending.size) {
        const scores = this.realtimePending.has('scores');
        const rankings = this.realtimePending.has('rankings');
        this.realtimePending.clear();
        this.syncRankingDay();
        const generation = this.realtimeGeneration;
        const results = await Promise.all([
          ...(scores ? [this.loadScores()] : []),
          ...(rankings ? [this.readRanking()] : []),
        ]);
        // A failed request waits for a new signal/fallback, never its own queue.
        if (generation === this.realtimeGeneration && results.some(success => !success)) {
          this.realtimePending.clear();
          break;
        }
      }
    });
    this.realtimeFlight = operation;
    const clear = () => { if (this.realtimeFlight === operation) this.realtimeFlight = null; };
    operation.then(clear, clear);
    return operation;
  };
  private checkTask(task: Task): Task {
    if (task.userId !== this.userId) throw new Error('Response owner mismatch');
    return task;
  }
  private publishLocal(scope: OfflineScope) {
    if (!this.active || this.offline !== scope) return;
    const document = scope.storage.getSnapshot();
    this.publish({
      sync: scope.engine.getSnapshot(),
      ...(document ? {
        tasks: { status: 'ready', data: scope.engine.tasks(this.snapshot.date), error: null } as Resource<Task[]>,
        categories: { ...this.snapshot.categories, data: document.categories,
          status: this.snapshot.categories.status === 'idle' ? 'ready' : this.snapshot.categories.status } as Resource<Category[]>,
      } : {}),
    });
  }
  private async localHome() {
    if (!this.offline) this.activate();
    const scope = this.offline;
    if (!scope || !(await scope.engine.open()) || this.offline !== scope || !this.active) return;
    this.publishLocal(scope);
    if (!this.online) return;
    const date = this.snapshot.date;
    await Promise.all([
      scope.engine.refresh(date),
      this.read('categories', async () => {
        const categories = await this.api.categories();
        if (this.offline !== scope || !this.active || !this.online) return [];
        // Storage validates owner/default visibility before committing the cache.
        await scope.storage.update(draft => { draft.categories = categories; });
        return categories;
      }),
      this.loadServerMetrics(),
    ]);
    this.publishLocal(scope);
  }
  private async loadServerMetrics() {
    if (!this.active || !this.online) return;
    await Promise.all([this.loadScores(), this.loadRanking()]);
  }
  private async loadScores(): Promise<boolean> {
    if (!this.active || !this.online) return false;
    const date = this.snapshot.date;
    const results = await Promise.all([
      this.read('score', async () => {
        const score = await this.api.score(date);
        if (score && (score.userId !== this.userId || utcDay(new Date(score.scoreDate)) !== date))
          throw new Error('Response scope mismatch');
        return score;
      }),
      this.read('summary', () => this.api.summary()),
    ]);
    return results.every(Boolean);
  }
  private async home() {
    if (this.offlineFactory) { await this.localHome(); return; }
    if (!this.online) return;
    const date = this.snapshot.date;
    await Promise.all([
      this.read('tasks', async () =>
        (await this.api.tasks(date)).map((task) => {
          this.checkTask(task);
          if (utcDay(new Date(task.startAt)) !== date)
            throw new Error('Response date mismatch');
          return task;
        }),
      ),
      this.read('categories', async () => {
        const data = await this.api.categories();
        if (
          data.some(
            (item) =>
              item.userId !== this.userId &&
              !(item.isDefault && item.userId === null),
          )
        )
          throw new Error('Response owner mismatch');
        return data;
      }),
      this.loadScores(),
    ]);
  }
  private changeHomeDate(date: string) {
    if (date === this.snapshot.date) return;
    this.clearRealtimePending();
    this.revisions.tasks++;
    this.revisions.score++;
    this.publish({ date, tasks: empty(), score: empty(), mutationError: null });
  }
  private syncRankingDay() {
    const today = utcDay();
    if (today === this.rankingDay) return;
    this.clearRealtimePending();
    this.rankingDay = today;
    this.revisions.ranking++;
    this.revisions.leaderboard++;
    this.publish({ ranking: empty(), leaderboard: empty() });
  }
  loadHome = async () => {
    if (!this.active || this.snapshot.mutating) return;
    if (this.followsToday) this.changeHomeDate(utcDay());
    this.syncRankingDay();
    await this.home();
  };
  loadRanking = async () => {
    await this.readRanking();
  };
  private async readRanking(): Promise<boolean> {
    if (!this.active || !this.online) return false;
    this.syncRankingDay();
    const period = this.snapshot.period;
    const results = await Promise.all([
      this.read('ranking', async () => {
        const data = await this.api.ranking(period);
        if (data.period !== period) throw new Error('Response period mismatch');
        return data;
      }),
      this.read('leaderboard', () => this.api.leaderboard(period)),
    ]);
    return results.every(Boolean);
  }
  refresh = async () => {
    if (!this.snapshot.mutating)
      await Promise.all([this.loadHome(), ...(this.offlineFactory ? [] : [this.loadRanking()])]);
  };
  setDate = async (date: string) => {
    utcTimestamp(date, '00:00');
    if (!this.active || this.snapshot.mutating) return;
    this.followsToday = date === utcDay();
    this.changeHomeDate(date);
    await this.home();
  };
  setPeriod = async (period: Period) => {
    if (!this.active) return;
    if (period !== this.snapshot.period) {
      this.clearRealtimePending();
      this.revisions.ranking++;
      this.revisions.leaderboard++;
      this.publish({ period, ranking: empty(), leaderboard: empty() });
    }
    await this.loadRanking();
  };
  private async mutate(
    operation: (lifetime: number) => Promise<unknown>,
    optimistic?: Task[],
    didReachMutation = () => true,
  ): Promise<boolean> {
    if (!this.active || this.snapshot.mutating) return false;
    const lifetime = this.lifetime;
    const previous = this.snapshot.tasks;
    // A GET started before a mutation must never replace its optimistic state.
    this.revisions.tasks++;
    this.publish({
      mutating: true,
      mutationError: null,
      ...(optimistic
        ? {
            tasks: {
              status: 'ready',
              data: optimistic,
              error: null,
            } as Resource<Task[]>,
          }
        : {}),
    });
    try {
      await operation(lifetime);
      if (!this.active || lifetime !== this.lifetime) return false;
      await Promise.all([this.home(), this.loadRanking()]);
      return this.active && lifetime === this.lifetime;
    } catch (error) {
      if (!this.active || lifetime !== this.lifetime) return false;
      const ambiguous = isAmbiguousMutationError(error) && didReachMutation();
      const rollback: Resource<Task[]> =
        previous.status === 'loading'
          ? {
              status: previous.data ? 'ready' : 'error',
              data: previous.data,
              error: previous.data ? null : message(error),
            }
          : previous;
      this.publish({
        tasks: rollback,
        mutationError: ambiguous
          ? '저장 결과를 확인할 수 없습니다. 새로고침한 목록을 확인한 뒤 재시도해 주세요.'
          : message(error),
      });
      if (ambiguous) await Promise.all([this.home(), this.loadRanking()]);
      return false;
    } finally {
      if (lifetime === this.lifetime) {
        this.publish({ mutating: false });
        this.applyRealtime([]).catch(() => undefined);
      }
    }
  }
  private async localMutation(operation: (engine: OfflineTaskSync) => Promise<boolean>): Promise<boolean> {
    if (!this.active || this.snapshot.mutating) return false;
    if (!this.offline) this.activate();
    const scope = this.offline;
    if (!scope) return false;
    const lifetime = this.lifetime;
    this.publish({ mutating: true, mutationError: null });
    try {
      const success = await operation(scope.engine);
      if (!this.active || this.lifetime !== lifetime) return false;
      this.publishLocal(scope);
      if (!success) this.publish({ mutationError: scope.engine.getSnapshot().error ?? '기기에 저장하지 못했습니다.' });
      return success;
    } catch (error) {
      if (this.lifetime === lifetime) this.publish({ mutationError: message(error) });
      return false;
    } finally {
      if (this.lifetime === lifetime) {
        this.publish({ mutating: false });
        this.applyRealtime([]).catch(() => undefined);
      }
    }
  }
  private syncFields(input: TaskInput, status: Task['status']): TaskSyncFields {
    return { ...input, description: input.description ?? null, categoryId: input.categoryId ?? null,
      startAt: new Date(input.startAt).toISOString(), endAt: new Date(input.endAt).toISOString(), status };
  }
  retrySync = async () => {
    const scope = this.offline;
    if (!scope || !this.active) return;
    const ids = new Set(scope.storage.getSnapshot()?.outbox.filter(row => row.blocked).map(row => row.operation.taskId));
    for (const id of ids) await scope.engine.retryBlocked(id);
    scope.engine.setOnline(this.online);
    await this.loadHome();
  };
  blockedTasks = () => this.offline?.engine.blockedTasks() ?? [];
  discardBlocked = async (taskId: string) => {
    const success = await this.localMutation(engine => engine.discardBlocked(taskId));
    if (success) await this.loadHome();
    return success;
  };
  create = (input: TaskInput) => {
    if (this.offlineFactory) return this.localMutation(engine => engine.create(this.syncFields(input, 'PENDING')));
    const key = taskInputKey(input);
    let taskPostStarted = false;
    return this.mutate(
      async (lifetime) => {
        let clientMutationId = this.createMutationIds.get(key);
        if (!clientMutationId) {
          clientMutationId = await this.api.issueClientMutationId();
          if (!this.active || lifetime !== this.lifetime) return;
          this.createMutationIds.set(key, clientMutationId);
        }
        if (!this.active || lifetime !== this.lifetime) return;
        taskPostStarted = true;
        try {
          this.checkTask(await this.api.create(input, clientMutationId));
          this.createMutationIds.delete(key);
        } catch (error) {
          if (!isAmbiguousMutationError(error)) {
            this.createMutationIds.delete(key);
          }
          throw error;
        }
      },
      undefined,
      () => taskPostStarted,
    );
  };
  update = (id: string, input: TaskInput) => {
    if (this.offlineFactory) {
      const task = this.snapshot.tasks.data?.find(item => item.id === id);
      if (!task) return Promise.resolve(false);
      return this.localMutation(engine => engine.replace(id, this.syncFields(input, task.status)));
    }
    return this.mutate(async () => this.checkTask(await this.api.update(id, input)));
  };
  toggle = (id: string) => {
    const tasks = this.snapshot.tasks.data;
    const task = tasks?.find((item) => item.id === id);
    if (!task || !tasks || task.status === 'CANCELLED') return Promise.resolve(false);
    const done = task.status === 'COMPLETED';
    if (this.offlineFactory) return this.localMutation(engine => {
      return engine.replace(id, { title: task.title, description: task.description, difficulty: task.difficulty,
        categoryId: task.categoryId, notificationEnabled: task.notificationEnabled,
        startAt: new Date(task.startAt).toISOString(), endAt: new Date(task.endAt).toISOString(),
        status: done ? 'PENDING' : 'COMPLETED' });
    });
    return this.mutate(
      async () =>
        this.checkTask(
          await (done ? this.api.undo(id) : this.api.complete(id)),
        ),
      tasks.map((item) =>
        item.id === id
          ? { ...item, status: done ? 'PENDING' : 'COMPLETED' }
          : item,
      ),
    );
  };
  remove = (id: string) =>
    this.offlineFactory ? this.localMutation(engine => engine.remove(id)) : this.mutate(
      () => this.api.remove(id),
      this.snapshot.tasks.data?.filter((item) => item.id !== id),
    );
}
