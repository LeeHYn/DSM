# Main Branch Integration Review Design

## Purpose

Prepare a local integration branch that reconciles product work from the active DSM feature branches without changing or pushing `main`, while preserving the offline learning site on its own dedicated branch. The result must make branch ancestry, conflict decisions, validation evidence, and residual risks explicit before any pull request or merge into `main` is considered.

## Current Branch Topology

- Baseline: `main` at `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`.
- Canonical product candidate: `codex/front-secure-session-rest-client` at `2a4e9916765b505037e1c533735d84cd9f251ccf`. It is 100 commits ahead of `main` and contains the product checkpoint `960f02bc9f24c8a5d578c64fb7b734cdb8530506` plus 94 later commits.
- `codex/m12b-front-prototype-checkpoint` now points to `396fc0a89327795646e89e128d7204b55b7fc00b`. It and the canonical product branch share merge base `960f02bc9f24c8a5d578c64fb7b734cdb8530506`, then diverge by four checkpoint-side commits and 94 product-side commits.
- The four checkpoint-side commits are `43145b6` offline learning site content, `c79a042` handoff and AI workflow documents, `fb54b5d` combined project memory, and `396fc0a` publish-closure memory. The checkpoint branch is not a whole-branch merge input.
- The offline learning site must remain on dedicated branch `codex/offline-learning-site` in isolated worktree `C:\dsm-offline-learning-site`. Its content baseline is commit `43145b6`, whose parent is the selected source snapshot `960f02b`. The dedicated branch also receives only the offline-site sections of active memory and `ER-20260809-001` through `ER-20260809-003`; it does not receive unrelated branch-publish or product-integration memory.
- `codex/dsm-back-foundation-prisma` at `2a6ba73adfca52398cc2299d91c3f6dff7788af3` diverged before the current `main`; it is four commits ahead and one commit behind `main`. Its four unique commits cover notification/realtime backend work, backend stabilization, a front integration foundation, and backend milestone closure.
- `codex/dsm-milestone-12a-notifications` at `362aabeb713c2f5c0b73f599216b8cf92ea1b97a` is one commit ahead of the current `main` and overlaps the notification and task synchronization areas already changed by the other branches.
- No pull request currently represents these branches.

### Start Preconditions and Stop Conditions

Before implementation, re-fetching is allowed only as a read/update of remote-tracking refs. After fetch, every remote ref below must equal its exact expected SHA. If any ref moved, stop and update this specification through review before integrating the new state.

| Remote ref | Expected SHA |
|---|---|
| `origin/main` | `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81` |
| `origin/codex/front-secure-session-rest-client` | `2a4e9916765b505037e1c533735d84cd9f251ccf` |
| `origin/codex/m12b-front-prototype-checkpoint` | `396fc0a89327795646e89e128d7204b55b7fc00b` |
| `origin/codex/dsm-back-foundation-prisma` | `2a6ba73adfca52398cc2299d91c3f6dff7788af3` |
| `origin/codex/dsm-milestone-12a-notifications` | `362aabeb713c2f5c0b73f599216b8cf92ea1b97a` |
| `origin/codex/integration-main-review` | `6fa66eb5998c140bb6db995cc48c1a51f7a3089f` |

The approved integration workspace is `C:\dsm-integration-review` on local branch `codex/integration-main-review`, tracking `origin/codex/integration-main-review`. It was created from remote commit `6fa66eb5998c140bb6db995cc48c1a51f7a3089f` after the user approved the revised isolation design. Reuse is allowed only when all of the following hold: `git branch --show-current` returns that exact branch; `git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}"` returns the exact upstream; `git rev-list --left-right --count origin/codex/integration-main-review...HEAD` has a left count of zero; and `git status --short` is empty. Every local-only commit must then be one of three reviewed classes: an approved specification commit named in `.ai/memory/plan.md` or `.ai/memory/checklist.md`; a `docs(memory):` closure commit whose changed paths are a subset of `.ai/memory/plan.md`, `.ai/memory/context.md`, and `.ai/memory/checklist.md`; or an explicitly approved implementation-plan or preflight commit whose exact path allowlist is recorded in `.ai/memory/plan.md`. The specification blob at `HEAD` must match the user-approved reviewed version. Any other subject, path, merge, or unexplained commit is a stop condition. Never force-reset, overwrite/recreate the branch, reuse another worktree, or discard uncommitted files to satisfy these checks.

The approved offline workspace is `C:\dsm-offline-learning-site` on local branch `codex/offline-learning-site`. Before creation, the path, `refs/heads/codex/offline-learning-site`, and `refs/remotes/origin/codex/offline-learning-site` must all be absent; if any exists, stop and request review rather than deleting, overwriting, or reusing it. Only after the implementation plan is approved, create it with `git worktree add -b codex/offline-learning-site C:\dsm-offline-learning-site 43145b6e0407c3c539ca66deb1813ddbc2e97ec8`. Then require a linked-worktree Git dir distinct from the common Git dir, no superproject, `git branch --show-current` equal to the exact branch, `git rev-parse HEAD` equal to `43145b6e0407c3c539ca66deb1813ddbc2e97ec8`, and empty `git status --short`. Do not use `C:\DEV`, `C:\dsm-integration-review`, or the existing but unignored `C:\DEV\.worktrees` directory for this branch.

## Chosen Integration Strategy

Use selective integration rather than merging all branches wholesale.

1. Start from `origin/main` on the isolated local branch `codex/integration-main-review` in `C:\dsm-integration-review`.
2. Preserve the approved specification commit, then merge `origin/codex/front-secure-session-rest-client` with a regular non-squash merge. A fast-forward is no longer possible after the specification commit; the merge must retain both the specification and the complete canonical product history through `2a4e991`.
3. Do not merge `origin/codex/m12b-front-prototype-checkpoint`. Review `c79a042` file by file and selectively port the external-PC handoff, AI workflow specification/plan, and compatible agent/system guidance. Reconcile its architecture document against the canonical product tree instead of accepting stale statements. Do not port `43145b6`, `fb54b5d`, or `396fc0a` into the main integration branch.
4. Create `codex/offline-learning-site` from `43145b6` in `C:\dsm-offline-learning-site` only after the implementation plan is approved and the offline-worktree preconditions above pass. Add one focused memory commit that extracts only the enumerated offline-site blocks from `fb54b5d`. Commit `396fc0a` contributes no offline content because its diff changes only branch-publish closure, so do not source or port any text from it. Exclude unrelated product, branch-publish, Obsidian, external-PC, AI-control, and main-integration history. Validate the dedicated branch with all 66 learning-site tests, the 28-source full verifier, the exact ancestry check, and the memory allowlist checks before push is considered.
5. Treat `origin/codex/dsm-back-foundation-prisma` as a source of candidate backend capabilities, not as a whole-branch merge. Review its four unique commits and port only changes that remain absent and compatible after step 2.
6. Classify `origin/codex/dsm-milestone-12a-notifications` as superseded for its FCM token API and Task-to-Schedule implementation. It may supply no product code unless a named, independently testable capability is absent from the canonical branch and satisfies the acceptance rules below.
7. Reconcile generated metadata, package manifests, lockfiles, Prisma schema/migrations, and main-integration `.ai` memory documents after product-code decisions are complete. Main-integration memory must not claim that the excluded offline site exists in the integrated product tree.

### Considered Alternatives

- **Selected — canonical product merge plus dedicated offline branch:** preserves the full product history, keeps source-faithful learning artifacts available, and prevents product memory from claiming an excluded site.
- **Rejected — merge the current checkpoint wholesale:** would mix offline artifacts and publish-closure memory into the product integration branch and reintroduce avoidable `.ai/memory` conflicts.
- **Rejected — copy the offline site into the main integration branch:** would violate the user's explicit branch boundary and make future product releases carry a large generated learning artifact set.

## Canonical Source Rules

### Frontend

`codex/front-secure-session-rest-client` at `2a4e991` is canonical for frontend runtime, Android configuration, authentication/session behavior, API clients, screens, tests, and frontend documentation because it contains the product checkpoint `960f02b` and 94 later commits. Older frontend files from `codex/dsm-back-foundation-prisma` must not overwrite it.

### Backend

Backend behavior is selected per subsystem rather than by branch date alone:

- Existing behavior and tests on `codex/front-secure-session-rest-client` form the initial whole-tree integration baseline, including its backend notification dispatcher, refresh-token session family, Prisma migration chain, and authentication contracts.
- Unique Redis, realtime ranking, user-account, score finalization, and backend closure changes from `codex/dsm-back-foundation-prisma` are candidates for porting when the baseline lacks equivalent behavior.
- The canonical FCM registration contract is `PUT /notifications/fcm-tokens`; a token owned by another user returns `409`; the successful response excludes the raw token; revocation uses `DELETE` and remains idempotent. These API, ownership, and exposure rules may not be weakened by another branch.
- Task creation, update, removal, completion, score recomputation, schedule mutation, and delivery cancellation must remain inside the canonical Serializable transaction boundary with at most two `P2034` retries (three attempts total). No branch may move schedule synchronization after transaction commit.
- Preserve the canonical dispatcher status machine, lease/retry/idempotency rules, notification delivery outcome model, and their existing tests. Do not create a second provider, scheduler, or delivery state machine.
- `codex/dsm-milestone-12a-notifications` is superseded for notification product code. From `codex/dsm-back-foundation-prisma`, only the partial unique index enforcing one active schedule per task and the `NotificationMode` user preference are eligible notification candidates. Each is accepted only if it has a forward migration after the canonical chain, dedicated tests, no API/security regression, and no duplicate invariant already enforced by the canonical implementation.
- Authentication, category ownership, task transactionality, refresh-token rotation, and score recalculation hardening already present on current `main` must not regress.

### Prisma and Database Changes

- Preserve a single coherent `schema.prisma` matching the selected backend services.
- The canonical migration chain is, in order: `20260716_init`, `20260720_notification_delivery_outcome_policy`, `20260725_user_onboarding_completed_at`, and `20260810_refresh_token_session_family` from `codex/front-secure-session-rest-client`.
- Do not copy the foundation files `20260620000000_milestone_13_notification_indexes` or `20260621000000_milestone_15_backend_closure`; their timestamps sort before table creation. If either eligible delta is selected, express it in a new forward migration at `DSM_Back/prisma/migrations/20260825_integration_backend_deltas/migration.sql` after the canonical chain.
- Never edit an already-applied migration merely to hide a conflict.
- Before accepting any new migration delta, obtain a sanitized ordered list of the intended database's `_prisma_migrations.migration_name` values. If no intended database exists, record that fact and use the four canonical migrations as the explicit pre-deployment baseline. If a database exists but its ordered migration list is unavailable or differs from the canonical prefix, migration-affecting candidates are `BLOCKED` and must be deferred; do not infer or repair its state.
- Always validate the final chain in one disposable PostgreSQL 17 empty database. When an integration migration exists, also validate a second database that receives the four canonical migrations first and then the integration delta. Every used database must reach the final schema with `prisma migrate deploy` and `prisma migrate status` at exit code 0.
- Migration validation may target only explicitly named disposable local Docker databases created for this task. Do not reset or connect to an existing, shared, remote, staging, or production database, and do not access real credentials.

### Disposable Migration Harness

- Use image `postgres:17-alpine` and exact container names `dsm-integration-migrate-empty` and `dsm-integration-migrate-upgrade` on loopback ports `55432` and `55433` respectively.
- Use task-only local credentials `POSTGRES_USER=dsm_integration`, `POSTGRES_PASSWORD=dsm_integration_password`, and `POSTGRES_DB=dsm_integration`. These values are test fixtures, not reusable credentials, and must not be written to a tracked file.
- Before creation, `docker ps -a --format "{{.Names}}"` must show neither name. If either exists, report `BLOCKED`; do not stop, remove, or reuse it.
- Start each with `docker run --rm -d --name <exact-name> -e POSTGRES_USER=dsm_integration -e POSTGRES_PASSWORD=dsm_integration_password -e POSTGRES_DB=dsm_integration -p 127.0.0.1:<exact-port>:5432 postgres:17-alpine`, substituting only the exact name/port pair above, and wait for `pg_isready` to succeed.
- For the empty-chain check, set `DATABASE_URL=postgresql://dsm_integration:dsm_integration_password@127.0.0.1:55432/dsm_integration?schema=public`, run the final tree's `npx prisma migrate deploy`, then `npx prisma migrate status`.
- For the upgrade check, extract `DSM_Back/prisma` from canonical ref `2a4e9916765b505037e1c533735d84cd9f251ccf` into this plan's git-ignored SDD workspace. Set `DATABASE_URL=postgresql://dsm_integration:dsm_integration_password@127.0.0.1:55433/dsm_integration?schema=public`, deploy the extracted canonical chain, then run the final tree's `npx prisma migrate deploy` and `npx prisma migrate status` against the same database.
- Stop only the two container IDs returned by this run. Because `--rm` is required and no volume is mounted, their databases are destroyed with those containers. Record creation, health, migration, status, and cleanup results in the ledger.

### Configuration and Dependencies

- The integration runtime is Node.js `24.19.0` and npm `11.19.0`. The design-review host currently reports Node.js `24.13.0` and npm `11.6.2`; implementation remains `BLOCKED` until an approved setup step provides the exact required versions. Record `node --version` and `npm --version`; any other version is `BLOCKED`, not an implicit substitute.
- The canonical manifests and lockfiles come from `codex/front-secure-session-rest-client`. Add only exact dependencies required by accepted backend deltas, using the exact versions already resolved in the candidate branch; do not carry unused branch dependencies.
- Never resolve lockfile conflict markers by hand. After the runtime version check has established npm `11.19.0`, when a selected manifest changes run `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, followed by `npm ci --no-audit --no-fund`, in that project. When a manifest does not change, retain its canonical lockfile byte-for-byte and run `npm ci --no-audit --no-fund`.
- After installation, parse `package.json` and `package-lock.json` and assert that every root dependency/devDependency name and version range equals `package-lock.json`'s root `packages[""]` entry; extra or missing root entries fail validation.
- Keep secret values out of Git. `.env.example` files may contain names and non-secret examples only.
- Preserve the Android-only frontend direction established by the latest frontend branch.
- Do not add unrelated dependency upgrades.

### Project Memory and Agent Rules

- Preserve the agent contracts and `.ai/memory/*` documents from `codex/front-secure-session-rest-client` as the baseline.
- Reconcile main-integration `.ai/memory/plan.md`, `context.md`, and `checklist.md` only after product decisions are final. Add only capabilities actually ported and validated on the integrated tree. Do not copy offline-site completion state, branch-publish bookkeeping, Expo-era state, or milestone status from an excluded branch; cite those only as provenance in the conflict report.
- On `codex/offline-learning-site`, use only commit `fb54b5d07d9b03d42ae70890a954454027002b0d` as the extraction source. The exact source map is:
  - `.ai/memory/plan.md`: the full block beginning `# 오프라인 학습 사이트 계획 — 2026-08-08` and ending immediately before `# 외부 PC setup·handoff 문서 계획 — 2026-08-08`, plus the consecutive blocks beginning `## Pilot A source 확인에 따른 사실 정정 — 2026-08-08`, `## 디자인·서면 명세 승인과 상세 구현 계획 — Pilot A 승인 완료`, and `## 오프라인 학습 사이트 Batch B 설계 탐색 — 2026-08-09`, ending immediately before `# AI CONTROL SYSTEM v5.1 프로젝트 통합 — 2026-08-15`.
  - `.ai/memory/context.md`: the consecutive bullet range beginning `**오프라인 학습 사이트 조사(2026-08-08)**` and ending `**Batch B 범위 보존**`. Exclude the following `**Git branch publish·동기화(2026-08-25)**` bullet.
  - `.ai/memory/checklist.md`: the full `## 오프라인 학습 사이트` block ending immediately before `## 외부 PC setup·handoff 문서`.
  - `.ai/memory/error-resolution-playbook.md`: only the index rows and full records for `ER-20260809-001`, `ER-20260809-002`, and `ER-20260809-003`.
- The focused commit may modify only those four `.ai/memory` files. Review its added lines against the exact source map above. Do not cherry-pick `fb54b5d` wholesale. Do not extract anything from `396fc0a89327795646e89e128d7204b55b7fc00b`; its only changes are branch-publish closure bookkeeping.
- After the implementation plan is written and explicitly approved, but before SDD begins, the main controller owns one standalone process-setup change with exact writable allowlist `.gitignore`: add the exact repository-root rule `/.superpowers/sdd/` and commit only that file with message `chore: ignore SDD execution workspace`. This is controller-owned integration metadata, not a subagent product/config task; no repository subagent role is authorized to make it. Without explicit plan approval, this preflight is `BLOCKED` and no ledger may be created. Do not use a global ignore file, `.git/info/exclude`, or user-specific Git configuration. After that commit and before creating the ledger, `git check-ignore -q .superpowers/sdd/2026-08-25-main-branch-integration-review/progress.md` must exit 0 and `git status --short` must be empty.
- The SDD workspace is `.superpowers/sdd/2026-08-25-main-branch-integration-review/`, and its ledger is `.superpowers/sdd/2026-08-25-main-branch-integration-review/progress.md`.
- The ledger's first line must be `# SDD ledger — plan: docs/superpowers/plans/2026-08-25-main-branch-integration-review.md`. It must record each task base/head, test command and result, reviewer verdict, deferred minor, fix round, and every `Ruling:` with the cost if wrong.
- Record every non-obvious conflict ruling in both the integration report and SDD ledger.

## Conflict Review Procedure

1. Produce a branch and commit inventory with exact SHAs and ancestry relationships.
2. Produce a file-overlap matrix for the candidate branches, grouped into frontend, backend subsystem, Prisma/migrations, dependency metadata, and project memory.
3. Produce a second inventory for `43145b6`, `c79a042`, `fb54b5d`, and `396fc0a`, classifying every changed file as offline-branch content, main-integration document candidate, offline-memory extraction source, or excluded publish bookkeeping.
4. For each overlapping subsystem, compare public interfaces, data models, tests, error handling, and operational assumptions before selecting a side.
5. Resolve product conflicts in small subsystem-scoped commits. Do not mix frontend, backend, Prisma, offline-branch extraction, and main-integration memory conflict resolution in one commit.
6. After every subsystem commit, run its targeted tests and a type/build check appropriate to that subsystem.
7. Run a final whole-branch review after all subsystem tasks complete.

## Roles and Work Ownership

Repository policy requires product investigation and implementation through the roles under `.ai/agents/`.

- Investigator: read-only branch topology, overlap matrix, and candidate capability inventory.
- Backend developer: selected backend and Prisma integration with an exact writable allowlist.
- Frontend developer: frontend conflict resolution only if the canonical frontend branch fails validation or conflicts with selected backend contracts.
- Reviewer: independent review of each subsystem diff and final integrated branch.
- Main controller: plan/spec ownership, user approvals, file ownership, rulings, review packaging, and final verification.

No two implementation agents may edit overlapping files concurrently.

## Validation

Every row below must be recorded as `PASS`, `BLOCKED`, or `NOT_APPLICABLE`. `NOT_APPLICABLE` is allowed only for a row whose stated trigger is false. Any required row that is `BLOCKED`, not run, or has a nonzero exit code prevents completion.

| Area | Exact command or check | Required status |
|---|---|---|
| Runtime | `node --version` equals `v24.19.0`; `npm --version` equals `11.19.0` | `PASS` |
| Backend install | In `DSM_Back`: `npm ci --no-audit --no-fund` | `PASS` |
| Backend schema | In `DSM_Back`: `npm run prisma:validate` then `npm run prisma:generate` | `PASS` |
| Backend build | In `DSM_Back`: `npm run build` | `PASS` |
| Backend tests | In `DSM_Back`: `npm test -- --runInBand --no-cache` | `PASS` |
| Backend lint | In `DSM_Back`: `npx eslint "{src,apps,libs,test}/**/*.ts"` without `--fix` | `PASS` |
| Frontend install | In `DSM_Front`: `npm ci --no-audit --no-fund` | `PASS` |
| Frontend tests | In `DSM_Front`: `npm test -- --no-cache` | `PASS` |
| Frontend types | In `DSM_Front`: `npm run typecheck` | `PASS` |
| Frontend lint | In `DSM_Front`: `npm run lint` | `PASS` |
| Android debug build | In `DSM_Front/android`: `.\gradlew.bat assembleDebug --no-daemon` | `PASS` |
| Offline worktree | `C:\dsm-offline-learning-site` is a linked worktree on `codex/offline-learning-site`; no superproject; clean status | `PASS` |
| Offline ancestry | In the offline worktree, `git rev-list --left-right --count 43145b6...HEAD` equals `0 1`, and `git log --format=%H 43145b6..HEAD` contains only the focused memory commit | `PASS` |
| Offline path allowlist | In the offline worktree, `git diff --name-only 43145b6...HEAD` equals only `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md`, and `.ai/memory/error-resolution-playbook.md` | `PASS` |
| Offline memory provenance | Review every added line against the exact `fb54b5d` source map above; the diff contains all three named ER index rows and full records and contains no added branch-publish, Obsidian, external-PC, AI-control, or main-integration history | `PASS` |
| Offline tests | In the offline worktree root: `node --test "tools/learning-site/tests/*.test.mjs"`; exactly 66 tests and zero failures | `PASS` |
| Offline verifier | In the offline worktree root: `node tools/learning-site/verify.mjs --root C:\dsm-offline-learning-site --out C:\dsm-offline-learning-site\learning-site --batch batch-b --full --report C:\dsm-offline-learning-site\learning-site\verification-report.json`; report status `PASS` with 28 sources | `PASS` |
| Offline integrity | In the offline worktree: `git diff --check 43145b6...HEAD` and post-verifier `git status --short` is empty | `PASS` |
| Clean migration chain | Deploy and inspect the final chain against the named disposable PostgreSQL 17 empty database; `npx prisma migrate deploy` then `npx prisma migrate status` | `PASS` |
| Baseline upgrade | Deploy the four canonical migrations to the second named disposable PostgreSQL 17 database, then deploy the integration delta with the final tree; both `npx prisma migrate deploy` and final `npx prisma migrate status` | `PASS` when an integration migration exists; otherwise `NOT_APPLICABLE` |
| Lockfile roots | Parse both manifest/lockfile pairs and assert exact root dependency/devDependency agreement | `PASS` |
| SDD ignore contract | `git check-ignore -q .superpowers/sdd/2026-08-25-main-branch-integration-review/progress.md` after the tracked root `.gitignore` update | `PASS` before ledger creation |
| Git integrity | `git diff --check`, reviewed `git diff --stat origin/main...HEAD`, and `git status --short` containing no unexplained changes | `PASS` |

Missing credentials, external services, Docker, PostgreSQL, Android SDK components, or network policy are reported as `BLOCKED`, never bypassed or converted to `NOT_APPLICABLE`.

## Safety Boundaries

- Do not merge into or modify `main`.
- Do not push any branch, create a pull request, publish artifacts, deploy, or contact production services.
- Do not delete source branches during this task.
- Do not force-reset, force-checkout, recreate an existing branch, clean an existing worktree, or discard uncommitted changes.
- Do not check out the offline branch in `C:\DEV` or `C:\dsm-integration-review`. If `C:\dsm-offline-learning-site` or either local/remote offline branch ref already exists, stop; do not delete or reuse it to satisfy the design.
- Do not disable TLS verification or commit trusted-root certificates.
- Do not introduce secrets or modify user-wide Git/npm configuration.
- Local database mutation is allowed only inside the two disposable PostgreSQL 17 containers created and named by the implementation plan for the migration checks above; those containers and their task-specific volumes must not pre-exist.
- Stop for user approval before any future merge or push to GitHub.

## Deliverables

- Local branch `codex/integration-main-review` in `C:\dsm-integration-review`.
- Local branch `codex/offline-learning-site` in `C:\dsm-offline-learning-site`, based on `43145b6`, containing one reviewed offline-memory extraction commit and no product-integration commits.
- Root `.gitignore` containing the tracked portable rule `/.superpowers/sdd/` before execution artifacts are created.
- A reviewed series of subsystem-scoped integration commits.
- `docs/reviews/2026-08-25-main-integration-conflict-review.md` containing branch inventory, conflict decisions, test evidence, deferred items, and residual risks.
- `.superpowers/sdd/2026-08-25-main-branch-integration-review/progress.md` as the git-ignored execution ledger.
- A clean final review verdict or an explicit list of blocking findings.

## Completion Criteria

The integration review is complete when:

1. Every non-`main` branch is classified as included, selectively ported, superseded, or intentionally deferred with evidence.
2. `codex/offline-learning-site` contains the offline artifacts and only their related memory/playbook records, while the main integration branch contains neither.
3. Every overlapping product subsystem has a recorded canonical implementation and conflict ruling.
4. Every required row in the validation matrix is recorded `PASS`; no required row is `BLOCKED`, omitted, or nonzero.
5. `main` and all remote branches remain unchanged during local integration review.
6. The user receives both local branch names, commit summaries, validation evidence, remaining risks, and explicit next-step choices for future pushes, pull requests, or merges.
