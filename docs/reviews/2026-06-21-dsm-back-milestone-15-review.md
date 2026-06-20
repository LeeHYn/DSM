# DSM_Back Milestone 15 Review

## Scope

Milestone 15 closes backend-only work before DSM_Front product screens:

- Account deletion with refresh-token confirmation.
- Notification mode settings and FCM payload propagation.
- Refresh token reuse detection with active-session revocation.
- UTC daily score finalization and DAILY ranking snapshot recreation.
- API contract and memory updates.

Out of scope remains Apple Sign In real verification, profile image object
storage, and forced breaking dependency upgrades.

## Implementation Summary

- Added Prisma `NotificationMode` enum and `User.notificationMode` with default `SOUND`.
- Added shared refresh token parsing and reuse detection in `AuthService`.
- Added `DELETE /users/me` through `UsersController` and `UsersService`.
- Extended notification settings DTO/service handling with optional `notificationMode`.
- Extended notification scheduling and FCM task reminder payloads with `notificationMode`.
- Added `DailyScoreFinalizationService` with `00:05 UTC` cron and deterministic testable methods.
- Added `RankingsService.createDailySnapshotsForDate()` for idempotent DAILY snapshot recreation.

## Verification Evidence

Targeted TDD checks run during implementation:

- `npm test -- auth.service.spec.ts --runInBand`: 1 suite, 11 tests passed.
- `npm test -- users.service.spec.ts users.controller.spec.ts --runInBand`: 2 suites, 17 tests passed.
- `npm test -- users.service.spec.ts users.controller.spec.ts notifications.service.spec.ts fcm-admin.service.spec.ts --runInBand`: 4 suites, 42 tests passed.
- `npm test -- rankings.service.spec.ts daily-score-finalization.service.spec.ts --runInBand`: 2 suites, 13 tests passed.

- `npm test -- --runInBand`: 27 suites, 191 tests passed.
- `npm run test:e2e`: 1 suite, 2 tests passed.
- `DATABASE_URL=postgresql://dsm:dsm@localhost:5432/dsm?schema=public npm run prisma:validate`: schema valid.
- `npm run build`: passed.
- `npm run lint`: passed.

Code review follow-up:

- Added refresh-token expiry validation for `DELETE /users/me`.
- Adjusted DAILY snapshot batch creation to use competition ranking for ties.
- Added `RankingSnapshot(userId, period, snapshotAt)` uniqueness and `skipDuplicates` for concurrent DAILY snapshot recreation protection.

## Review Notes

- Hard delete is acceptable for current pre-production state because no retention or deactivation policy exists yet.
- Notification mode is stored and transported by the backend; exact native sound/vibration behavior remains a DSM_Front device integration concern.
- Daily snapshot recreation is idempotent by deleting existing DAILY snapshots for the target `snapshotAt` before inserting current rows.
- Concurrent DAILY snapshot recreation is additionally guarded by a unique `(userId, period, snapshotAt)` constraint and `createMany(skipDuplicates)`.
