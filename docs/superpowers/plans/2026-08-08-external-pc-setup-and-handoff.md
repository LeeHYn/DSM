# External PC Setup and Handoff Plan

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
git fetch --prune origin
git rev-parse main
git rev-parse origin/main
git rev-parse origin/codex/front-secure-session-rest-client
git worktree list --porcelain
git status --short --branch
```

Expected protected values are the two exact SHAs in Global constraints. Fetch changes only remote-tracking metadata; it does not authorize checkout, merge, pull, push, or branch deletion. If a pinned ref moved, stop and reconcile the reviewed integration plan before continuing.

In every npm verification shell, prepend the exact Node directory to `PATH`, then prove:

```powershell
node --version
npm --version
```

Expected: `v24.19.0` and `11.19.0`.

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
$validationDatabaseUrl = 'postgresql://dsm_validation:dsm_validation@127.0.0.1:1/dsm_validation?schema=public'
$env:DATABASE_URL = $validationDatabaseUrl
npm run prisma:validate
if ($LASTEXITCODE -ne 0) {
  $validateExit = $LASTEXITCODE
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  exit $validateExit
}
npm run prisma:generate
$generateExit = $LASTEXITCODE
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
if ($generateExit -ne 0) { exit $generateExit }
npm run build
npm test -- --runInBand --no-cache
npx eslint "{src,apps,libs,test}/**/*.ts"
```

Expected: every command exits `0` and `Test-Path Env:DATABASE_URL` is `False` after generate. The URL is parse-only and port `1` fails closed. Do not run Prisma migration, database push, migration-status, or any other database connection command in this task. The repository lint script is not used because it includes automatic fixes.

## Task 4: Install and verify the Android frontend

Run in `C:\dsm-integration-review\DSM_Front`:

```powershell
npm ci --no-audit --no-fund
npm test -- --no-cache
npm run typecheck
npm run lint
```

Then run in `C:\dsm-integration-review\DSM_Front\android`:

```powershell
.\gradlew.bat assembleDebug --no-daemon
```

This is a React Native 0.83.10 Community CLI Android project. No Web or iOS launch path is part of this handoff. Local SDK/JDK paths and signing material remain outside Git.

Create only local untracked configuration from safe placeholders. The current public variable names are `API_BASE_URL` and `GOOGLE_WEB_CLIENT_ID`; never place a client secret, token, keystore value, or credential in frontend configuration. For an explicitly approved local smoke after the validation gate, the tracked scripts are:

```powershell
npm run start
npm run android
```

## Task 5: Verify the separate offline learning branch

Require `C:\dsm-offline-learning-site` on `codex/offline-learning-site`, with base `43145b6e0407c3c539ca66deb1813ddbc2e97ec8` and the reviewed memory-only commit above it. Run exactly:

```powershell
node --test "tools/learning-site/tests/*.test.mjs"
node tools/learning-site/verify.mjs --root C:\dsm-offline-learning-site --out C:\dsm-offline-learning-site\learning-site --batch batch-b --full --report C:\dsm-offline-learning-site\learning-site\verification-report.json
```

Expected: 66 tests, zero failures, report status `PASS`, and 28 sources. Environment-only ignored files and line-ending materialization may be required as documented by the integration ledger, but they must not become branch content.

Prove ancestry and the four-path memory allowlist:

```powershell
git rev-list --left-right --count 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD
git log --format="%H %s" 43145b6e0407c3c539ca66deb1813ddbc2e97ec8..HEAD
git diff --name-only 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD
git diff --check 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD
git status --short
```

Expected: `0 1`, one focused memory commit, exactly the four approved `.ai/memory` paths, and no tracked dirt.

## Task 6: Collect read-only handoff evidence

In the integration worktree, record without changing state:

```powershell
git status --short --branch
git log --oneline --decorate -20
git rev-parse HEAD
git rev-parse main
git rev-parse origin/main
git diff --check
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
