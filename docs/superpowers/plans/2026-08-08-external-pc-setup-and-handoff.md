# External PC Setup and Handoff Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create one root Markdown handoff that lets a developer clone DSM on another PC, reconstruct the local environment, verify the true current state, and resume from Front Task 20 without weakening any approval gate.

**Architecture:** `EXTERNAL_PC_SETUP_AND_HANDOFF.md` is a self-contained entrypoint with two state layers: a dated Git/memory snapshot and commands that recompute current truth. It links to tracked repository evidence, contains safe setup commands only, and directs readers to actual Git, source, tests, and active `.ai/memory` whenever a snapshot differs.

**Tech Stack:** Markdown, Git CLI, PowerShell, Node.js 22+, npm, Docker Compose, PostgreSQL 17, Prisma 6, NestJS 11, Expo SDK 55.

## Global Constraints

- Create only `C:\DEV\EXTERNAL_PC_SETUP_AND_HANDOFF.md` during implementation; do not modify product source, tests, configuration, README, architecture, offline learning-site files, or existing unrelated memory changes.
- Treat `origin/codex/front-secure-session-rest-client` as the default resume branch only after recomputing its current ref; the verified 2026-08-08 snapshot is `bb712ba`.
- Record the immediate resume point as Front Task 20 React session context. Task 31 authentication `change-gate` and subsequent M12C remain pending.
- Use Node.js `>=22` as the shared runtime floor.
- Use `npm ci` independently in `DSM_Back` and `DSM_Front`; there is no root npm workspace.
- Never read or copy a real `.env`, ADC credential, OAuth token, signing key, service-account JSON, private key, or user identifier.
- Use only variable names and explicit safe sample values such as `CHANGE_ME_LOCAL_ONLY`; never present samples as production credentials.
- Keep `FCM_DISPATCH_ENABLED=false` until 12C and an approved Firebase sandbox/device gate are complete.
- Do not install dependencies, start services, apply migrations, switch branches, stage, commit, push, merge, deploy, or access remote/production systems while authoring the document.
- Preserve all existing dirty and untracked files.

---

### Task 1: Reconfirm the authoritative handoff baseline

**Files:**
- Read: `docs/superpowers/specs/2026-08-08-external-pc-setup-and-handoff-design.md`
- Read: `.ai/system_prompt.md`
- Read: `.ai/memory/plan.md`
- Read: `.ai/memory/context.md`
- Read: `.ai/memory/checklist.md`
- Read from Git object: `origin/codex/front-secure-session-rest-client:.ai/memory/{plan,context,checklist}.md`
- Read: `DSM_Back/package.json`
- Read: `DSM_Back/.env.example`
- Read: `DSM_Back/compose.yaml`
- Read: `DSM_Back/prisma/migrations/`
- Read from Git object: `origin/codex/front-secure-session-rest-client:DSM_Front/package.json`
- Read from Git object: `origin/codex/front-secure-session-rest-client:DSM_Front/.env.example`
- Read from Git object: `origin/codex/front-secure-session-rest-client:DSM_Front/app.json`
- Modify: none

**Interfaces:**
- Consumes: local remote-tracking refs, tracked source/configuration, active and latest-branch memory.
- Produces: an evidence table used verbatim by Task 2: branch refs, ahead counts, completed work, next task, pending gates, runtime versions, environment-variable names, migration names, and verification totals.

- [ ] **Step 1: Confirm branch refs without checkout**

Run:

```powershell
git status --short --branch
git log -1 --format="%h %ci %s" origin/main
git log -1 --format="%h %ci %s" origin/codex/m12b-front-prototype-checkpoint
git log -1 --format="%h %ci %s" origin/codex/front-secure-session-rest-client
git rev-list --left-right --count main...origin/codex/front-secure-session-rest-client
git merge-base --is-ancestor main origin/codex/front-secure-session-rest-client
```

Expected for the dated snapshot:

```text
origin/main: 2e25d98
origin/codex/m12b-front-prototype-checkpoint: 960f02b
origin/codex/front-secure-session-rest-client: bb712ba
main...latest: 0 59
main is an ancestor of latest: exit 0
```

If a ref differs, use the newly observed ref in the final document and label the three values above as the previous 2026-08-08 snapshot. Do not move any branch.

- [ ] **Step 2: Confirm the latest branch implementation checkpoint**

Run:

```powershell
git show origin/codex/front-secure-session-rest-client:.ai/memory/checklist.md |
  Select-String -Pattern "Front secure session|Task 20|Task 31|12C|실제 ADC|M13|M14" -Context 2,6
git show origin/codex/front-secure-session-rest-client:.ai/memory/context.md |
  Select-String -Pattern "Task 1~19|Jest 10 suites/101 tests|dependency audit 55|migration" -Context 1,3
```

Expected facts:

- Backend M1~M11, notification 12A, and 12B backend safety implementation are complete.
- FCM dispatch remains disabled; 12C and actual ADC/FCM test-device evidence are incomplete.
- Front Phase 1 prototype is complete.
- Latest feature branch Front Tasks 1~19 are complete; Task 20 React session context is next.
- Task 31 authentication `change-gate` is incomplete.
- Front latest verification is Jest 10 suites/101 tests, ESLint, and TypeScript passing.
- The onboarding migration file exists on the latest branch but has not been applied to the persistent development DB.
- Dependency audit has 55 findings including one critical item and needs separate triage.

- [ ] **Step 3: Confirm setup contracts without reading secrets**

Run:

```powershell
rg -n '"node"|"build"|"test"|"test:e2e"|"prisma:' DSM_Back/package.json
rg -n 'POSTGRES_|127\.0\.0\.1|postgres:17|dsm-postgres-data' DSM_Back/compose.yaml
rg -n '^[A-Z][A-Z0-9_]*=' DSM_Back/.env.example
git show origin/codex/front-secure-session-rest-client:DSM_Front/package.json |
  Select-String -Pattern '"expo"|"test"|"typecheck"|"lint"|"expo-secure-store"'
git show origin/codex/front-secure-session-rest-client:DSM_Front/.env.example
git ls-tree -r --name-only origin/codex/front-secure-session-rest-client -- DSM_Back/prisma/migrations
```

Expected contracts:

- Backend Node floor `>=22`.
- Two independent npm lockfile projects.
- PostgreSQL `17-alpine`, loopback host binding, and named volume `dsm-back-postgres-data`.
- Backend application variables plus Compose-only `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, optional `POSTGRES_PORT`.
- Front `EXPO_PUBLIC_API_BASE_URL`, Jest, typecheck, lint, and `expo-secure-store` on the latest branch.
- Three latest-branch migrations: initial, notification outcome policy, and onboarding completion timestamp.

### Task 2: Create the root setup and handoff document

**Files:**
- Create: `EXTERNAL_PC_SETUP_AND_HANDOFF.md`
- Modify: none
- Test: Markdown structure and command/evidence checks in Task 3

**Interfaces:**
- Consumes: Task 1 evidence table and `docs/superpowers/specs/2026-08-08-external-pc-setup-and-handoff-design.md`.
- Produces: a root Markdown entrypoint with the exact heading contract and copy-safe setup commands below.

- [ ] **Step 1: Create the exact document skeleton with `apply_patch`**

Create these headings in this order:

```markdown
# DSM 외부 PC 설정 및 작업 인수인계
## 1. 문서 목적과 사실 판정 우선순위
## 2. 5분 빠른 시작
## 3. 확인일 기준 Git 스냅샷
## 4. 현재 구현 상태
## 5. 필수 프로그램과 플랫폼 도구
## 6. Clone과 작업 브랜치 선택
## 7. Backend 로컬 환경변수
## 8. PostgreSQL과 Prisma 초기화
## 9. Frontend 로컬 환경변수
## 10. 설치·검증·실행 명령
## 11. Git으로 전달되지 않는 항목
## 12. 외부 서비스와 승인 Gate
## 13. 현재 진척도 재확인
## 14. 다음 작업 재개 절차
## 15. Windows 문제 해결과 금지 명령
## 16. 문서 갱신 규칙과 완료 체크리스트
```

- [ ] **Step 2: Write the source-of-truth and branch-selection sections**

State explicitly:

- Source and current test/Git output override document snapshots.
- `main` being synchronized with `origin/main` does not mean it contains current feature work.
- The dated snapshot contains `2e25d98`, `960f02b`, and `bb712ba`; the latest feature branch is 59 commits ahead of `main` at the snapshot.
- Default continuation branch is `codex/front-secure-session-rest-client` after ref verification.
- The root dirty architecture change is not transferred by Git.

Include:

```powershell
git clone https://github.com/LeeHYn/DSM.git C:\DEV
Set-Location C:\DEV
git fetch --prune origin
git switch --track origin/codex/front-secure-session-rest-client
git status -sb
git branch -vv
```

Also include the non-mutating comparison commands from Task 1 so the reader can detect later branch movement.

- [ ] **Step 3: Write the current-progress section**

Use three status groups:

```text
완료: Backend M1~M11, notification 12A/12B backend, Front Phase 1, Front secure session/API Tasks 1~19
즉시 다음: Task 20 React session context
후속/미완료: Task 31 authentication change-gate, onboarding migration local apply, dependency-security triage, M12C, ADC/FCM device sandbox, WebSocket, Redis/batch
```

Include the verified backend baseline of 22 suites/198 tests and e2e 2 tests, and the latest front baseline of 10 suites/101 tests plus ESLint and TypeScript. State that these are historical verification baselines and must be rerun on the new PC.

- [ ] **Step 4: Write prerequisites and backend setup**

Document Git, Node.js 22+, npm, Docker Desktop/Compose, WSL2 on Windows, and optional Android/iOS toolchains. Link only to these primary sources:

- `https://docs.expo.dev/versions/v55.0.0/`
- `https://docs.expo.dev/workflow/android-studio-emulator/`
- `https://docs.docker.com/desktop/setup/install/windows-install/`
- `https://firebase.google.com/docs/admin/setup`

Include backend setup:

```powershell
Set-Location C:\DEV\DSM_Back
npm ci
Copy-Item .env.example .env
```

List application variable names and constraints: `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_ID`, `CORS_ORIGINS`, `FCM_DISPATCH_ENABLED`, conditional `FCM_PROJECT_ID`, optional `REDIS_URL`.

List the Compose-only additions:

```dotenv
POSTGRES_USER=dsm
POSTGRES_PASSWORD=CHANGE_ME_LOCAL_ONLY
POSTGRES_DB=dsm
POSTGRES_PORT=5432
```

Explain that `DATABASE_URL` must use matching values and a URL-encoded password. Do not include a working shared password or token.

- [ ] **Step 5: Write DB, frontend, and runtime commands**

Include safe new-local-DB commands:

```powershell
docker compose config --quiet
docker compose up -d db
docker compose ps
npm run prisma:generate
npm run prisma:validate
npx prisma migrate deploy
npx prisma migrate status
```

State that Git does not carry the old Docker volume or data, no seed command exists, `migrate deploy` applies tracked migrations, and `migrate:dev`/`db push` are not onboarding commands for this handoff.

Include backend verification/run commands:

```powershell
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run start:dev
```

Include latest-branch frontend setup:

```powershell
Set-Location C:\DEV\DSM_Front
npm ci
Copy-Item .env.example .env.local
npm run typecheck
npm test
npm run lint
npm run web
```

Document API base URLs:

- Web/iOS simulator: `http://127.0.0.1:3000`
- Android Emulator: `http://10.0.2.2:3000`
- Physical device: `http://<PC-LAN-IP>:3000` with same network and firewall rule
- Production: HTTPS only

State that `EXPO_PUBLIC_*` is public bundle data and must not contain secrets.

- [ ] **Step 6: Write transfer boundaries, gates, recovery, and resumption**

List non-transferred state: `.env`, `.env.local`, `node_modules`, `.expo`, build output, generated native folders, Docker volume/data, ADC, signing keys, `.worktrees`, global Codex skills/plugins, Obsidian junction/cache, and all uncommitted changes.

Keep these gates explicit:

- FCM remains disabled until M12C and approved test-project/device evidence.
- Actual Firebase send, remote/production DB migration, deploy, Git push/merge, and accepted-risk status changes require separate approval.
- Onboarding migration apply to the persistent development DB is not implied by clone and needs its documented action-time approval.

Document the exact resumption sequence:

1. Recompute refs and compare the snapshot.
2. Read `.ai/system_prompt.md` and active memory three-file set.
3. Check latest-branch memory if the current checkout differs.
4. Reinstall/recreate local state and rerun verification.
5. Resume with Task 20, not M12C.
6. Preserve Task 31 and later M12C ordering and all gates.
7. Record a new plan with exact 1~2-file writable allowlist before modification.

Document Windows recovery:

- If PowerShell resolves blocked `npm.ps1`, use the matching `npm.cmd`/`npx.cmd`; do not weaken system ExecutionPolicy.
- If managed sandbox Jest ends with Temp cache `EPERM` after tests pass, distinguish cache failure from assertion failure and use the approved writable/unsandboxed verification path.
- Never run root `setup-ai.ps1` or frontend `npm run reset-project` as clone setup.

### Task 3: Verify the final handoff document

**Files:**
- Test: `EXTERNAL_PC_SETUP_AND_HANDOFF.md`
- Modify: `EXTERNAL_PC_SETUP_AND_HANDOFF.md` only if a verification failure requires correction

**Interfaces:**
- Consumes: the Task 2 document and Task 1 evidence.
- Produces: a Markdown handoff that passes structure, evidence, security, whitespace, and scope checks.

- [ ] **Step 1: Verify all required sections and critical contracts**

Run:

```powershell
rg -n '^## (1\.|2\.|3\.|4\.|5\.|6\.|7\.|8\.|9\.|10\.|11\.|12\.|13\.|14\.|15\.|16\.)' EXTERNAL_PC_SETUP_AND_HANDOFF.md
rg -n '2e25d98|960f02b|bb712ba|Task 20|Task 31|M12C|FCM_DISPATCH_ENABLED=false|POSTGRES_USER|EXPO_PUBLIC_API_BASE_URL|migrate deploy|npm\.cmd|setup-ai\.ps1|reset-project' EXTERNAL_PC_SETUP_AND_HANDOFF.md
```

Expected: exactly 16 numbered level-two sections and at least one match for every critical contract token.

- [ ] **Step 2: Verify repository-command consistency**

Compare every documented npm script and path against:

```powershell
rg -n '"build"|"test"|"test:e2e"|"prisma:generate"|"prisma:validate"|"start:dev"' DSM_Back/package.json
git show origin/codex/front-secure-session-rest-client:DSM_Front/package.json |
  Select-String -Pattern '"test"|"typecheck"|"lint"|"web"|"android"|"ios"'
git show origin/codex/front-secure-session-rest-client:DSM_Front/.env.example
```

Expected: every documented script exists on its stated branch and `EXPO_PUBLIC_API_BASE_URL` matches the tracked latest-branch example.

- [ ] **Step 3: Verify no credential material or unfinished content was introduced**

Run a scoped scan for private-key blocks, common live-token prefixes, and credential assignments whose value is not an explicit safe sample. Do not scan or open real `.env` files. Confirm that the only password-like sample is `CHANGE_ME_LOCAL_ONLY` and that all FCM instructions keep dispatch disabled.

Expected: no private key, live token, user identifier, working credential, or incomplete section.

- [ ] **Step 4: Verify whitespace and preserve existing work**

Run:

```powershell
git diff --check -- EXTERNAL_PC_SETUP_AND_HANDOFF.md
git status --short --branch
```

Expected: no whitespace errors; only `EXTERNAL_PC_SETUP_AND_HANDOFF.md` is newly introduced by the execution. Existing architecture, memory, offline-learning analysis, design spec, and implementation-plan changes remain present and untouched.

- [ ] **Step 5: Stop without Git write**

Report the created document, validation results, dated snapshot caveat, and the exact existing unrelated changes. Do not stage, commit, push, merge, or deploy.
