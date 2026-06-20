# DSM_Back Milestone 13 Review Report

## Summary

Milestone 13 stabilizes DSM_Back for DSM_Front integration and safer
multi-instance operation. The milestone closes the P0 backend gaps identified
after notification/realtime work in Milestone 12.

## Implemented

- Daily active task registration limit: max 20 non-deleted tasks per user per
  UTC day.
- NotificationSchedule duplicate protection: partial unique index for active
  `PENDING`/`PROCESSING` schedules per task, conflict fallback, and stale
  `PROCESSING` recovery.
- Optional Redis integration: cache helpers, Redis-backed Socket.IO adapter,
  and Redis-backed leaderboard cache with no-op fallback when `REDIS_URL` is
  empty.
- Leaderboard freshness hardening: score recomputation and realtime score
  events invalidate leaderboard cache before emitting ranking/leaderboard
  updates.
- Dependency audit review: non-breaking audit fix attempted, forced breaking
  downgrades rejected and residual production vulnerabilities documented.
- Backend contract document for REST, WebSocket, environment variables, and
  frontend integration constraints.

## Verification

- `npm test -- --runInBand`: passed, 25 suites / 174 tests.
- `npm run test:e2e`: passed, 1 suite / 2 tests.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dsm?schema=public npm run prisma:validate`: passed.
- `npm run build`: passed.
- `npm run lint`: passed.
- `npm audit --omit=dev`: completed with known residual vulnerabilities, 13 total (6 moderate, 7 high). No non-breaking fix is available from npm audit; `--force` proposes breaking downgrades.

## Residual Risks

- `npm audit --omit=dev` still reports production vulnerabilities through
  transitive `multer` and `uuid` paths. The available forced fixes downgrade
  NestJS/Firebase Admin to older major lines, so they remain accepted
  pre-production risk.
- If file upload endpoints are added before upstream `multer` fixes are
  available, request limits and upload-specific hardening must be added before
  public traffic.
- If Redis is disabled in an environment, leaderboard cache is bypassed and
  realtime fan-out remains single-instance in that environment.
- Apple Sign In still requires real Apple Developer configuration before
  production verification.

## Next Milestone

Recommended next work: DSM_Front integration foundation. Start with API client
configuration, token storage/refresh handling, authenticated route structure,
and screens that consume the now-documented DSM_Back v0 contract.
