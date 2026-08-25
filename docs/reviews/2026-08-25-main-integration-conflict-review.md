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
- Foundation unique commits, in order: `d977633`, `62772f6`, `81495a3`, `2a6ba73`.
- M12A unique commit: `362aabe`.

## Overlap matrix

Counts are candidate changed paths followed by paths also changed on the canonical side after the applicable merge base.

| Candidate | Total changed → overlap | Frontend | Backend subsystems | Prisma / migrations | Dependency metadata | Docs / policy | Project memory |
|---|---:|---:|---|---:|---:|---:|---:|
| Foundation | 107 → 40 | 31 → 11 | app 1→1; auth 7→5; config 2→2; notifications 11→7; rankings 5→1; realtime 6→0; redis 3→0; scores 5→3; tasks 5→3; users 8→0 | 3 → 1 | 3 → 3 | 14 → 0 | 3 → 3 |
| M12A notification | 15 → 14 | 0 → 0 | app 1→1; notifications 7→7; tasks 2→2 | 0 → 0 | 0 → 0 | 2 → 1 | 3 → 3 |
| Checkpoint side | 94 → 4 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 16 → 0 plus 74 offline paths → 0 | 4 → 4 |

Path overlap alone does not prove behavioral equivalence. Foundation capability compatibility remains a later acceptance-gate decision.

## Checkpoint file classification

| Commit | Observed paths | Exclusive category | Decision |
|---|---:|---|---|
| `43145b6e0407c3c539ca66deb1813ddbc2e97ec8` | 83 added: five offline docs, four offline assets, 44 `learning-site/**`, 30 `tools/learning-site/**` | Offline branch content | Offline branch baseline only; never port into product integration. |
| `c79a042b3c1e115fc0b092a8bddcd3e6723439d6` | Seven documents/policies | Main-integration document candidate | Review file-by-file in Tasks 7 and 10. |
| `fb54b5d07d9b03d42ae70890a954454027002b0d` | Four modified active memory files | Offline-memory source | Read only through the exact section map; never cherry-pick wholesale. |
| `396fc0a89327795646e89e128d7204b55b7fc00b` | `.ai/memory/checklist.md`, `.ai/memory/plan.md` | Excluded publish bookkeeping | Contributes nothing to either integration content or offline extraction. |

The seven `c79a042` candidates are `.ai/docs/2026-07-15-current-project-architecture.md`, `.ai/system_prompt.md`, `EXTERNAL_PC_SETUP_AND_HANDOFF.md`, the two 2026-08-08 external-PC spec/plan files, and the two 2026-08-15 AI-control spec/plan files.

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
- Ruling: split Task 4 memory conflict resolution into `.ai/memory/plan.md` + `.ai/memory/context.md`, then `.ai/memory/checklist.md`, before one merge commit — this satisfies the global one-or-two-file modification cap without changing the mandated final merge tree — cost if wrong: conflict resolution is applied in two controller actions instead of one, with the same staged result.
- Ruling: plan-specific repository roles override the generic SDD assumption that every implementer edits and commits — investigators/reviewers stay read-only, product/document writers use exact role allowlists, and the main controller alone commits and owns Git, the ledger, active memory, and conflict report — cost if wrong: controller-owned artifacts receive task review after controller commits rather than being authored by a generic implementer.
- Ruling: Task 14's independent whole-branch review is the SDD final mutation review; Task 15 is read-only handoff and cannot add review surface — cost if wrong: no second redundant whole-branch review runs after a task that changes no files.

## Validation matrix

| Gate | Evidence | Status |
|---|---|---|
| Task 0 environment | Node `v24.19.0`, npm `11.19.0`, Docker client/server `29.6.1`, Java `21.0.12.1`, Android SDK env and required packages | PASS |
| Task 1 immutable refs | Six exact refs, linked clean integration worktree, approved spec blob `5a4dff47179c816963d5d2513e383f7e583b072a` | PASS |
| Task 2 SDD ignore | Standalone commit `d4f2474`; root rule matches ledger path | PASS |
| Task 3 topology | Exact merge bases, counts, unique commit lists, path classifications | PASS |
| Canonical product suite | Runs after the canonical merge | PENDING |
| Offline branch suite | Runs after isolated branch creation | PENDING |
| Migration validation | Runs only in named disposable PostgreSQL 17 containers | PENDING |
| Final independent review | Task 14 | PENDING |

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
