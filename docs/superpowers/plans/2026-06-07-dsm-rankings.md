# DSM Back — Ranking & Percentile (Milestone 11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Provide daily / weekly / cumulative rankings with the user's rank + top percentile, a TOP-100 leaderboard, and a method to persist a `RankingSnapshot` (FR-04).

**Ranking policy (FR-04, from Planing Document v1.3):**
- DAILY: today's `DailyScore.cappedScore` (UTC day).
- WEEKLY: Σ `cappedScore` over the last 7 UTC days (inclusive).
- TOTAL: `User.totalScore` (cumulative).
- Each: rank + top percentile among **all users** (전체 유저 기준). `rank = (#users strictly above) + 1`; `percentile = round(rank / totalUsers × 100, 2)` ("top X%").
- TOP-100 leaderboard: rank, nickname, tier, profile image, score (IA 2.1.3).

**Design decisions (confirmed with user):**
- Compute **live on read** (query DailyScore/User each request). Batch/Redis/WebSocket (NFR-02/03) deferred.
- Scope: my-ranking + leaderboard + a `createSnapshot` method that persists one `RankingSnapshot` row (no automatic Cron).
- Ranking basis: **all users** (users with no period activity count as score 0).

**Architecture:** New `src/rankings` module. Pure rank/percentile math + UTC date-window helpers in `rankings.policy.ts` (unit-tested). `RankingsService` derives the subject's period score, counts users scoring higher (count / groupBy-having for weekly), and computes rank+percentile; leaderboards use ordered `findMany`/`groupBy`. No schema/migration change — `RankingSnapshot`/`RankingPeriod` already exist.

---

## File Structure

- Create: `src/rankings/rankings.policy.ts` (+ `.spec.ts`) — `computeRanking`, `startOfUtcDay`, `weeklyRange`.
- Create: `src/rankings/rankings.service.ts` (+ `.spec.ts`) — `getMyRanking`, `getLeaderboard`, `createSnapshot`.
- Create: `src/rankings/rankings.controller.ts` (+ `.spec.ts`) — `GET /rankings?period=`, `GET /rankings/leaderboard?period=&limit=`, `POST /rankings/snapshot` (JwtAuthGuard).
- Create: `src/rankings/dto/ranking-query.dto.ts`, `dto/leaderboard-query.dto.ts`.
- Create: `src/rankings/rankings.module.ts`.
- Modify: `src/app.module.ts` — register `RankingsModule`.
- Modify: `.ai/memory/*` — record Milestone 11.

No Prisma schema/migration changes. No new dependencies.

---

### Task 1: Ranking policy (pure)
- [ ] `computeRanking(higherCount, totalUsers)` → rank + top percentile; `startOfUtcDay`, `weeklyRange`. Spec covers first/last/empty + window boundaries.

### Task 2: RankingsService
- [ ] `scoreForUser` per period (TOTAL=user.totalScore; DAILY=today DailyScore.cappedScore; WEEKLY=Σ last-7-day cappedScore).
- [ ] `countHigher` per period (user.count / dailyScore.count / dailyScore.groupBy-having).
- [ ] `getMyRanking` → {period, score, rank, percentile, totalUsers}. `getLeaderboard` (TOTAL/DAILY/WEEKLY, top-N). `createSnapshot` persists a RankingSnapshot.

### Task 3: Controller + module + DTOs
- [ ] `GET /rankings`, `GET /rankings/leaderboard`, `POST /rankings/snapshot`, guarded. Register `RankingsModule` in `AppModule`. Specs for delegation + limit default (100).

### Task 4: Verify + record
- [ ] `tsc --noEmit`, `eslint`, full `jest` green. Update `.ai/memory`.

---

## Acceptance Criteria
- `GET /rankings?period=DAILY|WEEKLY|TOTAL` returns the user's score, rank, top percentile, and total user count, ranked against all users.
- `GET /rankings/leaderboard?period=&limit=` returns up to N (default 100) ranked entries with nickname/tier/profile/score.
- `POST /rankings/snapshot` persists a `RankingSnapshot` of the user's current standing.
- No schema/migration change. Lint, type-check, and full Jest suite pass.
- Deferred: batch/Redis caching, WebSocket realtime broadcast, automatic Cron snapshots (NFR-02/03).
