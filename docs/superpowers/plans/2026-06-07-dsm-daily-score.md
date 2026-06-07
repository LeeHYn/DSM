# DSM Back — Daily Score Aggregation (Milestone 10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Compute each user's daily achievement score from their tasks (FR-03), maintain a cumulative `totalScore` + `tier`, and expose read endpoints. Recompute is triggered whenever the user's tasks change.

**Scoring policy (FR-03, from Planing Document v1.3):**
- `rawScore = Σ(difficulty score of COMPLETED tasks)`; difficulty 하10 / 중20 / 상30.
- Achievement rate = completed / registered (that UTC day). Multiplier: 100%→×1.5, ≥80%→×1.3, ≥60%→×1.0, <60%→×0.7.
- `adjustedScore = round(rawScore × multiplier)`; `cappedScore = min(adjustedScore, DAILY_SCORE_CAP)`.
- **DAILY_SCORE_CAP = 900** (= 20 HIGH tasks × 1.5, the legitimate ceiling; binds only on abuse).
- Tier by cumulative score: 브론즈 0–999 / 실버 1k–2,999 / 골드 3k–6,999 / 플래티넘 7k–14,999 / 다이아 15k–29,999 / 마스터 30k+.

**Design decisions (confirmed with user):**
- Trigger: recompute on task create/update/remove/complete + read API. (Not cron — UTC-midnight finalize deferred.)
- Scope includes cumulative `totalScore` + `tier` refresh. Ranking (FR-04 / RankingSnapshot) deferred to a later milestone.

**Architecture:** New `src/scores` feature module. Pure scoring math lives in `scores.policy.ts` (unit-tested in isolation). `ScoresService.recompute(userId, dateRef)` reads that UTC day's tasks, upserts the `DailyScore` row (unique `userId_scoreDate`), then re-aggregates `Σ cappedScore` into `User.totalScore` + tier. `TasksModule` imports `ScoresModule` (exports `ScoresService`); `TasksService` calls `recompute` after each mutation (update recomputes both the old and new day). No schema/migration change — all DailyScore/User fields already exist.

---

## File Structure

- Create: `src/scores/scores.policy.ts` (+ `.spec.ts`) — difficulty/multiplier/cap/tier pure functions.
- Create: `src/scores/scores.service.ts` (+ `.spec.ts`) — recompute, getDaily, getSummary.
- Create: `src/scores/scores.controller.ts` (+ `.spec.ts`) — `GET /scores?date=`, `GET /scores/summary` (JwtAuthGuard).
- Create: `src/scores/dto/score-query.dto.ts` — optional `date` (IsDateString).
- Create: `src/scores/scores.module.ts` — exports `ScoresService`.
- Modify: `src/tasks/tasks.service.ts` — inject `ScoresService`; recompute on create/update/remove/complete.
- Modify: `src/tasks/tasks.module.ts` — import `ScoresModule`.
- Modify: `src/tasks/tasks.service.spec.ts` — provide `ScoresService` mock; assert recompute on create/complete.
- Modify: `src/app.module.ts` — register `ScoresModule`.
- Modify: `.ai/memory/*` — record Milestone 10.

No Prisma schema or migration changes. No new dependencies.

---

### Task 1: Scoring policy (pure functions, TDD)
- [ ] Write `scores.policy.spec.ts` covering the FR-03 worked examples (180 / 117 / 28), the zero-day, the 900 cap, and all 6 tier boundaries.
- [ ] Implement `DIFFICULTY_SCORE`, `achievementMultiplier`, `computeDailyScore`, `tierForScore`, `DAILY_SCORE_CAP`.

### Task 2: ScoresService + read API
- [ ] `recompute(userId, ref)`: findMany day tasks → `computeDailyScore` → `dailyScore.upsert` → `recomputeUserTotal` (aggregate Σ cappedScore → user.update totalScore + tierForScore).
- [ ] `getDaily(userId, ref)` → findUnique by `userId_scoreDate`. `getSummary(userId)` → user totalScore + tier.
- [ ] Controller `GET /scores?date=` (defaults to today UTC) and `GET /scores/summary`, guarded.
- [ ] Specs: recompute computes + caps + zero-day + refreshes total/tier; getDaily/getSummary delegate.

### Task 3: Tasks trigger integration
- [ ] Inject `ScoresService`; recompute after create/remove/complete (task's startAt day) and update (old + new day, deduped).
- [ ] Import `ScoresModule` in `TasksModule`; register in `AppModule`; update tasks.service.spec mock + assertions.

### Task 4: Verify + record
- [ ] `tsc --noEmit`, `eslint`, full `jest` all green. Update `.ai/memory`.

---

## Acceptance Criteria
- DailyScore upsert stores registered/completed counts, rawScore, adjustedScore, cappedScore (≤900), achievementRate; `User.totalScore`/`tier` reflect Σ cappedScore.
- Task create/update/remove/complete trigger a recompute for the affected UTC day(s).
- `GET /scores?date=` and `GET /scores/summary` return per-day and cumulative data for the authenticated user.
- No schema/migration change. Lint, type-check, and full Jest suite pass.
