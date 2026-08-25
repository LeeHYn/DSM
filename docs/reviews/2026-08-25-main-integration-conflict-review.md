# Main integration conflict review — 2026-08-25

## Purpose

Record reproducible branch topology, path-level overlap, checkpoint source classification, and integration rulings for the local-only `codex/integration-main-review` workflow. This report does not authorize push, PR, deployment, publication, changes to `main`, or access to an existing/shared database.

## Pinned refs

| Ref | Expected and observed SHA | Status |
|---|---|---|
| `origin/main` | `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81` | PASS |
| `origin/codex/front-secure-session-rest-client` | `2a4e9916765b505037e1c533735d84cd9f251ccf` | PASS |
| `origin/codex/m12b-front-prototype-checkpoint` | `396fc0a89327795646e89e128d7204b55b7fc00b` | PASS |
| `origin/codex/dsm-back-foundation-prisma` | `2a6ba73adfca52398cc2299d91c3f6dff7788af3` | PASS |
| `origin/codex/dsm-milestone-12a-notifications` | `362aabeb713c2f5c0b73f599216b8cf92ea1b97a` | PASS |
| `origin/codex/integration-main-review` | `6fa66eb5998c140bb6db995cc48c1a51f7a3089f` | PASS |

## Ancestry

- `git merge-base origin/main origin/codex/front-secure-session-rest-client` → `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`.
- `git merge-base origin/codex/front-secure-session-rest-client origin/codex/m12b-front-prototype-checkpoint` → shared checkpoint `960f02bc9f24c8a5d578c64fb7b734cdb8530506`.
- `git rev-list --left-right --count origin/main...origin/codex/front-secure-session-rest-client` → `0 100`.
- `git rev-list --left-right --count origin/codex/front-secure-session-rest-client...origin/codex/m12b-front-prototype-checkpoint` → `94 4`.
- `git log --left-right --cherry-pick` confirmed canonical/checkpoint `94 4`, canonical/foundation `101 4`, and canonical/M12A `100 1` unique commit counts.
- Foundation unique commits, in command order:
  1. `d977633887113f7b4ddc3c35137a984de00ee4c0 feat: add notification and realtime backend`
  2. `62772f603aa60d10ecf2b0e0a0c683bf8409c226 feat: stabilize DSM back milestone 13`
  3. `81495a3844058c63c79567ee414284866e1017a7 feat: establish DSM front integration foundation`
  4. `2a6ba73adfca52398cc2299d91c3f6dff7788af3 feat: close DSM back milestone 15`
- M12A unique commit: `362aabeb713c2f5c0b73f599216b8cf92ea1b97a feat(back): add notification foundation`.

## Overlap matrix

Counts are candidate changed paths followed by paths also changed on the canonical side after the applicable merge base.

| Candidate | Total changed → overlap | Frontend | Backend subsystems | Prisma / migrations | Dependency metadata | Docs / policy | Project memory |
|---|---:|---:|---|---:|---:|---:|---:|
| Foundation | 107 → 40 | 31 → 11 | app 1→1; auth 7→5; config 2→2; notifications 11→7; rankings 5→1; realtime 6→0; redis 3→0; scores 5→3; tasks 5→3; users 8→0 | 3 → 1 | 3 → 3 | 14 → 0 | 3 → 3 |
| M12A notification | 15 → 14 | 0 → 0 | app 1→1; notifications 7→7; tasks 2→2 | 0 → 0 | 0 → 0 | 2 → 1 | 3 → 3 |
| Checkpoint side | 94 → 4 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 16 → 0 plus 74 offline paths → 0 | 4 → 4 |

Path overlap alone does not prove behavioral equivalence. Foundation capability compatibility remains a later acceptance-gate decision.

## Checkpoint file classification

### `43145b6` — offline branch content (83 paths)

- `.ai/docs/2026-08-08-offline-learning-site-project-analysis.md` — offline branch content.
- `docs/superpowers/plans/2026-08-08-offline-learning-site-pilot-a.md` — offline branch content.
- `docs/superpowers/plans/2026-08-09-offline-learning-site-batch-b.md` — offline branch content.
- `docs/superpowers/specs/2026-08-08-offline-learning-site-design.md` — offline branch content.
- `docs/superpowers/specs/2026-08-09-offline-learning-site-batch-b-design.md` — offline branch content.
- `docs/superpowers/specs/assets/offline-learning-site/01-project-map.png` — offline branch content.
- `docs/superpowers/specs/assets/offline-learning-site/02-task-architecture.png` — offline branch content.
- `docs/superpowers/specs/assets/offline-learning-site/03-file-study-desktop.png` — offline branch content.
- `docs/superpowers/specs/assets/offline-learning-site/04-file-study-mobile.png` — offline branch content.
- `learning-site/architecture.html` — offline branch content.
- `learning-site/assets/site-data.js` — offline branch content.
- `learning-site/assets/site.css` — offline branch content.
- `learning-site/assets/site.js` — offline branch content.
- `learning-site/concepts/jwt-session.html` — offline branch content.
- `learning-site/concepts/serializable-transaction.html` — offline branch content.
- `learning-site/diagrams/auth-session-flow.html` — offline branch content.
- `learning-site/diagrams/task-update-flow.html` — offline branch content.
- `learning-site/exercises/auth-session.html` — offline branch content.
- `learning-site/exercises/task-flow.html` — offline branch content.
- `learning-site/features/refresh-rotation.html` — offline branch content.
- `learning-site/features/social-login.html` — offline branch content.
- `learning-site/features/task-score-schedule.html` — offline branch content.
- `learning-site/files/DSM_Back/prisma/schema.prisma.html` — offline branch content.
- `learning-site/files/DSM_Back/src/app.bootstrap.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/app.module.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/auth/auth.controller.spec.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/auth/auth.controller.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/auth/auth.module.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/auth/auth.service.spec.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/auth/auth.service.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/auth/dto/refresh-token.dto.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/auth/dto/social-login.dto.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/auth/dto/token-response.dto.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/auth/guards/jwt-auth.guard.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/auth/types/jwt-payload.type.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/auth/types/social-profile.type.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/main.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/notifications/notification-schedule.constants.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/notifications/notifications.service.spec.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/notifications/notifications.service.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/prisma/prisma.service.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/scores/scores.policy.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/scores/scores.service.spec.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/scores/scores.service.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/tasks/dto/create-task.dto.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/tasks/dto/update-task.dto.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/tasks/tasks.controller.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/tasks/tasks.service.spec.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/src/tasks/tasks.service.ts.html` — offline branch content.
- `learning-site/files/DSM_Back/test/app.e2e-spec.ts.html` — offline branch content.
- `learning-site/index.html` — offline branch content.
- `learning-site/qa-report.md` — offline branch content.
- `learning-site/verification-report.json` — offline branch content.
- `tools/learning-site/assets/site.css` — offline branch content.
- `tools/learning-site/assets/site.js` — offline branch content.
- `tools/learning-site/content/batch-b.mjs` — offline branch content.
- `tools/learning-site/content/pilot-a.mjs` — offline branch content.
- `tools/learning-site/generate.mjs` — offline branch content.
- `tools/learning-site/lib/pages.mjs` — offline branch content.
- `tools/learning-site/lib/paths.mjs` — offline branch content.
- `tools/learning-site/lib/render.mjs` — offline branch content.
- `tools/learning-site/lib/source.mjs` — offline branch content.
- `tools/learning-site/lib/symbols.mjs` — offline branch content.
- `tools/learning-site/lib/syntax.mjs` — offline branch content.
- `tools/learning-site/manifest.mjs` — offline branch content.
- `tools/learning-site/tests/batch-b-content.test.mjs` — offline branch content.
- `tools/learning-site/tests/batch-b-generate.test.mjs` — offline branch content.
- `tools/learning-site/tests/batch-b-pages.test.mjs` — offline branch content.
- `tools/learning-site/tests/batch-b-verify.test.mjs` — offline branch content.
- `tools/learning-site/tests/batches.test.mjs` — offline branch content.
- `tools/learning-site/tests/content.test.mjs` — offline branch content.
- `tools/learning-site/tests/generate.test.mjs` — offline branch content.
- `tools/learning-site/tests/manifest.test.mjs` — offline branch content.
- `tools/learning-site/tests/pages.test.mjs` — offline branch content.
- `tools/learning-site/tests/paths.test.mjs` — offline branch content.
- `tools/learning-site/tests/render.test.mjs` — offline branch content.
- `tools/learning-site/tests/runtime.test.mjs` — offline branch content.
- `tools/learning-site/tests/source.test.mjs` — offline branch content.
- `tools/learning-site/tests/style.test.mjs` — offline branch content.
- `tools/learning-site/tests/symbols.test.mjs` — offline branch content.
- `tools/learning-site/tests/syntax.test.mjs` — offline branch content.
- `tools/learning-site/tests/verify.test.mjs` — offline branch content.
- `tools/learning-site/verify.mjs` — offline branch content.

### `c79a042` — main-integration document candidate (7 paths)

- `.ai/docs/2026-07-15-current-project-architecture.md` — main-integration document candidate.
- `.ai/system_prompt.md` — main-integration document candidate.
- `EXTERNAL_PC_SETUP_AND_HANDOFF.md` — main-integration document candidate.
- `docs/superpowers/plans/2026-08-08-external-pc-setup-and-handoff.md` — main-integration document candidate.
- `docs/superpowers/plans/2026-08-15-ai-control-system-v5-1-integration.md` — main-integration document candidate.
- `docs/superpowers/specs/2026-08-08-external-pc-setup-and-handoff-design.md` — main-integration document candidate.
- `docs/superpowers/specs/2026-08-15-ai-control-system-v5-1-integration-design.md` — main-integration document candidate.

### `fb54b5d` — offline-memory extraction source (4 paths)

- `.ai/memory/checklist.md` — offline-memory extraction source.
- `.ai/memory/context.md` — offline-memory extraction source.
- `.ai/memory/error-resolution-playbook.md` — offline-memory extraction source.
- `.ai/memory/plan.md` — offline-memory extraction source.

### `396fc0a` — excluded publish bookkeeping (2 paths)

- `.ai/memory/checklist.md` — excluded publish bookkeeping.
- `.ai/memory/plan.md` — excluded publish bookkeeping.

## Initial rulings

- Ruling: `2a4e991` is the canonical whole-tree `PORT` baseline — it is the user-approved complete product lineage — cost if wrong: the integration preserves the wrong product history and every later compatibility decision is invalid.
- Ruling: Foundation is `DEFER` as a selective candidate source — path overlap cannot establish capability equivalence, and only named acceptance-gated deltas may proceed — cost if wrong: a needed capability may remain absent, while a premature port could duplicate state machines or regress contracts.
- Ruling: M12A notification product code is `SUPERSEDED` — canonical notification and task synchronization contracts already occupy 14 of its 15 changed paths — cost if wrong: a genuinely unique capability could be missed and would require a reviewed plan amendment.
- Ruling: The checkpoint branch is `SUPERSEDED` as a whole-branch merge input — its four unique commits mix offline content, document candidates, extraction-only memory, and publish bookkeeping — cost if wrong: product integration would absorb excluded offline artifacts and stale memory.
- Ruling: `43145b6` is `PORT` only as the isolated offline branch baseline and excluded from main integration — cost if wrong: the product branch gains 83 offline-only paths or the requested offline branch loses its source-faithful baseline.
- Ruling: The seven `c79a042` candidates are `DEFER` to Tasks 7 and 10 — their facts must be reconciled against the post-merge product tree — cost if wrong: stale setup or architecture guidance could be published as current.
- Ruling: `fb54b5d` is `DEFER` to exact section-scoped offline extraction — cost if wrong: unrelated product, publish, Obsidian, or AI-control memory contaminates the offline branch.
- Ruling: `396fc0a` is `SUPERSEDED` and excluded — its observed delta is publish-closure bookkeeping only — cost if wrong: content with no offline or product delta is falsely treated as source material.

### Preflight rulings mirrored from the SDD ledger

- Ruling: defer the SDD workspace resolver until after the tracked root ignore commit — the binding spec forbids creating the workspace before the portable ignore contract, while the skill asks to resolve it at skill start — cost if wrong: SDD setup begins one controller task later, but no tracked or leaked artifact is introduced.
- Ruling: controller-owned ignored ledger updates are globally required even when a task's `Files` block omits the ledger — the plan Global Constraints and SDD recovery contract require every task record — cost if wrong: the controller writes one ignored bookkeeping file outside some task-local file lists, but no tracked/product scope expands.
- Ruling: split Task 4 conflict resolution into `.ai/memory/plan.md` + `.ai/memory/context.md`, then `.ai/memory/checklist.md` + `.gitignore`, before one merge commit — this satisfies the global one-or-two-file modification cap without changing the mandated product tree — cost if wrong: a conflict file could be resolved outside the reviewed action boundary.
- Ruling: resolve root `.gitignore` from the canonical `2a4e991` baseline and add exactly one `/.superpowers/sdd/` rule — cost if wrong: canonical ignore policy or the portable SDD workspace exclusion could be lost.
- Ruling: plan-specific repository roles override the generic SDD assumption that every implementer edits and commits — investigators/reviewers stay read-only, product/document writers use exact role allowlists, and the main controller alone commits and owns Git, the ledger, active memory, and conflict report — cost if wrong: controller-owned artifacts receive task review after controller commits rather than being authored by a generic implementer.
- Ruling: Task 14's independent whole-branch review is the SDD final mutation review; Task 15 is read-only handoff and cannot add review surface — cost if wrong: no second redundant whole-branch review runs after a task that changes no files.

## Task 4 precheck blocker

The canonical merge was not started. A read-only three-way `git merge-tree` precheck used merge base `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81` and detected conflict markers in four paths:

1. `.ai/memory/checklist.md`
2. `.ai/memory/context.md`
3. `.ai/memory/plan.md`
4. `.gitignore`

The original plan permitted exactly the three active memory conflicts and required `BLOCKED` rather than an improvised resolution when another path appeared. Root `.gitignore` changed locally in required Task 2 commit `d4f2474` and also changed on the canonical branch, producing the fourth conflict.

- Ruling: do not start Task 4's real merge until a reviewed plan amendment explicitly handles the predicted `.gitignore` conflict — Task 2's required SDD rule and the canonical branch both modify root `.gitignore`, while Task 4 authorizes only three memory resolutions — cost if wrong: proceeding could silently discard either canonical ignore rules or the portable SDD ignore contract and would violate the explicit stop condition.

The user approved that amendment on `2026-08-26`. Approval closure `e9e265a`, reviewed plan amendment `aaef828`, and memory closure `fa2fc88` authorized exactly four conflict paths. The amended `git merge-tree` precheck returned `4/4` with difference `0`.

Task 4 then created merge commit `a639ac2508a01bab83af3a4d233755bbbbcad3b8` with first parent `5079b0e96232448342a464819c406c7746d4c0b2` and exact canonical second parent `2a4e9916765b505037e1c533735d84cd9f251ccf`. Actual conflicts matched the four-path allowlist. The resolved product tree is byte-identical to canonical under `DSM_Back` and `DSM_Front`; tracked offline intersection is zero; canonical `.gitignore` content/order is preserved with exactly one portable SDD rule.

Independent reviewer `/root/task4_reviewer` used exact writable allowlist `none`, found no findings, and approved Task 4. The reviewer confirmed combined merge diff contains only the four approved resolution paths, canonical ancestry and subtree hashes match, conflict markers are absent, `main` refs are unchanged, and the start/end worktree is clean. Product behavior suites remain Task 5 and are not claimed by this verdict.

## Validation matrix

| Gate | Evidence | Status |
|---|---|---|
| Task 0 environment | Node `v24.19.0`, npm `11.19.0`, Docker client/server `29.6.1`, Java `21.0.12.1`, Android SDK env and required packages | PASS |
| Task 1 immutable refs | Six exact refs, linked clean integration worktree, approved spec blob `5a4dff47179c816963d5d2513e383f7e583b072a` | PASS |
| Task 2 SDD ignore | Standalone commit `d4f2474`; root rule matches ledger path | PASS |
| Task 3 topology | Exact merge bases, counts, unique commit lists, path classifications | PASS |
| Task 4 canonical merge | Merge `a639ac2`, exact canonical second parent, conflicts `4/4`, canonical-identical product tree, offline intersection `0`, independent review with no findings | PASS |
| Task 5 canonical baseline | Initial Prisma `P1012` stopped safely; approved amendment `68557d7`; retry backend 23 suites/214 tests and frontend 18 suites/162 tests, typecheck/lint, Android 365-task build all exit `0`; product canonical-identical | PASS |
| Canonical product suite | Runs after the canonical merge | PENDING |
| Offline branch suite | Runs after isolated branch creation | PENDING |
| Migration validation | Runs only in named disposable PostgreSQL 17 containers | PENDING |
| Final independent review | Task 14 | PENDING |

## Task 5 baseline blocker and amended retry

The first backend command installed the canonical lockfile successfully (`npm ci --no-audit --no-fund`, 882 packages, exit `0`). The next exact command failed before any DB connection: `npm run prisma:validate` returned Prisma `P1012` because `DATABASE_URL` is absent in a clean worktree. No tracked file changed.

The required-check stop condition prevented Prisma generate, backend build/test/lint, and all frontend/Android commands. No existing/shared/remote database or secret file was accessed. The error-resolution playbook has no exact matching record.

- Ruling: stop Task 5 after the first required command failure and do not inject an unplanned database URL — the approved plan says required failures are `BLOCKED` and existing/shared/remote DB access is forbidden — cost if wrong: an improvised environment could conceal a non-reproducible baseline or accidentally target an existing database.
- The user approved the reviewed amendment on `2026-08-26`. Approval closure `9e6ba3b`, plan amendment `68557d7`, and memory closure `995bdcf` set `DATABASE_URL=postgresql://dsm_validation:dsm_validation@127.0.0.1:1/dsm_validation?schema=public` only for `prisma:validate` and `prisma:generate`, remove it on failure or immediately after generate, and forbid DB connection commands. Loopback port `1` makes any unexpected connection fail closed.

The full Task 5 retry then passed:

- Backend: `npm ci` 882 packages; Prisma validate and generate exit `0`; process URL removed (`False`); build exit `0`; 23 suites/214 tests; non-fixing ESLint exit `0`.
- Frontend: `npm ci` 988 packages; 18 suites/162 tests; typecheck exit `0`; lint exit `0` with 0 errors/18 warnings.
- Android: `assembleDebug --no-daemon` exit `0`; `BUILD SUCCESSFUL in 17m 38s`; 365 actionable tasks; ignored APK 143,247,539 bytes.
- Post-check: tracked dirty count `0`, `git diff --check` exit `0`, canonical product diff exit `0`, `DATABASE_URL` absent, and `main`/`origin/main` unchanged at `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`.

Initial independent review found one P2 documentation finding: this retry evidence had not yet been copied from the ignored Task 5 report into tracked SSOT. This section and active memory are the scoped fix; no product command needs rerun. Re-review is pending at this record.

## Deferred items

- Whether each Foundation-only Redis, realtime, user, ranking, score-finalization, notification-mode, or active-schedule-index capability is truly absent and compatible is deferred to Task 8.
- Intended database migration history is unavailable; migration-affecting acceptance remains gated and may be deferred.
- The seven `c79a042` candidates remain unselected until current-tree reconciliation.

## Residual risks

- Path-level overlap can undercount semantic overlap through renamed or independently reimplemented behavior.
- The exact Node runtime is user-scoped; every validation shell must prepend `NODEJS_HOME` because system-wide Node remains `v24.13.0` after UAC cancellation.
- Existing container `dsm-back-dev-db-1` is out of scope and must not be stopped, removed, reused, or connected to.
- No product, offline, Android, or database validation has run at this inventory stage.

## Review verdict

`PASS` for Task 3 inventory completeness: pinned refs, ancestry, subsystem overlap, and every checkpoint-side path have a reproducible classification. Product compatibility and final integration correctness remain explicitly pending their later task gates.
