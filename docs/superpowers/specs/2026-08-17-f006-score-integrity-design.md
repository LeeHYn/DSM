# F-006 Task Score Integrity Design

## Status

- Audit: `20260817-release-audit-full-project`
- Finding: `F-006` / P1 / fingerprint `8a3ef211a27aecc69a70c661b495ba9cca1a2ec2102c3da205c084e5414a6374`
- Design policy approved by the user on 2026-08-17.
- The in-place amendment approach and prioritized remediation design were approved by the user on 2026-08-30.
- The amended spec was re-reviewed and strengthened for migration and disposable-database safety on 2026-08-31.
- The user approved this re-reviewed amended written spec with `ㄱ` on 2026-08-31; implementation planning may proceed.
- Product implementation, migration application, Git push, PR, merge and deployment remain separately gated.

## Problem

`TasksService` currently allows a user to create Tasks for arbitrary past or future dates and complete them immediately. `ScoresService` groups Tasks by `startAt`, counts every `COMPLETED` status regardless of `completedAt`, and sums every date's capped score into `User.totalScore`. A user can therefore consume a separate 900-point cap on an unbounded number of fabricated dates and inflate tier and TOTAL ranking.

The requirements add a second missing invariant: a user may register at most 20 Tasks per day. The current service enforces neither that limit nor a trustworthy relationship between the scheduled day and the completion timestamp.

## Goals

1. Keep past and future Task creation available for calendar and history use.
2. Limit each user to 20 active Tasks for one UTC `startAt` day.
3. Award score only when the Task was completed during that same UTC day.
4. Preserve the existing 900-point daily cap, cumulative tier thresholds and ranking read model.
5. Make completion timestamps consistent across the generic update and explicit completion endpoints.
6. Repair existing `DailyScore` and `User.totalScore`/`tier` data from trustworthy Task fields without inventing historical timestamps.
7. Verify the application-level count invariant against real PostgreSQL Serializable concurrency.

## Non-goals

- Do not forbid creation of past or future Tasks.
- Do not move scoring to the actual completion day or redesign `DailyScore` semantics.
- Do not delete, cancel or silently move existing Tasks on over-limit historical days.
- Do not infer a timestamp for legacy rows whose `status` is `COMPLETED` but `completedAt` is null.
- Do not change DAILY/WEEKLY/TOTAL ranking APIs, tier thresholds or the 900-point cap.
- Do not rewrite historical `RankingSnapshot` rows. Live TOTAL ranking continues to use the repaired `User.totalScore`.
- Do not apply a migration to remote or production databases in this task.

## Chosen approach

The remediation uses two complementary service boundaries and one data-only reconciliation:

1. `TasksService` enforces the 20-Task registration limit inside the existing Serializable transaction.
2. `ScoresService` treats `completedAt` within the scheduled UTC day as a mandatory score-eligibility condition.
3. A data-only Prisma migration recalculates stored score projections from canonical Task rows.

This keeps the existing model and public API while blocking both unlimited date fabrication and incorrect completion attribution. A completion-day redesign was rejected because it would redefine registered-task count, achievement rate and all daily/weekly aggregation semantics. Rejecting past/future Tasks was rejected because it would unnecessarily remove calendar functionality.

## UTC day contract

For a reference timestamp, the service derives a half-open UTC range:

```text
dayStart = YYYY-MM-DDT00:00:00.000Z
nextDay = dayStart + 1 UTC calendar day
range = [dayStart, nextDay)
```

Every count and eligibility check uses this exact range. A timestamp at `dayStart` belongs to the day; a timestamp at `nextDay` belongs to the following day. Server locale and client timezone do not change the invariant.

## Task registration limit

Define `MAX_TASKS_PER_UTC_DAY = 20` in `TasksService`.

### Create

Derive the target UTC day and, before category lookup or `client.task.create`, count rows matching:

```ts
{
  userId,
  deletedAt: null,
  startAt: { gte: dayStart, lt: nextDay },
}
```

If the count is 20 or more, throw `ConflictException('Daily task limit reached')`. The capacity result deliberately has precedence over category lookup: a full day returns the stable 409 even when the same request names an invalid category. Category validation runs only after capacity passes. Task creation, notification schedule creation and score recomputation must not occur after the rejection.

### Update

Load the active user-owned Task first; a missing or foreign Task retains the existing Task-not-found result. Only an update that moves `startAt` to a different UTC day needs a target-day capacity check. Count active rows in the target range while excluding the current Task ID. If the target already contains 20 other Tasks, throw the same conflict before changed-category lookup, notification cancellation or any write. After capacity passes, validate a changed category before continuing.

A move within the same UTC day does not consume another slot and does not query capacity; a changed invalid category therefore retains its 404 result on that path. Soft-deleted rows do not consume a slot. PENDING, COMPLETED and CANCELLED active rows all count because the requirement limits registered Tasks, not only score-eligible Tasks.

### Concurrency

The count and write remain inside `runSerializableTransaction`. PostgreSQL Serializable predicate conflict detection prevents two concurrent requests from both committing after observing the same nineteenth Task. Existing bounded `P2034` retry reruns the complete callback. After retry, one request commits the twentieth Task and the other observes the limit and returns 409.

No database trigger or counter table is introduced. The existing `(userId, startAt)` index supports the range predicate.

## Completion timestamp transitions

The following rules make `status` and `completedAt` consistent:

- Transition from a non-COMPLETED status to `COMPLETED`: set `completedAt` to one captured `now` value.
- Transition from `COMPLETED` to PENDING or CANCELLED: set `completedAt` to null.
- Update that does not change completion status: preserve `completedAt`.
- Explicit completion of an already completed Task with a non-null timestamp: preserve the existing timestamp and behave idempotently.
- Explicit completion of a legacy completed Task with null `completedAt`: set it to the current timestamp; score eligibility is then evaluated normally.

`now` is captured once per transaction callback attempt so the Task write, notification decision and tests share one instant. A `P2034` retry may capture a new instant because the earlier transaction did not commit.

Moving a completed Task does not rewrite its completion timestamp. The old and new scheduled UTC days are recomputed; only the day whose scheduled and completed ranges agree can retain score.

## Score eligibility

`ScoresService.recompute` continues to load all active Tasks whose `startAt` is within the requested UTC day. This preserves `registeredTaskCount` and the achievement-rate denominator.

A Task contributes its difficulty to `completedDifficulties` only when all conditions hold:

```text
status == COMPLETED
completedAt != null
completedAt >= dayStart
completedAt < nextDay
```

Consequences:

- A Task completed on its scheduled UTC day earns score.
- A past Task completed today remains completed but earns no historical score.
- A future Task completed early remains completed but earns no future score.
- A legacy COMPLETED row with null `completedAt` earns no score.
- Up to 20 same-day Tasks can be completed immediately; this is bounded by both the registration limit and the existing 900-point cap.

The daily upsert, cumulative aggregation, tier mapping and ranking services remain unchanged.

## Existing-data reconciliation

Create a data-only Prisma migration at:

`DSM_Back/prisma/migrations/20260830_enforce_task_score_integrity/migration.sql`

### Migration-history contract

The current migration history already ends at `20260825_integration_backend_deltas`. The target migration name must sort after that predecessor. The canonical fresh-database order is therefore:

1. `20260716_init`
2. `20260720_notification_delivery_outcome_policy`
3. `20260725_user_onboarding_completed_at`
4. `20260810_refresh_token_session_family`
5. `20260825_integration_backend_deltas`
6. `20260830_enforce_task_score_integrity`

Verification must cover two distinct supported states. The empty-chain route applies all six migrations to a truly empty database and proves ordering, schema and migration-ledger validity; it has no historical score projections to compare. The seeded-upgrade route applies the first five migrations, seeds pre-remediation Task and stale projection rows, then introduces and applies only the target migration. Both routes must end with the same normalized schema signature and the same ordered set of six successful migration names/checksums. Repaired seeded projections are compared with explicit application-policy fixtures, not with the empty route. No migration is inserted before an already-recorded migration.

### Transaction and consistency contract

The data repair must not rely on the migration runner to infer an all-statements transaction. The target SQL owns its atomic boundary: its first executable statement is `BEGIN;`, immediately followed by `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;`, and its final executable statement is `COMMIT;`. The migration contains only transaction-compatible data reconciliation statements.

Every `DailyScore` repair and every dependent `User` projection update occurs inside that one transaction. A statement error aborts the migration transaction instead of committing a partial DailyScore/User state. Serializable isolation prevents a concurrent canonical-Task writer and the migration from both committing an execution that is inconsistent with any serial order; the separately required write drain avoids deciding which transaction must retry during a future deployment. A disposable failure probe must force an error during the User update and prove that all earlier DailyScore changes rolled back to their exact pre-migration values.

### SQL parity contract

The migration groups active Tasks with `deletedAt IS NULL` by `userId` and UTC score date. The date expression is `("startAt" AT TIME ZONE 'UTC')::date`; it must not depend on the connection's timezone. For the derived `score_date`, SQL defines `utc_day_start = score_date::timestamp AT TIME ZONE 'UTC'` and `utc_next_day = (score_date + 1)::timestamp AT TIME ZONE 'UTC'`. A Task contributes difficulty only when it is `COMPLETED`, `completedAt` is non-null and `completedAt >= utc_day_start AND completedAt < utc_next_day`; no implicit date-to-timestamp cast may reintroduce the session timezone.

The SQL projection must reproduce `scores.policy.ts` exactly:

- Difficulty score: `LOW=10`, `MEDIUM=20`, `HIGH=30`.
- `registeredTaskCount`: all active Tasks on the UTC score date.
- `completedTaskCount` and `rawScore`: only same-day eligible completed Tasks.
- Achievement multiplier: `1.5` when completed equals registered, `1.3` when `completed * 5 >= registered * 4`, `1.0` when `completed * 5 >= registered * 3`, otherwise `0.7`. A zero registered count produces zero values.
- `adjustedScore`: `ROUND(rawScore::numeric * multiplier)::integer`. Scores are non-negative, so PostgreSQL numeric rounding and JavaScript `Math.round` agree at every reachable boundary.
- `cappedScore`: `LEAST(adjustedScore, 900)`.
- `achievementRate` has one canonical numerator-first half-up definition. The application uses `Math.round(completedTaskCount * 10000 / registeredTaskCount) / 100`; SQL uses `ROUND(completed::numeric * 10000 / registered) / 100`, stored as `DECIMAL(5,2)`; zero when registered is zero. Neither side may round a precomputed floating-point ratio.
- Tier mapping from cumulative `totalScore`: `MASTER >= 30000`, `DIAMOND >= 15000`, `PLATINUM >= 7000`, `GOLD >= 3000`, `SILVER >= 1000`, otherwise `BRONZE`.

The User update must cover every User through a left-joined aggregate. Users with no DailyScore rows receive `totalScore = 0` and `tier = BRONZE`; the tier `CASE` result is explicitly cast to the PostgreSQL enum with `::"Tier"`. The same statement refreshes `User.updatedAt = CURRENT_TIMESTAMP` because Prisma's `@updatedAt` behavior does not run for raw SQL.

`scores.policy.ts` must adopt the canonical numerator-first achievement-rate expression before migration parity is asserted. This is unchanged for every newly permitted day because the registration limit is 20, but deliberately normalizes legacy over-limit floating-point anomalies such as 57 completions out of 800 registrations from 7.12% to the canonical 7.13%.

Boundary fixtures are fixed independent oracles, not values generated by either implementation under test. For daily fixtures, every completed Task has the listed difficulty:

| Registered | Completed | Difficulty | Raw | Multiplier | Adjusted | Capped | Rate |
| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 3 | 1 | LOW | 10 | 0.7 | 7 | 7 | 33.33 |
| 20 | 11 | LOW | 110 | 0.7 | 77 | 77 | 55.00 |
| 20 | 12 | LOW | 120 | 1.0 | 120 | 120 | 60.00 |
| 20 | 15 | LOW | 150 | 1.0 | 150 | 150 | 75.00 |
| 20 | 16 | LOW | 160 | 1.3 | 208 | 208 | 80.00 |
| 20 | 19 | LOW | 190 | 1.3 | 247 | 247 | 95.00 |
| 20 | 20 | LOW | 200 | 1.5 | 300 | 300 | 100.00 |
| 20 | 20 | HIGH | 600 | 1.5 | 900 | 900 | 100.00 |
| 21 | 21 | HIGH | 630 | 1.5 | 945 | 900 | 100.00 |
| 800 | 57 | LOW | 570 | 0.7 | 399 | 399 | 7.13 |

The first, second-to-seventh and final rows cover a non-terminating ratio, the closest reachable values below and at the 60%/80%/100% thresholds, and the legacy 57/800 anomaly. The 20- and 21-HIGH rows cover the cap boundary and a historical over-limit cap. Tier oracles are `999→BRONZE`, `1000→SILVER`, `2999→SILVER`, `3000→GOLD`, `6999→GOLD`, `7000→PLATINUM`, `14999→PLATINUM`, `15000→DIAMOND`, `29999→DIAMOND` and `30000→MASTER`. Both the amended application policy and migrated SQL must independently equal these literals.

### Upsert contract

`DailyScore.id` and `DailyScore.updatedAt` have no database defaults. Each missing row insert must supply:

- `id = gen_random_uuid()::text`, using the PostgreSQL 17 core UUID function without adding an extension;
- `createdAt = CURRENT_TIMESTAMP` and `updatedAt = CURRENT_TIMESTAMP`;
- the calculated projection fields; and
- conflict target `("userId", "scoreDate")` matching `DailyScore_userId_scoreDate_key`.

On conflict, preserve the existing `id` and `createdAt`, update every projection field and set `updatedAt = CURRENT_TIMESTAMP`. Existing `DailyScore` rows without active Tasks are reset to zero and receive the same `updatedAt` refresh. The conflict path is verified with a seeded stale row whose fixed ID and `createdAt` must survive reconciliation; a separate missing row must receive a generated UUID and non-null timestamps.

The SQL file is a Prisma migration, not a public replay procedure. Exactly-once behavior is verified by running `prisma migrate deploy` again after success: it must report no pending migration, retain exactly one successful target ledger row, and leave IDs, `createdAt`, projection fields and `updatedAt` unchanged because the target SQL was not executed again.

The migration's business projection must be deterministic and idempotent in effect; UUID and timestamp generation is limited to required persistence metadata:

1. Derive every user's active Task counts by UTC `startAt` date.
2. Count and sum difficulties only for Tasks satisfying the same-day `completedAt` eligibility rule.
3. Recalculate `registeredTaskCount`, `completedTaskCount`, `rawScore`, `adjustedScore`, `cappedScore` and `achievementRate` for existing Task days.
4. Upsert missing `DailyScore` rows for active Task days.
5. Reset existing `DailyScore` rows with no active Tasks to zero rather than retaining stale points.
6. Recalculate every `User.totalScore` from `DailyScore.cappedScore`, default users without scores to zero/BRONZE, map the existing six tier thresholds with an explicit `::"Tier"` cast and refresh `User.updatedAt`.

The migration does not modify `Task`, fabricate `completedAt`, remove Tasks from days containing more than 20 rows or rewrite `RankingSnapshot`. An over-limit historical day remains visible, cannot accept another active Task, and its score remains bounded at 900.

The migration source is prepared in the worktree but applied only to a disposable PostgreSQL 17 database during this work. Commit and remote or production application each require separate action-time approval.

### Future remote/production application gate

No shared, remote or production database is inspected or changed by F-006 implementation verification. A later application requires a new plan and action-time approval that names the exact environment and reviewed migration checksum. Before that approval, operators must rehearse row counts, runtime, locks and the rollback/failure procedure on a recent staging clone; take a recoverable backup; choose explicit lock and statement-timeout budgets; use the deployment system's direct non-pooled migration connection; and schedule a maintenance window that drains Task mutation, score recomputation and other projection writers.

After deployment, operators verify the six-migration ledger, repaired projection invariants and application health before resuming writes. A failed transaction is resolved only through the documented Prisma failed-migration procedure after cause review. A successfully applied but logically incorrect reconciliation is corrected by an approved forward migration or backup restore, never by editing the recorded SQL in place.

## Error contract

- HTTP status: `409 Conflict`
- Stable message: `Daily task limit reached`
- Rejection happens before Task, notification and score writes.
- Create checks target-day capacity before category lookup; full-day 409 wins over an invalid category. Otherwise category ownership errors remain `404 Category not found`.
- Update first resolves the owned Task. A different-day move checks target-day capacity before changed-category lookup; same-day updates skip capacity, so an invalid changed category remains 404.
- Persistent Serializable conflicts retain the existing Prisma `P2034` behavior after the bounded retry limit.
- No identifiers, Task contents or database values are added to error messages or logs.

## Test design

### TasksService unit tests

- Reject the twenty-first create before every write and recompute.
- Allow a create when the active target-day count is 19.
- Ignore soft-deleted rows through the count predicate.
- Count cancelled and completed active Tasks through the common predicate.
- Verify create precedence: full day plus invalid category returns 409 without category lookup; available day plus invalid category returns 404 without writes.
- Reject moving a Task into a full UTC day while excluding the Task being moved.
- Verify update precedence: Task lookup occurs first; a full different-day move returns 409 before changed-category lookup, while a same-day invalid category returns 404.
- Skip the count query when `startAt` stays within the same UTC day.
- Verify UTC midnight boundaries.
- Stamp and clear `completedAt` on generic status transitions.
- Preserve `completedAt` on repeated explicit completion.
- Stamp a legacy completed/null row only when explicitly completed again.

### ScoresService unit tests

- Update `scores.policy.spec.ts` first to require numerator-first half-up achievement-rate calculation, including the 57/800 legacy fixture, while preserving all existing score, cap and tier fixtures.
- Count a completion at `dayStart`.
- Exclude a completion exactly at `nextDay`.
- Exclude late completion of a past Task.
- Exclude early completion of a future Task.
- Exclude COMPLETED/null rows.
- Preserve registered count, daily cap, total and tier recomputation behavior.

### Disposable PostgreSQL harness safety

The real-database suite is `DSM_Back/test/task-score-integrity.pg-spec.ts`, not an `.e2e-spec.ts` file. The repository's normal `npm run test:e2e` selection therefore cannot discover it. In Jest 30, this config resolves `rootDir: "."` from `DSM_Back/test/jest-e2e.json`, so the dedicated invocation must override the regex and pass the resolved absolute test path. A relative `./test/...` or `./task...` path is a fail-closed command error because it is resolved against the config root or current working directory inconsistently. The dedicated PowerShell invocation is:

```powershell
$f006PgSpecPath = (Resolve-Path '.\test\task-score-integrity.pg-spec.ts').Path
npx.cmd jest --config ./test/jest-e2e.json --testRegex '.*\.pg-spec\.ts$' --runInBand --runTestsByPath $f006PgSpecPath
```

The suite fails closed unless `F006_DISPOSABLE_DB_TEST=1` and two dedicated URLs, `F006_EMPTY_DATABASE_URL` and `F006_UPGRADE_DATABASE_URL`, are all present. Before any Prisma/AppModule dynamic import or connection, it parses both dedicated URLs and requires loopback host `127.0.0.1`, distinct task-owned ports and database names beginning with `f006_task_score_integrity_`; `/dsm_test` is forbidden. The common setup's fallback `DATABASE_URL` is never consumed: only after both dedicated URLs pass validation does the suite overwrite `DATABASE_URL` with the upgrade URL and dynamically import database-using modules. A missing/partial marker or invalid dedicated URL fails before connection; full URLs and credentials are never logged.

The primary implementation route creates uniquely named PostgreSQL 17 `--rm` containers with no volume, captures their returned IDs and derives both URLs only from those captured containers. If the local Docker backend is proven unusable before any container is created, the controller may instead use an official PostgreSQL 17 portable binary archive placed under the ignored task runtime. That fallback must use two newly initialized task-owned data directories, distinct loopback-only ports, a process-generated credential, no Windows service installation and no shared product database. It records the archive source, SHA-256 and exact server version, starts and stops only those two captured data directories with `pg_ctl`, and verifies both ports have no listeners afterward. Both routes must prove their exact runtime and migration-extraction paths are initially absent, preserve failed evidence under a new run suffix, clear credentials and database variables, and perform cleanup in a `finally` path. Wildcard stop/remove, prune, reset and shared/local product databases are forbidden.

The predecessor-only upgrade tree is extracted read-only with `git archive` from pinned pre-target commit `d8d6937cf7ef96b0d17ecfa2cbee6f3d0867b73e`. Before use, the harness proves that archive contains `migration_lock.toml` and exactly the five migration directories listed in the migration-history contract, while the live tree contains those five plus the target. Because Windows `core.autocrlf` can make archive output disagree with the mixed historical working-tree line endings that Prisma hashes, the controller must first prove all five live predecessor SQL paths are clean against the pinned commit, then copy only those exact clean `migration.sql` bytes into the ignored prefix tree and require all five SHA-256 values to match the live files. It never edits an existing migration or deletes, renames or hides the target directory in the working tree to simulate an upgrade.

### Disposable PostgreSQL verification

- Statically assert that the target's first two executable statements are `BEGIN;` and `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;`, and that its final executable statement is `COMMIT;`.
- Assert normal e2e discovery does not list the `.pg-spec.ts` suite. Invoke that exact file without the F-006 marker/URLs and require a pre-connection failure, then run the validated dedicated invocation against only the captured disposable instances.
- Record the container image identity or official portable-archive source/SHA-256, and assert `SHOW server_version_num` reports PostgreSQL major 17 in each captured instance.
- Fresh route: apply all migrations through `20260830_enforce_task_score_integrity` to an empty PostgreSQL 17 database and assert exactly six successful migration records.
- Upgrade route: apply predecessors through `20260825_integration_backend_deltas`, seed the pre-remediation state, then introduce and apply only `20260830_enforce_task_score_integrity`.
- Seed representative valid, late, early and null completion rows plus intentionally stale DailyScore/User projections.
- Compare the normalized final schema and ordered migration names/checksums between empty and upgrade routes. Compare only the seeded-upgrade DailyScore/User projections with explicit application-policy expected fixtures.
- Assert inserted DailyScore IDs are UUID text and required timestamps are non-null; the existing-row conflict fixture preserves ID/createdAt; stale rows without active Tasks are zeroed; and a User with no DailyScore is reset to total zero and BRONZE.
- Run `prisma migrate deploy` a second time and assert no pending migration, exactly one successful target ledger row and byte/value-stable IDs, timestamps and projections.
- In a separate task-owned database inside a captured disposable instance, install a test-only failing User-update trigger, execute the target SQL, require failure and prove the explicit transaction restored every DailyScore/User projection to its pre-migration value.
- Assert the amended `computeDailyScore`/`tierForScore` and the migrated SQL independently equal every literal daily and tier oracle in the SQL parity contract.
- In the migrated database, seed one user and 19 active Tasks on one UTC day.
- Issue two concurrent service creates for that user/day.
- Assert exactly 20 active Tasks remain and exactly one request returns the stable conflict after Serializable retry.
- Run the existing backend unit, e2e, build, non-fixing lint and Prisma validation gates.

## File and stage boundaries

Each implementation stage modifies at most two exact files:

1. Registration and completion invariants:
   - `DSM_Back/src/tasks/tasks.service.ts`
   - `DSM_Back/src/tasks/tasks.service.spec.ts`
2. Canonical score rounding:
   - `DSM_Back/src/scores/scores.policy.ts`
   - `DSM_Back/src/scores/scores.policy.spec.ts`
3. Score eligibility:
   - `DSM_Back/src/scores/scores.service.ts`
   - `DSM_Back/src/scores/scores.service.spec.ts`
4. Data reconciliation and real-DB regression:
   - `DSM_Back/prisma/migrations/20260830_enforce_task_score_integrity/migration.sql`
   - `DSM_Back/test/task-score-integrity.pg-spec.ts`
5. Audit lifecycle opening and closure:
   - `.ai/audits/20260817-release-audit-full-project/findings.jsonl`
   - `.ai/audits/20260817-release-audit-full-project/README.md`

   This pair first records `CONFIRMED -> FIXING` after implementation approval and before product changes. After verified implementation and the independent recheck, the same pair records `FIXING -> FIXED -> RECHECKING -> RECHECKED`. No audit transition is made during implementation-plan authoring.
6. Active-memory state closure:
   - `.ai/memory/plan.md`
   - `.ai/memory/context.md`
7. Active-memory checklist/hash closure:
   - `.ai/memory/checklist.md`
   - `.ai/memory/README.md`

Product files, migration source and tests require a separate implementation-plan approval. Migration application to a disposable DB is included only when that plan is approved. Git stage, commit and push are separately reported and gated.

## Adversarial verification

F-006 is a confirmed P1 data-integrity finding, so the release-audit workflow remains authoritative:

1. Main agent records `CONFIRMED -> FIXING` only after implementation approval.
2. Implementation follows TDD and the exact file stages above.
3. Main agent verifies the diff, focused tests, full backend gates and disposable-DB evidence.
4. An implementation-independent reviewer performs `fix-recheck` against the original condition and checks the fix diff for new P0/P1 findings.
5. Main agent alone records `FIXED -> RECHECKING -> RECHECKED` if the evidence supports it.

## Residual risks

- The 20-Task invariant is enforced by Serializable application transactions rather than a database constraint; all Task writes must continue through `TasksService`.
- Direct database writes can violate the count limit and require administrative controls outside this task.
- The reconciliation can scan and update large Task/DailyScore/User sets; production runtime and lock budgets remain unknown until the separately approved staging-clone rehearsal.
- A successful data migration has no automatic down migration; recovery after a logic defect requires an approved forward correction or backup restore.
- Historical `RankingSnapshot` rows can retain old scores and must not be treated as the current leaderboard.
- User-visible timezone expectations remain a product decision; the current score and ranking contract is explicitly UTC.
- Remote/production data is not inspected or changed by this remediation.
