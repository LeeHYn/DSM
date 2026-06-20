# DSM Back Milestone 13 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize DSM_Back for frontend integration by closing P0 backend gaps: daily task limit, notification scheduling safety, Redis-backed realtime/ranking operations, dependency audit handling, and backend contract docs.

**Architecture:** Keep existing NestJS modules stable and add small support units where needed. Task limit logic lives in a pure task policy helper, notification hardening stays inside NotificationsModule, Redis support is optional and degrades to current in-memory/live-query behavior when `REDIS_URL` is absent.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL, Jest, Socket.IO, Redis (`redis`, `@socket.io/redis-adapter`), Firebase Admin SDK.

---

## File Structure

- Create: `DSM_Back/src/tasks/tasks.policy.ts` — UTC day range helper and `MAX_DAILY_TASKS`.
- Create: `DSM_Back/src/tasks/tasks.policy.spec.ts` — pure tests for day range and limit constant.
- Modify: `DSM_Back/src/tasks/tasks.service.ts` — enforce daily active task limit on create and date-moving update.
- Modify: `DSM_Back/src/tasks/tasks.service.spec.ts` — conflict tests for create/update.
- Create: `DSM_Back/prisma/migrations/20260620000000_milestone_13_notification_indexes/migration.sql` — partial unique index for active schedules.
- Modify: `DSM_Back/src/notifications/notifications.service.ts` — handle duplicate index conflicts and pending/processing schedule lookup.
- Modify: `DSM_Back/src/notifications/notification-scheduler.service.ts` — add stale processing recovery and env-driven batch size/timeout.
- Modify: `DSM_Back/src/notifications/notifications.service.spec.ts` — duplicate conflict regression tests.
- Modify: `DSM_Back/src/notifications/notification-scheduler.service.spec.ts` — stale recovery tests.
- Create: `DSM_Back/src/redis/redis.module.ts` — optional Redis provider.
- Create: `DSM_Back/src/redis/redis.service.ts` — Redis lifecycle, cache helpers, pub/sub clients.
- Create: `DSM_Back/src/redis/redis.service.spec.ts` — disabled/fallback behavior tests.
- Modify: `DSM_Back/src/realtime/realtime.module.ts` — import RedisModule.
- Modify: `DSM_Back/src/realtime/ranking.gateway.ts` — attach Redis adapter when available.
- Modify: `DSM_Back/src/realtime/ranking.gateway.spec.ts` — adapter enabled/disabled tests.
- Create: `DSM_Back/src/rankings/rankings-cache.service.ts` — optional leaderboard cache.
- Create: `DSM_Back/src/rankings/rankings-cache.service.spec.ts` — cache hit/miss/fallback tests.
- Modify: `DSM_Back/src/rankings/rankings.module.ts` — provide cache service.
- Modify: `DSM_Back/src/rankings/rankings.service.ts` — use cache for leaderboard reads.
- Modify: `DSM_Back/src/rankings/rankings.service.spec.ts` — cache behavior tests.
- Modify: `DSM_Back/src/realtime/ranking-realtime.service.ts` — invalidate cache on score recompute.
- Modify: `DSM_Back/src/config/env.validation.ts` — validate new optional env vars.
- Modify: `DSM_Back/src/config/env.validation.spec.ts` — env conversion tests.
- Modify: `DSM_Back/.env.example` — document new env vars.
- Modify: `DSM_Back/package.json`, `DSM_Back/package-lock.json` — add Redis dependencies and safe audit fixes.
- Create: `docs/api/DSM_Back_API_v0.md` — REST/WebSocket contract summary.
- Create: `docs/reviews/2026-06-20-dsm-back-milestone-13-review.md` — verification and residual risk report.
- Modify: `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md` — record milestone 13 status.

---

### Task 1: Daily Task Limit Guard

**Files:**
- Create: `DSM_Back/src/tasks/tasks.policy.ts`
- Create: `DSM_Back/src/tasks/tasks.policy.spec.ts`
- Modify: `DSM_Back/src/tasks/tasks.service.ts`
- Modify: `DSM_Back/src/tasks/tasks.service.spec.ts`

- [ ] **Step 1: Write failing policy tests**

Create `DSM_Back/src/tasks/tasks.policy.spec.ts`:

```ts
import { MAX_DAILY_TASKS, utcDayRange } from './tasks.policy';

describe('tasks.policy', () => {
  it('uses the FR-03 daily task registration limit', () => {
    expect(MAX_DAILY_TASKS).toBe(20);
  });

  it('returns the UTC day range for an ISO timestamp', () => {
    const { gte, lt } = utcDayRange('2026-06-20T15:30:00.000Z');

    expect(gte).toEqual(new Date('2026-06-20T00:00:00.000Z'));
    expect(lt).toEqual(new Date('2026-06-21T00:00:00.000Z'));
  });
});
```

- [ ] **Step 2: Run policy tests and verify failure**

Run:

```powershell
cd C:\DSM\DSM_Back
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' test -- tasks.policy --runInBand
```

Expected: FAIL with `Cannot find module './tasks.policy'`.

- [ ] **Step 3: Implement task policy**

Create `DSM_Back/src/tasks/tasks.policy.ts`:

```ts
export const MAX_DAILY_TASKS = 20;

export type UtcDayRange = {
  gte: Date;
  lt: Date;
};

export function utcDayRange(reference: Date | string): UtcDayRange {
  const date = new Date(reference);
  const gte = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}
```

- [ ] **Step 4: Write failing service tests**

In `DSM_Back/src/tasks/tasks.service.spec.ts`, import `ConflictException`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
```

Extend `makePrismaMock()`:

```ts
const makePrismaMock = () => ({
  task: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
});
```

Add create limit tests:

```ts
it('throws ConflictException when the user already has 20 active tasks that day', async () => {
  prismaMock.task.count.mockResolvedValue(20);

  await expect(
    service.create('user-uuid-1', {
      title: 'Too much',
      startAt: '2026-06-03T06:00:00Z',
      endAt: '2026-06-03T07:00:00Z',
      difficulty: TaskDifficulty.MEDIUM,
    }),
  ).rejects.toThrow(ConflictException);

  expect(prismaMock.task.create).not.toHaveBeenCalled();
  expect(scoresMock.recompute).not.toHaveBeenCalled();
  expect(notificationsMock.upsertTaskSchedule).not.toHaveBeenCalled();
});
```

Add update limit test:

```ts
it('throws ConflictException when moving a task into a full UTC day', async () => {
  prismaMock.task.findFirst.mockResolvedValue(MOCK_TASK);
  prismaMock.task.count.mockResolvedValue(20);

  await expect(
    service.update('user-uuid-1', 'task-uuid-1', {
      startAt: '2026-06-04T06:00:00Z',
    }),
  ).rejects.toThrow(ConflictException);

  expect(prismaMock.task.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Implement service guard**

In `DSM_Back/src/tasks/tasks.service.ts`, update imports:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MAX_DAILY_TASKS, utcDayRange } from './tasks.policy';
```

Before `this.prisma.task.create()` in `create()`:

```ts
await this.ensureDailyTaskLimit(userId, new Date(dto.startAt));
```

Before `this.prisma.task.update()` in `update()`:

```ts
if (dto.startAt !== undefined) {
  await this.ensureDailyTaskLimit(userId, new Date(dto.startAt), id);
}
```

Add private method:

```ts
private async ensureDailyTaskLimit(
  userId: string,
  startAt: Date,
  excludeTaskId?: string,
): Promise<void> {
  const { gte, lt } = utcDayRange(startAt);
  const activeTaskCount = await this.prisma.task.count({
    where: {
      userId,
      deletedAt: null,
      startAt: { gte, lt },
      ...(excludeTaskId && { id: { not: excludeTaskId } }),
    },
  });

  if (activeTaskCount >= MAX_DAILY_TASKS) {
    throw new ConflictException('Daily task limit exceeded');
  }
}
```

Also replace the date range logic in `findAll()` with `utcDayRange(query.date)` to keep one source of truth.

- [ ] **Step 6: Verify task tests**

Run:

```powershell
cd C:\DSM\DSM_Back
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' test -- tasks --runInBand
```

Expected: task policy/service/controller suites pass.

---

### Task 2: NotificationSchedule DB Safety and Stale Recovery

**Files:**
- Create: `DSM_Back/prisma/migrations/20260620000000_milestone_13_notification_indexes/migration.sql`
- Modify: `DSM_Back/src/notifications/notifications.service.ts`
- Modify: `DSM_Back/src/notifications/notification-scheduler.service.ts`
- Modify: `DSM_Back/src/notifications/notifications.service.spec.ts`
- Modify: `DSM_Back/src/notifications/notification-scheduler.service.spec.ts`
- Modify: `DSM_Back/src/config/env.validation.ts`
- Modify: `DSM_Back/src/config/env.validation.spec.ts`
- Modify: `DSM_Back/.env.example`

- [ ] **Step 1: Add migration for active schedule uniqueness**

Create `DSM_Back/prisma/migrations/20260620000000_milestone_13_notification_indexes/migration.sql`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationSchedule_one_active_per_task"
ON "NotificationSchedule" ("taskId")
WHERE "status" IN ('PENDING', 'PROCESSING');
```

- [ ] **Step 2: Add env fields**

In `DSM_Back/src/config/env.validation.ts`, add optional numeric env vars:

```ts
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  NOTIFICATION_DUE_BATCH_SIZE?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  NOTIFICATION_PROCESSING_TIMEOUT_SECONDS?: number;
```

In `DSM_Back/.env.example`, add:

```dotenv
NOTIFICATION_DUE_BATCH_SIZE=50
NOTIFICATION_PROCESSING_TIMEOUT_SECONDS=300
WS_CORS_ORIGINS="http://localhost:19006,http://localhost:8081"
```

- [ ] **Step 3: Write duplicate-conflict service test**

In `DSM_Back/src/notifications/notifications.service.spec.ts`, add a test that simulates Prisma `P2002` on create and verifies the service re-reads and updates the existing schedule:

```ts
it('updates the existing active schedule when a unique conflict occurs during create', async () => {
  const conflict = new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed',
    { code: 'P2002', clientVersion: '6.19.3' },
  );
  prismaMock.user.findUnique.mockResolvedValue({ notificationEnabled: true });
  prismaMock.notificationSchedule.findFirst
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(MOCK_SCHEDULE);
  prismaMock.notificationSchedule.create.mockRejectedValue(conflict);
  prismaMock.notificationSchedule.update.mockResolvedValue({
    ...MOCK_SCHEDULE,
    scheduledAt: MOCK_TASK.startAt,
  });

  const result = await service.upsertTaskSchedule(MOCK_TASK);

  expect(result?.id).toBe(MOCK_SCHEDULE.id);
  expect(prismaMock.notificationSchedule.update).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: MOCK_SCHEDULE.id } }),
  );
});
```

- [ ] **Step 4: Implement conflict fallback**

In `NotificationsService.upsertTaskSchedule()`, extract the transaction body into a helper and catch `P2002`. On conflict, find the active schedule where `status in [PENDING, PROCESSING]`, update it with the new scheduled time, and return it.

Use this status filter wherever schedule lookup is needed:

```ts
status: {
  in: [
    NOTIFICATION_SCHEDULE_STATUS.PENDING,
    NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
  ],
},
```

- [ ] **Step 5: Write stale recovery test**

In `DSM_Back/src/notifications/notification-scheduler.service.spec.ts`, add:

```ts
it('recovers stale processing schedules before processing due schedules', async () => {
  prismaMock.notificationSchedule.updateMany.mockResolvedValueOnce({ count: 2 });
  prismaMock.notificationSchedule.findMany.mockResolvedValue([]);

  await service.processDueSchedules(new Date('2026-06-20T12:00:00Z'));

  expect(prismaMock.notificationSchedule.updateMany).toHaveBeenCalledWith({
    where: {
      status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
      updatedAt: { lt: new Date('2026-06-20T11:55:00.000Z') },
    },
    data: {
      status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
      failureReason: 'RECOVERED_STALE_PROCESSING',
    },
  });
});
```

- [ ] **Step 6: Implement stale recovery**

Inject `ConfigService` into `NotificationSchedulerService`, add:

```ts
private getProcessingTimeoutMs(): number {
  const seconds =
    this.config.get<number>('NOTIFICATION_PROCESSING_TIMEOUT_SECONDS') ?? 300;
  return seconds * 1000;
}

private async recoverStaleProcessingSchedules(now: Date): Promise<number> {
  const staleBefore = new Date(now.getTime() - this.getProcessingTimeoutMs());
  const result = await this.prisma.notificationSchedule.updateMany({
    where: {
      status: NOTIFICATION_SCHEDULE_STATUS.PROCESSING,
      updatedAt: { lt: staleBefore },
    },
    data: {
      status: NOTIFICATION_SCHEDULE_STATUS.PENDING,
      failureReason: 'RECOVERED_STALE_PROCESSING',
    },
  });
  return result.count;
}
```

Call it at the start of `processDueSchedules()`.

- [ ] **Step 7: Verify notifications tests and Prisma schema**

Run:

```powershell
cd C:\DSM\DSM_Back
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' test -- notifications --runInBand
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run prisma:validate
```

Expected: notifications tests pass and Prisma schema validates.

---

### Task 3: Optional Redis Module and Socket.IO Adapter

**Files:**
- Create: `DSM_Back/src/redis/redis.module.ts`
- Create: `DSM_Back/src/redis/redis.service.ts`
- Create: `DSM_Back/src/redis/redis.service.spec.ts`
- Modify: `DSM_Back/src/realtime/realtime.module.ts`
- Modify: `DSM_Back/src/realtime/ranking.gateway.ts`
- Modify: `DSM_Back/src/realtime/ranking.gateway.spec.ts`
- Modify: `DSM_Back/package.json`

- [ ] **Step 1: Install Redis dependencies**

Run:

```powershell
cd C:\DSM\DSM_Back
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' install redis @socket.io/redis-adapter
```

Expected: `package.json` includes `redis` and `@socket.io/redis-adapter`.

- [ ] **Step 2: Implement optional Redis service**

Create `DSM_Back/src/redis/redis.service.ts` with methods:

```ts
isEnabled(): boolean;
getJson<T>(key: string): Promise<T | null>;
setJson(key: string, value: unknown, ttlSeconds: number): Promise<void>;
delByPrefix(prefix: string): Promise<void>;
createAdapterClients(): Promise<{ pubClient: RedisClientType; subClient: RedisClientType } | null>;
```

Rules:

- If `REDIS_URL` is absent, `isEnabled()` returns false and all cache methods become no-ops or return null.
- Redis errors are logged and swallowed for cache paths.
- `createAdapterClients()` returns null when Redis is disabled.

- [ ] **Step 3: Add RedisModule**

Create `DSM_Back/src/redis/redis.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

- [ ] **Step 4: Attach adapter in gateway**

In `RankingGateway`, inject `RedisService` and implement `OnGatewayInit`:

```ts
async afterInit(server: Server): Promise<void> {
  const clients = await this.redis.createAdapterClients();
  if (!clients) {
    return;
  }

  server.adapter(createAdapter(clients.pubClient, clients.subClient));
}
```

Add `RedisModule` to `RealtimeModule` imports.

- [ ] **Step 5: Verify realtime tests**

Run:

```powershell
cd C:\DSM\DSM_Back
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' test -- redis realtime --runInBand
```

Expected: Redis disabled fallback and adapter-enabled path tests pass.

---

### Task 4: Ranking Leaderboard Cache

**Files:**
- Create: `DSM_Back/src/rankings/rankings-cache.service.ts`
- Create: `DSM_Back/src/rankings/rankings-cache.service.spec.ts`
- Modify: `DSM_Back/src/rankings/rankings.module.ts`
- Modify: `DSM_Back/src/rankings/rankings.service.ts`
- Modify: `DSM_Back/src/rankings/rankings.service.spec.ts`
- Modify: `DSM_Back/src/realtime/ranking-realtime.service.ts`

- [ ] **Step 1: Implement cache service**

Create `RankingsCacheService` with:

```ts
leaderboardKey(period: RankingPeriod, limit: number): string;
getLeaderboard(period: RankingPeriod, limit: number): Promise<LeaderboardEntry[] | null>;
setLeaderboard(period: RankingPeriod, limit: number, entries: LeaderboardEntry[]): Promise<void>;
invalidateAllLeaderboards(): Promise<void>;
```

Use `RANKING_CACHE_TTL_SECONDS` from ConfigService, defaulting to 30.

- [ ] **Step 2: Use cache in RankingsService**

Change `getLeaderboard()` to:

1. Try cache.
2. If cache hit, return it.
3. Compute existing DB result.
4. Store in cache.
5. Return result.

Keep `getMyRanking()` live on read.

- [ ] **Step 3: Invalidate cache on score recompute**

In `RankingRealtimeService`, call `rankingsCache.invalidateAllLeaderboards()` before recomputing and broadcasting DAILY/WEEKLY/TOTAL leaderboard payloads.

- [ ] **Step 4: Verify rankings tests**

Run:

```powershell
cd C:\DSM\DSM_Back
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' test -- rankings realtime --runInBand
```

Expected: leaderboard cache hit/miss/fallback and realtime invalidation tests pass.

---

### Task 5: Dependency Audit Handling

**Files:**
- Modify: `DSM_Back/package.json`
- Modify: `DSM_Back/package-lock.json`
- Create: `docs/reviews/2026-06-20-dsm-back-milestone-13-audit.md`

- [ ] **Step 1: Capture current production audit**

Run:

```powershell
cd C:\DSM\DSM_Back
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' audit --omit=dev --json
```

Expected: JSON output identifies remaining production vulnerability paths.

- [ ] **Step 2: Try non-breaking fixes first**

Run:

```powershell
cd C:\DSM\DSM_Back
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' audit fix --omit=dev
```

Expected: lockfile changes only if npm can resolve compatible versions. Do not use `--force`.

- [ ] **Step 3: If vulnerabilities remain, document accepted risk**

Create `docs/reviews/2026-06-20-dsm-back-milestone-13-audit.md` with:

```md
# DSM_Back Milestone 13 Audit Review

## Command

- `npm audit --omit=dev`

## Result

- Remaining vulnerabilities:
  - `multer` path: record the package chain from the current audit output.
  - `uuid` path: record the package chain from the current audit output.
  - Any newly introduced production dependency path from the current audit output.

## Decision

- `npm audit fix --force` was not applied because it proposes breaking dependency changes.
- Accepted risk is temporary and must be revisited before production release.

## Follow-up Trigger

- Re-run this review after NestJS/Firebase dependency updates or before production deployment.
```

- [ ] **Step 4: Verify full backend after dependency changes**

Run:

```powershell
cd C:\DSM\DSM_Back
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' test -- --runInBand
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run build
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run lint
```

Expected: tests, build, and lint pass.

---

### Task 6: Backend Contract and Final Review

**Files:**
- Create: `docs/api/DSM_Back_API_v0.md`
- Create: `docs/reviews/2026-06-20-dsm-back-milestone-13-review.md`
- Modify: `.ai/memory/plan.md`
- Modify: `.ai/memory/context.md`
- Modify: `.ai/memory/checklist.md`

- [ ] **Step 1: Write backend contract doc**

Create `docs/api/DSM_Back_API_v0.md` with sections:

```md
# DSM_Back API v0

## Auth

- `POST /auth/social-login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

## Tasks

- `POST /tasks`
- `GET /tasks?date=YYYY-MM-DD`
- `GET /tasks/:id`
- `PATCH /tasks/:id`
- `DELETE /tasks/:id`
- `PATCH /tasks/:id/complete`
- Constraint: max 20 active tasks per UTC day.

## Scores and Rankings

- `GET /scores?date=YYYY-MM-DD`
- `GET /scores/summary`
- `GET /rankings?period=DAILY|WEEKLY|TOTAL`
- `GET /rankings/leaderboard?period=DAILY|WEEKLY|TOTAL&limit=100`
- `POST /rankings/snapshot`

## Notifications

- `POST /notifications/fcm-tokens`
- `DELETE /notifications/fcm-tokens`

## Users

- `GET /users/me`
- `PATCH /users/me/profile`
- `PATCH /users/me/notification-settings`
- `GET /users/me/social-accounts`

## WebSocket

- Handshake: access token through `handshake.auth.token` or `Authorization: Bearer <token>`.
- Client events: `user.join`, `ranking.subscribe`, `ranking.unsubscribe`.
- Server events: `score.updated`, `ranking.updated`, `leaderboard.updated`, `notification.due`.
```

- [ ] **Step 2: Run final verification**

Run:

```powershell
cd C:\DSM\DSM_Back
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' test -- --runInBand
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run test:e2e
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run prisma:validate
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run build
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run lint
```

Expected: all verification commands pass.

- [ ] **Step 3: Write final review report**

Create `docs/reviews/2026-06-20-dsm-back-milestone-13-review.md` with:

```md
# DSM_Back Milestone 13 Review Report

## Summary

Milestone 13 stabilizes DSM_Back for frontend integration and multi-instance operation.

## Implemented

- Daily active task limit.
- NotificationSchedule duplicate protection and stale recovery.
- Optional Redis ranking cache and Socket.IO adapter.
- Audit review.
- Backend contract document.

## Verification

- `npm test -- --runInBand`:
- `npm run test:e2e`:
- `npm run prisma:validate`:
- `npm run build`:
- `npm run lint`:
- `npm audit --omit=dev`:

## Residual Risks

- If `multer` remains unresolved, keep it as an accepted pre-production risk and revisit before production deployment.
- If `uuid` remains unresolved through Firebase/Google Cloud dependencies, track it with the Firebase Admin SDK upgrade path.
- If Redis is disabled in an environment, realtime fan-out remains single-instance only in that environment.
```

- [ ] **Step 4: Update `.ai/memory`**

Update:

- `.ai/memory/plan.md`: move milestone 13 to completed and set next milestone to DSM_Front integration foundation.
- `.ai/memory/context.md`: summarize Redis optional fallback, task limit, schedule hardening, audit decision.
- `.ai/memory/checklist.md`: mark all milestone 13 items complete.

- [ ] **Step 5: Check git status**

Run:

```powershell
cd C:\DSM
& 'C:\Program Files\Git\cmd\git.exe' status --short --branch
```

Expected: changed files are limited to milestone 13 implementation, docs, package lock, Prisma migration, and memory updates.

---

## Final Verification

Run:

```powershell
cd C:\DSM
& 'C:\Program Files\Git\cmd\git.exe' status --short --branch
cd C:\DSM\DSM_Back
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' test -- --runInBand
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run test:e2e
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run prisma:validate
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run build
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run lint
```

Expected:

- Git shows only intended changes.
- Unit tests pass.
- E2E tests pass.
- Prisma schema validates.
- Build passes.
- Lint passes.

## Self-Review

- Spec coverage: covers FR-03 task count limit, NFR-02/NFR-03 Redis realtime/ranking operations, notification scheduler resilience, and audit stabilization.
- Scope check: 회원 탈퇴, image storage, notification mode settings, Apple Sign In verification, and offline sync are explicitly deferred.
- Placeholder scan: this plan contains no unresolved placeholder fields for milestone 13 P0 scope.
