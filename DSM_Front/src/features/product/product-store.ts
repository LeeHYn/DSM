import { ApiError } from '../../lib/api/api-error';
import type { ProductApi } from './product-api';
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
};
function message(error: unknown): string {
  if (error instanceof ApiError) {
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
  constructor(
    private api: ProductApi,
    readonly userId: string,
    date = utcDay(),
  ) {
    utcTimestamp(date, '00:00');
    this.snapshot = {
      tasks: empty(),
      categories: empty(),
      score: empty(),
      summary: empty(),
      ranking: empty(),
      leaderboard: empty(),
      date,
      period: 'DAILY',
      mutating: false,
      mutationError: null,
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
  }
  dispose() {
    this.active = false;
    this.lifetime++;
    this.createMutationIds.clear();
    Object.keys(this.revisions).forEach(
      (key) => this.revisions[key as keyof Resources]++,
    );
  }
  private async read<K extends keyof Resources>(
    key: K,
    load: () => Promise<Resources[K]>,
  ) {
    if (!this.active) return;
    const revision = ++this.revisions[key];
    this.publish({
      [key]: { status: 'loading', data: this.snapshot[key].data, error: null },
    });
    try {
      const data = await load();
      if (revision === this.revisions[key])
        this.publish({ [key]: { status: 'ready', data, error: null } });
    } catch (error) {
      if (revision === this.revisions[key])
        this.publish({
          [key]: { status: 'error', data: null, error: message(error) },
        });
    }
  }
  private checkTask(task: Task): Task {
    if (task.userId !== this.userId) throw new Error('Response owner mismatch');
    return task;
  }
  private async home() {
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
      this.read('score', async () => {
        const score = await this.api.score(date);
        if (
          score &&
          (score.userId !== this.userId ||
            utcDay(new Date(score.scoreDate)) !== date)
        )
          throw new Error('Response scope mismatch');
        return score;
      }),
      this.read('summary', () => this.api.summary()),
    ]);
  }
  loadHome = async () => {
    if (!this.snapshot.mutating) await this.home();
  };
  loadRanking = async () => {
    const period = this.snapshot.period;
    await Promise.all([
      this.read('ranking', async () => {
        const data = await this.api.ranking(period);
        if (data.period !== period) throw new Error('Response period mismatch');
        return data;
      }),
      this.read('leaderboard', () => this.api.leaderboard(period)),
    ]);
  };
  refresh = async () => {
    if (!this.snapshot.mutating)
      await Promise.all([this.home(), this.loadRanking()]);
  };
  setDate = async (date: string) => {
    utcTimestamp(date, '00:00');
    if (!this.active || this.snapshot.mutating) return;
    this.publish({ date, tasks: empty(), score: empty(), mutationError: null });
    await this.home();
  };
  setPeriod = async (period: Period) => {
    if (!this.active) return;
    this.publish({ period, ranking: empty(), leaderboard: empty() });
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
      if (lifetime === this.lifetime) this.publish({ mutating: false });
    }
  }
  create = (input: TaskInput) => {
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
  update = (id: string, input: TaskInput) =>
    this.mutate(async () => this.checkTask(await this.api.update(id, input)));
  toggle = (id: string) => {
    const tasks = this.snapshot.tasks.data;
    const task = tasks?.find((item) => item.id === id);
    if (!task || !tasks) return Promise.resolve(false);
    const done = task.status === 'COMPLETED';
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
    this.mutate(
      () => this.api.remove(id),
      this.snapshot.tasks.data?.filter((item) => item.id !== id),
    );
}
