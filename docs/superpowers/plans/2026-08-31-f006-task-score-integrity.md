# F-006 Task Score Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for the recommended sequential execution profile, or `superpowers:subagent-driven-development` only after the user explicitly approves subagents. Use `superpowers:test-driven-development` for product stages, `superpowers:systematic-debugging` for unexpected failures, and `superpowers:verification-before-completion` before any completion claim.

**Goal:** Enforce a 20-Task UTC-day registration limit, make completion timestamps and score eligibility trustworthy, reconcile existing score projections atomically, and verify the behavior against task-owned disposable PostgreSQL 17 databases without touching shared, remote, or production state.

**Architecture:** Keep the existing Serializable `TasksService` transaction as the write boundary, add UTC range capacity checks within it, make `ScoresService` filter eligible completions by the scheduled UTC day, canonicalize percentage rounding in the score policy, and add one forward data-only Prisma migration. A fail-closed `.pg-spec.ts` suite owns migration parity, rollback, exactly-once, and real concurrency assertions; a controller-owned runner provides isolated databases and captured cleanup.

**Tech Stack:** NestJS 11, TypeScript, Jest 30, Prisma 6.19.3, PostgreSQL 17, Node.js/npm as required by the integration specification, PowerShell, Docker.

**Spec:** `docs/superpowers/specs/2026-08-17-f006-score-integrity-design.md`

## Global Constraints

- Work only in the existing linked worktree `C:\dsm-integration-review` on `codex/integration-main-review`. Do not switch, reset, clean, recreate, or discard its current document-only changes.
- Before implementation, require a separate user approval naming the execution profile, disposable PostgreSQL permission, and independent reviewer. This plan's approval does not authorize Git, remote, shared DB, production, Firebase, deploy, PR, or merge actions.
- Preserve the offline learning site on its separate branch/worktree; no offline-site path is in this plan.
- Modify at most two exact files per stage. Finish the RED/GREEN/review checkpoint for a stage before opening the next writable pair.
- Use `apply_patch` for tracked edits. Do not run auto-fixing lint, bulk formatters over unrelated paths, or dependency upgrades.
- Do not stage or commit after individual tasks. Repository policy gates `git add`, commit, push, PR, and merge separately; use `git diff` checkpoints instead.
- Never print connection URLs or generated credentials. Every PostgreSQL connection must be derived in process from the two captured container IDs and the task-owned database names.
- Stop as `BLOCKED` if the runtime versions, worktree identity, current five-migration prefix, Docker ownership checks, or fail-closed URL checks do not match this plan.
- Prisma generation is serial. Before `prisma:generate`, prove no build, test, dev server, or second generator is running.

## Fixed Paths and Contracts

| Purpose | Exact path |
|---|---|
| Task implementation | `DSM_Back/src/tasks/tasks.service.ts` |
| Task unit tests | `DSM_Back/src/tasks/tasks.service.spec.ts` |
| Score policy | `DSM_Back/src/scores/scores.policy.ts` |
| Score policy tests | `DSM_Back/src/scores/scores.policy.spec.ts` |
| Score recomputation | `DSM_Back/src/scores/scores.service.ts` |
| Score service tests | `DSM_Back/src/scores/scores.service.spec.ts` |
| Forward migration | `DSM_Back/prisma/migrations/20260830_enforce_task_score_integrity/migration.sql` |
| PostgreSQL regression | `DSM_Back/test/task-score-integrity.pg-spec.ts` |
| Audit pair | `.ai/audits/20260817-release-audit-full-project/findings.jsonl`, `.ai/audits/20260817-release-audit-full-project/README.md` |
| Execution evidence root | `.superpowers/sdd/2026-08-31-f006-task-score-integrity/` |

The stable public conflict is HTTP 409 with message `Daily task limit reached`. UTC ranges are half-open `[dayStart, nextDay)`. Active PENDING, COMPLETED, and CANCELLED Tasks count; soft-deleted Tasks do not. The current Task is excluded only when moving it to a different UTC day.

---

## Task 1: Implementation Authorization and Audit Opening

**Files:**

- Modify: `.ai/audits/20260817-release-audit-full-project/findings.jsonl`
- Modify: `.ai/audits/20260817-release-audit-full-project/README.md`

- [ ] **Step 1: Re-read execution and safety instructions after implementation approval**

  Read `.ai/system_prompt.md`, the active memory index and three required memory files, the approved spec, this plan, and the applicable Superpowers skills. Record the exact user approval in `.ai/memory/plan.md` only in the later memory stage; do not widen this two-file audit stage.

- [ ] **Step 2: Prove the worktree and migration prefix**

  Run read-only checks from `C:\dsm-integration-review`:

  ```powershell
  git branch --show-current
  git rev-parse HEAD
  git rev-parse --git-dir
  git rev-parse --git-common-dir
  git status --short
  git diff --name-only HEAD -- DSM_Back
  Get-ChildItem DSM_Back\prisma\migrations -Directory | Sort-Object Name | Select-Object -ExpandProperty Name
  node --version
  npm --version
  docker --version
  ```

  Require branch `codex/integration-main-review`, linked-worktree Git/common dirs, no current `DSM_Back` diff, and exactly these five predecessor directories before the new migration exists:

  ```text
  20260716_init
  20260720_notification_delivery_outcome_policy
  20260725_user_onboarding_completed_at
  20260810_refresh_token_session_family
  20260825_integration_backend_deltas
  ```

  Require the runtime versions named in the integration specification. If the host still reports Node `v24.13.0` and npm `11.6.2` instead of Node `v24.19.0` and npm `11.19.0`, stop before audit or product mutation and obtain a separately approved environment-preparation step.

- [ ] **Step 3: Open the finding lifecycle**

  In the JSONL record whose ID is `F-006` and fingerprint is `8a3ef211a27aecc69a70c661b495ba9cca1a2ec2102c3da205c084e5414a6374`, append the audit history transition from `CONFIRMED` to `FIXING`, preserving every other finding byte-for-byte. Update the audit README aggregate from:

  ```text
  CONFIRMED 22, FIXING 0, UNKNOWN 2, RECHECKED 2
  ```

  to:

  ```text
  CONFIRMED 21, FIXING 1, UNKNOWN 2, RECHECKED 2
  ```

  Use the repository's existing JSONL field shape and timestamp convention; do not invent a second schema.

- [ ] **Step 4: Validate the exact two-file stage**

  Parse every JSONL line, recompute status totals, verify F-006 is the only changed record, run `git diff --check`, and inspect:

  ```powershell
  git diff -- .ai/audits/20260817-release-audit-full-project/findings.jsonl .ai/audits/20260817-release-audit-full-project/README.md
  ```

  Expected: valid JSONL, counts `21/1/2/2`, no product change, no Git action.

---

## Task 2: Task Registration and Completion Invariants

**Files:**

- Modify: `DSM_Back/src/tasks/tasks.service.spec.ts`
- Modify: `DSM_Back/src/tasks/tasks.service.ts`

- [ ] **Step 1: Add failing unit tests first**

  Extend `makeClientMock()` with `task.count: jest.fn()` and default it to `0` in `beforeEach`. Add literal tests for:

  - create with count 19 succeeds;
  - create with count 20 rejects with `ConflictException`, status 409 and exact message, without category lookup, Task write, notification write, or score recompute;
  - the create count predicate is exactly `userId`, `deletedAt: null`, and `startAt: { gte: dayStart, lt: nextDay }`, with no status filter;
  - full day plus invalid category returns 409 before category lookup; available day plus invalid category retains 404;
  - update first resolves the owned Task, excludes its ID on a different-day count, and rejects a full target day before category lookup, notification cancellation, Task write, or recompute;
  - same-UTC-day moves skip `count`, including an invalid changed category that retains 404;
  - `23:59:59.999Z` and the following `00:00:00.000Z` produce different ranges;
  - non-COMPLETED to COMPLETED stamps one captured instant; COMPLETED to PENDING/CANCELLED clears it; unrelated and same-status updates omit `completedAt` and preserve it;
  - repeated explicit completion preserves a non-null timestamp; explicit completion of a legacy COMPLETED/null Task stamps the current instant.

  Freeze time with Jest fake timers only inside the timestamp tests and restore real timers in `finally`/`afterEach` so existing tests remain isolated.

- [ ] **Step 2: Run the focused RED gate**

  From `DSM_Back`:

  ```powershell
  npm.cmd test -- --runInBand --cacheDirectory ..\.superpowers\sdd\2026-08-31-f006-task-score-integrity\jest-cache-tasks src/tasks/tasks.service.spec.ts
  ```

  Expected RED reasons: no `task.count` capacity call, no stable 409 path, incorrect completion timestamp transitions, and repeated explicit completion overwriting the timestamp. If failure is unrelated, invoke systematic debugging and resolve the premise before implementation.

- [ ] **Step 3: Implement the minimal service helpers**

  Add `ConflictException` to the Nest import, define `MAX_TASKS_PER_UTC_DAY = 20`, and add these exact private helpers:

  ```ts
  private utcDayRange(reference: Date): { dayStart: Date; nextDay: Date } {
    const dayStart = new Date(
      Date.UTC(
        reference.getUTCFullYear(),
        reference.getUTCMonth(),
        reference.getUTCDate(),
      ),
    );
    const nextDay = new Date(dayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return { dayStart, nextDay };
  }

  private isSameUtcDay(left: Date, right: Date): boolean {
    return (
      left.getUTCFullYear() === right.getUTCFullYear() &&
      left.getUTCMonth() === right.getUTCMonth() &&
      left.getUTCDate() === right.getUTCDate()
    );
  }

  private async assertDailyTaskCapacity(
    userId: string,
    startAt: Date,
    excludedTaskId: string | undefined,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const { dayStart, nextDay } = this.utcDayRange(startAt);
    const count = await client.task.count({
      where: {
        userId,
        deletedAt: null,
        startAt: { gte: dayStart, lt: nextDay },
        ...(excludedTaskId ? { id: { not: excludedTaskId } } : {}),
      },
    });

    if (count >= MAX_TASKS_PER_UTC_DAY) {
      throw new ConflictException('Daily task limit reached');
    }
  }
  ```

  In create, parse/validate `startAt`, call capacity before category lookup, then retain the current write/notification/recompute sequence. In update, load the owned Task first, derive the target `startAt`, and call capacity only when `isSameUtcDay` is false, before changed-category lookup and all side effects.

  Construct generic update data so `completedAt` is present only for a status transition:

  ```ts
  const completionData =
    dto.status === TaskStatus.COMPLETED && task.status !== TaskStatus.COMPLETED
      ? { completedAt: now }
      : dto.status !== undefined &&
          dto.status !== TaskStatus.COMPLETED &&
          task.status === TaskStatus.COMPLETED
        ? { completedAt: null }
        : {};
  ```

  Capture `now` once inside each Serializable callback attempt. In explicit completion use:

  ```ts
  const completedAt =
    task.status === TaskStatus.COMPLETED && task.completedAt !== null
      ? task.completedAt
      : now;
  ```

- [ ] **Step 4: Run GREEN and regression checks**

  Re-run the focused command. Then run:

  ```powershell
  npx.cmd eslint "src/tasks/tasks.service.ts" "src/tasks/tasks.service.spec.ts"
  git diff --check -- DSM_Back/src/tasks/tasks.service.ts DSM_Back/src/tasks/tasks.service.spec.ts
  git diff -- DSM_Back/src/tasks/tasks.service.ts DSM_Back/src/tasks/tasks.service.spec.ts
  ```

  Expected: all Task service tests pass; the existing Serializable `P2034` maximum-two-retry behavior, notification ordering, and score recompute ordering remain unchanged.

---

## Task 3: Canonical Achievement-Rate Rounding

**Files:**

- Modify: `DSM_Back/src/scores/scores.policy.spec.ts`
- Modify: `DSM_Back/src/scores/scores.policy.ts`

- [ ] **Step 1: Add literal policy oracles**

  Add a table-driven test whose expected values are hard-coded, not computed by the implementation:

  ```ts
  const dailyOracles = [
    [3, 1, 'LOW', 10, 0.7, 7, 7, 33.33],
    [20, 11, 'LOW', 110, 0.7, 77, 77, 55.0],
    [20, 12, 'LOW', 120, 1.0, 120, 120, 60.0],
    [20, 15, 'LOW', 150, 1.0, 150, 150, 75.0],
    [20, 16, 'LOW', 160, 1.3, 208, 208, 80.0],
    [20, 19, 'LOW', 190, 1.3, 247, 247, 95.0],
    [20, 20, 'LOW', 200, 1.5, 300, 300, 100.0],
    [20, 20, 'HIGH', 600, 1.5, 900, 900, 100.0],
    [21, 21, 'HIGH', 630, 1.5, 945, 900, 100.0],
    [800, 57, 'LOW', 570, 0.7, 399, 399, 7.13],
  ] as const;
  ```

  Build each completed-difficulty list from its literal count and difficulty, assert every projection field, and retain the existing tier boundary tests for 999/1000/2999/3000/6999/7000/14999/15000/29999/30000.

- [ ] **Step 2: Run the focused RED gate**

  ```powershell
  npm.cmd test -- --runInBand --cacheDirectory ..\.superpowers\sdd\2026-08-31-f006-task-score-integrity\jest-cache-policy src/scores/scores.policy.spec.ts
  ```

  Expected RED: legacy `57/800` returns `7.12`, not the required `7.13`.

- [ ] **Step 3: Apply the one-line canonical formula**

  Replace only the achievement-rate calculation with:

  ```ts
  const achievementRate =
    registeredTaskCount > 0
      ? Math.round((completedTaskCount * 10000) / registeredTaskCount) / 100
      : 0;
  ```

  Do not alter difficulty values, multiplier comparisons, `Math.round` for adjusted score, cap 900, or tier thresholds.

- [ ] **Step 4: Run GREEN and inspect the pair**

  Re-run the focused test, non-fixing ESLint on the two files, `git diff --check`, and the exact two-file diff. Expected: all literal daily and tier oracles pass.

---

## Task 4: Score Eligibility by Scheduled UTC Day

**Files:**

- Modify: `DSM_Back/src/scores/scores.service.spec.ts`
- Modify: `DSM_Back/src/scores/scores.service.ts`

- [ ] **Step 1: Add failing eligibility tests**

  Update existing completed fixtures to include an in-range `completedAt`. Add exact cases for completion at `dayStart` (included), at `nextDay` (excluded), one millisecond before `dayStart` (early), one millisecond after the prior scheduled day (late), and COMPLETED/null (excluded). In every excluded case assert the Task still contributes to `registeredTaskCount` but not `completedTaskCount` or `rawScore`.

  Assert the Prisma query uses the same active scheduled-day range and selects only:

  ```ts
  {
    status: true,
    difficulty: true,
    completedAt: true,
  }
  ```

- [ ] **Step 2: Run the focused RED gate**

  ```powershell
  npm.cmd test -- --runInBand --cacheDirectory ..\.superpowers\sdd\2026-08-31-f006-task-score-integrity\jest-cache-scores src/scores/scores.service.spec.ts
  ```

  Expected RED: current code counts every COMPLETED status without the timestamp boundaries.

- [ ] **Step 3: Implement the predicate without changing aggregation**

  Keep the registered Task query and current transaction client. Derive `completedDifficulties` with:

  ```ts
  const completedDifficulties = tasks
    .filter(
      (task) =>
        task.status === TaskStatus.COMPLETED &&
        task.completedAt !== null &&
        task.completedAt >= dayStart &&
        task.completedAt < nextDay,
    )
    .map((task) => task.difficulty);
  ```

  Preserve daily upsert, cumulative `cappedScore` aggregation, user total/tier update, and ranking behavior.

- [ ] **Step 4: Run GREEN and inspect the pair**

  Re-run the focused suite, non-fixing ESLint, `git diff --check`, and the exact two-file diff. Expected: boundary cases pass and existing daily cap/total/tier tests remain green.

---

## Task 5: Atomic Reconciliation Migration and PostgreSQL Regression

**Files:**

- Create: `DSM_Back/prisma/migrations/20260830_enforce_task_score_integrity/migration.sql`
- Create: `DSM_Back/test/task-score-integrity.pg-spec.ts`

- [ ] **Step 1: Write a static RED test before the migration exists**

  The `.pg-spec.ts` module must validate dedicated environment values synchronously before any runtime Prisma or Nest import. Use a type-only import only where needed. The validator contract is:

  ```ts
  type DisposableDatabaseConfig = {
    emptyUrl: string;
    upgradeUrl: string;
    prefixSchemaPath: string;
  };

  function requireDisposableDatabaseConfig(): DisposableDatabaseConfig {
    if (process.env.F006_DISPOSABLE_DB_TEST !== '1') {
      throw new Error('F006 disposable database marker is required');
    }

    const emptyUrl = process.env.F006_EMPTY_DATABASE_URL;
    const upgradeUrl = process.env.F006_UPGRADE_DATABASE_URL;
    const prefixSchemaPath = process.env.F006_PREFIX_SCHEMA_PATH;
    if (!emptyUrl || !upgradeUrl || !prefixSchemaPath) {
      throw new Error('F006 disposable database configuration is incomplete');
    }

    const parsed = [new URL(emptyUrl), new URL(upgradeUrl)];
    for (const url of parsed) {
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        throw new Error('F006 database protocol is invalid');
      }
      if (url.hostname !== '127.0.0.1') {
        throw new Error('F006 database host must be loopback');
      }
      if (!url.pathname.slice(1).startsWith('f006_task_score_integrity_')) {
        throw new Error('F006 database name is not task-owned');
      }
      if (url.pathname === '/dsm_test') {
        throw new Error('F006 refuses the common test database');
      }
    }
    if (parsed[0].port === parsed[1].port) {
      throw new Error('F006 databases require distinct ports');
    }

    return { emptyUrl, upgradeUrl, prefixSchemaPath };
  }
  ```

  Immediately evaluate the validator, set `process.env.DATABASE_URL` to the validated upgrade URL, then dynamically import `@prisma/client`, `PrismaService`, `ScoresService`, and `TasksService` in `beforeAll`. Never interpolate or print a URL in assertion errors.

  Add a static test that strips line comments, splits executable statements, and requires first `BEGIN`, second `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`, and last `COMMIT`. Run the dedicated test and require RED because the target SQL does not yet exist:

  ```powershell
  $f006PgSpecPath = (Resolve-Path '.\test\task-score-integrity.pg-spec.ts').Path
  npx.cmd jest --config ./test/jest-e2e.json --testRegex '.*\.pg-spec\.ts$' --runInBand --runTestsByPath $f006PgSpecPath
  ```

- [ ] **Step 2: Write the complete migration SQL**

  Use this statement structure, with no session-timezone-dependent casts:

  ```sql
  BEGIN;
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

  WITH task_facts AS (
    SELECT
      task."userId" AS user_id,
      (task."startAt" AT TIME ZONE 'UTC')::date AS score_date,
      (
        task."status" = 'COMPLETED'
        AND task."completedAt" IS NOT NULL
        AND task."completedAt" >= (
          ((task."startAt" AT TIME ZONE 'UTC')::date)::timestamp
          AT TIME ZONE 'UTC'
        )
        AND task."completedAt" < (
          (((task."startAt" AT TIME ZONE 'UTC')::date + 1)::timestamp)
          AT TIME ZONE 'UTC'
        )
      ) AS eligible,
      CASE task."difficulty"
        WHEN 'LOW' THEN 10
        WHEN 'MEDIUM' THEN 20
        WHEN 'HIGH' THEN 30
      END AS difficulty_score
    FROM "Task" AS task
    WHERE task."deletedAt" IS NULL
  ),
  daily_aggregate AS (
    SELECT
      user_id,
      score_date,
      COUNT(*)::integer AS registered_count,
      (COUNT(*) FILTER (WHERE eligible))::integer AS completed_count,
      COALESCE(
        SUM(CASE WHEN eligible THEN difficulty_score ELSE 0 END),
        0
      )::integer AS raw_score
    FROM task_facts
    GROUP BY user_id, score_date
  ),
  weighted AS (
    SELECT
      daily_aggregate.*,
      CASE
        WHEN completed_count = registered_count THEN 1.5::numeric
        WHEN completed_count * 5 >= registered_count * 4 THEN 1.3::numeric
        WHEN completed_count * 5 >= registered_count * 3 THEN 1.0::numeric
        ELSE 0.7::numeric
      END AS multiplier
    FROM daily_aggregate
  ),
  projected AS (
    SELECT
      user_id,
      score_date,
      registered_count,
      completed_count,
      raw_score,
      ROUND(raw_score::numeric * multiplier)::integer AS adjusted_score,
      LEAST(ROUND(raw_score::numeric * multiplier)::integer, 900) AS capped_score,
      (
        ROUND(completed_count::numeric * 10000 / registered_count) / 100
      )::numeric(5, 2) AS achievement_rate
    FROM weighted
  )
  INSERT INTO "DailyScore" (
    "id",
    "userId",
    "scoreDate",
    "rawScore",
    "achievementRate",
    "adjustedScore",
    "cappedScore",
    "completedTaskCount",
    "registeredTaskCount",
    "createdAt",
    "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    user_id,
    score_date,
    raw_score,
    achievement_rate,
    adjusted_score,
    capped_score,
    completed_count,
    registered_count,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM projected
  ON CONFLICT ("userId", "scoreDate") DO UPDATE SET
    "rawScore" = EXCLUDED."rawScore",
    "achievementRate" = EXCLUDED."achievementRate",
    "adjustedScore" = EXCLUDED."adjustedScore",
    "cappedScore" = EXCLUDED."cappedScore",
    "completedTaskCount" = EXCLUDED."completedTaskCount",
    "registeredTaskCount" = EXCLUDED."registeredTaskCount",
    "updatedAt" = CURRENT_TIMESTAMP;

  UPDATE "DailyScore" AS daily_score
  SET
    "rawScore" = 0,
    "achievementRate" = 0.00,
    "adjustedScore" = 0,
    "cappedScore" = 0,
    "completedTaskCount" = 0,
    "registeredTaskCount" = 0,
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE NOT EXISTS (
    SELECT 1
    FROM "Task" AS task
    WHERE task."userId" = daily_score."userId"
      AND task."deletedAt" IS NULL
      AND (task."startAt" AT TIME ZONE 'UTC')::date = daily_score."scoreDate"
  );

  WITH user_totals AS (
    SELECT
      app_user."id" AS user_id,
      COALESCE(SUM(daily_score."cappedScore"), 0)::integer AS total_score
    FROM "User" AS app_user
    LEFT JOIN "DailyScore" AS daily_score
      ON daily_score."userId" = app_user."id"
    GROUP BY app_user."id"
  )
  UPDATE "User" AS app_user
  SET
    "totalScore" = user_totals.total_score,
    "tier" = (
      CASE
        WHEN user_totals.total_score >= 30000 THEN 'MASTER'
        WHEN user_totals.total_score >= 15000 THEN 'DIAMOND'
        WHEN user_totals.total_score >= 7000 THEN 'PLATINUM'
        WHEN user_totals.total_score >= 3000 THEN 'GOLD'
        WHEN user_totals.total_score >= 1000 THEN 'SILVER'
        ELSE 'BRONZE'
      END
    )::"Tier",
    "updatedAt" = CURRENT_TIMESTAMP
  FROM user_totals
  WHERE app_user."id" = user_totals.user_id;

  COMMIT;
  ```

- [ ] **Step 3: Complete the fail-closed real-DB test harness**

  Add child-process helpers that invoke the local Prisma CLI with `DATABASE_URL` only in the child environment. Use `spawnSync` argument arrays; never construct a shell command string. Required operations are:

  ```ts
  const prismaCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  function runPrisma(
    args: string[],
    databaseUrl: string,
    input?: string,
  ): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(prismaCommand, ['prisma', ...args], {
      cwd: backendRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      input,
      shell: false,
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
  ```

  The suite must perform all of these assertions:

  1. `prisma migrate deploy` and `migrate status` on the empty route produce exactly six finished, non-rolled-back ledger rows.
  2. The upgrade route uses `F006_PREFIX_SCHEMA_PATH` to deploy exactly the pinned first five migrations, seeds dirty Task/DailyScore/User/RankingSnapshot state, then uses the live schema to deploy only the target.
  3. The normalized `information_schema.columns`, `pg_indexes`, enum labels, ordered migration names, and migration checksums match between empty and upgrade routes.
  4. The ten daily literals and ten tier literals from the spec are seeded independently and equal both `computeDailyScore`/`tierForScore` and migrated SQL projections.
  5. Valid same-day completions score; late, early, nextDay, and null completions remain registered but score zero.
  6. A stale existing DailyScore preserves its fixed ID and `createdAt`; a missing row receives UUID text and non-null timestamps; a stale row without active Tasks becomes all-zero; a user without DailyScore becomes total zero/BRONZE; the RankingSnapshot sentinel is unchanged.
  7. A second deploy reports no pending migrations, has exactly one successful target ledger row, and leaves IDs, `createdAt`, `updatedAt`, and projection values unchanged.
  8. A third database named `f006_task_score_integrity_atomic` is created inside the captured upgrade container by the runner. Deploy the prefix, seed a preimage, install a trigger that raises during `User` update through `prisma db execute --stdin`, execute the target with `prisma db execute --file`, require nonzero status, and compare every DailyScore/User preimage value after rollback.
  9. After target migration, instantiate actual `PrismaService`, `ScoresService`, and `TasksService`; seed one user and 19 active Tasks; issue two concurrent creates with `notificationEnabled: false`; assert exactly one fulfills, exactly one rejects with 409 and `Daily task limit reached`, and exactly 20 active Tasks remain.

  Seed the literal daily rows with deterministic UTC dates and IDs. For each fixture, create `registered` active Tasks, make the first `completed` rows `COMPLETED` at UTC noon of their scheduled day with the listed difficulty, and make the remaining rows `PENDING`/LOW. The 800/57 fixture is intentionally large and must not be reduced because it detects the old floating-point anomaly.

  Disconnect every Prisma client and app-owned Prisma service in `afterAll` and inner `finally` blocks. Do not log captured child stdout/stderr unless sanitized to remove both exact URL strings.

- [ ] **Step 4: Type-check the two-file stage without connecting**

  Run non-fixing ESLint and TypeScript build only after the fail-closed module proves it rejects missing configuration before dynamic imports:

  ```powershell
  $f006PgSpecPath = (Resolve-Path '.\test\task-score-integrity.pg-spec.ts').Path
  npx.cmd jest --config ./test/jest-e2e.json --testRegex '.*\.pg-spec\.ts$' --runInBand --runTestsByPath $f006PgSpecPath
  npx.cmd eslint "test/task-score-integrity.pg-spec.ts"
  npm.cmd run build
  git diff --check -- prisma/migrations/20260830_enforce_task_score_integrity/migration.sql test/task-score-integrity.pg-spec.ts
  ```

  The first command must fail with `F006 disposable database marker is required` before any connection. Treat that controlled failure as the expected fail-closed result, not as the later database PASS.

---

## Task 6: Controller-Owned Disposable PostgreSQL 17 Execution

**Files:** No tracked file modification. Runtime evidence is written only under `.superpowers/sdd/2026-08-31-f006-task-score-integrity/` after `git check-ignore` succeeds.

- [ ] **Step 1: Prove exclusion and absence**

  Use run suffix `r1`. If any exact path/name/port is occupied, stop without deletion. A retry after preserved failure evidence uses suffix `r2`, container names ending `-r2`, ports `55444` and `55445`, and a new extraction directory; it never overwrites `r1`.

  ```powershell
  git check-ignore -q .superpowers/sdd/2026-08-31-f006-task-score-integrity/progress.md
  docker ps -a --format "{{.ID}} {{.Names}} {{.Ports}}"
  Test-Path .superpowers\sdd\2026-08-31-f006-task-score-integrity\r1
  ```

  For `r1`, exact names are `dsm-f006-empty-20260831-r1` and `dsm-f006-upgrade-20260831-r1`; exact loopback ports are `55442` and `55443`. Capture the exact ID and running state of pre-existing `dsm-back-dev-db-1` if present, for unchanged-state comparison only.

- [ ] **Step 2: Extract the pinned predecessor tree without editing the worktree**

  Create the ignored `r1` evidence directory, archive only `DSM_Back/prisma` from commit `d8d6937cf7ef96b0d17ecfa2cbee6f3d0867b73e`, and expand it under `r1\prefix`. Require one `migration_lock.toml` and exactly the five named migration directories. Require the live tree to contain the same five plus `20260830_enforce_task_score_integrity`.

  ```powershell
  git archive --format=zip --output=.superpowers/sdd/2026-08-31-f006-task-score-integrity/r1/prefix.zip d8d6937cf7ef96b0d17ecfa2cbee6f3d0867b73e DSM_Back/prisma
  Expand-Archive -LiteralPath .superpowers\sdd\2026-08-31-f006-task-score-integrity\r1\prefix.zip -DestinationPath .superpowers\sdd\2026-08-31-f006-task-score-integrity\r1\prefix
  ```

  On Windows, do not assume `git archive` preserved the byte form Prisma recorded: historical migrations can have mixed worktree line endings under `core.autocrlf`. Prove each of the five live `migration.sql` paths is clean against `d8d6937cf7ef96b0d17ecfa2cbee6f3d0867b73e`, copy only those exact clean SQL bytes into the ignored prefix tree, and require the five live/prefix SHA-256 pairs to match before starting a database. Never normalize or edit an existing migration in the worktree.

- [ ] **Step 3: Start only two task-owned PostgreSQL 17 instances**

  Generate a process-only password and never echo it:

  ```powershell
  $f006Password = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
  ```

  Start `postgres:17-alpine` with `--rm`, no volume, loopback-only port publishing, database names `f006_task_score_integrity_empty` and `f006_task_score_integrity_upgrade`, and user `f006_runner`. Store each returned container ID in `$f006EmptyContainerId` and `$f006UpgradeContainerId`. Wait with `docker exec $f006EmptyContainerId pg_isready -U f006_runner` and `docker exec $f006UpgradeContainerId pg_isready -U f006_runner`. Create the atomic database only with `docker exec $f006UpgradeContainerId createdb -U f006_runner f006_task_score_integrity_atomic`. Record `docker image inspect postgres:17-alpine --format '{{.Id}} {{index .RepoDigests 0}}'`, and assert `SHOW server_version_num` begins with `17`.

  If Docker is proven unusable before any task container is created, use the official PostgreSQL 17 Windows binary ZIP only under the ignored task runtime. Record its official source URL, SHA-256 and binary version; initialize two new run-suffixed data directories with `initdb`; bind only `127.0.0.1` on the run's two unoccupied ports; and create the same empty, upgrade and atomic database names. Do not install a service or use any pre-existing cluster. Capture the two data directories as the cleanup identities and require `SHOW server_version_num` to begin with `17`.

- [ ] **Step 4: Prove ordinary discovery and fail-closed behavior**

  With all F-006 variables cleared:

  ```powershell
  npm.cmd run test:e2e -- --listTests
  $f006PgSpecPath = (Resolve-Path '.\test\task-score-integrity.pg-spec.ts').Path
  npx.cmd jest --config ./test/jest-e2e.json --testRegex '.*\.pg-spec\.ts$' --runInBand --runTestsByPath $f006PgSpecPath
  ```

  Require the list not to contain `task-score-integrity.pg-spec.ts`. Require the direct invocation to fail with the marker message before any database connection.

- [ ] **Step 5: Run the validated suite**

  Construct both URLs in process from `127.0.0.1`, the exact ports, `f006_runner`, the process-only password, and the task-owned database names. Use these PowerShell variables without writing or echoing them:

  ```powershell
  $f006EmptyUrl = "postgresql://f006_runner:$f006Password@127.0.0.1:55442/f006_task_score_integrity_empty?schema=public"
  $f006UpgradeUrl = "postgresql://f006_runner:$f006Password@127.0.0.1:55443/f006_task_score_integrity_upgrade?schema=public"
  $f006PrefixSchemaPath = (Resolve-Path '.superpowers\sdd\2026-08-31-f006-task-score-integrity\r1\prefix\DSM_Back\prisma\schema.prisma').Path
  $env:F006_DISPOSABLE_DB_TEST = '1'
  $env:F006_EMPTY_DATABASE_URL = $f006EmptyUrl
  $env:F006_UPGRADE_DATABASE_URL = $f006UpgradeUrl
  $env:F006_PREFIX_SCHEMA_PATH = $f006PrefixSchemaPath
  $env:DATABASE_URL = $f006UpgradeUrl
  ```

  Then run exactly:

  ```powershell
  $f006PgSpecPath = (Resolve-Path '.\test\task-score-integrity.pg-spec.ts').Path
  npx.cmd jest --config ./test/jest-e2e.json --testRegex '.*\.pg-spec\.ts$' --runInBand --runTestsByPath $f006PgSpecPath
  ```

  Expected: all static, empty-chain, seeded-upgrade, parity, exactly-once, rollback, and concurrent-create tests pass.

- [ ] **Step 6: Captured cleanup in `finally`**

  In a PowerShell `try/finally`, stop only the two non-empty captured IDs. For the portable fallback, call `pg_ctl stop -m fast -w` only for the two captured run data directories and require both exact ports to have zero listeners. Clear `$env:F006_DISPOSABLE_DB_TEST`, both URL variables, prefix path, `$env:DATABASE_URL`, and the password variable. Verify the two exact container names are absent when the container route was used and the pre-existing `dsm-back-dev-db-1` ID/state is unchanged. Never use wildcard stop/remove, `docker system prune`, `docker volume prune`, Prisma reset, or a shared database.

  Preserve `r1` evidence on failure. Record only sanitized commands, exit codes, migration names/checksums, schema signatures, image identity, server versions, assertions, and cleanup results; omit credentials and URLs.

---

## Task 7: Full Backend Verification

**Files:** No intended tracked modification.

- [ ] **Step 1: Run Prisma gates serially**

  Ensure no Node/Jest/Nest/Prisma generator process from this worktree is active, then from `DSM_Back` run:

  ```powershell
  npm.cmd run prisma:validate
  npm.cmd run prisma:generate
  npm.cmd run build
  ```

  If generation changes an unexpected tracked file or another process holds generated Prisma files, stop and apply the documented Prisma-generation playbook; do not force-delete generated output.

- [ ] **Step 2: Run focused and full tests**

  ```powershell
  npm.cmd test -- --runInBand --cacheDirectory ..\.superpowers\sdd\2026-08-31-f006-task-score-integrity\jest-cache-unit
  npm.cmd run test:e2e -- --runInBand --cacheDirectory ..\.superpowers\sdd\2026-08-31-f006-task-score-integrity\jest-cache-e2e
  npx.cmd eslint "{src,apps,libs,test}/**/*.ts"
  ```

  Use `npm.cmd`/`npx.cmd` on Windows. If the default Temp cache produces the known EPERM condition, retain the task-local ignored cache shown here; do not relax file permissions or use `--force`.

- [ ] **Step 3: Verify exact product scope and migration shape**

  Require the product diff to contain only these eight paths:

  ```text
  DSM_Back/src/tasks/tasks.service.ts
  DSM_Back/src/tasks/tasks.service.spec.ts
  DSM_Back/src/scores/scores.policy.ts
  DSM_Back/src/scores/scores.policy.spec.ts
  DSM_Back/src/scores/scores.service.ts
  DSM_Back/src/scores/scores.service.spec.ts
  DSM_Back/prisma/migrations/20260830_enforce_task_score_integrity/migration.sql
  DSM_Back/test/task-score-integrity.pg-spec.ts
  ```

  Run `git diff --check`, inspect `git diff --stat`, scan these eight paths for credentials/URLs/conflict markers, and verify `package.json`, lockfile, Prisma schema, existing migrations, `RankingSnapshot`, and offline-site files are unchanged.

---

## Task 8: Independent Adversarial Recheck

**Files:** Read-only review; no reviewer writes.

- [ ] **Step 1: Dispatch only under the approved execution profile**

  Recommended reviewer authorization: one implementation-independent `gpt-5.6-sol` reviewer at `high` reasoning, read-only. The reviewer receives the original F-006 condition, approved spec, this plan, exact eight-path product diff, focused/full command results, sanitized disposable-DB evidence, and migration checksum.

- [ ] **Step 2: Require findings-first output**

  The reviewer must independently check:

  - 20th allowed/21st stable 409 and create/update precedence;
  - Serializable count/write/retry behavior and current-ID exclusion;
  - completion timestamp transition/idempotence;
  - UTC half-open eligibility and registered denominator;
  - policy/SQL literal parity, cap, tiers, and 57/800;
  - first-five to target chronology, explicit transaction, rollback, upsert metadata, zero-user repair, exactly-once ledger;
  - fail-closed URL validation, normal-suite exclusion, captured cleanup, and no secret leakage;
  - regression or new P0/P1 findings.

  Any P0/P1, unverified required command, or unverifiable evidence returns the audit to implementation work. The reviewer must not edit files, close the audit, or authorize Git.

---

## Task 9: Audit Closure After Verified Recheck

**Files:**

- Modify: `.ai/audits/20260817-release-audit-full-project/findings.jsonl`
- Modify: `.ai/audits/20260817-release-audit-full-project/README.md`

- [ ] **Step 1: Record implementation evidence**

  In F-006's existing record shape, capture the exact eight fixed paths, focused/full commands and exit codes, sanitized PostgreSQL evidence path, target migration checksum, reviewer identity/profile, and reviewer result. Do not include a URL, password, container environment dump, or fabricated test output.

- [ ] **Step 2: Close only supported transitions**

  If and only if every required gate passed and the independent recheck found no P0/P1, main agent records `FIXING -> FIXED -> RECHECKING -> RECHECKED`. Update aggregate counts to:

  ```text
  CONFIRMED 21, FIXING 0, UNKNOWN 2, RECHECKED 3
  ```

  If evidence is incomplete, leave F-006 at `FIXING` and report the exact blocker.

- [ ] **Step 3: Validate JSONL and counts**

  Parse all lines, recompute counts, assert only F-006 changed since Task 1, run `git diff --check`, and inspect the exact audit pair.

---

## Task 10: Active Memory Execution Closure, Pair One

**Files:**

- Modify: `.ai/memory/plan.md`
- Modify: `.ai/memory/context.md`

- [ ] **Step 1: Record facts, not intentions**

  Add the approved execution profile and exact implementation outcome. Include runtime versions, eight paths, test counts/exit codes, disposable image/server identity, migration checksum and six-name ledger, atomic rollback, exactly-once, 19+2 concurrency result, reviewer result, audit status, and residual risks. State explicitly that shared/remote/prod DB, Firebase, deploy, Git stage/commit/push/PR/merge, and offline branch were untouched.

- [ ] **Step 2: Validate the pair**

  Check strict UTF-8, required F-006 anchors, no secret/URL, no unsupported PASS claim, `git diff --check`, and exact two-file diff.

---

## Task 11: Active Memory Checklist and Hash Closure

**Files:**

- Modify: `.ai/memory/checklist.md`
- Modify: `.ai/memory/README.md`

- [ ] **Step 1: Complete the evidence checklist**

  Mark each plan task `PASS`, `BLOCKED`, or not run with exact evidence. Never convert a missing Docker/runtime/database requirement to `NOT_APPLICABLE`. Record the separately gated Git and remote actions as not authorized.

- [ ] **Step 2: Refresh memory integrity metadata**

  Recompute the repository's existing active-memory byte counts and SHA-256 entries using its current README format. Verify plan/context/checklist semantic anchors, strict UTF-8, and unchanged error-resolution playbook.

- [ ] **Step 3: Final CCTV check**

  Run read-only final checks:

  ```powershell
  git status --short --branch
  git diff --check
  git diff --name-only HEAD
  git diff --stat HEAD
  git diff -- DSM_Back
  ```

  Reconcile the output with the approved document and eight-product-path allowlists. Confirm there are no tracked credentials, conflict markers, unplanned files, running task containers, changed manifests/lockfiles, or product test artifacts.

---

## Task 12: Handoff at the Git Gate

**Files:** No modification.

- [ ] **Step 1: Report the verified outcome and residual risk**

  Lead with whether F-006 is `RECHECKED` or remains `FIXING/BLOCKED`. List exact commands actually run, exact failures or omissions, the disposable cleanup result, and the fact that production-scale runtime/locks still require the spec's future staging-clone rehearsal.

- [ ] **Step 2: Stop before Git actions**

  Do not stage, commit, push, create a PR, merge, or deploy. If the user wants Git work, request a new approval that names the exact path set, commit structure/message, remote branch, and whether push is authorized. The existing blocked 177-commit integration push remains a separate decision and is not implicitly included in F-006.

## Self-Review Checklist Before Requesting Execution Approval

- [ ] Every approved spec section maps to a task: UTC capacity, completion transitions, score eligibility, rounding parity, data repair, fail-closed harness, empty/upgrade/atomic routes, exactly-once, concurrency, audit, memory, and Git gate.
- [ ] Each writable stage names exactly one or two files; runtime-only stages name no tracked file.
- [ ] Code snippets use current Prisma/Nest/Jest types and Windows command names.
- [ ] Migration SQL has explicit `BEGIN`, Serializable isolation, complete upsert/reset/user projection, enum cast, and final `COMMIT`; it contains no placeholder.
- [ ] Required RED and GREEN expectations are explicit and distinguish fail-closed expected failure from database-suite PASS.
- [ ] Container ownership, URL validation, evidence preservation, captured cleanup, and pre-existing-container protection are exact.
- [ ] No dependency, schema, manifest, lockfile, shared DB, remote, deployment, offline-branch, or Git action is silently authorized.

## Execution Handoff Options

1. **Recommended — sequential controller execution:** Approve `superpowers:executing-plans` in the current session, the two task-owned PostgreSQL 17 containers, and one read-only independent reviewer. This best preserves the exact two-file stages and stateful DB evidence.
2. **Subagent-driven execution:** Explicitly approve `superpowers:subagent-driven-development`, name the allowed implementation/reviewer profiles, and retain non-overlapping sequential ownership. No subagent may mutate audit or memory files; main agent remains the sole audit/memory controller.

Neither option includes Git stage, commit, push, PR, merge, shared/remote/production DB access, Firebase, or deployment.
