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

## Task 14 pre-review validation status

The Task 14 pre-report review base/snapshot was `f6cd9840b30aee6e3622519670757a4e085860d6`; at that snapshot it was `174` commits ahead of `origin/main` and retained canonical `2a4e9916765b505037e1c533735d84cd9f251ccf` as an ancestor. This is not a claim about the final integration HEAD: Task 15 owns the final branch-summary record after Task 14 review/closure. The initial Task 12 lint failure below is preserved as history, but its current `BLOCKED` conclusion is superseded by the approved one-file formatting correction (`69d3154484146c69999f5bc8e0d6c1fba313fa2d`) and the completed full-matrix restart. No required *product-validation* row remains blocked.

### Exact merge ancestry and commit summary

- Merge base: `git merge-base 2e25d9811db39a69a5ee6fa2f16d386d6bd18d81 2a4e9916765b505037e1c533735d84cd9f251ccf` returned `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81` (exit `0`).
- Canonical merge: `a639ac2508a01bab83af3a4d233755bbbbcad3b8` has parents `5079b0e96232448342a464819c406c7746d4c0b2` and exact canonical `2a4e9916765b505037e1c533735d84cd9f251ccf`; all actual conflicts were the approved four paths.
- Pre-report snapshot ancestry: `git rev-list --left-right --count origin/main...f6cd9840b30aee6e3622519670757a4e085860d6` returned `0 174` (exit `0`), and `git merge-base --is-ancestor 2a4e9916765b505037e1c533735d84cd9f251ccf f6cd9840b30aee6e3622519670757a4e085860d6` returned exit `0`.
- Post-merge delivery summary through the Task 14 security amendment: Task 5 baseline/review closures; Task 6 offline validation; Task 7 compatible AI-control history (`1bacf47`, `1d36d70`); Task 8 classification (`3a6397f`, `c070880`); Task 9 forward invariant (`56c0575`); Task 10 reconciled handoff and fail-fast correction (`28b440c`, `af97e63`, `04f5980`); Task 11 migration retry/evidence (`332e3ad`, `f30dcd2`); Task 12 amendment/style correction (`046d67f`, `0ecbf2d`, `69d3154`); Task 13 memory closure/fix (`80ab65b`, `e54e3f1`, `f6cd984`); and the approved Task 14 plan/config commits (`2815f6d`, `4533c0c`).

### Complete spec validation matrix

| Area | Exact command or check | Evidence/result | Status |
|---|---|---|---|
| Runtime | `node --version`; `npm --version` | `v24.19.0`; `11.19.0`; both exit `0` | PASS |
| Backend install | In `DSM_Back`: `npm ci --no-audit --no-fund` | exit `0`; `882` packages | PASS |
| Backend schema | In `DSM_Back`: `npm run prisma:validate`; `npm run prisma:generate` | both exit `0`; generated Prisma Client `v6.19.3`; process-scoped loopback-port-`1` URL removed immediately after generate | PASS |
| Backend build | In `DSM_Back`: `npm run build` | exit `0` | PASS |
| Backend tests | In `DSM_Back`: `npm test -- --runInBand --no-cache` | exit `0`; `24/24` suites, `215/215` tests, `0` snapshots | PASS |
| Backend lint | In `DSM_Back`: `npx eslint "{src,apps,libs,test}/**/*.ts"` (no `--fix`) | exit `0` | PASS |
| Frontend install | In `DSM_Front`: `npm ci --no-audit --no-fund` | exit `0`; `988` packages | PASS |
| Frontend tests | In `DSM_Front`: `npm test -- --no-cache` | exit `0`; `18/18` suites, `162/162` tests, `0` snapshots | PASS |
| Frontend types | In `DSM_Front`: `npm run typecheck` | exit `0` | PASS |
| Frontend lint | In `DSM_Front`: `npm run lint` | exit `0`; `0` errors, `18` warnings | PASS |
| Android debug build | In `DSM_Front/android`: `.\gradlew.bat assembleDebug --no-daemon` | exit `0`; `BUILD SUCCESSFUL`; `365` actionable tasks | PASS |
| Offline worktree | In `C:\dsm-offline-learning-site`: `git branch --show-current`; `git rev-parse HEAD`; `git rev-parse --show-superproject-working-tree`; `git rev-parse --git-dir`; `git rev-parse --git-common-dir`; `git status --short` | all checks exit `0`; branch `codex/offline-learning-site`; HEAD `2cbb088326044b9c44115741a761778f725da153`; superproject output empty; Git dir distinct from common Git dir; status empty | PASS |
| Offline ancestry | In offline worktree: `git rev-list --left-right --count 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD`; `git log --format=%H 43145b6e0407c3c539ca66deb1813ddbc2e97ec8..HEAD` | exit `0`; `0 1`; only `2cbb088326044b9c44115741a761778f725da153` | PASS |
| Offline path allowlist | In offline worktree: `git diff --name-only 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD` | exactly `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md`, `.ai/memory/error-resolution-playbook.md` | PASS |
| Offline memory provenance | In offline worktree: `git show fb54b5d07d9b03d42ae70890a954454027002b0d:.ai/memory/plan.md`; `git show fb54b5d07d9b03d42ae70890a954454027002b0d:.ai/memory/context.md`; `git show fb54b5d07d9b03d42ae70890a954454027002b0d:.ai/memory/checklist.md`; `git show fb54b5d07d9b03d42ae70890a954454027002b0d:.ai/memory/error-resolution-playbook.md`; `git diff --name-only 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD`; `git diff --check 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD`; `git diff 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD -- .ai/memory/plan.md .ai/memory/context.md .ai/memory/checklist.md .ai/memory/error-resolution-playbook.md`; `git status --short` | each command exit `0`; base-range name list exactly the four memory paths; status empty; source/delta comparison found forbidden added-category count `0`, required Plan/Pilot/Batch headings, and all three `ER-20260809-001`/`002`/`003` index rows/full records | PASS |
| Offline tests | In offline root: `node --test "tools/learning-site/tests/*.test.mjs"` | exit `0`; `66/66` tests, `0` failures | PASS |
| Offline verifier | In offline root: `node tools/learning-site/verify.mjs --root C:\dsm-offline-learning-site --out C:\dsm-offline-learning-site\learning-site --batch batch-b --full --report C:\dsm-offline-learning-site\learning-site\verification-report.json` | exit `0`; report `PASS`; `28` sources | PASS |
| Offline integrity | In offline worktree: `git diff --check 43145b6e0407c3c539ca66deb1813ddbc2e97ec8...HEAD`; post-verifier `git status --short` | both exit `0`; empty status | PASS |
| Clean migration chain | Named `postgres:17-alpine` empty disposable DB: final-tree `npx prisma migrate deploy`; `npx prisma migrate status` | both exit `0`; exactly `5` migrations applied/status checked | PASS |
| Baseline upgrade | From integration root: `Test-Path -LiteralPath '.superpowers/sdd/2026-08-25-main-branch-integration-review/canonical-prisma-r2.zip'`; `Test-Path -LiteralPath '.superpowers/sdd/2026-08-25-main-branch-integration-review/canonical-prisma-r2'`; `git archive --format=zip --output=.superpowers/sdd/2026-08-25-main-branch-integration-review/canonical-prisma-r2.zip 2a4e9916765b505037e1c533735d84cd9f251ccf DSM_Back/prisma`; `Expand-Archive -LiteralPath '.superpowers/sdd/2026-08-25-main-branch-integration-review/canonical-prisma-r2.zip' -DestinationPath '.superpowers/sdd/2026-08-25-main-branch-integration-review/canonical-prisma-r2'`; `$upgradeContainerId = docker run --rm -d --name dsm-integration-migrate-upgrade -e POSTGRES_USER=dsm_integration -e POSTGRES_PASSWORD=dsm_integration_password -e POSTGRES_DB=dsm_integration -p 127.0.0.1:55433:5432 postgres:17-alpine`; `$upgradeReady = $false`; `foreach ($attempt in 1..30) { docker exec $upgradeContainerId pg_isready -U dsm_integration -d dsm_integration; if ($LASTEXITCODE -eq 0) { $upgradeReady = $true; break }; Start-Sleep -Seconds 2 }`; `if (-not $upgradeReady) { throw 'upgrade migration database did not become ready in 60 seconds' }`; in `DSM_Back`: `$env:DATABASE_URL = 'postgresql://dsm_integration:dsm_integration_password@127.0.0.1:55433/dsm_integration?schema=public'`; `npx prisma migrate deploy --schema ..\.superpowers\sdd\2026-08-25-main-branch-integration-review\canonical-prisma-r2\DSM_Back\prisma\schema.prisma`; `npx prisma migrate status --schema ..\.superpowers\sdd\2026-08-25-main-branch-integration-review\canonical-prisma-r2\DSM_Back\prisma\schema.prisma`; `docker cp ..\.superpowers\sdd\2026-08-25-main-branch-integration-review\pre-migration-seed.sql "${upgradeContainerId}:/tmp/pre-migration-seed.sql"`; `docker exec $upgradeContainerId psql -v ON_ERROR_STOP=1 -U dsm_integration -d dsm_integration -f /tmp/pre-migration-seed.sql`; `npx prisma migrate deploy`; `npx prisma migrate status`; `docker cp ..\.superpowers\sdd\2026-08-25-main-branch-integration-review\post-migration-probe.sql "${upgradeContainerId}:/tmp/post-migration-probe.sql"`; `docker exec $upgradeContainerId psql -v ON_ERROR_STOP=1 -U dsm_integration -d dsm_integration -f /tmp/post-migration-probe.sql`; cleanup `if ($upgradeContainerId) { docker stop $upgradeContainerId }`; `$env:DATABASE_URL = $null`; `docker ps -a --format "{{.Names}}"` | both `Test-Path` checks returned `False`; archive/extract, health, every deploy/status/seed/probe, captured-container cleanup, and name-absence check exit `0`; canonical prefix `4`, seed `1/1/2`, final chain `5`; deterministic dedupe, exact partial index, active-duplicate rejection, and cancelled-row insertion passed | PASS |
| Lockfile roots | From integration root: `node .superpowers/sdd/2026-08-25-main-branch-integration-review/verify-lock-roots.mjs DSM_Back DSM_Front`; `git diff --quiet 2a4e9916765b505037e1c533735d84cd9f251ccf -- DSM_Back/package.json DSM_Back/package-lock.json DSM_Front/package.json DSM_Front/package-lock.json` | verifier exit `0`: `DSM_Back: PASS`, `DSM_Front: PASS`; canonical four-path diff exit `0` | PASS |
| SDD ignore contract | `git check-ignore -q .superpowers/sdd/2026-08-25-main-branch-integration-review/progress.md` | exit `0` | PASS |
| Git integrity | `git check-ignore -q .superpowers/sdd/2026-08-25-main-branch-integration-review/progress.md`; `git diff --check`; `git diff --stat origin/main...HEAD`; `git status --short`; `git merge-base --is-ancestor 2a4e9916765b505037e1c533735d84cd9f251ccf HEAD`; `git rev-parse origin/main`; `git rev-parse origin/codex/integration-main-review` | each check exit `0`; reviewed stat; canonical ancestry true; remote SHAs exactly `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81` and `6fa66eb5998c140bb6db995cc48c1a51f7a3089f`; only this Task 14 report is tracked dirty | PASS |
| Final independent review | Independent read-only Task 14 reviewer examined the working report, `origin/main...HEAD`, offline delta, migration SQL/test, evidence, the approved security fix wave, and the exact-command correction package | Initial verdict preserved as `Spec: REJECTED`, `Quality: REJECTED`, `Whole-branch: REJECTED`, `Ready: NO`. After exact approval `Task 14 security amendment 승인 — .codex/config.toml 제거`, plan `2815f6d`, security commit `4533c0c`, and two scoped re-review rounds: security config, exact-command matrix, stale HEAD wording, release-audit residual risks, stale Task 4 ledger, and task-report scope were all `ADDRESSED`; no new P0-P2 was found. Final reviewer verdict: `Task14 Spec: APPROVED`, `Task14 Quality: APPROVED`, `Whole-branch: APPROVED`, `Ready to record verdict: YES`. | PASS |

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

## Task 10 external-PC and architecture reconciliation

Read-only investigation mapped all four `c79a042` candidates to the actual integrated tree. The tracked frontend setup uses JDK 17 while the successful integration evidence used JDK 21.0.12.1; the reconciled documents preserve that distinction instead of silently selecting one. Commit `3216ac3` fixes the master plan's invalid ripgrep `-E` encoding option to the intended regular-expression `-e` form.

The exact Task 10 document commits are:

- `28b440c` `docs: update external PC setup plan` — setup design and plan only.
- `af97e63` `docs: reconcile integration architecture and handoff` — current architecture and root handoff only.

The documents distinguish unpublished local integration/offline refs from unchanged remotes, require Node `24.19.0`/npm `11.19.0`, use React Native CLI Android-only commands, list the four canonical migrations plus Task 9's delta, preserve every Task 8 ruling, and keep secrets, real databases, push/PR, deployment and `main` changes outside scope. Stale-term, private-key marker and whitespace checks passed.

Initial independent review found one P2: native command blocks promised fail-fast behavior but did not guard every external exit or actually evaluate the URL cleanup check. Fix commit `0556097` added guards, Prisma `try/finally`, evaluated `Test-Path`, and separate Metro/Android terminals. Its re-review remained `FAILED` because `$LASTEXITCODE` alone can stay unchanged when a native command is unresolved on Windows PowerShell. Fix commit `04f5980` now passes immediate `$?` plus `$LASTEXITCODE` to every one of 60 guard calls. Independent reproductions returned `MISSING_COMMAND_GUARD=PASS` and `NATIVE_NONZERO_GUARD=PASS`; scoped fix-recheck marked the original P2 `ADDRESSED`, found no new P0/P1, and returned `RECHECKED`.

Actual execution on a different PC remains a future evidence gate; Task 10 performed no product test/build, DB, Docker, network, push, PR, or deployment action.

## Task 11 migration validation blocker and approved retry

Preflight proved both task container names and all original ignored extraction/SQL targets absent. The first disposable PostgreSQL 17 container deployed all five migrations from empty and reported the schema up to date. The second container deployed exactly the four canonical migrations from the extracted `2a4e991` Prisma tree and also reported the schema up to date.

The planned pre-delta seed then failed with psql exit `3`: `TaskDifficulty='EASY'` is invalid. Both the canonical schema and `20260716_init` define only `LOW`, `MEDIUM`, and `HIGH`. The failure is therefore an exact seed-plan defect, not a product migration failure. The integration delta and post-migration invariant probe did not run.

The mandatory `finally` path stopped and removed only the two captured disposable container IDs. Both exact task names are absent, `DATABASE_URL` is absent, protected refs are unchanged, and `dsm-back-dev-db-1` was neither stopped nor accessed. The failed run's ignored `canonical-prisma.zip` and `canonical-prisma` remain preserved; the plan forbids deleting or reusing them.

- Ruling: stop Task 11 after the invalid enum seed and preserve first-run artifacts — cost if wrong: a disposable rerun is delayed, but deleting/reusing evidence would violate the approved precondition and could hide the original failure.
- Approved amendment: the user approved the retry, commit `332e3ad` replaced only the seed enum with canonical `LOW` and switched extraction/schema references to initially absent `canonical-prisma-r2.zip` and `canonical-prisma-r2`. Approval-memory commit `720961d` preserved the no-existing-database, no-push/PR/deploy and original-evidence boundaries.
- Retry result: exact Node `v24.19.0` and npm `11.19.0`; empty PostgreSQL 17 applied/status-checked exactly five migrations; the fresh canonical extraction applied/status-checked exactly four migrations; seed inserted `1/1/2` rows; the forward delta produced exactly five applied migrations; the post-migration `DO` probe proved deterministic dedupe, the exact partial unique index, active duplicate rejection and allowed cancelled rows. The script exited `0`.
- Retry cleanup: mandatory `finally` stopped only the two captured task container IDs. Both exact task names and process `DATABASE_URL` were absent afterward; a separate read-only check showed only the preserved out-of-scope `dsm-back-dev-db-1`. Original and `r2` ignored extraction evidence remain, while the temporary execution script was removed. `main` and `origin/main` remain `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`.
- Independent reviewer verdict: `APPROVED`, no findings. It verified amendment and memory commit allowlists, byte-equivalent canonical extraction contents, all raw migration/seed/probe/cleanup evidence, protected refs and absence of tracked execution residue.

## Task 12 historical blocker and approved resolution

Task 12 started from clean tracked status at `2f96c77`. Exact Node `v24.19.0` and npm `11.19.0`, backend clean install (`882` packages), Prisma validate/generate with the already approved process-scoped parse-only URL and immediate URL removal, Nest build, and full Jest (`24` suites, `215` tests) all exited `0`.

The next required non-fixing command, `npx eslint "{src,apps,libs,test}/**/*.ts"`, exited `1`. Both errors are `prettier/prettier` in `DSM_Back/src/notifications/notification-migration.contract.spec.ts`: line 17 requires the long `migration.indexOf` argument to wrap, and line 25 requires the long failure-reason `toContain` argument to wrap. A separate non-writing `prettier --check` reproduced the same single-file failure and stdout formatting showed only those two wraps. The file originated in Task 9 commit `56c0575`; Task 9 ran its targeted Jest, Prisma and build gates but not the final full non-fixing lint.

Required-check stop semantics applied to that initial attempt. Frontend install/tests/types/lint, Android build, lock-root check, offline checks and final Git/SDD integrity were not run **in the failed attempt**. No `--fix`, source mutation, DB connection, existing/shared/remote DB access, push, PR or deployment occurred; tracked status remained clean and `DATABASE_URL` was absent.

- Ruling: stop after the first required Task 12 failure rather than auto-format a product test outside the validation-only Task 12 allowlist — cost if wrong: the remaining matrix is delayed, but silently changing a reviewed Task 9 file would exceed the approved scope and weaken change attribution.
- Resolution: the user approved the amendment. `69d3154484146c69999f5bc8e0d6c1fba313fa2d` changed only the two prescribed line wraps and trailing commas in `DSM_Back/src/notifications/notification-migration.contract.spec.ts`; focused Jest was `1/1`, non-writing Prettier and full non-fixing ESLint exited `0`. The full matrix was then restarted from the runtime gate and every spec row is now `PASS` as recorded above. No behavioral, migration, dependency, DB, remote or deployment change was introduced.

## Final subsystem rulings and deferred capabilities

- Canonical `2a4e991` is the whole-tree `PORT` baseline. Its merge is retained exactly through merge commit `a639ac2`; `DSM_Back` and `DSM_Front` were byte-identical to canonical immediately after the merge, and later changes are the approved Task 9 migration/test and Task 12 style-only test formatting.
- Foundation legacy notification runtime and Expo frontend are `SUPERSEDED`; the legacy refresh-reuse/account-delete implementation is also `SUPERSEDED` while the capabilities remain future work. M12A notification product code is `SUPERSEDED`. No whole checkpoint branch was merged.
- The active `NotificationSchedule` partial unique index was the one conditional `PORT`, delivered only by Task 9's forward migration and contract test. Redis/cache, realtime, users/profile APIs, `NotificationMode`, daily finalization/automatic snapshot uniqueness, and the UTC-day 20-active-Task implementation remain `DEFER` (the last to separately approved F-006 work).
- `43145b6` is `PORT` only as the isolated offline baseline; `fb54b5d` supplied only the four scoped memory/playbook extraction paths; `396fc0a` remains excluded publish bookkeeping. `c79a042` document candidates were reconciled in Tasks 7 and 10, not wholesale ported.
- An intended existing database migration history remains unavailable. Task 11 establishes acceptance only for empty-chain and canonical-prefix upgrade paths in named disposable PostgreSQL 17 containers; it does not authorize access to an existing, shared, remote, staging, or production database.

## Residual risks and boundaries

- Path-level overlap can still undercount semantic overlap through renamed or independently reimplemented behavior; the final reviewer must assess the full branch rather than treating overlap counts as equivalence.
- The exact Node runtime is user-scoped; future verification shells must prepend `NODEJS_HOME` because system-wide Node remains `v24.13.0` after UAC cancellation.
- Existing container `dsm-back-dev-db-1` is out of scope and must not be stopped, removed, reused, or connected to.
- A new Windows offline worktree still requires the ignored three-line Expo declaration and LF materialization for the 28 source/page pairs under global `core.autocrlf=true`; these are environment prerequisites, not branch deltas.
- Whole-branch P2 security finding remediation: the initial tracked `.codex/config.toml` declared `npx -y caveman-shrink`, permitting mutable registry-code execution outside the reviewed dependency locks. The exact user-approved amendment removed that file in `4533c0c`; no replacement, manifest, lockfile, or product edit was made. Path/reference/lock-diff checks pass, and the independent reviewer marked the finding `ADDRESSED` with no new P0-P2.
- The separate release audit `20260817-release-audit-full-project` remains `confirmed 22`, `unknown 2`, `rechecked 2`, and **not release-ready**. Unresolved P1 findings are `F-006`, `F-003`, `F-005`, and `F-017`; Task/Score/Ranking Android UI remains prototype/fixed-data, and signing/release-environment provisioning remains incomplete. This is a separate audit gate, not closed by the integration matrix.
- Production verification, actual multi-connection refresh/logout interleavings, Firebase delivery and accepted F-007 cancellation-race risk remain outside this integration review. The deferred capability rows above remain unimplemented.
- Remote refs are unchanged: `origin/main` is `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`, canonical is `2a4e9916765b505037e1c533735d84cd9f251ccf`, and `origin/codex/integration-main-review` is `6fa66eb5998c140bb6db995cc48c1a51f7a3089f`. The local integration branch is intentionally unpublished.

## Review verdict

Task 14 review verdict: `Task14 Spec: APPROVED`, `Task14 Quality: APPROVED`, `Whole-branch: APPROVED`, `Ready to record verdict: YES`. The independent reviewer marked every original finding `ADDRESSED` and found no new P0-P2 in the approved security and evidence-correction fix waves. This verdict closes the local Task 14 review gate only; the separate release audit and all deferred/production risks above remain open. No push, pull request, merge to `main`, deployment, publication, remote mutation, or shared/remote database access is authorized by this verdict.
