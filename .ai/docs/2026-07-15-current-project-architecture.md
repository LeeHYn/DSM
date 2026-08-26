# DSM Current Integrated Architecture

> Reconciled: 2026-08-27
> Historical provenance: `c79a042b3c1e115fc0b092a8bddcd3e6723439d6`
> Authority: tracked source and tests, current Git refs, active memory, then this document.

## 1. Scope and status

DSM is an Android-first schedule, score, ranking, authentication, and reminder service. This document describes the actual integrated tree, not a target architecture.

The product integration is local on `codex/integration-main-review` in `C:\dsm-integration-review`. The offline learning site is local on `codex/offline-learning-site` in `C:\dsm-offline-learning-site` and is absent from the product tree. Neither local result is fully available from `origin` alone.

`main` and `origin/main` remain protected at `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`. The canonical product source is `origin/codex/front-secure-session-rest-client` at `2a4e9916765b505037e1c533735d84cd9f251ccf`. The current local integration tip must always be recomputed with `git rev-parse HEAD`.

The release audit remains open. This branch is not release-ready, deployed, published, or merged into `main`.

## 2. Repository layout

- `DSM_Back`: NestJS 11 modular backend with Prisma 6 and PostgreSQL.
- `DSM_Front`: React Native 0.83.10 Community CLI Android application.
- `.ai`: controller policy, active memory, audits, and architecture records.
- `docs/superpowers`: reviewed specifications, execution plans, and integration evidence.

There is no root npm workspace. Backend and frontend have independent manifests and lockfiles.

## 3. Backend architecture

`DSM_Back/src/app.module.ts` composes Auth, Tasks, Categories, Scores, Rankings, and Notifications. Controllers expose REST contracts; services own authorization, transactions, provider boundaries, and persistence.

### Authentication and session security

- Google and Kakao provider exchange are implemented; Apple actual verification remains deferred.
- Access tokens are short-lived. Refresh tokens use `<recordId>.<secret>` so lookup is by primary key and only one bcrypt comparison is required.
- Refresh rotation preserves a `sessionId` family.
- Refresh and logout serialize on the same user row lock. Logout revokes only the presented active family.
- `/auth/me` returns the selected `userId` and `onboardingCompletedAt`, not a broad Prisma record.
- Account deletion and revoked-token reuse detection remain future family-aware work; the historical implementation was not ported.

### Task, category, score, and ranking

- Task mutation, notification-schedule synchronization, and score recomputation run in one Serializable transaction.
- Only Prisma `P2034` retries the entire callback, at most twice.
- Categories are actor-owned or default.
- Scores are UTC based with the canonical difficulty and completion factors, a 900 cap, and six tiers.
- DAILY, WEEKLY, and TOTAL rankings and actor-triggered snapshots are implemented.
- The UTC-day active Task limit and same-day `completedAt` eligibility are the separately approved F-006 obligation and are not implemented by this integration task.

### Notification model

- FCM token registration uses `PUT`; deletion is idempotent `DELETE`.
- A token or Firebase installation owned by another user returns `409` before mutation.
- Responses do not expose raw token material.
- The provider uses application default credentials and is disabled by default.
- Payloads are account-neutral data-only `REMINDER_SYNC` messages with `version=1`.
- The dispatcher uses per-device `NotificationDelivery`, schedule and delivery leases, heartbeat, bounded retry, and terminal `UNKNOWN` after an ambiguous post-send marker.
- Task 9 adds a database invariant allowing at most one `PENDING` or `PROCESSING` schedule per Task.

## 4. Frontend architecture

The frontend is an Android-only React Native Community CLI application. `DSM_Front/android` is tracked native source, not generated handoff state.

### Session and API client

- Access tokens are memory-only.
- Refresh tokens are stored in native Keychain under a versioned service.
- Token-store operations are serialized and protected by epoch/generation fences.
- Session bootstrap starts in a non-authenticated transient state so a stored session does not flash the login route.
- Authenticated requests use single-flight refresh, one replay at most, runtime response validation, timeout handling, and sanitized errors.
- Offline bootstrap preserves a recoverable token; protocol or storage corruption fails closed.
- Frontend configuration names are `API_BASE_URL` and `GOOGLE_WEB_CLIENT_ID`; no client secret belongs in the app.

### UI boundary

The navigation shell, login, onboarding, session recovery, and authenticated REST client are implemented. Core Task, score, and ranking screens still use prototype/fixed data in places, so secure transport completion does not imply product-feature completion.

The tracked setup contract uses Microsoft OpenJDK 17. The integration Android build was also reproduced with Microsoft OpenJDK 21.0.12.1. Android platform 36, build-tools 36.0.0, and NDK 27.1.12297006 are the verified native tool versions.

## 5. Data model and migrations

The canonical migration prefix is immutable:

1. `20260716_init`
2. `20260720_notification_delivery_outcome_policy`
3. `20260725_user_onboarding_completed_at`
4. `20260810_refresh_token_session_family`

The integration branch adds:

5. `20260825_integration_backend_deltas`

The fifth migration deterministically keeps the newest active schedule by `createdAt DESC, id DESC`, cancels older active rows, then creates `NotificationSchedule_one_active_per_task` without silently accepting an existing index.

Prisma validate/generate and the migration contract test pass. Actual empty-chain and canonical-prefix application of all five migrations remains Task 11 in two named disposable PostgreSQL 17 containers. No existing, shared, remote, or production database has been used for this integration delta.

## 6. Selective integration rulings

| Capability group | Ruling | Current consequence |
|---|---|---|
| active-schedule partial unique invariant | `PORT` complete | new forward migration and contract test only |
| Redis/cache and realtime | `DEFER` | no Redis service, Socket adapter, or realtime protocol |
| broad users/profile/settings APIs | `DEFER` | `/auth/me` remains selected and narrow |
| `NotificationMode` | `DEFER` | no new enum, settings API, or payload contract |
| daily finalization and ranking-snapshot uniqueness | `DEFER` | actor-triggered snapshots remain; no cron side effect |
| historical UTC-day 20-Task implementation | `DEFER` to F-006 | do not port its incompatible transaction/error behavior |
| legacy notification stack | `SUPERSEDED` | canonical dispatcher/provider/API remain authoritative |
| historical Foundation frontend | `SUPERSEDED` | current Android session architecture remains authoritative |
| legacy refresh reuse/account-delete implementation | `SUPERSEDED` | future capabilities need family-aware design |

## 7. Verification baseline

The latest completed evidence before Task 10 includes:

- Exact integration runtime: Node.js 24.19.0 and npm 11.19.0.
- Backend: Prisma validate/generate, Nest build, 23 Jest suites / 214 tests, and non-fixing ESLint.
- Frontend: 18 Jest suites / 162 tests, TypeScript, ESLint with zero errors, and a 365-task Android debug build.
- Task 9: dedicated migration contract test 1/1, Prisma validate/generate, URL removal, and build.
- Offline branch: 66 Node tests and a full verifier `PASS` over 28 sources.

These are evidence snapshots, not substitutes for fresh commands on another PC.

## 8. External systems and local state

Real `.env` files, ADC material, OAuth identifiers, tokens, keystores, SDK paths, database volumes, caches, generated clients, and build outputs are local state and must not be copied into Git or this document.

`FCM_DISPATCH_ENABLED=false` remains the safe default until a separately approved Firebase sandbox. Remote/production migration, actual message send, deploy, push, PR, and protected-branch mutation require separate action-time approval.

The existing `dsm-back-dev-db-1` container and `C:\DEV` workspace are out of scope and must not be reused or modified.

## 9. Offline learning branch

`codex/offline-learning-site` is based on `43145b6e0407c3c539ca66deb1813ddbc2e97ec8` and has one reviewed memory-only commit `2cbb088326044b9c44115741a761778f725da153`. Its source verification is independent of the product integration. The branch has no remote counterpart and must not be assumed available after a normal clone.

## 10. Next gates

1. Reconcile and review the Task 10 documents.
2. Validate the five-migration chain and canonical-prefix upgrade in Task 11 disposable databases.
3. Run the final product/offline matrix and independent whole-branch review.
4. Present local keep, approved push, or approved PR options without executing them.
5. Continue the separate release-audit sequence: F-006, remaining findings, then M12C.

## 11. Update rule

When this document disagrees with source, tests, Git refs, or fresh verification output, update the document. Never change source or refs merely to make a dated architecture sentence true.
