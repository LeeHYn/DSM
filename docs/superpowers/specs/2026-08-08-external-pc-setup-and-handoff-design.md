# External PC Setup and Handoff Design

## Status and provenance

This document reconciles the historical `c79a042b3c1e115fc0b092a8bddcd3e6723439d6` setup candidate with the integrated product tree reviewed on 2026-08-27. The historical document remains provenance only. Current Git refs, tracked source, active memory, and fresh verification output are authoritative when a dated value moves.

## Goal

An external Windows PC must be able to reconstruct the two local work streams without mixing them:

1. validate the canonical DSM product in an isolated integration worktree;
2. validate the offline learning site in its own branch and worktree;
3. preserve secrets, remote refs, `main`, databases, and deployment state;
4. hand the next operator reproducible evidence and explicit future Git choices.

## Authoritative topology

| Purpose | Ref or path | Contract |
|---|---|---|
| protected product base | `main`, `origin/main` at `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81` | never switch, merge, reset, or push during validation |
| canonical product source | `origin/codex/front-secure-session-rest-client` at `2a4e9916765b505037e1c533735d84cd9f251ccf` | complete product lineage consumed by the integration branch |
| local integration | `codex/integration-main-review` in `C:\dsm-integration-review` | local review and validation only; no push or PR |
| offline base | `43145b6e0407c3c539ca66deb1813ddbc2e97ec8` | offline branch ancestry root |
| local offline site | `codex/offline-learning-site` in `C:\dsm-offline-learning-site` | contains offline product plus approved memory extraction only; no push |

The offline learning site is not part of `DSM_Back`, `DSM_Front`, or the integration product tree. The integration branch may document the offline branch but must not import its files.

Neither local result is currently transferable from `origin` alone: `origin/codex/integration-main-review` is an older baseline and no `origin/codex/offline-learning-site` exists. An external PC must receive the local refs through a separately approved Git transfer or wait for an approved branch publication. This design does not authorize either action.

## Runtime and platform contract

- Git for Windows with PowerShell.
- Node.js `24.19.0` and npm `11.19.0` for both npm projects and the offline verifier.
- Microsoft OpenJDK 17 is the tracked frontend setup contract. The integration build also passed with Microsoft OpenJDK 21.0.12.1; use 17 for normal external-PC setup and 21.0.12.1 only when reproducing that exact integration evidence.
- Android SDK platform 36, build-tools 36.0.0, and NDK 27.1.12297006.
- Docker 29.6.1 or compatible Docker Desktop only for the named disposable PostgreSQL 17 validation task.
- Backend: NestJS 11, Prisma 6, PostgreSQL 17.
- Frontend: React Native 0.83.10 Community CLI, Android only.

There is no root npm workspace. Run `npm ci` separately in `DSM_Back` and `DSM_Front`. A user-scoped Node installation is acceptable, but every validation shell must resolve the exact versions before continuing.

## Product and migration contract

The canonical backend migration prefix is:

1. `20260716_init`
2. `20260720_notification_delivery_outcome_policy`
3. `20260725_user_onboarding_completed_at`
4. `20260810_refresh_token_session_family`

The integration branch adds only `20260825_integration_backend_deltas` when Task 9 is present. That migration deterministically removes duplicate active notification schedules before creating `NotificationSchedule_one_active_per_task`. Existing migrations are immutable.

Task 8 rulings remain binding:

- legacy notification runtime, the historical frontend runtime, and legacy refresh/account-delete implementations are `SUPERSEDED`;
- Redis/cache, realtime, general users APIs, `NotificationMode`, daily finalization, snapshot uniqueness, and the historical 20-Task implementation are `DEFER`;
- only the active-schedule partial unique invariant is `PORT`, through the new migration and its contract test.

## Validation design

Validation is ordered so a failure stops before a more expensive or stateful step:

1. verify branch identity, exact refs, clean status, and runtime versions;
2. install backend dependencies from the lockfile;
3. run Prisma validate/generate with a process-scoped parse-only URL on loopback port `1`, then remove it;
4. run backend build, full Jest, and non-fixing ESLint;
5. install frontend dependencies and run Jest, TypeScript, ESLint, and Android `assembleDebug`;
6. in the separate offline worktree, run the 66 Node tests and 28-source full verifier;
7. compare status and refs again.

Prisma validation in the baseline does not authorize a database connection. Migration application is confined to the two named disposable PostgreSQL 17 containers in the main integration plan. An unexpected connection attempt is a blocker.

## Security and side-effect boundary

- Never read or transfer real `.env` files, ADC material, OAuth credentials, tokens, keystores, private keys, database volumes, or user data.
- Document variable names and safe placeholders only.
- Frontend local configuration uses `API_BASE_URL` and `GOOGLE_WEB_CLIENT_ID`; both values are environment-specific and must not be copied from another PC into tracked files.
- Keep `FCM_DISPATCH_ENABLED=false` until a separately approved sandbox task.
- Do not connect to an existing, shared, remote, or production database.
- Do not run package upgrades, auto-fixing formatters, deployment, publish, push, PR creation, or remote branch mutation.
- Do not reuse or modify `C:\DEV` or the existing `dsm-back-dev-db-1` container.

## Handoff structure

The root handoff must present:

1. source-of-truth priority and dated ref snapshot;
2. isolated integration/offline branch topology;
3. exact runtime and local-only prerequisites;
4. backend, frontend, Android, and offline verification commands;
5. migration prefix and Task 9 delta;
6. non-transferred local state and secret boundaries;
7. read-only evidence collection;
8. future push/PR options as choices, never executed actions;
9. remaining gates, especially disposable migration validation and final independent review.

The active release audit remains open. F-006 is the next separately planned product-integrity obligation; M12C remains after audit closure. These are status facts, not authority to start those changes during setup.

## Acceptance criteria

- Both setup documents contain Node.js `24.19.0` and npm `11.19.0`.
- Commands match tracked scripts and use non-fixing backend lint.
- The Android command is `gradlew.bat assembleDebug --no-daemon`.
- Offline commands are byte-for-byte consistent with the main integration plan.
- All five migrations are named in order and the fifth is clearly integration-only.
- The offline site is clearly absent from the product tree.
- No stale platform, branch, checkpoint, secret, remote-write, or real-database guidance remains.
