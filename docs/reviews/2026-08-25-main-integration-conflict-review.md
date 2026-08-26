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
| Offline branch suite | `codex/offline-learning-site` at `2cbb088`; one commit beyond `43145b6`; 4-path memory allowlist; Node 66/66; full verifier `PASS`, 28 sources; independent review clean | PASS |
| Task 7 AI-control policy/history | Exact `c79a042` design `d652711`, plan `3b81151`, system prompt `3fdd556`; commits `1bacf47` and `1d36d70`; product diff 0; independent review clean | PASS |
| Task 8 selective foundation classification | Four commits and ten rows covering eleven capabilities classified with evidence/cost; only the partial active-schedule index conditionally `PORT` to Task 9 | PASS |
| Task 9 active-schedule invariant | Commit `56c0575`; exact forward migration + contract test; targeted Jest 1/1, Prisma validate/generate, URL removal and build exit `0`; independent review clean | PASS |
| Migration validation | Runs only in named disposable PostgreSQL 17 containers | PENDING |
| Final independent review | Task 14 | PENDING |

## Task 5 baseline blocker and amended retry

The first backend command installed the canonical lockfile successfully (`npm ci --no-audit --no-fund`, 882 packages, exit `0`). The next exact command failed before any DB connection: `npm run prisma:validate` returned Prisma `P1012` because `DATABASE_URL` is absent in a clean worktree. No tracked file changed.

The required-check stop condition prevented Prisma generate, backend build/test/lint, and all frontend/Android commands. No existing/shared/remote database or secret file was accessed. The error-resolution playbook has no exact matching record.

- Ruling: stop Task 5 after the first required command failure and do not inject an unplanned database URL — the approved plan says required failures are `BLOCKED` and existing/shared/remote DB access is forbidden — cost if wrong: an improvised environment could conceal a non-reproducible baseline or accidentally target an existing database.
- The user approved the reviewed amendment on `2026-08-26`. Approval closure `9e6ba3b`, plan amendment `68557d7`, and memory closure `995bdcf` set `DATABASE_URL=postgresql://dsm_validation:dsm_validation@127.0.0.1:1/dsm_validation?schema=public` only for `prisma:validate` and `prisma:generate`, remove it on failure or immediately after generate, and forbid DB connection commands. Loopback port `1` makes any unexpected connection fail closed.

The full Task 5 retry then passed:

- Backend `npm ci --no-audit --no-fund`: exit `0`, 882 packages.
- Backend `npm run prisma:validate`: exit `0`; canonical schema valid.
- Backend `npm run prisma:generate`: exit `0`; Prisma Client v6.19.3 generated under ignored `node_modules`; subsequent `Test-Path Env:DATABASE_URL` was `False`.
- Backend `npm run build`: exit `0`.
- Backend `npm test -- --runInBand --no-cache`: exit `0`; 23 suites, 214 tests, 0 snapshots.
- Backend `npx eslint "{src,apps,libs,test}/**/*.ts"`: exit `0`.
- Frontend `npm ci --no-audit --no-fund`: exit `0`, 988 packages.
- Frontend `npm test -- --no-cache`: exit `0`; 18 suites, 162 tests, 0 snapshots.
- Frontend `npm run typecheck`: exit `0`.
- Frontend `npm run lint`: exit `0`; 0 errors, 18 warnings.
- Android `.\gradlew.bat assembleDebug --no-daemon`: exit `0`; `BUILD SUCCESSFUL in 17m 38s`; 365 actionable tasks; ignored APK 143,247,539 bytes.
- Post-check `git status --short`: empty output, exit `0` (tracked dirty count `0`).
- Post-check `git diff --quiet 2a4e9916765b505037e1c533735d84cd9f251ccf -- DSM_Back DSM_Front`: exit `0` (canonical product equality).
- Post-check `git diff --check`: exit `0`; `DATABASE_URL` absent; `main` and `origin/main` unchanged at `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`.

Initial independent review found one P2 documentation finding: retry evidence had not yet been copied from the ignored Task 5 report into tracked SSOT. Fix round 1 added the result but its command rows were too abbreviated and left one stale residual-risk sentence. Fix round 2 expanded product commands and corrected the residual-risk boundary but abbreviated two post-check commands. Fix round 3 added the two exact post-check rows. Scoped re-review marked the original P2 `ADDRESSED`, found no new breakage, and returned `APPROVED`; no product command was rerun.

## Task 6 isolated offline branch

Created linked worktree `C:\dsm-offline-learning-site` on local branch `codex/offline-learning-site` from exact base `43145b6e0407c3c539ca66deb1813ddbc2e97ec8`. The base commit remains the offline product/site snapshot and was not merged into the integration branch.

Only the approved memory source `fb54b5d07d9b03d42ae70890a954454027002b0d` was used. The extracted units were the two approved plan ranges, the offline context range, the offline checklist range, and playbook index/full records `ER-20260809-001` through `003`. Source comparison was exact; literal leading patch markers were `0`; `396fc0a` contributed no content.

Commit `2cbb088326044b9c44115741a761778f725da153` (`docs(memory): preserve offline learning records`) is exactly one commit beyond the base (`git rev-list --left-right --count ...` = `0 1`) and changes only:

- `.ai/memory/checklist.md`
- `.ai/memory/context.md`
- `.ai/memory/error-resolution-playbook.md`
- `.ai/memory/plan.md`

The first Node run exposed an environment-only baseline gap: clean Git worktrees omit ignored `DSM_Front/expo-env.d.ts`, so the corpus was `123 files / 13,165 lines` instead of `124 / 13,168`. Restoring the exact three-line Expo-generated ignored declaration returned the focused baseline tests to green. The global Windows `core.autocrlf=true` setting also materialized source and source-page HTML as CRLF while the committed verifier metadata is LF; the exact 28 source blobs and paired HTML blobs were re-materialized as LF. Neither preparation changed branch content, staged files, or the four-path commit allowlist.

Fresh final evidence:

- `node --test "tools/learning-site/tests/*.test.mjs"`: exit `0`; tests `66`, pass `66`, fail `0`.
- `node tools/learning-site/verify.mjs --root C:\dsm-offline-learning-site --out C:\dsm-offline-learning-site\learning-site --batch batch-b --full --report C:\dsm-offline-learning-site\learning-site\verification-report.json`: exit `0`; status `PASS`, sources `28`.
- `git diff --check 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD`: exit `0`.
- `git status --short`: empty; staged and working diffs empty.
- `main` and `origin/main`: unchanged at `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`; integration branch remained `3daa28441fcf610b1ff89fb8eea8dac870e45881` during the offline review.

Independent reviewer `/root/task6_reviewer`, mode `discovery-review`, exact writable allowlist `none`, verified all extraction units, refs, ancestry, four-path allowlist, ignored environment file, report and clean status. Findings: none. Verdict: `APPROVED`.

## Task 7 compatible AI-control policy/history port

The two reviewed history documents were preserved from `c79a042b3c1e115fc0b092a8bddcd3e6723439d6` in a focused two-file commit:

- `1bacf47f130568081a79124f7e79c404b41e0af2` — `docs: preserve AI control integration records`
- design blob `d6527119396b044f9b0d414159cfadad4a29b1ac`
- plan blob `3b81151f6fb489e54f33ee1f440b1ddba01f32a4`

The compatible v5.1 controller guidance was then ported alone:

- `1d36d7023c8e62365711c8c298f5c200e6eee3b0` — `docs: port compatible agent guidance`
- `.ai/system_prompt.md` blob `3fdd55608c475b352ac90dff57d22f3438a03f14`, exact to `c79a042`

The prompt retains the compression backup boundaries, all seven subagent assignment fields, Context Compiler protocol, adversarial verification workflow, `ACCEPTED_RISK`, one-to-two-file limit, explicit approval wait gate, and five CCTV fields. References to `.ai/memory/memory.md` and `.ai/archive/` explicitly forbid their automatic creation; neither path exists in the Git tree or worktree.

Task 7 changed exactly the two history documents and one system prompt. `DSM_Back` and `DSM_Front` changed paths were `0`; `git diff --check` passed; the worktree was clean; `main` and `origin/main` remained `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`.

Independent reviewer `/root/task7_reviewer`, mode `discovery-review`, exact writable allowlist `none`, verified all six contract groups and returned findings none, verdict `APPROVED`.

## Task 8 selective foundation capability rulings

Read-only investigator `/root/task8_investigator` compared commits `d977633`, `62772f6`, `81495a3`, and `2a6ba73` against the canonical-identical current product tree. The comparison covered public interfaces, Prisma schema/migrations, errors, authentication/ownership, transaction and concurrency behavior, tests, dependencies, operational burden, and security assumptions. No file, test, DB, Docker, network, or Git state was changed.

| Capability | Current evidence and acceptance gate | Ruling and cost if wrong |
|---|---|---|
| Legacy notification API/provider/scheduler | Foundation uses `POST`, returns raw `FcmToken`, can reassign another user's token, sends task title/id, and runs a separate scheduler state machine (`d977633:DSM_Back/src/notifications/**`). Current uses `PUT`, 409 ownership protection, selected response fields, ADC/default-disabled provider, account-neutral data payload, per-device delivery, lease/heartbeat/retry/`UNKNOWN`, and Task/schedule/score in one Serializable transaction (`DSM_Back/src/notifications/**`, `DSM_Back/src/tasks/tasks.service.ts`). Fails absence, API/security/transaction compatibility, and no-duplicate-state-machine gates. | `SUPERSEDED`, excluding the separately classified partial index. Wrong supersede could hide the unique invariant; wrong port reintroduces token takeover/raw-token exposure/content-bearing FCM and a duplicate dispatcher. |
| Partial active-schedule unique invariant | Current schema has only `(scheduledAt,status)` and `(userId,scheduledAt)` indexes and all four current migrations lack an equivalent partial unique index. Foundation `62772f6` migration dedupes then indexes `taskId` where status is `PENDING`/`PROCESSING`; current nonterminal statuses match. API/provider/dependency changes are unnecessary and Task 9 supplies an exact two-file forward sequence. | Conditional `PORT`; Task 9 trigger is true, subject to migration-history and disposable PostgreSQL gates. Wrong defer permits duplicate active schedules; unsafe port may cancel existing duplicates or fail on unknown migration history. |
| Redis ranking cache and Socket.IO adapter | Current manifests/modules have no Redis, `@socket.io/redis-adapter`, or WebSocket dependencies. Foundation supplies cache timeouts, fail-open behavior, pub/sub clients and tests (`62772f6:DSM_Back/src/redis/**`, rankings cache/gateway specs), but adds a new operational service and no approved current contract or Task 8 implementation sequence exists. | `DEFER`. Wrong defer delays scale-out/live caching; wrong port adds Redis availability, invalidation and adapter operations to the approved scope. |
| Realtime ranking/notification events | Foundation defines access-JWT socket handshake, rooms, subscription events, score/ranking/leaderboard broadcasts and `notification.due` (`d977633:DSM_Back/src/realtime/**` and ranking gateway). Current backend/frontend contain no realtime protocol or client. | `DEFER`. Wrong defer omits live updates; wrong port fixes an unapproved socket API, CORS/auth handshake and optional Redis topology. |
| General users/profile/settings APIs | Foundation adds `/users/*` and broad Prisma `User` returns with lightly constrained profile DTOs (`d977633:DSM_Back/src/users/**`); its front client assumes those shapes. Current has no users module and `/auth/me` selects only `userId` and `onboardingCompletedAt`. Fails security/API compatibility and exact-sequence gates. | `DEFER`. Wrong defer delays profile/settings/social-account management; wrong port opens broad row exposure and an unapproved mutation surface. |
| `NotificationMode` | Foundation adds an enum/column, settings API, scheduler coupling and content-bearing notification payload; its migration also mixes the separate ranking-snapshot unique invariant classified in the daily-finalization row (`2a6ba73:DSM_Back/prisma/**`, notifications/users files). Current has no enum or public contract and uses account-neutral payloads. | `DEFER`. Wrong defer omits sound/vibrate/silent preference; wrong port imports a stale mixed migration/API and legacy payload contract. |
| Legacy refresh reuse/account deletion | Foundation revokes all active refresh tokens after revoked-token reuse and deletes the user after validating one token (`2a6ba73:DSM_Back/src/auth/auth.service.ts`, users files). Current preserves `sessionId` families and serializes rotation/logout under a user-row lock; account deletion is absent. | Foundation implementation `SUPERSEDED`; future capabilities remain unimplemented. Wrong supersede can leave deletion/reuse detection forgotten; wrong port breaks session-family isolation and concurrency. |
| Daily finalization/automatic snapshots and snapshot uniqueness | Foundation runs UTC 00:05 recompute/snapshot and adds `RankingSnapshot_userId_period_snapshotAt_key` on `(userId, period, snapshotAt)` (`2a6ba73:DSM_Back/prisma/migrations/20260621000000_milestone_15_backend_closure/migration.sql`). Current has only actor-triggered snapshot, a non-unique index on the same columns, and score code that still counts any `COMPLETED` Task; approved F-006 requires same-day non-null `completedAt`. The automatic flow and unique invariant are both absent, coupled in foundation behavior, and have no safe exact integration sequence here. | Both `DEFER`. Wrong defer leaves finalization manual and permits duplicate snapshots for the same user/period/timestamp; wrong port automatically persists an incorrect score/ranking projection, cron side effect, and an unplanned migration cleanup. This does not open another Task 9 trigger. |
| UTC-day active Task cap of 20 | Foundation `62772f6` implements the cap but performs notification/score work outside its Task transaction, uses a different retry count/error, and lacks the full F-006 `completedAt` contract. The capability is required by approved F-006 but was not listed in the original Task 8 table. | `DEFER` to F-006, not `SUPERSEDED`. Wrong defer that forgets F-006 leaves its P1; direct Task 8 port violates atomicity, retry, stable-error and score-integrity rules. Direct implementation here would require a reviewed plan amendment. |
| Foundation Expo frontend | Foundation uses Expo Router/SDK 55, SecureStore plus Web localStorage for access+refresh pairs, unchecked JSON casts, Socket.IO and obsolete notification API (`81495a3:DSM_Front/**`). Current is Android-only RN CLI 0.83.10, memory-only access token, Keychain refresh token, runtime validation, sanitized errors, epoch fences and guarded single-flight replay. | `SUPERSEDED`. Wrong supersede may miss reusable screen ideas; wrong port restores persisted access tokens, Web/Expo runtime and duplicate obsolete session/notification protocols. |

No contrary current contract requires automatically porting a `DEFER` row. Redis/realtime and midnight cron remain backlog ideas, not approved public/operational contracts. The extra 20-Task capability is preserved as a separate F-006 obligation. The absent ranking-snapshot unique invariant is explicitly deferred with automatic finalization because no reviewed migration/behavior sequence exists. The only accepted Task 8 product delta is the absent partial active-schedule invariant, and it must proceed solely through Task 9.

## Task 9 active-schedule invariant

The exact index was absent and the canonical pre-deployment history contained only `20260716_init`, `20260720_notification_delivery_outcome_policy`, `20260725_user_onboarding_completed_at`, and `20260810_refresh_token_session_family`. Task 9 therefore added only `DSM_Back/prisma/migrations/20260825_integration_backend_deltas/migration.sql` and `DSM_Back/src/notifications/notification-migration.contract.spec.ts`.

The first targeted Jest run passed (`1` suite, `1` test), then exact `npm run prisma:validate` stopped with Prisma `P1012` because clean Task 9 had no `DATABASE_URL`. Generate, build, Git commit, Docker and every DB command remained unrun. The user explicitly approved `Task 9 amendment 승인`; plan commit `0e19c5f` applies the same process-scoped parse-only loopback-port-`1` URL contract as Task 5, removes it on validate failure or immediately after generate, and forbids every DB-connecting Prisma command.

The amended retry used Node `v24.19.0` and npm `11.19.0`:

- `npm test -- --runInBand --no-cache notification-migration.contract.spec.ts`: exit `0`, `1` suite / `1` test.
- `npm run prisma:validate`: exit `0`.
- `npm run prisma:generate`: exit `0`, Prisma Client v6.19.3; `DATABASE_URL_PRESENT_AFTER_GENERATE=False`.
- `npm run build`: exit `0`.
- `git diff --name-only 2a4e9916765b505037e1c533735d84cd9f251ccf -- DSM_Back/prisma/migrations`: only `DSM_Back/prisma/migrations/20260825_integration_backend_deltas/migration.sql` after exact staging.
- `git diff --cached --check`: exit `0`; staged paths were the migration and contract test only.

Commit `56c0575` (`feat(back): enforce one active notification schedule`) deterministically keeps the newest active schedule by `createdAt DESC, id DESC`, cancels older active rows with the exact failure reason, and creates the exact loud-failing partial unique index without `IF NOT EXISTS`. Independent discovery review found no findings and returned `APPROVED`; schema, provider/API, dependencies and all four canonical migrations remained unchanged. No `.env`, Docker, credential, existing/shared/remote database or DB connection command was used. Actual PostgreSQL application and canonical-prefix upgrade behavior remain exclusively in Task 11's disposable containers.

## Deferred items

- Task 8 classified every Foundation capability. Redis/cache, realtime, users APIs, `NotificationMode`, daily finalization and the UTC-day 20-Task implementation are deferred; legacy notification/Expo/refresh-account implementations are superseded; only the active-schedule partial index advances conditionally to Task 9.
- An intended existing database history remains unavailable; Task 9 used the explicit four-name pre-deployment baseline, while actual application and upgrade acceptance remain gated to Task 11 disposable databases.
- The seven `c79a042` candidates remain unselected until current-tree reconciliation.

## Residual risks

- Path-level overlap can undercount semantic overlap through renamed or independently reimplemented behavior.
- The exact Node runtime is user-scoped; every validation shell must prepend `NODEJS_HOME` because system-wide Node remains `v24.13.0` after UAC cancellation.
- Existing container `dsm-back-dev-db-1` is out of scope and must not be stopped, removed, reused, or connected to.
- Task 5 canonical product/Android baseline, Task 6 offline validation, Task 7 policy/history port, Task 8 selective classification and Task 9's two-file invariant port are complete. Task 11 disposable migration application and the final full validation matrix remain pending their later task gates.
- Reproducing the offline verifier in a new Windows worktree requires the ignored three-line Expo declaration and LF materialization for the 28 source/page pairs because the global Git checkout policy is `core.autocrlf=true`; these are environment prerequisites, not branch deltas.

## Review verdict

`PASS` for Task 3 inventory completeness: pinned refs, ancestry, subsystem overlap, and every checkpoint-side path have a reproducible classification. Product compatibility and final integration correctness remain explicitly pending their later task gates.
