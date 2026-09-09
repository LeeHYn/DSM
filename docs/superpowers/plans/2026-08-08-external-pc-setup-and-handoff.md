# Historical External PC Setup and Handoff Plan

> **역사 기록 — 현재 실행 지침이 아닙니다.** 이 문서는 2026-08-08 branch·migration·Git 제약을 보존합니다. 현재 Windows clone·개발 절차는 [Windows clone·개발 가이드](../../setup/windows-clone-and-development.md)를 사용하세요.

> Reconciled on 2026-08-27 from historical candidate `c79a042b3c1e115fc0b092a8bddcd3e6723439d6`. Current refs and tracked repository facts override the historical snapshot.

**Goal:** Reconstruct and verify the DSM integration and offline branches on an external Windows PC without changing remotes, `main`, existing databases, secrets, or deployment state.

**Architecture:** Use `C:\dsm-integration-review` for local `codex/integration-main-review` and `C:\dsm-offline-learning-site` for local `codex/offline-learning-site`. The first contains the canonical product integration; the second contains the offline learning site. They never share product files.

**Toolchain:** Node.js 24.19.0, npm 11.19.0, Git for Windows, PowerShell, Microsoft OpenJDK 17 for the tracked frontend setup (or 21.0.12.1 only to reproduce the successful integration build), Android platform 36/build-tools 36.0.0/NDK 27.1.12297006, Docker 29.6.1 for later disposable PostgreSQL 17 validation only.

## Global constraints

- Keep `main` and `origin/main` at `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`.
- Treat `origin/codex/front-secure-session-rest-client` `2a4e9916765b505037e1c533735d84cd9f251ccf` as the canonical product source.
- Do not modify, clean, switch, reset, or reuse `C:\DEV`.
- Do not push, create a PR, deploy, publish, upgrade packages, read secrets, or connect to an existing/shared/remote database.
- Do not stop, remove, reuse, or connect to `dsm-back-dev-db-1`.
- Stop on the first failed required command and record its exact exit code.
- The local integration branch is ahead of its older remote baseline, and the offline branch has no remote. A normal clone cannot reproduce either completed local result until a separate Git transfer or publication is explicitly approved.

## Task 1: Verify refs, worktrees, and exact runtime

Run read-only Git checks in the clone:

```powershell
function Assert-ExternalExit([string]$Step, [bool]$Succeeded, [int]$ExitCode) {
  if (-not $Succeeded -or $ExitCode -ne 0) {
    throw "$Step failed (resolved=$Succeeded, exit=$ExitCode)"
  }
}

git fetch --prune origin
Assert-ExternalExit 'git fetch' $? $LASTEXITCODE
git rev-parse main
Assert-ExternalExit 'resolve main' $? $LASTEXITCODE
git rev-parse origin/main
Assert-ExternalExit 'resolve origin/main' $? $LASTEXITCODE
git rev-parse origin/codex/front-secure-session-rest-client
Assert-ExternalExit 'resolve canonical product ref' $? $LASTEXITCODE
git worktree list --porcelain
Assert-ExternalExit 'list worktrees' $? $LASTEXITCODE
git status --short --branch
Assert-ExternalExit 'read clone status' $? $LASTEXITCODE
```

Expected protected values are the two exact SHAs in Global constraints. Fetch changes only remote-tracking metadata; it does not authorize checkout, merge, pull, push, or branch deletion. If a pinned ref moved, stop and reconcile the reviewed integration plan before continuing.

In every npm verification shell, prepend the exact Node directory to `PATH`, then prove:

```powershell
node --version
Assert-ExternalExit 'read Node version' $? $LASTEXITCODE
npm --version
Assert-ExternalExit 'read npm version' $? $LASTEXITCODE
```

Expected: `v24.19.0` and `11.19.0`.

Keep this PowerShell process open for Tasks 2–6; their command blocks call the `Assert-ExternalExit` helper defined above.

## Task 2: Verify the integration worktree

In `C:\dsm-integration-review`, require branch `codex/integration-main-review`, a clean tracked status, and unchanged protected refs. The current migration directories must be exactly:

```text
20260716_init
20260720_notification_delivery_outcome_policy
20260725_user_onboarding_completed_at
20260810_refresh_token_session_family
20260825_integration_backend_deltas
```

The first four are canonical. The fifth is the reviewed integration delta. Do not edit or regenerate any migration.

If the local ref was not transferred to the external PC, stop here. Do not construct an apparent integration branch from the older remote baseline and do not treat `main` as the integrated result.

## Task 3: Install and verify the backend

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

Expected: every command exits `0` and `Test-Path Env:DATABASE_URL` is `False` after generate. The URL is parse-only and port `1` fails closed. Do not run Prisma migration, database push, migration-status, or any other database connection command in this task. The repository lint script is not used because it includes automatic fixes.

## Task 4: Install and verify the Android frontend

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

Then run in `C:\dsm-integration-review\DSM_Front\android`:

```powershell
.\gradlew.bat assembleDebug --no-daemon
Assert-ExternalExit 'Android assembleDebug' $? $LASTEXITCODE
```

This is a React Native 0.83.10 Community CLI Android project. No Web or iOS launch path is part of this handoff. Local SDK/JDK paths and signing material remain outside Git.

Create only local untracked configuration from safe placeholders. The current public variable names are `API_BASE_URL` and `GOOGLE_WEB_CLIENT_ID`; never place a client secret, token, keystore value, or credential in frontend configuration. For an explicitly approved local smoke after the validation gate, the tracked scripts are:

In terminal A, keep Metro running:

```powershell
npm run start
if ($LASTEXITCODE -ne 0) { throw "Metro start failed with exit code $LASTEXITCODE" }
```

After Metro is ready, run in terminal B:

```powershell
npm run android
if ($LASTEXITCODE -ne 0) { throw "Android run failed with exit code $LASTEXITCODE" }
```

## Task 5: Verify the separate offline learning branch

Require `C:\dsm-offline-learning-site` on `codex/offline-learning-site`, with base `43145b6e0407c3c539ca66deb1813ddbc2e97ec8` and the reviewed memory-only commit above it. Run exactly:

```powershell
node --test "tools/learning-site/tests/*.test.mjs"
Assert-ExternalExit 'offline Node tests' $? $LASTEXITCODE
node tools/learning-site/verify.mjs --root C:\dsm-offline-learning-site --out C:\dsm-offline-learning-site\learning-site --batch batch-b --full --report C:\dsm-offline-learning-site\learning-site\verification-report.json
Assert-ExternalExit 'offline full verifier' $? $LASTEXITCODE
```

Expected: 66 tests, zero failures, report status `PASS`, and 28 sources. Environment-only ignored files and line-ending materialization may be required as documented by the integration ledger, but they must not become branch content.

Prove ancestry and the four-path memory allowlist:

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

Expected: `0 1`, one focused memory commit, exactly the four approved `.ai/memory` paths, and no tracked dirt.

## Task 6: Collect read-only handoff evidence

In the integration worktree, record without changing state:

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
git diff --check
Assert-ExternalExit 'integration diff check' $? $LASTEXITCODE
Get-ChildItem -LiteralPath DSM_Back/prisma/migrations -Directory | Sort-Object Name | Select-Object -ExpandProperty Name
```

Read `.ai/system_prompt.md`, `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md`, the integration plan, and the conflict review before choosing the next task. Actual source, tests, Git, and fresh verification output take priority over a stale memory sentence.

The current release audit is not closed. F-006 remains the next separately approved data-integrity plan, and M12C remains after audit closure. External-PC setup does not authorize either implementation.

## Future Git choices

After every task and final independent review pass, present—but do not execute—these choices:

1. keep both branches local for more review;
2. push only a named feature branch after explicit user approval;
3. create a PR after a separate explicit approval;
4. continue to forbid direct `main` mutation and force push.

## Completion checklist

- [ ] Exact refs and worktree identities match.
- [ ] Node.js 24.19.0 and npm 11.19.0 resolve in every verification shell.
- [ ] Backend lockfile install, Prisma parse/generate, build, test, and non-fixing lint pass.
- [ ] Frontend lockfile install, Jest, TypeScript, ESLint, and Android build pass.
- [ ] Offline 66 tests and 28-source full verifier pass on the separate branch.
- [ ] Five migration directories appear in exact order; the first four remain unchanged.
- [ ] `DATABASE_URL` is absent after Prisma generation.
- [ ] No secret, existing database, remote write, deployment, or protected ref changed.
- [ ] Fresh status, refs, command exits, and residual gates are handed off.
