# Main Branch Integration Review Design

## Purpose

Prepare a local integration branch that reconciles work from the active DSM feature branches without changing or pushing `main`. The result must make branch ancestry, conflict decisions, validation evidence, and residual risks explicit before any pull request or merge into `main` is considered.

## Current Branch Topology

- Baseline: `main` at `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`.
- `codex/front-secure-session-rest-client` is 99 commits ahead of `main` and contains `codex/m12b-front-prototype-checkpoint` in full.
- `codex/m12b-front-prototype-checkpoint` is therefore an intermediate checkpoint and is not an independent merge input.
- `codex/dsm-back-foundation-prisma` diverged before the current `main`; it is four commits ahead and one commit behind `main`. Its four unique commits cover notification/realtime backend work, backend stabilization, a front integration foundation, and backend milestone closure.
- `codex/dsm-milestone-12a-notifications` is one commit ahead of the current `main` and overlaps the notification and task synchronization areas already changed by the other branches.
- No pull request currently represents these branches.

## Chosen Integration Strategy

Use selective integration rather than merging all four branches wholesale.

1. Start from `origin/main` on the isolated local branch `codex/integration-main-review` in `C:\dsm-integration-review`.
2. Advance the integration branch to `origin/codex/front-secure-session-rest-client` with a fast-forward-only merge. This preserves the complete latest frontend history and automatically includes `codex/m12b-front-prototype-checkpoint`.
3. Treat `origin/codex/dsm-back-foundation-prisma` as a source of candidate backend capabilities, not as a whole-branch merge. Review its four unique commits and port only changes that remain absent and compatible after step 2.
4. Treat `origin/codex/dsm-milestone-12a-notifications` as an alternative notification implementation. Compare behavior, schema assumptions, tests, and task synchronization with the integration branch; port only demonstrably missing or superior behavior.
5. Reconcile generated metadata, package manifests, lockfiles, Prisma schema/migrations, and `.ai` memory documents after product-code decisions are complete.

## Canonical Source Rules

### Frontend

`codex/front-secure-session-rest-client` is canonical for frontend runtime, Android configuration, authentication/session behavior, API clients, screens, tests, and frontend documentation because it contains the checkpoint branch and 93 later commits. Older frontend files from `codex/dsm-back-foundation-prisma` must not overwrite it.

### Backend

Backend behavior is selected per subsystem rather than by branch date alone:

- Existing behavior and tests on `codex/front-secure-session-rest-client` form the initial integration baseline.
- Unique Redis, realtime ranking, user-account, score finalization, and backend closure changes from `codex/dsm-back-foundation-prisma` are candidates for porting when the baseline lacks equivalent behavior.
- Notification behavior must be compared across all three relevant lines. The chosen implementation must preserve FCM token lifecycle, task-to-schedule synchronization, dispatch outcomes, retry/idempotency rules, and existing API contracts without duplicating providers or schedules.
- Authentication, category ownership, task transactionality, refresh-token rotation, and score recalculation hardening already present on current `main` must not regress.

### Prisma and Database Changes

- Preserve a single coherent `schema.prisma` matching the selected backend services.
- Retain only migrations that form a valid forward-only history from the current baseline and represent selected schema changes.
- Never edit an already-applied migration merely to hide a conflict.
- Do not run a destructive migration, reset a database, or access production credentials during integration review.
- Validate schema and generate Prisma Client locally; database migration execution remains outside this task unless separately authorized.

### Configuration and Dependencies

- Merge package manifests semantically, then regenerate or verify each npm lockfile from the selected manifest rather than resolving lockfile text conflicts manually.
- Keep secret values out of Git. `.env.example` files may contain names and non-secret examples only.
- Preserve the Android-only frontend direction established by the latest frontend branch.
- Do not add unrelated dependency upgrades.

### Project Memory and Agent Rules

- Preserve the most recent applicable agent contracts from the latest frontend branch.
- Reconcile `.ai/memory/plan.md`, `context.md`, and `checklist.md` only after product decisions are final so they describe the integrated tree rather than a discarded branch state.
- Record every non-obvious conflict ruling and its cost if wrong in the integration report and SDD ledger.

## Conflict Review Procedure

1. Produce a branch and commit inventory with exact SHAs and ancestry relationships.
2. Produce a file-overlap matrix for the candidate branches, grouped into frontend, backend subsystem, Prisma/migrations, dependency metadata, and project memory.
3. For each overlapping subsystem, compare public interfaces, data models, tests, error handling, and operational assumptions before selecting a side.
4. Resolve product conflicts in small subsystem-scoped commits. Do not mix frontend, backend, Prisma, and memory conflict resolution in one commit.
5. After every subsystem commit, run its targeted tests and a type/build check appropriate to that subsystem.
6. Run a final whole-branch review after all subsystem tasks complete.

## Roles and Work Ownership

Repository policy requires product investigation and implementation through the roles under `.ai/agents/`.

- Investigator: read-only branch topology, overlap matrix, and candidate capability inventory.
- Backend developer: selected backend and Prisma integration with an exact writable allowlist.
- Frontend developer: frontend conflict resolution only if the canonical frontend branch fails validation or conflicts with selected backend contracts.
- Reviewer: independent review of each subsystem diff and final integrated branch.
- Main controller: plan/spec ownership, user approvals, file ownership, rulings, review packaging, and final verification.

No two implementation agents may edit overlapping files concurrently.

## Validation

The integrated worktree must pass fresh checks using the selected manifests and lockfiles:

- Clean npm dependency installation for `DSM_Back` and `DSM_Front`.
- `prisma validate` and `prisma generate` for the backend schema.
- Backend TypeScript build.
- Backend unit tests in-band with cache disabled.
- Frontend TypeScript check with incremental compilation disabled.
- Frontend test suite and Android build/configuration checks defined by the canonical branch, when available without secrets or external service calls.
- Git status and diff review proving only intentional tracked changes exist.

Failures caused by missing credentials, external services, databases, Android SDK components, or network policy must be separated from product-code failures and documented rather than bypassed.

## Safety Boundaries

- Do not merge into or modify `main`.
- Do not push any branch, create a pull request, publish artifacts, deploy, or contact production services.
- Do not delete source branches during this task.
- Do not disable TLS verification or commit trusted-root certificates.
- Do not introduce secrets or modify user-wide Git/npm configuration.
- Stop for user approval before any future merge or push to GitHub.

## Deliverables

- Local branch `codex/integration-main-review` in `C:\dsm-integration-review`.
- A reviewed series of subsystem-scoped integration commits.
- `docs/reviews/2026-08-25-main-integration-conflict-review.md` containing branch inventory, conflict decisions, test evidence, deferred items, and residual risks.
- A clean final review verdict or an explicit list of blocking findings.

## Completion Criteria

The integration review is complete when:

1. Every non-`main` branch is classified as included, selectively ported, superseded, or intentionally deferred with evidence.
2. Every overlapping product subsystem has a recorded canonical implementation and conflict ruling.
3. The integrated branch passes all locally applicable validation commands.
4. `main` and all remote branches remain unchanged.
5. The user receives the branch name, commit summary, validation evidence, remaining risks, and the explicit next-step choice for a future pull request or merge.
