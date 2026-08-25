# F-006 Task Score Integrity Design

## Status

- Audit: `20260817-release-audit-full-project`
- Finding: `F-006` / P1 / fingerprint `8a3ef211a27aecc69a70c661b495ba9cca1a2ec2102c3da205c084e5414a6374`
- Design policy approved by the user on 2026-08-17.
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

Before `client.task.create`, count rows matching:

```ts
{
  userId,
  deletedAt: null,
  startAt: { gte: dayStart, lt: nextDay },
}
```

If the count is 20 or more, throw `ConflictException('Daily task limit reached')`. Category validation, Task creation, notification schedule creation and score recomputation must not occur after the rejection.

### Update

Only an update that moves `startAt` to a different UTC day needs a target-day capacity check. Count active rows in the target range while excluding the current Task ID. If the target already contains 20 other Tasks, throw the same conflict before cancelling notifications or writing the Task.

A move within the same UTC day does not consume another slot and does not query capacity. Soft-deleted rows do not consume a slot. PENDING, COMPLETED and CANCELLED active rows all count because the requirement limits registered Tasks, not only score-eligible Tasks.

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

`DSM_Back/prisma/migrations/20260817_enforce_task_score_integrity/migration.sql`

The migration must be deterministic and idempotent in effect:

1. Derive every user's active Task counts by UTC `startAt` date.
2. Count and sum difficulties only for Tasks satisfying the same-day `completedAt` eligibility rule.
3. Recalculate `registeredTaskCount`, `completedTaskCount`, `rawScore`, `adjustedScore`, `cappedScore` and `achievementRate` for existing Task days.
4. Upsert missing `DailyScore` rows for active Task days.
5. Reset existing `DailyScore` rows with no active Tasks to zero rather than retaining stale points.
6. Recalculate each `User.totalScore` from `DailyScore.cappedScore` and map the existing six tier thresholds exactly.

The migration does not modify `Task`, fabricate `completedAt`, remove Tasks from days containing more than 20 rows or rewrite `RankingSnapshot`. An over-limit historical day remains visible, cannot accept another active Task, and its score remains bounded at 900.

The migration source is committed but applied only to a disposable PostgreSQL 17 database during this work. Remote and production application require a separate action-time approval.

## Error contract

- HTTP status: `409 Conflict`
- Stable message: `Daily task limit reached`
- Rejection happens before Task, notification and score writes.
- Category ownership errors remain `404 Category not found` and are not conflated with the limit.
- Persistent Serializable conflicts retain the existing Prisma `P2034` behavior after the bounded retry limit.
- No identifiers, Task contents or database values are added to error messages or logs.

## Test design

### TasksService unit tests

- Reject the twenty-first create before every write and recompute.
- Allow a create when the active target-day count is 19.
- Ignore soft-deleted rows through the count predicate.
- Count cancelled and completed active Tasks through the common predicate.
- Reject moving a Task into a full UTC day while excluding the Task being moved.
- Skip the count query when `startAt` stays within the same UTC day.
- Verify UTC midnight boundaries.
- Stamp and clear `completedAt` on generic status transitions.
- Preserve `completedAt` on repeated explicit completion.
- Stamp a legacy completed/null row only when explicitly completed again.

### ScoresService unit tests

- Count a completion at `dayStart`.
- Exclude a completion exactly at `nextDay`.
- Exclude late completion of a past Task.
- Exclude early completion of a future Task.
- Exclude COMPLETED/null rows.
- Preserve registered count, daily cap, total and tier recomputation behavior.

### Disposable PostgreSQL verification

- Apply predecessor migrations through `20260810_refresh_token_session_family` to a fresh PostgreSQL 17 database.
- Seed representative valid, late, early and null completion rows plus intentionally stale DailyScore/User projections.
- Apply `20260817_enforce_task_score_integrity`; assert repaired DailyScore and User total/tier values, then verify a second target-migration application is not attempted because Prisma records it exactly once.
- In the migrated database, seed one user and 19 active Tasks on one UTC day.
- Issue two concurrent service creates for that user/day.
- Assert exactly 20 active Tasks remain and exactly one request returns the stable conflict after Serializable retry.
- Run the existing backend unit, e2e, build, non-fixing lint and Prisma validation gates.

## File and stage boundaries

Each implementation stage modifies at most two exact files:

1. Registration and completion invariants:
   - `DSM_Back/src/tasks/tasks.service.ts`
   - `DSM_Back/src/tasks/tasks.service.spec.ts`
2. Score eligibility:
   - `DSM_Back/src/scores/scores.service.ts`
   - `DSM_Back/src/scores/scores.service.spec.ts`
3. Data reconciliation and real-DB regression:
   - `DSM_Back/prisma/migrations/20260817_enforce_task_score_integrity/migration.sql`
   - `DSM_Back/test/task-score-integrity.e2e-spec.ts`
4. Main-agent closure after independent recheck:
   - exact audit ledger/README stage
   - exact active-memory stage

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
- Historical `RankingSnapshot` rows can retain old scores and must not be treated as the current leaderboard.
- User-visible timezone expectations remain a product decision; the current score and ranking contract is explicitly UTC.
- Remote/production data is not inspected or changed by this remediation.
