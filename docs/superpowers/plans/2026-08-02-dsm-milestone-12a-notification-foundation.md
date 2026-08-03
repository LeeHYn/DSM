# DSM Back Milestone 12A Notification Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated FCM token lifecycle APIs and keep Task notification schedules atomically synchronized without sending push notifications.

**Architecture:** A new `NotificationsModule` owns FCM token DTOs, controller, and Prisma-backed service. Existing Task mutations use Prisma nested writes to cancel stale `PENDING` schedules and create at most one new eligible schedule in the same Serializable transaction, while preserving score recomputation and historical schedule rows.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL schema contract, class-validator 0.15, Jest 30, TypeScript 5.7.

**Execution Result (2026-08-03):** Tasks 1-8 complete. Focused Jest passed 58 tests, full Jest passed 135 tests, TypeScript and non-fix ESLint for all 10 changed/new TypeScript files passed, and independent review found no product defects. Full-repository non-fix ESLint still reports five pre-existing Prettier errors in unchanged Auth files. Actual PostgreSQL schema application and concurrent transaction behavior remain deployment gates.

## Global Constraints

- Human implementation approval is recorded on 2026-08-02 in `.ai/memory/plan.md` and `.ai/docs/2026-07-10-milestone-12a-notification-foundation.md`.
- Each implementation assignment may write exactly 1-2 approved files under `DSM_Back/`.
- Use strict TDD: add a failing behavior test, run it and confirm the expected failure, then add minimum production code and rerun.
- Do not add packages or modify `package.json`, lockfiles, `.env*`, `prisma/schema.prisma`, migrations, generated Prisma files, or `DSM_Front/`.
- Do not initialize Firebase Admin, schedule a Cron worker, contact Firebase, access credentials, or connect to/change a database.
- FCM token request values are never logged, embedded in URLs, or returned in API responses.
- Schedule timestamps use Task `startAt` as the UTC `scheduledAt` value without conversion to local time.
- 12A creates only `PENDING` and `CANCELLED`; `PROCESSING`, `SENT`, and `FAILED` histories are not modified.
- Implementation subagents do not run Git write commands. The main agent owns branch state, memory updates, and any later commit/push.
- Baseline verified before Task 1: Jest 16 suites/99 tests passed; `tsc --noEmit --incremental false` passed.

---

### Task 1: Register FCM Token DTO Contract

**Files:**
- Create: `DSM_Back/src/notifications/dto/register-fcm-token.dto.ts`
- Create: `DSM_Back/src/notifications/notifications.controller.spec.ts`

**Interfaces:**
- Produces: `RegisterFcmTokenDto` with `token: string`, `platform: 'ios' | 'android'`, and optional `deviceId?: string`.
- Validation: token is nonblank and at most 4096 characters; platform is an allowlist; deviceId, when present, is nonblank and at most 255 characters.

- [x] **Step 1: Write failing DTO behavior tests**

Use `plainToInstance` and `validate` to assert a valid Android payload has no errors, then independently assert errors for whitespace token, 4097-character token, invalid platform, whitespace deviceId, and 256-character deviceId. Keep these tests in the initial `notifications.controller.spec.ts`; later tasks extend the same approved file.

```ts
const dto = plainToInstance(RegisterFcmTokenDto, {
  token: 'fcm-token',
  platform: 'android',
  deviceId: 'device-1',
});
expect(await validate(dto)).toHaveLength(0);
```

- [x] **Step 2: Verify RED**

Run: `npm test -- --runInBand --no-cache notifications.controller.spec.ts`

Expected: FAIL because `./dto/register-fcm-token.dto` does not exist.

- [x] **Step 3: Implement the minimum DTO**

Use `@IsString()`, `@IsNotEmpty()`, `@MaxLength(4096)`, and `@Matches(/\S/)` for token; `@IsIn(['ios', 'android'])` for platform; and optional string/nonblank/`@MaxLength(255)` validation for deviceId.

- [x] **Step 4: Verify GREEN**

Run the same focused Jest command. Expected: PASS.

---

### Task 2: Revoke FCM Token DTO Contract

**Files:**
- Create: `DSM_Back/src/notifications/dto/revoke-fcm-token.dto.ts`
- Modify: `DSM_Back/src/notifications/notifications.controller.spec.ts`

**Interfaces:**
- Produces: `RevokeFcmTokenDto` with one nonblank `token: string` field, maximum 4096 characters.

- [x] **Step 1: Add failing revoke validation tests**

Add a valid token case and independent whitespace/4097-character cases.

- [x] **Step 2: Verify RED**

Run the focused controller spec. Expected: FAIL because `RevokeFcmTokenDto` does not exist.

- [x] **Step 3: Implement the minimum DTO**

Use `@IsString()`, `@IsNotEmpty()`, `@MaxLength(4096)`, and `@Matches(/\S/)`; do not normalize or log the token.

- [x] **Step 4: Verify GREEN**

Run the focused controller spec. Expected: PASS.

---

### Task 3: FCM Token Lifecycle Service

**Files:**
- Create: `DSM_Back/src/notifications/notifications.service.spec.ts`
- Create: `DSM_Back/src/notifications/notifications.service.ts`

**Interfaces:**
- Consumes: `RegisterFcmTokenDto`, `RevokeFcmTokenDto`, and `PrismaService.fcmToken`.
- Produces: `registerFcmToken(userId, dto)` and `revokeFcmToken(userId, dto)`.
- Registration response select: `{ id, platform, deviceId, lastSeenAt, revokedAt }`; raw token must not be selected.

- [x] **Step 1: Write failing service tests**

Freeze time with Jest. Assert register calls `fcmToken.upsert` by the global `token` key and sets current `userId`, platform, `deviceId ?? null`, `lastSeenAt=now`, and `revokedAt=null` in both create/update branches. Return a sanitized fixture and assert no `token` property. Assert revoke calls `updateMany` with `{ token, userId, revokedAt: null }`, sets `revokedAt=now`, and resolves for count 0 or 1.

- [x] **Step 2: Verify RED**

Run: `npm test -- --runInBand --no-cache notifications.service.spec.ts`

Expected: FAIL because `NotificationsService` does not exist.

- [x] **Step 3: Implement minimum Prisma operations**

```ts
return this.prisma.fcmToken.upsert({
  where: { token: dto.token },
  create: { token: dto.token, userId, platform: dto.platform, deviceId: dto.deviceId ?? null, lastSeenAt: now, revokedAt: null },
  update: { userId, platform: dto.platform, deviceId: dto.deviceId ?? null, lastSeenAt: now, revokedAt: null },
  select: { id: true, platform: true, deviceId: true, lastSeenAt: true, revokedAt: true },
});
```

Revoke uses `updateMany` and returns `Promise<void>` regardless of affected count.

- [x] **Step 4: Verify GREEN**

Run the focused service spec. Expected: PASS.

---

### Task 4: Authenticated Notifications Controller

**Files:**
- Modify: `DSM_Back/src/notifications/notifications.controller.spec.ts`
- Create: `DSM_Back/src/notifications/notifications.controller.ts`

**Interfaces:**
- `PUT /notifications/fcm-tokens`: JWT-protected, delegates `req.user.sub`, returns the sanitized service result with 200.
- `DELETE /notifications/fcm-tokens`: JWT-protected, accepts token in body, delegates the current user, returns 204 and no body.

- [x] **Step 1: Add failing controller tests**

Compile `NotificationsController` with a mocked service and JWT guard dependencies. Assert register/revoke delegation with the authenticated user ID and assert route HTTP metadata makes DELETE 204. Keep DTO validation tests intact.

- [x] **Step 2: Verify RED**

Run the focused controller spec. Expected: FAIL because the controller does not exist.

- [x] **Step 3: Implement minimum controller**

Mirror `TasksController`'s `AuthRequest = Request & { user: JwtPayload }` pattern, apply `@Controller('notifications')` and class-level `@UseGuards(JwtAuthGuard)`, and use body DTOs only.

- [x] **Step 4: Verify GREEN**

Run the focused controller spec. Expected: PASS.

---

### Task 5: Notifications Feature Module

**Files:**
- Modify: `DSM_Back/src/notifications/notifications.controller.spec.ts`
- Create: `DSM_Back/src/notifications/notifications.module.ts`

**Interfaces:**
- Produces: `NotificationsModule` with `NotificationsController` and `NotificationsService`; `PrismaModule` is global but may be explicitly imported to match feature-module conventions.

- [x] **Step 1: Add a failing module compile test**

Extend `notifications.controller.spec.ts` to import `NotificationsModule`, compile a TestingModule containing it, and assert the controller and service resolve. The test import intentionally references the not-yet-created module.

- [x] **Step 2: Verify RED**

Run the focused controller spec.

Expected: FAIL with missing `./notifications.module`.

- [x] **Step 3: Add minimum module wiring**

Create the module with `imports: [PrismaModule]`, `controllers: [NotificationsController]`, and `providers: [NotificationsService]`.

- [x] **Step 4: Verify GREEN and focused regressions**

Run the focused controller spec and TypeScript. Expected: PASS.

---

### Task 6: AppModule Registration

**Files:**
- Modify: `DSM_Back/src/notifications/notifications.controller.spec.ts`
- Modify: `DSM_Back/src/app.module.ts`

**Interfaces:**
- AppModule imports `NotificationsModule` once.

- [x] **Step 1: Add a failing AppModule wiring test**

Use Nest `MODULE_METADATA.IMPORTS` reflection in `notifications.controller.spec.ts` to assert AppModule's imports contain `NotificationsModule`.

- [x] **Step 2: Verify RED**

Run the focused controller spec. Expected: FAIL because `AppModule` does not import `NotificationsModule`.

- [x] **Step 3: Register NotificationsModule**

Import `NotificationsModule` from `./notifications/notifications.module` and add it once to AppModule's `imports` array.

- [x] **Step 4: Verify GREEN**

Run the focused controller spec and TypeScript. Expected: PASS.

---

### Task 7: Atomic Task-NotificationSchedule Synchronization

**Files:**
- Modify: `DSM_Back/src/tasks/tasks.service.spec.ts`
- Modify: `DSM_Back/src/tasks/tasks.service.ts`

**Interfaces:**
- Application constants: `PENDING` and `CANCELLED` string literals for `NotificationSchedule.status`.
- Eligibility: `notificationEnabled === true`, `status === TaskStatus.PENDING`, `deletedAt === null`, and `startAt > now`.
- Schedule-changing update fields: `startAt`, `notificationEnabled`, or `status` only.

- [x] **Step 1: Add the first failing schedule tests**

Freeze time and assert future enabled Task creation nests one schedule create with current `userId`, identical `scheduledAt`, and `PENDING`. Assert past/equal-now/disabled creation omits `notificationSchedules`.

- [x] **Step 2: Verify RED**

Run: `npm test -- --runInBand --no-cache tasks.service.spec.ts`

Expected: FAIL because create data has no nested schedule.

- [x] **Step 3: Implement creation eligibility only**

Add a small private eligibility helper and nested create data. Run the focused spec until GREEN before continuing.

- [x] **Step 4: Add failing update transition tests**

Assert changing `startAt`, `notificationEnabled`, or `status` cancels all nested `PENDING` rows; eligible post-update state additionally creates one new `PENDING`. Assert title/description/difficulty/category-only updates omit `notificationSchedules`. The nested `updateMany` where clause must target only `PENDING`, preserving `SENT`/`FAILED`.

- [x] **Step 5: Implement update transition**

Derive the post-update Task state from `existing` plus DTO values. Add this shape only when a schedule-changing field is present:

```ts
notificationSchedules: {
  updateMany: { where: { status: 'PENDING' }, data: { status: 'CANCELLED' } },
  ...(eligible && { create: { userId, scheduledAt: nextStartAt, status: 'PENDING' } }),
}
```

Run the focused spec until GREEN.

- [x] **Step 6: Add failing complete/remove/failure-boundary tests**

Assert complete and soft-delete nest `PENDING -> CANCELLED`, score recomputation remains once per affected UTC date, and a rejected nested Task mutation does not call recompute. Keep existing Serializable/P2034 tests passing.

- [x] **Step 7: Implement complete/remove cancellation and verify GREEN**

Add nested `updateMany` to the existing Task update calls. Run the focused Task service spec, then all notifications specs.

---

### Task 8: Full Verification and State Recording

**Files:**
- Modify after verified success: `.ai/memory/plan.md`
- Modify after verified success: `.ai/memory/context.md`
- Modify after verified success: `.ai/memory/checklist.md`

**Interfaces:**
- No product behavior changes in this task.

- [x] **Step 1: Run non-mutating verification**

Run focused Jest, full `npm test -- --runInBand --no-cache`, `npx tsc --noEmit --incremental false`, and `npx eslint "{src,apps,libs,test}/**/*.ts"` without `--fix`.

- [x] **Step 2: Verify repository scope**

Run `git diff --check`, `git status --short`, and inspect `git diff -- package.json package-lock.json prisma/schema.prisma prisma/migrations DSM_Front`. Expected: no changes in excluded paths.

- [x] **Step 3: Independent final review**

Review the entire branch diff against this plan and `.ai/docs/2026-07-10-milestone-12a-notification-foundation.md`. Resolve all P0-P2 findings through the subagent review loop.

- [x] **Step 4: Update memory**

Mark 12A complete only when all verification is green. Record exact test counts and keep actual DB/migration status as an explicit unknown if no approved read-only DB connection was available.

---

## Acceptance Criteria

- Authenticated users can upsert and soft-revoke one FCM token without exposing the token in responses or URLs.
- Re-registration reactivates a token and transfers its ownership to the current user atomically.
- Eligible future Tasks own one newly created `PENDING` schedule; stale `PENDING` schedules are cancelled on relevant updates, completion, or deletion.
- Non-schedule Task updates leave schedule history untouched; `SENT` and `FAILED` records are preserved.
- Task/schedule mutation failure prevents score recomputation, while successful mutations preserve existing recomputation and Serializable retry behavior.
- No package, environment, Prisma schema/migration, Firebase, front-end, WebSocket, Redis, or Cron change is included.
- Focused and full tests, TypeScript, changed-file non-fix ESLint, and diff checks pass; pre-existing Auth formatting debt remains explicitly recorded.
