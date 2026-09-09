# DSM External PC Setup and Handoff

> Reconciled: 2026-08-27
> Historical provenance: `c79a042b3c1e115fc0b092a8bddcd3e6723439d6`
> This runbook does not authorize push, PR, merge, deployment, real database access, or secret transfer.

## 1. Purpose and fact priority

Use this runbook to reconstruct and verify the current DSM product integration and its separate offline learning branch on another Windows PC. Resolve disagreements in this order: tracked source/tests/Git refs, fresh verification output, active `.ai/memory`, the approved integration specification and plan, then this dated handoff.

## 2. Local and remote snapshot

| Item | Exact ref | Meaning |
|---|---|---|
| `main`, `origin/main` | `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81` | protected and unchanged |
| canonical product source | `origin/codex/front-secure-session-rest-client` at `2a4e9916765b505037e1c533735d84cd9f251ccf` | complete product lineage |
| local integration | `codex/integration-main-review` | current local result; recompute tip |
| remote integration baseline | `origin/codex/integration-main-review` at `6fa66eb5998c140bb6db995cc48c1a51f7a3089f` | older than local result |
| local offline branch | `codex/offline-learning-site` at `2cbb088326044b9c44115741a761778f725da153` | offline site plus approved memory |
| remote offline branch | absent | unavailable from a normal clone |

The local integration tip changes with reviewed closures. Recompute it with `git rev-parse HEAD`.

## 3. Transfer precondition

A normal clone cannot reconstruct either completed local result. Before using the worktree paths below, the external PC must receive the local refs through a separately approved branch publication, reviewed Git bundle, or reviewed PR flow. This document performs and approves none of them. If the refs are unavailable, stop; do not substitute the older remote baseline or `main`.

## 4. Isolated worktrees

```text
C:\dsm-integration-review
  branch: codex/integration-main-review
  content: DSM product integration

C:\dsm-offline-learning-site
  branch: codex/offline-learning-site
  content: offline learning site and approved offline memory
```

The offline site is absent from `DSM_Back`, `DSM_Front`, and the integration product tree. Do not modify, clean, switch, reset, or reuse `C:\DEV`.

## 5. Exact tools

- Git for Windows and PowerShell.
- Node.js `24.19.0`; npm `11.19.0`.
- Android platform 36, build-tools 36.0.0, NDK 27.1.12297006.
- Microsoft OpenJDK 17 for normal tracked setup. Microsoft OpenJDK 21.0.12.1 is only the successful integration-reproduction value.
- Docker 29.6.1 or compatible Docker Desktop only for later named disposable PostgreSQL 17 validation.

In every npm shell:

```powershell
function Assert-ExternalExit([string]$Step, [bool]$Succeeded, [int]$ExitCode) {
  if (-not $Succeeded -or $ExitCode -ne 0) {
    throw "$Step failed (resolved=$Succeeded, exit=$ExitCode)"
  }
}

node --version
Assert-ExternalExit 'read Node version' $? $LASTEXITCODE
npm --version
Assert-ExternalExit 'read npm version' $? $LASTEXITCODE
```

Expected: `v24.19.0` and `11.19.0`. If another installation resolves, prepend the approved Node directory to that process's `PATH`; do not weaken machine-wide script policy.

Keep this PowerShell process open for Sections 6–14; their command blocks call the `Assert-ExternalExit` helper defined above.

## 6. Local-only and secret state

Do not transfer real `.env` files, ADC, OAuth identifiers, tokens, client secrets, private keys, keystores, signing fingerprints, SDK paths, database volumes, user data, `node_modules`, generated clients, APKs, or caches. Use names and safe placeholders only. Keep `FCM_DISPATCH_ENABLED=false` until a separately approved sandbox. Do not stop, remove, reuse, or connect to `dsm-back-dev-db-1`.

## 7. Backend verification

Run in `C:\dsm-integration-review\DSM_Back`:

```powershell
npm ci --no-audit --no-fund
Assert-ExternalExit 'backend npm ci' $? $LASTEXITCODE
$validationDatabaseUrl = 'postgresql://dsm_validation:dsm_validation@127.0.0.1:1/dsm_validation?schema=public'
$env:DATABASE_URL = $validationDatabaseUrl
try {
  npm run prisma:validate
  Assert-ExternalExit 'Prisma validate' $? $LASTEXITCODE
  npm run prisma:generate
  Assert-ExternalExit 'Prisma generate' $? $LASTEXITCODE
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
$databaseUrlStillPresent = Test-Path Env:DATABASE_URL
$databaseUrlStillPresent
if ($databaseUrlStillPresent) { throw 'DATABASE_URL cleanup failed' }
npm run build
Assert-ExternalExit 'backend build' $? $LASTEXITCODE
npm test -- --runInBand --no-cache
Assert-ExternalExit 'backend test' $? $LASTEXITCODE
npx eslint "{src,apps,libs,test}/**/*.ts"
Assert-ExternalExit 'backend non-fixing lint' $? $LASTEXITCODE
```

Expected: all exit `0`, and `Test-Path Env:DATABASE_URL` is `False` after generate. The URL is parse-only; port `1` fails closed. Do not run migration application, database push, migration-status, or another database connection command. Do not use the backend lint script because it auto-fixes.

## 8. Frontend and Android verification

Run in `C:\dsm-integration-review\DSM_Front`:

```powershell
npm ci --no-audit --no-fund
Assert-ExternalExit 'frontend npm ci' $? $LASTEXITCODE
npm test -- --no-cache
Assert-ExternalExit 'frontend test' $? $LASTEXITCODE
npm run typecheck
Assert-ExternalExit 'frontend typecheck' $? $LASTEXITCODE
npm run lint
Assert-ExternalExit 'frontend lint' $? $LASTEXITCODE
```

Run in `C:\dsm-integration-review\DSM_Front\android`:

```powershell
.\gradlew.bat assembleDebug --no-daemon
Assert-ExternalExit 'Android assembleDebug' $? $LASTEXITCODE
```

The app is React Native 0.83.10 Community CLI and Android only. `android/` is tracked native source. Public local configuration names are `API_BASE_URL` and `GOOGLE_WEB_CLIENT_ID`; neither may contain a client secret or credential. Only after an approved local smoke, tracked runtime commands are `npm run start` and `npm run android`.

## 9. Migration inventory

Exact order:

1. `20260716_init`
2. `20260720_notification_delivery_outcome_policy`
3. `20260725_user_onboarding_completed_at`
4. `20260810_refresh_token_session_family`
5. `20260825_integration_backend_deltas`

The first four are the immutable canonical prefix. The fifth is Task 9's reviewed delta: it cancels older duplicate active schedules before creating `NotificationSchedule_one_active_per_task`. Actual empty-chain and canonical-prefix application remains Task 11 in two named disposable PostgreSQL 17 containers. This handoff touches no database.

## 10. Offline branch verification

Run only in `C:\dsm-offline-learning-site`:

```powershell
node --test "tools/learning-site/tests/*.test.mjs"
Assert-ExternalExit 'offline Node tests' $? $LASTEXITCODE
node tools/learning-site/verify.mjs --root C:\dsm-offline-learning-site --out C:\dsm-offline-learning-site\learning-site --batch batch-b --full --report C:\dsm-offline-learning-site\learning-site\verification-report.json
Assert-ExternalExit 'offline full verifier' $? $LASTEXITCODE
```

Expected: 66 tests, zero failures, verifier `PASS`, and 28 sources. Then run:

```powershell
git rev-list --left-right --count 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD
Assert-ExternalExit 'offline ancestry count' $? $LASTEXITCODE
git log --format="%H %s" 43145b6e0407c3c539ca66deb1813ddbc2e97ec8..HEAD
Assert-ExternalExit 'offline commit log' $? $LASTEXITCODE
git diff --name-only 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD
Assert-ExternalExit 'offline allowlist diff' $? $LASTEXITCODE
git diff --check 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD
Assert-ExternalExit 'offline diff check' $? $LASTEXITCODE
git status --short
Assert-ExternalExit 'offline status' $? $LASTEXITCODE
```

Expected: `0 1`, one focused memory commit, four approved `.ai/memory` paths, and no tracked dirt. Environment-only ignored files and line-ending materialization must not become branch content.

## 11. Current product architecture

Implemented foundations include NestJS/Prisma Auth, Tasks, Categories, Scores, Rankings and Notifications; refresh-token session families with user-row locking; Android memory-only access tokens and Keychain refresh tokens; validated REST clients with single-flight refresh and epoch fences; per-device notification delivery with leases, heartbeat, retry and terminal `UNKNOWN`; and the Task 9 active-schedule invariant.

Core Task/score/ranking UI still contains prototype/fixed data. The release audit remains open, so this branch is not release-ready.

## 12. Selective integration rulings

- `PORT` complete: active-schedule partial unique invariant only.
- `DEFER`: Redis/cache, realtime, broad users APIs, `NotificationMode`, daily finalization, ranking-snapshot uniqueness, and the historical UTC-day 20-Task implementation.
- `SUPERSEDED`: legacy notification runtime, historical Foundation frontend, and legacy refresh-reuse/account-delete implementation.

Future account-delete/reuse capabilities are not claimed complete.

## 13. Evidence and next gates

Completed evidence: backend Prisma/build/23 suites/214 tests/non-fixing ESLint; frontend 18 suites/162 tests/typecheck/lint zero errors/365-task Android build; Task 9 contract 1/1 and independent review; offline Node 66/66 and 28-source verifier `PASS`.

Remaining order: Task 10 document review, Task 11 disposable migration validation, final product/offline matrix, independent whole-branch review, then present Git choices. The separate release-audit order remains F-006, remaining findings, then M12C.

## 14. Read-only handoff evidence

```powershell
git status --short --branch
Assert-ExternalExit 'integration status' $? $LASTEXITCODE
git log --oneline --decorate -20
Assert-ExternalExit 'integration log' $? $LASTEXITCODE
git rev-parse HEAD
Assert-ExternalExit 'integration HEAD' $? $LASTEXITCODE
git rev-parse main
Assert-ExternalExit 'integration main ref' $? $LASTEXITCODE
git rev-parse origin/main
Assert-ExternalExit 'integration origin/main ref' $? $LASTEXITCODE
git rev-parse origin/codex/integration-main-review
Assert-ExternalExit 'integration remote baseline' $? $LASTEXITCODE
git rev-list --left-right --count origin/codex/integration-main-review...HEAD
Assert-ExternalExit 'integration ahead/behind' $? $LASTEXITCODE
git diff --check
Assert-ExternalExit 'integration diff check' $? $LASTEXITCODE
Get-ChildItem -LiteralPath DSM_Back/prisma/migrations -Directory | Sort-Object Name | Select-Object -ExpandProperty Name
```

Before resuming, read `.ai/system_prompt.md`, the three active `.ai/memory` files, the main integration specification/plan, and `docs/reviews/2026-08-25-main-integration-conflict-review.md`.

## 15. Windows stop conditions

- If PowerShell resolves a blocked shim or wrong Node, use the matching approved `npm.cmd`/`npx.cmd` or process-local `PATH`; do not relax global policy.
- If Gradle uses the wrong JDK, use supported JDK 17; use 21.0.12.1 only for exact evidence reproduction.
- If a pinned ref moved, a local branch is missing, status is dirty, runtime differs, or a required command fails, stop and record exact evidence.
- Never clean another user's changes, reset a worktree, improvise a secret, or reuse an existing database/container.

## 16. Completion and future choices

- [ ] Both local refs arrived through an explicitly approved transfer.
- [ ] Worktree identities and protected refs match.
- [ ] Node.js 24.19.0 and npm 11.19.0 resolve.
- [ ] Backend, frontend, Android and offline verification pass.
- [ ] Five migrations appear in order; the first four are unchanged.
- [ ] `DATABASE_URL` is absent after generation.
- [ ] No secret, database, remote ref, deployment or protected branch changed.

After final review, present one choice without executing it: keep both branches local; push only a named branch after explicit approval; or create a PR after separate explicit approval. Direct `main` mutation and force push remain forbidden.
