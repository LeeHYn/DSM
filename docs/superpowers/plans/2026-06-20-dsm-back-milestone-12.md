# DSM Back Milestone 12 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining DSM_Back foundation for user profile/settings, FCM notification scheduling, and realtime score/ranking updates.

**Architecture:** Add focused NestJS modules for Users, Notifications, and Realtime. Keep existing Auth, Tasks, Scores, and Rankings APIs stable while adding narrow integration points.

**Tech Stack:** NestJS 11, Prisma 6, Jest, Firebase Admin SDK, `@nestjs/schedule`, `@nestjs/websockets`, Socket.IO.

---

### Task 1: Users Profile and Notification Settings API

**Files:**
- Create: `DSM_Back/src/users/users.module.ts`
- Create: `DSM_Back/src/users/users.service.ts`
- Create: `DSM_Back/src/users/users.controller.ts`
- Create: `DSM_Back/src/users/dto/update-profile.dto.ts`
- Create: `DSM_Back/src/users/dto/update-notification-settings.dto.ts`
- Create: `DSM_Back/src/users/users.service.spec.ts`
- Create: `DSM_Back/src/users/users.controller.spec.ts`
- Modify: `DSM_Back/src/app.module.ts`

- [ ] Write failing service tests for `getMe`, `updateProfile`, duplicate nickname conflict, notification setting update, and social account provider list.
- [ ] Implement DTOs, service, controller, and module.
- [ ] Register `UsersModule` in `AppModule`.
- [ ] Run `npm test -- users --runInBand`.
- [ ] Run full backend tests.

### Task 2: FCM Token and Notification Schedule Core

**Files:**
- Create: `DSM_Back/src/notifications/notifications.module.ts`
- Create: `DSM_Back/src/notifications/notifications.service.ts`
- Create: `DSM_Back/src/notifications/notifications.controller.ts`
- Create: `DSM_Back/src/notifications/fcm-admin.service.ts`
- Create: `DSM_Back/src/notifications/notification-scheduler.service.ts`
- Create: `DSM_Back/src/notifications/notification-events.ts`
- Create: `DSM_Back/src/notifications/dto/register-fcm-token.dto.ts`
- Create: `DSM_Back/src/notifications/dto/revoke-fcm-token.dto.ts`
- Create: `DSM_Back/src/notifications/notifications.service.spec.ts`
- Create: `DSM_Back/src/notifications/notifications.controller.spec.ts`
- Modify: `DSM_Back/src/app.module.ts`
- Modify: `DSM_Back/package.json`

- [ ] Add failing service tests for FCM token register/reactivate/revoke, task schedule upsert/cancel, due schedule success/failure/skip-without-token.
- [ ] Add failing controller tests for protected token register/revoke API delegation.
- [ ] Add `@nestjs/schedule` and `firebase-admin` dependencies.
- [ ] Implement FCM wrapper that is mockable in tests and restores escaped private-key newlines.
- [ ] Implement due schedule processing with `PENDING -> PROCESSING -> SENT/FAILED`.
- [ ] Register `ScheduleModule.forRoot()` and `NotificationsModule`.
- [ ] Run targeted notification tests, then full backend tests.

### Task 3: Task Mutation to Notification Schedule Integration

**Files:**
- Modify: `DSM_Back/src/tasks/tasks.module.ts`
- Modify: `DSM_Back/src/tasks/tasks.service.ts`
- Modify: `DSM_Back/src/tasks/tasks.service.spec.ts`

- [ ] Add failing tests that task create/upsert calls schedule upsert, task update refreshes schedule, and task remove cancels schedule.
- [ ] Inject `NotificationsService` into `TasksService`.
- [ ] On create/update call `upsertTaskSchedule`; on remove call `cancelTaskSchedule`.
- [ ] Keep existing score recompute behavior unchanged.
- [ ] Run `npm test -- tasks.service --runInBand`, then full backend tests.

### Task 4: Realtime Score and Ranking Events

**Files:**
- Create: `DSM_Back/src/realtime/realtime.module.ts`
- Create: `DSM_Back/src/realtime/ranking.gateway.ts`
- Create: `DSM_Back/src/realtime/ranking-realtime.service.ts`
- Create: `DSM_Back/src/realtime/realtime-events.ts`
- Create: `DSM_Back/src/realtime/ranking.gateway.spec.ts`
- Create: `DSM_Back/src/realtime/ranking-realtime.service.spec.ts`
- Modify: `DSM_Back/src/scores/scores.module.ts`
- Modify: `DSM_Back/src/scores/scores.service.ts`
- Modify: `DSM_Back/src/scores/scores.service.spec.ts`
- Modify: `DSM_Back/src/app.module.ts`
- Modify: `DSM_Back/package.json`

- [ ] Add failing tests that `ScoresService.recompute` emits `score.recomputed` after persistence succeeds.
- [ ] Add failing realtime service tests for `score.updated`, `ranking.updated`, and `leaderboard.updated` emission.
- [ ] Add failing gateway tests for JWT handshake and period subscription validation.
- [ ] Add WebSocket/EventEmitter dependencies.
- [ ] Implement event publisher/listener and Gateway room policy.
- [ ] Run targeted realtime/scores tests, then full backend tests.

### Task 5: Auth Logout FCM Revocation

**Files:**
- Modify: `DSM_Back/src/auth/dto/refresh-token.dto.ts`
- Modify: `DSM_Back/src/auth/auth.module.ts`
- Modify: `DSM_Back/src/auth/auth.service.ts`
- Modify: `DSM_Back/src/auth/auth.service.spec.ts`
- Modify: `DSM_Back/src/auth/auth.controller.spec.ts`

- [ ] Add failing tests for optional `fcmToken` and `deviceId` logout revocation.
- [ ] Extend logout DTO with optional FCM token/device ID.
- [ ] Inject `NotificationsService` into `AuthService`.
- [ ] Revoke FCM token only after refresh token ownership is verified.
- [ ] Keep malformed/foreign refresh token logout idempotent.

### Task 6: Documentation, Memory, and Review Report

**Files:**
- Modify: `.ai/memory/plan.md`
- Modify: `.ai/memory/context.md`
- Modify: `.ai/memory/checklist.md`
- Create: `docs/reviews/2026-06-20-dsm-back-review.md`

- [ ] Update memory files with completed milestone 12 details and remaining deferred items.
- [ ] Run `npm test -- --runInBand`.
- [ ] Run `npm run build`.
- [ ] Run `npm run lint`.
- [ ] Review changed source for security, error handling, side effects, and missing tests.
- [ ] Write the review report with findings, residual risks, and verification evidence.

