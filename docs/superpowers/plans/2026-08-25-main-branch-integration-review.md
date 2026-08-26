# Main Branch Integration Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the complete canonical DSM product history on an isolated local integration branch, preserve the offline learning site on its own local branch, selectively retain only compatible checkpoint/backend deltas, and produce reproducible validation evidence without modifying or pushing `main`.

**Architecture:** `origin/codex/front-secure-session-rest-client` is merged with a regular non-squash merge into `codex/integration-main-review`. The checkpoint branch is never merged wholesale: `43145b6` seeds the isolated offline branch, `fb54b5d` supplies only the enumerated offline memory blocks, `c79a042` supplies reviewed documentation/policy candidates, and `396fc0a` supplies nothing. Foundation and notification branches are evidence sources; only a capability that passes the acceptance gate is ported in subsystem-scoped commits.

**Tech Stack:** Git worktrees, PowerShell, Node.js 24.19.0, npm 11.19.0, NestJS 11, Prisma 6, React Native 0.83, Android Gradle, PostgreSQL 17 in Docker, Markdown

**Spec:** `docs/superpowers/specs/2026-08-25-main-branch-integration-review-design.md`

## Global Constraints

- This is the single master plan required by the approved specification. It is not split by subsystem because the canonical merge, offline ancestry, candidate rulings, migration harness, and final report share one pinned ref set and one SDD ledger.
- Plan execution requires a new explicit user approval. Approval of the design or this plan's authorship does not authorize implementation, worktree creation, merge, branch creation, push, PR, deployment, or database access.
- Work only in `C:\dsm-integration-review`, except Task 6 which works only in `C:\dsm-offline-learning-site`. Do not modify, clean, switch, reset, or reuse `C:\DEV`.
- Treat the known `C:\DEV` user-owned untracked paths as immutable out-of-scope data: `.ai/memory/checklist.original.md`, `.ai/memory/context.original.failed-cp949.bin`, `.ai/memory/context.original.md`, `.ai/memory/error-resolution-playbook.original.md`, `.ai/memory/plan.original.md`, `DSM_Back/.env`, and `fsr/`. Do not read secrets, stage, move, delete, or overwrite any of them.
- Never modify or merge into `main`; never push, create a PR, deploy, publish artifacts, delete branches, force-reset, discard changes, or connect to an existing/shared/remote database.
- Runtime is exact: `node --version` must be `v24.19.0` and `npm --version` must be `11.19.0`. Any other value is `BLOCKED`; do not silently install, upgrade, or substitute a runtime.
- Before any execution artifact is created, the main controller must commit the exact root ignore rule `/.superpowers/sdd/` as the only change in commit `chore: ignore SDD execution workspace`.
- Ledger path: `.superpowers/sdd/2026-08-25-main-branch-integration-review/progress.md`. Its first line must be `# SDD ledger — plan: docs/superpowers/plans/2026-08-25-main-branch-integration-review.md`.
- Every task records base SHA, head SHA, exact commands and exit codes, reviewer verdict, deferred minor, fix round, and each non-obvious `Ruling:` with the cost if wrong in both the ledger and `docs/reviews/2026-08-25-main-integration-conflict-review.md`.
- Product investigation and implementation follow `.ai/agents/README.md`. Every assignment states `role`, `objective`, `read scope`, `exact writable allowlist`, `forbidden scope`, `verification`, and `done condition`. A modification step changes at most one or two files, and concurrent writers never overlap.
- `investigator` and `reviewer` are read-only. `backend-developer` may edit only the exact one-or-two backend files assigned for that step. The main controller alone owns Git, approvals, the SDD ledger, integration report, and `.ai/memory/*`.
- The current `frontend-developer` contract is Expo-specific while the canonical product is React Native CLI/Android-only. Do not assign canonical frontend edits under that stale contract. If the canonical frontend fails or a selected backend contract requires a frontend change, record `BLOCKED` and obtain a reviewed role-contract/plan amendment before editing.
- Use `PORT`, `SUPERSEDED`, `DEFER`, and `BLOCKED` as the only branch-capability verdicts. `NOT_APPLICABLE` is reserved for a validation whose stated trigger is false.
- A failed required check stops execution. Do not convert missing runtime, Docker, Java/Android SDK, credentials, network, or external services to `NOT_APPLICABLE`.
- Preserve canonical manifests and lockfiles byte-for-byte unless an accepted delta truly needs a dependency. Never hand-edit a lockfile conflict. No currently planned delta needs a package dependency.
- Keep the canonical FCM API (`PUT` register, cross-user `409`, no raw token response, idempotent `DELETE`), dispatcher state machine, delivery model, Serializable Task/score/schedule transaction, and maximum two `P2034` retries.
- Main-integration memory must never claim the offline site is in the product tree. Offline memory must contain only the approved `fb54b5d` source blocks and ER records.

## Pinned Sources and Fixed Initial Rulings

| Ref or commit | Exact SHA | Initial ruling |
|---|---|---|
| `origin/main` | `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81` | Integration baseline; unchanged |
| `origin/codex/front-secure-session-rest-client` | `2a4e9916765b505037e1c533735d84cd9f251ccf` | `PORT` by regular merge; canonical product |
| `origin/codex/m12b-front-prototype-checkpoint` | `396fc0a89327795646e89e128d7204b55b7fc00b` | `SUPERSEDED` as a whole-branch input |
| `43145b6` | `43145b6e0407c3c539ca66deb1813ddbc2e97ec8` | `PORT` only as offline branch base |
| `c79a042` | `c79a042b3c1e115fc0b092a8bddcd3e6723439d6` | File-by-file documentation/policy source |
| `fb54b5d` | `fb54b5d07d9b03d42ae70890a954454027002b0d` | Offline-memory extraction source only |
| `396fc0a` | `396fc0a89327795646e89e128d7204b55b7fc00b` | `SUPERSEDED`; contributes no content |
| `origin/codex/dsm-back-foundation-prisma` | `2a6ba73adfca52398cc2299d91c3f6dff7788af3` | Candidate evidence source, never merged |
| `origin/codex/dsm-milestone-12a-notifications` | `362aabeb713c2f5c0b73f599216b8cf92ea1b97a` | `SUPERSEDED` for product code |
| `origin/codex/integration-main-review` | `6fa66eb5998c140bb6db995cc48c1a51f7a3089f` | Remote tracking baseline; no push |

The approved specification blob must remain `5a4dff47179c816963d5d2513e383f7e583b072a`.

Foundation capability expectations after the canonical merge:

| Capability | Planned verdict rule |
|---|---|
| Legacy notification provider/scheduler and 12A branch implementation | `SUPERSEDED`; never port |
| Foundation Expo frontend | `SUPERSEDED`; never port |
| Foundation refresh-token/account deletion flow | `SUPERSEDED` because it predates canonical session families; never port |
| Partial unique index for one active schedule per Task | `PORT` only if the post-merge investigation confirms no equivalent invariant and the disposable PostgreSQL checks can validate the forward migration; otherwise `DEFER` |
| `NotificationMode` | `DEFER` unless a canonical documented public settings contract already exists; do not introduce a new API merely to retain an enum |
| Redis/realtime ranking | `DEFER` because it adds an operational service and dependency set not required by the approved integration outcome |
| General users/profile API | `DEFER` because the candidate returns broad Prisma records and couples to obsolete refresh-token behavior |
| Daily score finalization/automatic snapshot | `DEFER` because the candidate adds scheduled product behavior without a canonical current contract |

---

### Task 0: Confirm execution authority and environment gates

**Files:**
- Verify: `.ai/memory/plan.md`
- Verify: `.ai/memory/checklist.md`

**Interfaces:**
- Consumes: explicit user approval for this exact plan, local toolchain state
- Produces: `PASS`/`BLOCKED` preflight evidence; no repository mutation

- [ ] **Step 1: Confirm the approval scope in active memory**

Read the active plan/checklist and require an entry that explicitly approves execution of `docs/superpowers/plans/2026-08-25-main-branch-integration-review.md`. If it approves only design or plan writing, record `BLOCKED` and stop.

- [ ] **Step 2: Verify the exact Node/npm runtime**

Run:

```powershell
node --version
npm --version
```

Expected: exactly `v24.19.0` and `11.19.0`. The design-review host's known `v24.13.0`/`11.6.2` is not acceptable. Do not install or change system software in this task.

- [ ] **Step 3: Verify required local executors without changing them**

Run:

```powershell
docker version
docker ps -a --format "{{.Names}}"
java -version
Test-Path Env:ANDROID_HOME
Test-Path Env:ANDROID_SDK_ROOT
```

Expected: Docker client and server respond; neither `dsm-integration-migrate-empty` nor `dsm-integration-migrate-upgrade` exists; Java works; at least one Android SDK environment variable exists. If any prerequisite is missing, record `BLOCKED` and stop before Task 1.

- [ ] **Step 4: Record the gate**

Record command output and `Ruling: environment mutation is user-owned; repository execution does not begin until every required executor is available.` in the future ledger only after Task 2 authorizes ledger creation. Until then, report the evidence to the user without creating execution files.

---

### Task 1: Re-fetch and prove immutable ref/worktree preconditions

**Files:**
- Verify: `docs/superpowers/specs/2026-08-25-main-branch-integration-review-design.md`
- Verify: `.ai/memory/plan.md`
- Verify: `.ai/memory/checklist.md`

**Interfaces:**
- Consumes: pinned source table, clean integration worktree
- Produces: reproducible ref/ancestry/local-commit evidence; no file mutation

- [ ] **Step 1: Refresh remote-tracking refs only**

Run in `C:\dsm-integration-review`:

```powershell
git fetch --prune origin
git remote -v
```

Expected: fetch succeeds and no local branch is switched or reset.

- [ ] **Step 2: Verify every exact remote SHA**

Run each command and compare to the pinned table:

```powershell
git rev-parse origin/main
git rev-parse origin/codex/front-secure-session-rest-client
git rev-parse origin/codex/m12b-front-prototype-checkpoint
git rev-parse origin/codex/dsm-back-foundation-prisma
git rev-parse origin/codex/dsm-milestone-12a-notifications
git rev-parse origin/codex/integration-main-review
```

Expected: all six exact SHAs match. Any movement is `BLOCKED` and requires a reviewed spec revision.

- [ ] **Step 3: Verify integration worktree identity and cleanliness**

Run:

```powershell
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}"
git rev-list --left-right --count origin/codex/integration-main-review...HEAD
git status --short
git rev-parse --show-toplevel
git rev-parse --git-dir
git rev-parse --git-common-dir
```

Expected: branch `codex/integration-main-review`, upstream `origin/codex/integration-main-review`, left count `0`, empty status, top level `C:/dsm-integration-review`, and a linked-worktree Git dir distinct from the common Git dir.

- [ ] **Step 4: Classify every local-only commit**

Run:

```powershell
git log --format="%H %s" origin/codex/integration-main-review..HEAD
git log --format="%H" origin/codex/integration-main-review..HEAD
```

For every SHA returned, rerun `git show --format="%H %s" --name-only` with that emitted SHA as the revision argument. Accept only reviewed specification commits, `docs(memory):` closures limited to the three active memory files, and the approved implementation-plan/memory commits whose exact path allowlists are recorded in active memory. Any merge or unexplained subject/path is `BLOCKED`.

- [ ] **Step 5: Verify the approved spec blob**

Run:

```powershell
git hash-object docs/superpowers/specs/2026-08-25-main-branch-integration-review-design.md
```

Expected: `5a4dff47179c816963d5d2513e383f7e583b072a`.

---

### Task 2: Establish the tracked SDD ignore contract and ledger

**Files:**
- Modify: `.gitignore`
- Create (ignored): `.superpowers/sdd/2026-08-25-main-branch-integration-review/progress.md`

**Interfaces:**
- Consumes: clean approved integration worktree
- Produces: one portable ignore commit and an ignored append-only execution ledger

- [ ] **Step 1: Prove the rule is absent**

Run:

```powershell
rg -n -F "/.superpowers/sdd/" .gitignore
git status --short
```

Expected: no match and clean status.

- [ ] **Step 2: Add only the exact root rule**

Use `apply_patch` to add exactly:

```gitignore
/.superpowers/sdd/
```

Do not add a global ignore, `.git/info/exclude`, wildcard variant, or another repository rule.

- [ ] **Step 3: Verify and commit the standalone setup change**

Run:

```powershell
git diff --check -- .gitignore
git diff --name-only
git diff -- .gitignore
git add -- .gitignore
git diff --cached --name-only
git commit -m "chore: ignore SDD execution workspace"
git status --short
```

Expected: `.gitignore` is the only committed path and status is clean.

- [ ] **Step 4: Prove ignore behavior before ledger creation**

Run:

```powershell
git check-ignore -q .superpowers/sdd/2026-08-25-main-branch-integration-review/progress.md
```

Expected: exit code 0.

- [ ] **Step 5: Create the ledger**

Create the ignored ledger with this exact first line:

```markdown
# SDD ledger — plan: docs/superpowers/plans/2026-08-25-main-branch-integration-review.md
```

Add sections `Preflight`, `Task log`, `Rulings`, `Validation matrix`, `Review rounds`, and `Residual risks`. Run `git status --short` and expect empty output because the ledger is ignored.

---

### Task 3: Build the branch, overlap, and checkpoint inventory

**Files:**
- Create: `docs/reviews/2026-08-25-main-integration-conflict-review.md`
- Modify (ignored): `.superpowers/sdd/2026-08-25-main-branch-integration-review/progress.md`

**Interfaces:**
- Consumes: pinned refs and four checkpoint-side commits
- Produces: exact branch topology, overlap matrix, source classification, initial rulings

- [ ] **Step 1: Assign a read-only investigator**

Assignment must name `investigator`, read the approved spec and all pinned refs, use `exact writable allowlist: none`, forbid Git writes/network/database access, and require exact SHA, ancestry, path count, and overlap output grouped by frontend, backend subsystem, Prisma/migrations, dependency metadata, docs, and project memory.

- [ ] **Step 2: Generate reproducible topology evidence**

Run:

```powershell
git merge-base origin/main origin/codex/front-secure-session-rest-client
git merge-base origin/codex/front-secure-session-rest-client origin/codex/m12b-front-prototype-checkpoint
git rev-list --left-right --count origin/main...origin/codex/front-secure-session-rest-client
git rev-list --left-right --count origin/codex/front-secure-session-rest-client...origin/codex/m12b-front-prototype-checkpoint
git log --reverse --format="%H %s" origin/main..origin/codex/dsm-back-foundation-prisma
git log --reverse --format="%H %s" origin/main..origin/codex/dsm-milestone-12a-notifications
```

Expected: values agree with the approved design, including shared checkpoint `960f02bc9f24c8a5d578c64fb7b734cdb8530506` and the four unique foundation commits.

- [ ] **Step 3: Inventory the checkpoint-side commits file by file**

Run `git show --format="%H %P %s" --name-status` separately for `43145b6`, `c79a042`, `fb54b5d`, and `396fc0a`. Record every path under exactly one category: offline branch content, main-integration document candidate, offline-memory source, or excluded publish bookkeeping.

Expected fixed rulings:

- `43145b6` is the offline baseline and is not ported into integration.
- `c79a042` has seven main-document/policy candidates reviewed in Tasks 7 and 10.
- `fb54b5d` is read only for the exact offline extraction map.
- `396fc0a` changes publish-closure memory only and contributes nothing.

- [ ] **Step 4: Write and commit the initial report**

The report must include Purpose, Pinned refs, Ancestry, Overlap matrix, Checkpoint file classification, Initial rulings, Validation matrix, Deferred items, Residual risks, and Review verdict. Write only verified facts, then run:

```powershell
git diff --check -- docs/reviews/2026-08-25-main-integration-conflict-review.md
git add -- docs/reviews/2026-08-25-main-integration-conflict-review.md
git commit -m "docs: inventory integration branch conflicts"
git status --short
```

Expected: one report file committed and clean status.

---

### Task 4: Merge the canonical product history without squashing

**Files:**
- Resolve: `.ai/memory/plan.md`
- Resolve: `.ai/memory/context.md`
- Resolve: `.ai/memory/checklist.md`
- Resolve: `.gitignore`

**Interfaces:**
- Consumes: canonical product ref and approved local review history
- Produces: a regular two-parent merge whose product tree exactly equals the canonical ref

- [ ] **Step 1: Recheck clean state and predicted conflicts**

Run:

```powershell
git status --short
$canonical = 'origin/codex/front-secure-session-rest-client'
$mergeBase = (git merge-base HEAD $canonical).Trim()
$mergeTree = @(git merge-tree $mergeBase HEAD $canonical)
$currentPath = $null
$predictedConflicts = @()
foreach ($line in $mergeTree) {
  if ($line -match '^  our\s+\d+\s+\S+\s+(.+)$') { $currentPath = $Matches[1] }
  if ($line -match '^\+<<<<<<<' -and $currentPath) { $predictedConflicts += $currentPath }
}
$predictedConflicts = @($predictedConflicts | Sort-Object -Unique)
$expectedConflicts = @(
  '.ai/memory/checklist.md',
  '.ai/memory/context.md',
  '.ai/memory/plan.md',
  '.gitignore'
)
$difference = @(Compare-Object $expectedConflicts $predictedConflicts)
if ($difference.Count -ne 0) { $difference; throw 'unexpected predicted merge conflict set' }
$predictedConflicts
```

Expected: clean status and exactly the three active memory files plus root `.gitignore`. The fourth conflict is expected because Task 2 added the portable SDD rule while the canonical branch independently changed root ignore rules. Any different path set is `BLOCKED`; do not start the real merge.

- [ ] **Step 2: Start the regular merge without committing**

Run:

```powershell
git merge --no-ff --no-commit origin/codex/front-secure-session-rest-client
git diff --name-only --diff-filter=U
```

Expected: exactly `.ai/memory/checklist.md`, `.ai/memory/context.md`, `.ai/memory/plan.md`, and `.gitignore` are unmerged. If any other path appears, run `git merge --abort`, record `BLOCKED`, and do not improvise a resolution.

- [ ] **Step 3: Resolve plan and context from the canonical baseline**

Read the two canonical files with these exact commands:

```powershell
git show 2a4e9916765b505037e1c533735d84cd9f251ccf:.ai/memory/plan.md
git show 2a4e9916765b505037e1c533735d84cd9f251ccf:.ai/memory/context.md
```

Use one `apply_patch` action touching only `.ai/memory/plan.md` and `.ai/memory/context.md` to remove conflict markers and retain the canonical content as baseline, then reapply only the active integration-review approval, pinned-ref, plan-path, and no-push gate entries from the pre-merge local versions. Do not reapply offline completion state, branch-publish bookkeeping, excluded Expo milestones, or unverified product claims.

- [ ] **Step 4: Resolve checklist and root ignore contracts**

Read the remaining canonical files with these exact commands:

```powershell
git show 2a4e9916765b505037e1c533735d84cd9f251ccf:.ai/memory/checklist.md
git show 2a4e9916765b505037e1c533735d84cd9f251ccf:.gitignore
```

Use one `apply_patch` action touching only `.ai/memory/checklist.md` and `.gitignore`. Resolve checklist from the same canonical-memory baseline and integration-entry allowlist as Step 3. Preserve the canonical `.gitignore` content and order exactly, then add exactly one root rule `/.superpowers/sdd/`. Do not retain any other local-only ignore line or alter a canonical rule.

- [ ] **Step 5: Verify the staged merge tree and both ignore contracts**

Run:

```powershell
git diff --name-only --diff-filter=U
git diff --quiet 2a4e9916765b505037e1c533735d84cd9f251ccf -- DSM_Back DSM_Front
git ls-files | Select-String -Pattern '^(learning-site|tools/learning-site)/'
git diff --check
$canonicalIgnore = @(git show 2a4e9916765b505037e1c533735d84cd9f251ccf:.gitignore)
$resolvedIgnore = @(Get-Content -LiteralPath .gitignore)
$sddRules = @($resolvedIgnore | Where-Object { $_ -eq '/.superpowers/sdd/' })
if ($sddRules.Count -ne 1) { throw 'expected exactly one SDD ignore rule' }
$withoutSdd = @($resolvedIgnore | Where-Object { $_ -ne '/.superpowers/sdd/' })
$ignoreDifference = @(Compare-Object $canonicalIgnore $withoutSdd -SyncWindow 0)
if ($ignoreDifference.Count -ne 0) { $ignoreDifference; throw 'canonical ignore content changed' }
git check-ignore -q .superpowers/sdd/2026-08-25-main-branch-integration-review/progress.md
if ($LASTEXITCODE -ne 0) { throw 'SDD ledger is not ignored' }
```

Expected: no unmerged paths; product tree matches canonical; no offline path is present; diff check passes; canonical ignore content/order is unchanged after removing the single SDD rule; and the ledger remains ignored.

- [ ] **Step 6: Create and prove the merge commit**

Run:

```powershell
git add -- .ai/memory/plan.md .ai/memory/context.md .ai/memory/checklist.md .gitignore
git commit -m "merge: integrate canonical product branch"
git rev-list --parents -n 1 HEAD
git merge-base --is-ancestor 2a4e9916765b505037e1c533735d84cd9f251ccf HEAD
git status --short
```

Expected: the new commit has two parents, its second parent is the exact canonical SHA, the ancestry command exits 0, and status is clean.

---

### Task 5: Validate the canonical merge baseline before selective ports

**Files:**
- Verify: `DSM_Back/**`
- Verify: `DSM_Front/**`
- Modify (ignored): SDD ledger

**Interfaces:**
- Consumes: canonical merge commit
- Produces: baseline evidence separating inherited failures from integration changes

- [ ] **Step 1: Install and validate backend baseline**

Run in `DSM_Back`:

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

Expected: all exit 0 and `Test-Path Env:DATABASE_URL` is `False` after generate. The process-scoped URL exists only so Prisma can parse the canonical schema in a clean worktree; loopback port `1` makes any unexpected connection fail closed. Do not replace these commands with `prisma migrate`, `db push`, `migrate status`, or any command that connects to a database. A connection attempt is `BLOCKED`. Do not use the repository lint script because it includes `--fix`.

- [ ] **Step 2: Install and validate frontend baseline**

Run in `DSM_Front`:

```powershell
npm ci --no-audit --no-fund
npm test -- --no-cache
npm run typecheck
npm run lint
```

Run in `DSM_Front/android`:

```powershell
.\gradlew.bat assembleDebug --no-daemon
```

Expected: all exit 0. A failure is `BLOCKED`; do not edit frontend code under the Expo-only role contract.

- [ ] **Step 3: Prove baseline tests did not alter tracked files**

Run:

```powershell
git status --short
git diff --quiet 2a4e9916765b505037e1c533735d84cd9f251ccf -- DSM_Back DSM_Front
```

Expected: clean status and canonical-identical product tree.

---

### Task 6: Create and validate the dedicated offline learning branch

**Files:**
- Modify: `C:\dsm-offline-learning-site\.ai\memory\plan.md`
- Modify: `C:\dsm-offline-learning-site\.ai\memory\context.md`
- Modify: `C:\dsm-offline-learning-site\.ai\memory\checklist.md`
- Modify: `C:\dsm-offline-learning-site\.ai\memory\error-resolution-playbook.md`

**Interfaces:**
- Consumes: `43145b6` baseline and exact memory blocks from `fb54b5d`
- Produces: one clean offline-only branch with one focused memory commit

- [ ] **Step 1: Prove path and refs are all absent**

Run from the integration worktree:

```powershell
Test-Path -LiteralPath 'C:\dsm-offline-learning-site'
git show-ref --verify --quiet refs/heads/codex/offline-learning-site
git show-ref --verify --quiet refs/remotes/origin/codex/offline-learning-site
```

Expected: `False`, then both Git commands exit 1. If any exists, record `BLOCKED`; do not delete, overwrite, or reuse it.

- [ ] **Step 2: Create the exact isolated worktree**

Run:

```powershell
git worktree add -b codex/offline-learning-site C:\dsm-offline-learning-site 43145b6e0407c3c539ca66deb1813ddbc2e97ec8
```

Then in `C:\dsm-offline-learning-site` run:

```powershell
git branch --show-current
git rev-parse HEAD
git rev-parse --show-superproject-working-tree
git rev-parse --git-dir
git rev-parse --git-common-dir
git status --short
```

Expected: exact branch/SHA, empty superproject output, distinct worktree/common Git dirs, clean status.

- [ ] **Step 3: Extract plan and context in a two-file modification step**

Read only `fb54b5d07d9b03d42ae70890a954454027002b0d:.ai/memory/plan.md` and `fb54b5d07d9b03d42ae70890a954454027002b0d:.ai/memory/context.md` with `git show`. Use `apply_patch` to add exactly:

- Plan block beginning `# 오프라인 학습 사이트 계획 — 2026-08-08` and ending immediately before `# 외부 PC setup·handoff 문서 계획 — 2026-08-08`.
- Consecutive plan blocks beginning `## Pilot A source 확인에 따른 사실 정정 — 2026-08-08`, `## 디자인·서면 명세 승인과 상세 구현 계획 — Pilot A 승인 완료`, and `## 오프라인 학습 사이트 Batch B 설계 탐색 — 2026-08-09`, ending immediately before `# AI CONTROL SYSTEM v5.1 프로젝트 통합 — 2026-08-15`.
- Context bullet range beginning `**오프라인 학습 사이트 조사(2026-08-08)**` and ending `**Batch B 범위 보존**`.

Exclude the following `**Git branch publish·동기화(2026-08-25)**` bullet.

- [ ] **Step 4: Extract checklist and playbook in a two-file modification step**

Read only `fb54b5d07d9b03d42ae70890a954454027002b0d:.ai/memory/checklist.md` and `fb54b5d07d9b03d42ae70890a954454027002b0d:.ai/memory/error-resolution-playbook.md` with `git show`. Add only:

- Checklist block beginning `## 오프라인 학습 사이트` and ending immediately before `## 외부 PC setup·handoff 문서`.
- Playbook index rows for `ER-20260809-001`, `ER-20260809-002`, and `ER-20260809-003`.
- The full three records with those exact IDs.

- [ ] **Step 5: Review provenance and commit all four files together**

Run:

```powershell
git diff --name-only
git diff --check
git diff -- .ai/memory/plan.md .ai/memory/context.md .ai/memory/checklist.md .ai/memory/error-resolution-playbook.md
git add -- .ai/memory/plan.md .ai/memory/context.md .ai/memory/checklist.md .ai/memory/error-resolution-playbook.md
git diff --cached --name-only
git commit -m "docs(memory): preserve offline learning records"
```

Expected: exactly four memory paths and no added branch-publish, Obsidian, external-PC, AI-control, or main-integration history.

- [ ] **Step 6: Run the exact offline suite and verifier**

Run:

```powershell
node --test "tools/learning-site/tests/*.test.mjs"
node tools/learning-site/verify.mjs --root C:\dsm-offline-learning-site --out C:\dsm-offline-learning-site\learning-site --batch batch-b --full --report C:\dsm-offline-learning-site\learning-site\verification-report.json
```

Expected: exactly 66 tests with zero failures; verifier report status `PASS` with 28 sources.

- [ ] **Step 7: Prove ancestry, allowlist, and post-verifier cleanliness**

Run:

```powershell
git rev-list --left-right --count 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD
git log --format="%H %s" 43145b6e0407c3c539ca66deb1813ddbc2e97ec8..HEAD
git diff --name-only 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD
git diff --check 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD
git status --short
```

Expected: `0 1`; one focused memory commit; exactly four allowed paths; clean diff/status. Do not push.

---

### Task 7: Port compatible `c79a042` policy/history documents

**Files:**
- Create: `docs/superpowers/specs/2026-08-15-ai-control-system-v5-1-integration-design.md`
- Create: `docs/superpowers/plans/2026-08-15-ai-control-system-v5-1-integration.md`
- Modify: `.ai/system_prompt.md`

**Interfaces:**
- Consumes: three file candidates from `c79a042`
- Produces: preserved AI-control design history and compatible v5.1 controller guidance

- [ ] **Step 1: Restore the AI-control spec and plan as one two-file step**

Run:

```powershell
git restore --source=c79a042b3c1e115fc0b092a8bddcd3e6723439d6 -- docs/superpowers/specs/2026-08-15-ai-control-system-v5-1-integration-design.md docs/superpowers/plans/2026-08-15-ai-control-system-v5-1-integration.md
git diff --check -- docs/superpowers/specs/2026-08-15-ai-control-system-v5-1-integration-design.md docs/superpowers/plans/2026-08-15-ai-control-system-v5-1-integration.md
git diff --quiet c79a042b3c1e115fc0b092a8bddcd3e6723439d6 -- docs/superpowers/specs/2026-08-15-ai-control-system-v5-1-integration-design.md docs/superpowers/plans/2026-08-15-ai-control-system-v5-1-integration.md
```

Expected: exact source blobs and no whitespace errors. Commit only those two files with `docs: preserve AI control integration records`.

- [ ] **Step 2: Review v5.1 guidance against canonical contracts**

Compare canonical `.ai/system_prompt.md` to the `c79a042` candidate. Require all existing memory backup boundaries, agent assignment fields, Context Compiler, adversarial verification workflow, `ACCEPTED_RISK`, one-to-two-file limit, approval gate, and CCTV fields to remain present. Confirm it creates neither `.ai/memory/memory.md` nor `.ai/archive/`.

- [ ] **Step 3: Port the compatible system prompt as a one-file step**

Run:

```powershell
git restore --source=c79a042b3c1e115fc0b092a8bddcd3e6723439d6 -- .ai/system_prompt.md
rg -n -F "AI CONTROL SYSTEM v5.1 (DSM Project Adapted Edition)" .ai/system_prompt.md
rg -n -F "Context Compiler 호출 프로토콜" .ai/system_prompt.md
rg -n -F "적대적 검증 워크플로 호출 프로토콜" .ai/system_prompt.md
rg -n -F "ACCEPTED_RISK" .ai/system_prompt.md
git diff --check -- .ai/system_prompt.md
```

Expected: every contract is present once and the file is source-identical to `c79a042`. Commit only `.ai/system_prompt.md` with `docs: port compatible agent guidance`.

---

### Task 8: Decide every foundation capability after the canonical merge

**Files:**
- Modify: `docs/reviews/2026-08-25-main-integration-conflict-review.md`
- Modify (ignored): SDD ledger

**Interfaces:**
- Consumes: canonical validated tree and four foundation commits
- Produces: evidence-backed verdict for every candidate; no product mutation

- [ ] **Step 1: Assign a read-only backend investigator**

Require comparison of public interfaces, data models, tests, errors, transactions, operational dependencies, and security assumptions for commits `d977633`, `62772f6`, `81495a3`, and `2a6ba73` against the post-merge tree. Exact writable allowlist is `none`.

- [ ] **Step 2: Apply the acceptance gate**

For each capability, require all of these before `PORT`: absent from canonical, independently testable, compatible with canonical API/security/transaction contracts, no duplicate provider/state machine, no stale migration, no unused dependency, and an exact one-to-two-file implementation sequence already present in this plan.

Expected rulings:

- Notification branch, legacy notification code, Expo frontend, and legacy refresh-token/account deletion are `SUPERSEDED`.
- Redis/realtime, general user APIs, `NotificationMode`, and daily finalization are `DEFER` for the fixed reasons in this plan unless the investigator finds a canonical contract already demanding them; such a contrary finding is `BLOCKED` and requires a reviewed plan amendment rather than an automatic port.
- The partial active-schedule invariant is the only planned conditional `PORT` and proceeds to Task 9 only if no equivalent DB index exists and Docker preconditions still pass.

- [ ] **Step 3: Record the cost of every ruling**

For each verdict, add `Ruling:` to report and ledger. State the cost if wrong: duplicate active schedules for an incorrectly deferred index; new operational burden for incorrectly ported Redis/realtime; API/security exposure for incorrectly ported user settings; score/ranking side effects for incorrectly ported finalization.

- [ ] **Step 4: Commit the classification update**

Run `git diff --check` and commit only the report with `docs: classify selective backend integration`.

---

### Task 9: Conditionally port the active-schedule database invariant

**Trigger:** Task 8 verdict for the partial unique index is `PORT`. If it is `DEFER`, record this task and the baseline-upgrade validation as `NOT_APPLICABLE` and make no migration/test file.

**Files:**
- Create: `DSM_Back/prisma/migrations/20260825_integration_backend_deltas/migration.sql`
- Create: `DSM_Back/src/notifications/notification-migration.contract.spec.ts`

**Interfaces:**
- Consumes: canonical four-migration chain and foundation index intent
- Produces: one forward migration, one dedicated contract test, no schema/provider/API change

- [ ] **Step 1: Prove the invariant is absent**

Run:

```powershell
rg -n -F "NotificationSchedule_one_active_per_task" DSM_Back/prisma DSM_Back/src
Get-ChildItem -LiteralPath DSM_Back/prisma/migrations -Directory | Sort-Object Name | Select-Object -ExpandProperty Name
```

Expected: no index match and exactly the four canonical migration directories in order.

- [ ] **Step 2: Establish migration-history authority**

No existing/shared/remote database is in scope for this integration task, so record the explicit pre-deployment baseline as the four canonical migration names. Do not read `DSM_Back/.env`, inspect real credentials, or connect to an existing database. If the user later identifies an intended database, require its sanitized ordered `_prisma_migrations.migration_name` list before proceeding; a different/unavailable prefix is `BLOCKED`.

- [ ] **Step 3: Write the forward migration as a one-file step**

Create the new migration with this exact SQL:

```sql
WITH ranked_active_schedules AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "taskId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS dedupe_rank
  FROM "NotificationSchedule"
  WHERE "status" IN ('PENDING', 'PROCESSING')
)
UPDATE "NotificationSchedule" AS schedule
SET
  "status" = 'CANCELLED',
  "sentAt" = NULL,
  "failureReason" = 'DEDUPED_ACTIVE_SCHEDULE'
FROM ranked_active_schedules AS ranked
WHERE schedule."id" = ranked."id"
  AND ranked.dedupe_rank > 1;

CREATE UNIQUE INDEX "NotificationSchedule_one_active_per_task"
ON "NotificationSchedule" ("taskId")
WHERE "status" IN ('PENDING', 'PROCESSING');
```

This deterministically preserves the newest active schedule. Do not use `IF NOT EXISTS`, copy either old timestamped migration, or alter canonical migrations; an unexpected existing index must fail loudly.

- [ ] **Step 4: Add a dedicated contract test as a one-file step**

Create the test with this implementation:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('20260825 integration backend migration', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260825_integration_backend_deltas',
      'migration.sql',
    ),
    'utf8',
  );

  it('deduplicates active schedules before creating the exact partial unique index', () => {
    const updateOffset = migration.indexOf('UPDATE "NotificationSchedule" AS schedule');
    const indexOffset = migration.indexOf(
      'CREATE UNIQUE INDEX "NotificationSchedule_one_active_per_task"',
    );

    expect(updateOffset).toBeGreaterThanOrEqual(0);
    expect(indexOffset).toBeGreaterThan(updateOffset);
    expect(migration).toContain('ORDER BY "createdAt" DESC, "id" DESC');
    expect(migration).toContain('"failureReason" = \'DEDUPED_ACTIVE_SCHEDULE\'');
    expect(migration).toContain('ON "NotificationSchedule" ("taskId")');
    expect(
      migration.match(/WHERE "status" IN \('PENDING', 'PROCESSING'\)/g),
    ).toHaveLength(2);
    expect(migration).not.toContain('IF NOT EXISTS');
  });
});
```

Do not mock or modify runtime notification behavior. Step 5 separately proves that no canonical migration file changed.

- [ ] **Step 5: Run targeted checks and commit**

Run in `DSM_Back`:

```powershell
npm test -- --runInBand --no-cache notification-migration.contract.spec.ts
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
```

Expected: all commands exit `0` and `Test-Path Env:DATABASE_URL` is `False` immediately after generate. The process-scoped URL exists only so Prisma can parse the canonical schema and generate the client; loopback port `1` makes any unexpected connection fail closed. Remove it on validate failure or immediately after generate. Do not replace these commands with `prisma migrate`, `db push`, `migrate status`, or any command that connects to a database. A connection attempt is `BLOCKED`.

Then run:

```powershell
git diff --name-only 2a4e9916765b505037e1c533735d84cd9f251ccf -- DSM_Back/prisma/migrations
git diff --check
```

Expected: the only migration delta is `DSM_Back/prisma/migrations/20260825_integration_backend_deltas/migration.sql`. Stage only the two exact task files and commit `feat(back): enforce one active notification schedule`.

---

### Task 10: Reconcile external-PC and current-architecture documents

**Files:**
- Create: `docs/superpowers/specs/2026-08-08-external-pc-setup-and-handoff-design.md`
- Create: `docs/superpowers/plans/2026-08-08-external-pc-setup-and-handoff.md`
- Create: `.ai/docs/2026-07-15-current-project-architecture.md`
- Create: `EXTERNAL_PC_SETUP_AND_HANDOFF.md`

**Interfaces:**
- Consumes: four `c79a042` document candidates and actual post-decision tree
- Produces: current, non-Expo setup/architecture guidance with historical provenance

- [ ] **Step 1: Reconcile the setup design and plan as a two-file step**

Use the `c79a042` versions as provenance, not as verbatim truth. Replace stale branch/checkpoint counts, Node 22+, Expo SDK 55/router/generated native folders, Web/iOS launch commands, and `9ee7b97`/`960f02b` checkout guidance with the pinned refs, exact Node/npm versions, React Native CLI Android-only commands, canonical migration chain, isolated worktree paths, and no-push boundary from this plan.

Required commands in the rewritten plan: backend/frontend `npm ci`, backend Prisma/build/test/non-fixing lint, frontend test/typecheck/lint, Android `gradlew.bat assembleDebug --no-daemon`, and the exact offline test/verifier commands.

- [ ] **Step 2: Validate and commit the setup design/plan pair**

Run:

```powershell
rg -n -e "Expo SDK 55|expo-router|9ee7b97|Node.js 22\+|npm run ios|reset-project" docs/superpowers/specs/2026-08-08-external-pc-setup-and-handoff-design.md docs/superpowers/plans/2026-08-08-external-pc-setup-and-handoff.md
rg -n -F "24.19.0" docs/superpowers/specs/2026-08-08-external-pc-setup-and-handoff-design.md docs/superpowers/plans/2026-08-08-external-pc-setup-and-handoff.md
rg -n -F "11.19.0" docs/superpowers/specs/2026-08-08-external-pc-setup-and-handoff-design.md docs/superpowers/plans/2026-08-08-external-pc-setup-and-handoff.md
git diff --check -- docs/superpowers/specs/2026-08-08-external-pc-setup-and-handoff-design.md docs/superpowers/plans/2026-08-08-external-pc-setup-and-handoff.md
```

Expected: first command has no matches; exact runtime matches exist; diff check passes. Commit the pair with `docs: update external PC setup plan`.

- [ ] **Step 3: Reconcile architecture and handoff as a two-file step**

Write the architecture from the actual integrated tree: NestJS/Prisma backend, React Native 0.83.10 CLI Android app, secure session/API client, canonical notification dispatcher/delivery model, four canonical migrations plus the integration delta only when Task 9 ran, and all Task 8 defer/superseded rulings. State clearly that the offline site is on `codex/offline-learning-site` and absent from the product tree.

The handoff must distinguish local integration/offline branches from unchanged remotes, require the exact runtime/tool gates, avoid real secrets, and provide read-only validation plus future push/PR choices without executing them.

- [ ] **Step 4: Validate and commit architecture/handoff**

Run stale-term searches against both files, check exact canonical/ref/runtime facts, run `git diff --check`, and commit only the pair with `docs: reconcile integration architecture and handoff`.

---

### Task 11: Validate migrations in the two disposable PostgreSQL 17 containers

**Files:**
- Create/Modify (ignored): SDD ledger and canonical Prisma extraction (`canonical-prisma*` first-attempt evidence and fresh `canonical-prisma-r2*` retry targets)
- Create (ignored): `.superpowers/sdd/2026-08-25-main-branch-integration-review/pre-migration-seed.sql`
- Create (ignored): `.superpowers/sdd/2026-08-25-main-branch-integration-review/post-migration-probe.sql`
- Verify: `DSM_Back/prisma/**`

**Interfaces:**
- Consumes: final migration tree, Docker daemon, task-only credentials
- Produces: empty-chain and conditional baseline-upgrade evidence; disposable containers removed

- [ ] **Step 1: Re-prove container names are absent**

Run `docker ps -a --format "{{.Names}}"`. If either exact task name exists, record `BLOCKED`; do not stop, remove, or reuse it.

- [ ] **Step 2: Start the empty-chain container and capture its ID**

Run:

```powershell
$emptyContainerId = docker run --rm -d --name dsm-integration-migrate-empty -e POSTGRES_USER=dsm_integration -e POSTGRES_PASSWORD=dsm_integration_password -e POSTGRES_DB=dsm_integration -p 127.0.0.1:55432:5432 postgres:17-alpine
$emptyReady = $false
foreach ($attempt in 1..30) {
  docker exec $emptyContainerId pg_isready -U dsm_integration -d dsm_integration
  if ($LASTEXITCODE -eq 0) { $emptyReady = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $emptyReady) { throw 'empty migration database did not become ready in 60 seconds' }
```

Expected: a non-empty container ID and a successful health check within 60 seconds. Record the returned ID. Do not write the fixture credential to a tracked file.

- [ ] **Step 3: Deploy and inspect the final chain on empty PostgreSQL**

In `DSM_Back`, use the same PowerShell process and run:

```powershell
$env:DATABASE_URL = 'postgresql://dsm_integration:dsm_integration_password@127.0.0.1:55432/dsm_integration?schema=public'
npx prisma migrate deploy
npx prisma migrate status
```

Expected: both exit 0.

- [ ] **Step 4: Run the conditional canonical-prefix upgrade**

If Task 9 did not create an integration migration, record `NOT_APPLICABLE` and skip only this step. The first attempt's `canonical-prisma.zip` and `canonical-prisma/` are immutable failure evidence: preserve them and do not delete or reuse them. For the approved retry, first prove the fresh ignored `canonical-prisma-r2.zip` and `canonical-prisma-r2/` targets do not exist; if either exists, record `BLOCKED`. From the integration root run:

```powershell
Test-Path -LiteralPath '.superpowers/sdd/2026-08-25-main-branch-integration-review/canonical-prisma-r2.zip'
Test-Path -LiteralPath '.superpowers/sdd/2026-08-25-main-branch-integration-review/canonical-prisma-r2'
git archive --format=zip --output=.superpowers/sdd/2026-08-25-main-branch-integration-review/canonical-prisma-r2.zip 2a4e9916765b505037e1c533735d84cd9f251ccf DSM_Back/prisma
Expand-Archive -LiteralPath '.superpowers/sdd/2026-08-25-main-branch-integration-review/canonical-prisma-r2.zip' -DestinationPath '.superpowers/sdd/2026-08-25-main-branch-integration-review/canonical-prisma-r2'
$upgradeContainerId = docker run --rm -d --name dsm-integration-migrate-upgrade -e POSTGRES_USER=dsm_integration -e POSTGRES_PASSWORD=dsm_integration_password -e POSTGRES_DB=dsm_integration -p 127.0.0.1:55433:5432 postgres:17-alpine
$upgradeReady = $false
foreach ($attempt in 1..30) {
  docker exec $upgradeContainerId pg_isready -U dsm_integration -d dsm_integration
  if ($LASTEXITCODE -eq 0) { $upgradeReady = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $upgradeReady) { throw 'upgrade migration database did not become ready in 60 seconds' }
```

Expected: both `Test-Path` calls initially return `False`, extraction succeeds, and the captured container becomes healthy. In `DSM_Back`, run:

```powershell
$env:DATABASE_URL = 'postgresql://dsm_integration:dsm_integration_password@127.0.0.1:55433/dsm_integration?schema=public'
npx prisma migrate deploy --schema ..\.superpowers\sdd\2026-08-25-main-branch-integration-review\canonical-prisma-r2\DSM_Back\prisma\schema.prisma
npx prisma migrate status --schema ..\.superpowers\sdd\2026-08-25-main-branch-integration-review\canonical-prisma-r2\DSM_Back\prisma\schema.prisma
```

Expected: exactly the four canonical migrations deploy and status exits 0.

- [ ] **Step 5: Seed duplicate canonical rows before the forward delta**

Create the ignored `pre-migration-seed.sql` with this exact task-only data:

```sql
INSERT INTO "User" ("id", "nickname", "updatedAt")
VALUES ('integration-user', 'integration-migration-user', CURRENT_TIMESTAMP);

INSERT INTO "Task" ("id", "title", "startAt", "endAt", "difficulty", "userId", "updatedAt")
VALUES ('integration-task', 'integration migration probe', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour', 'LOW', 'integration-user', CURRENT_TIMESTAMP);

INSERT INTO "NotificationSchedule" ("id", "taskId", "userId", "scheduledAt", "status", "createdAt", "updatedAt")
VALUES
  ('integration-schedule-old', 'integration-task', 'integration-user', CURRENT_TIMESTAMP, 'PENDING', CURRENT_TIMESTAMP - INTERVAL '1 minute', CURRENT_TIMESTAMP),
  ('integration-schedule-new', 'integration-task', 'integration-user', CURRENT_TIMESTAMP, 'PROCESSING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
```

Copy it only into the captured upgrade container and apply it before the final delta:

```powershell
docker cp ..\.superpowers\sdd\2026-08-25-main-branch-integration-review\pre-migration-seed.sql "${upgradeContainerId}:/tmp/pre-migration-seed.sql"
docker exec $upgradeContainerId psql -v ON_ERROR_STOP=1 -U dsm_integration -d dsm_integration -f /tmp/pre-migration-seed.sql
npx prisma migrate deploy
npx prisma migrate status
```

Expected: seed succeeds against the canonical prefix; the final tree deploys `20260825_integration_backend_deltas`; final status exits 0.

- [ ] **Step 6: Verify deduplication and the active-schedule index**

Create ignored `post-migration-probe.sql` with:

```sql
DO $$
DECLARE
  active_count integer;
  deduped_count integer;
  index_count integer;
  unique_violation_seen boolean := false;
BEGIN
  SELECT count(*) INTO active_count
  FROM "NotificationSchedule"
  WHERE "taskId" = 'integration-task' AND "status" IN ('PENDING', 'PROCESSING');

  SELECT count(*) INTO deduped_count
  FROM "NotificationSchedule"
  WHERE "id" = 'integration-schedule-old'
    AND "status" = 'CANCELLED'
    AND "failureReason" = 'DEDUPED_ACTIVE_SCHEDULE';

  SELECT count(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'NotificationSchedule'
    AND indexname = 'NotificationSchedule_one_active_per_task'
    AND indexdef LIKE '%UNIQUE INDEX%'
    AND indexdef LIKE '%("taskId")%'
    AND indexdef LIKE '%PENDING%'
    AND indexdef LIKE '%PROCESSING%';

  IF active_count <> 1 OR deduped_count <> 1 OR index_count <> 1 THEN
    RAISE EXCEPTION 'integration migration state is invalid';
  END IF;

  BEGIN
    INSERT INTO "NotificationSchedule" ("id", "taskId", "userId", "scheduledAt", "status", "updatedAt")
    VALUES ('integration-schedule-rejected', 'integration-task', 'integration-user', CURRENT_TIMESTAMP, 'PENDING', CURRENT_TIMESTAMP);
  EXCEPTION WHEN unique_violation THEN
    unique_violation_seen := true;
  END;

  IF NOT unique_violation_seen THEN
    RAISE EXCEPTION 'second active schedule was accepted';
  END IF;

  INSERT INTO "NotificationSchedule" ("id", "taskId", "userId", "scheduledAt", "status", "updatedAt")
  VALUES ('integration-schedule-cancelled', 'integration-task', 'integration-user', CURRENT_TIMESTAMP, 'CANCELLED', CURRENT_TIMESTAMP);
END $$;
```

Run:

```powershell
docker cp ..\.superpowers\sdd\2026-08-25-main-branch-integration-review\post-migration-probe.sql "${upgradeContainerId}:/tmp/post-migration-probe.sql"
docker exec $upgradeContainerId psql -v ON_ERROR_STOP=1 -U dsm_integration -d dsm_integration -f /tmp/post-migration-probe.sql
```

Expected: exit 0, proving deterministic dedupe, exact partial index, active duplicate rejection, and allowed canceled rows.

- [ ] **Step 7: Clean up only containers created by this run**

This cleanup step is mandatory in a `finally` path even if a health, migration, status, seed, or probe command fails; failure still blocks all later repository tasks, but it does not excuse leaving a task container running.

Run:

```powershell
docker stop $emptyContainerId
if ($upgradeContainerId) { docker stop $upgradeContainerId }
$env:DATABASE_URL = $null
docker ps -a --format "{{.Names}}"
```

Stop only the two captured IDs. Because both used `--rm` and no volume, verify both exact names disappear. Record creation, health, migration, status, invariant probe, cleanup, and exit codes in the ledger.

---

### Task 12: Run the complete validation matrix

**Files:**
- Modify: `DSM_Back/src/notifications/notification-migration.contract.spec.ts` (approved formatting-only amendment)
- Verify: final integration tree
- Verify: offline worktree
- Modify (ignored): SDD ledger
- Create (ignored): `.superpowers/sdd/2026-08-25-main-branch-integration-review/verify-lock-roots.mjs`

**Interfaces:**
- Consumes: all accepted commits and both local branches
- Produces: one `PASS`/`BLOCKED`/triggered `NOT_APPLICABLE` row for every spec validation

- [ ] **Step 0: Apply the approved formatting-only amendment**

The first Task 12 run already established RED: the exact non-fixing backend ESLint command exited `1`, and a non-writing exact-file Prettier check reproduced only two wrap errors at lines 17 and 25 of `DSM_Back/src/notifications/notification-migration.contract.spec.ts`. The user approved `Task 12 amendment 승인` on 2026-08-27. Change only those two Prettier-prescribed line wraps; do not change assertions, strings, migration SQL, product behavior, dependencies, or any other source/test file.

Verify the exact file with non-writing Prettier, its focused Jest contract test, the full non-fixing backend ESLint command, and `git diff --check`. Prettier's multiline call style adds one optional trailing comma at each wrapped argument, so compare the HEAD and working file after removing whitespace and only commas immediately before `)`; the normalized contents must be identical, and the raw diff must contain only the two wraps plus their two trailing commas. Stage and commit only that test file with `style(back): format migration contract test`; leave the user-authorized active-memory compression changes unstaged and preserved. Then restart the complete Task 12 matrix from the runtime gate rather than reusing partial results.

- [ ] **Step 1: Re-run the exact runtime, backend, frontend, and Android commands**

Run every command from the approved spec validation table exactly, including clean `npm ci`, backend Prisma validate/generate/build/test/non-fixing lint, frontend test/typecheck/lint, and Android debug build. Every required row must be `PASS`.

- [ ] **Step 2: Verify manifest/lockfile root equality in both projects**

Create the ignored `verify-lock-roots.mjs` with:

```javascript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sorted = (value) =>
  Object.fromEntries(Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right)));

for (const root of process.argv.slice(2)) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const lockRoot = lock.packages?.[''];
  for (const field of ['dependencies', 'devDependencies']) {
    const expected = sorted(manifest[field]);
    const actual = sorted(lockRoot?.[field]);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      console.error(`${root}: ${field} root mismatch`);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log(`${root}: PASS`);
}
```

Run from the integration root:

```powershell
node .superpowers/sdd/2026-08-25-main-branch-integration-review/verify-lock-roots.mjs DSM_Back DSM_Front
git diff --quiet 2a4e9916765b505037e1c533735d84cd9f251ccf -- DSM_Back/package.json DSM_Back/package-lock.json DSM_Front/package.json DSM_Front/package-lock.json
```

Expected: both projects print `PASS`. The Git command exits 0 because the only planned backend delta has no dependency and no manifest changes.

- [ ] **Step 3: Re-run all offline checks**

Repeat the exact 66-test command, 28-source verifier, worktree identity, `0 1` ancestry, four-path allowlist, added-line provenance review, `git diff --check`, and clean post-verifier status.

- [ ] **Step 4: Verify Git/SDD integrity**

Run in the integration worktree:

```powershell
git check-ignore -q .superpowers/sdd/2026-08-25-main-branch-integration-review/progress.md
git diff --check
git diff --stat origin/main...HEAD
git status --short
git merge-base --is-ancestor 2a4e9916765b505037e1c533735d84cd9f251ccf HEAD
git rev-parse origin/main
git rev-parse origin/codex/integration-main-review
```

Expected: ignored ledger, no whitespace or unexplained status, reviewed stat, canonical ancestry, and unchanged remote SHAs.

---

### Task 13: Reconcile active integration memory

**Files:**
- Modify: `.ai/memory/plan.md`
- Modify: `.ai/memory/context.md`
- Modify: `.ai/memory/checklist.md`
- Modify: `.ai/memory/README.md` (approved compression routing and byte/hash snapshot only)

**Interfaces:**
- Consumes: actual branch rulings and validation outputs
- Produces: truthful main-integration memory with no offline/product conflation

- [ ] **Step 0: Apply the approved four-path memory amendment**

The user requested `.ai/memory` compression and then approved the exact phrase `Task 13 amendment 승인` on 2026-08-27. Extend Task 13 from three active-state files to exactly four tracked files by including `.ai/memory/README.md` only for recovery routing, compression byte counts, active SHA-256 values, UTF-8 verification, and current Task 12/13 status. Preserve the ignored byte-exact `*.20260827.original.md` recovery files without staging or modifying them. Do not edit `error-resolution-playbook.md`, product files, configuration, or any other memory file.

- [ ] **Step 1: Update plan and context as a two-file step**

Record only the actual canonical merge, ported capabilities, commit subjects, exact test results, local branch/worktree identities, blocked/deferred rows, and no-push gate. Mention the offline branch only as an excluded sibling deliverable; do not copy offline completion blocks into integration memory.

- [ ] **Step 2: Update checklist as a one-file step**

Mark only observed `PASS` items complete. A required `BLOCKED` row keeps integration review incomplete. `NOT_APPLICABLE` is allowed only for the false integration-migration trigger.

- [ ] **Step 3: Refresh and verify README as a one-file step**

After the active three files are final, recompute their exact byte counts and SHA-256 values, update the README snapshot, and verify each active/recovery Markdown file with strict UTF-8 decoding. Confirm the three ignored 2026-08-27 backups retain the exact byte/hash values recorded in README and remain ignored.

- [ ] **Step 4: Commit the four reconciled memory files**

Run `git diff --check`, confirm the staged set is exactly `.ai/memory/README.md`, `.ai/memory/plan.md`, `.ai/memory/context.md`, and `.ai/memory/checklist.md`, and commit `docs(memory): record integration review results`.

---

### Task 14: Finalize the conflict report and obtain independent review

**Files:**
- Modify: `docs/reviews/2026-08-25-main-integration-conflict-review.md`
- Modify (ignored): SDD ledger

**Interfaces:**
- Consumes: final committed integration branch, offline branch, complete validation ledger
- Produces: final evidence package and independent verdict

- [ ] **Step 1: Finalize the report**

Include exact merge ancestry, subsystem rulings, offline branch SHA and four-path allowlist, commit summary, every validation row with command/exit code/count, deferred capabilities, blockers, residual risks, unchanged remotes, and explicit prohibition on push/PR/main merge without another approval.

- [ ] **Step 2: Assign an independent read-only reviewer**

The reviewer reads the approved spec, this plan, integration report, ledger, `origin/main...HEAD`, the offline branch delta, migration SQL/test when present, and validation outputs. Exact writable allowlist is `none`; the implementer/investigator cannot self-review.

- [ ] **Step 3: Handle findings without scope expansion**

Record reviewer severity, path/line, evidence, and verdict. If a finding requires an unlisted product-file edit or structural decision, record `BLOCKED` and obtain a plan amendment plus user approval. Do not silently fix outside this plan. Re-run the reviewer after any approved fix.

- [ ] **Step 4: Commit the final report**

When the reviewer returns no blocking finding and every required row is `PASS`, record the verdict, run `git diff --check`, and commit only the report with `docs: finalize main integration review`.

---

### Task 15: Final clean handoff without publishing

**Files:**
- Verify: both local branches/worktrees and all pinned remote refs

**Interfaces:**
- Consumes: final report/reviewer verdict
- Produces: user-facing local handoff and a new approval gate; no GitHub mutation

- [ ] **Step 1: Capture final branch summaries**

Run `git status --short --branch`, `git log --oneline --decorate origin/main..HEAD`, and `git diff --stat origin/main...HEAD` in the integration worktree. Run corresponding status/log/ancestry/allowlist commands in the offline worktree.

- [ ] **Step 2: Reconfirm remote refs are unchanged**

Compare all six remote refs to the pinned table again. No push is performed.

- [ ] **Step 3: Deliver CCTV and choices**

Report modified/added files by subsystem, memory synchronization, direct/unrelated changes, every run and unrun validation, branch/commit summaries, deferred risks, and approval gates. Offer future choices—push the two branches, open a PR, or keep them local—but do not perform any choice until the user explicitly approves it.

## Completion Gate

Completion requires every required validation row to be `PASS`, no unexplained status, independent review with no blocking finding, the offline branch at exactly one commit beyond `43145b6`, canonical ancestry preserved by a regular merge, and unchanged `main`/remote refs. Any `BLOCKED` row means the review is not complete even if local commits exist.
