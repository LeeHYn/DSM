# F-016 Android Git Handoff Implementation Plan

> **Goal:** Publish the already-implemented Android-only React Native baseline to the current feature branch and prove that a clean checkout can build it without committing local credentials or machine state.

**Architecture:** Treat the JavaScript/toolchain migration and the native Android project as one compatibility baseline, but preserve reviewability with separate product, native, documentation, and audit commits. Verification runs before staging and again from the pushed branch in a clean checkout. No product source is rewritten unless a fresh failure produces a separately approved 1–2-file fix.

**Tech Stack:** Git, React Native 0.83.10, Node/npm, Jest, TypeScript, ESLint, Gradle/JDK 17, Android SDK 36.

---

## Task 1: Freeze and classify the existing worktree

**Files:**

- Inspect only: all paths reported by `git status --short --untracked-files=all`
- Modify: none

1. Capture branch/upstream status and the complete changed-file list.
2. Confirm the dirty set contains only the completed Android-only migration, release-audit documents, and active memory.
3. Inspect `git diff --stat`, deletions, untracked source, and recent commits for accidental or unrelated changes.
4. Stop if provenance is unclear; do not reset, checkout, overwrite, or discard any existing change.

## Task 2: Prove local and secret files stay outside Git

**Files:**

- Inspect: `DSM_Front/.gitignore`
- Inspect: `DSM_Front/android/.gitignore`
- Inspect only: candidate files under `DSM_Front/android`
- Modify: none

1. Use `git check-ignore -v` for `.env.local`, `android/local.properties`, `android/app/debug.keystore`, `.idea`, `.gradle`, and `app/build`.
2. Enumerate the 52 non-ignored Android handoff files and compare them with `rg --files` excluding cache/build paths.
3. Scan the entire prospective commit set for private keys, passwords, bearer tokens, client secrets, ID tokens, and full OAuth/SHA identifiers.
4. Run `git diff --check`.

## Task 3: Run the frontend release gate

**Files:**

- Read/execute only: `DSM_Front/package.json`
- Modify: none

1. Run `npm test -- --runInBand` from `DSM_Front`.
2. Run `npm run typecheck`.
3. Run `npm run lint`.
4. Inspect Community CLI config/autolinking and confirm no Expo runtime/CLI package remains.
5. If a command fails, record the exact failure and stop before changing source.

## Task 4: Run the native Android release gate

**Files:**

- Read/execute only: `DSM_Front/android/**`
- Modify: none

1. Set `JAVA_HOME` to the verified JDK 17 location for the command process.
2. Run `gradlew.bat assembleDebug` without `clean` unless stale output is proven.
3. Confirm Gradle success, APK production, application ID `com.dsm.dailyup`, and absence of Expo Gradle modules.
4. Re-run ignore and Git status checks after Gradle execution.

## Task 5: Create reviewed Git commits

**Files:**

- Stage existing frontend migration paths under `DSM_Front`, excluding `DSM_Front/android/**`, `DSM_Front/README.md`, and `DSM_Front/AGENTS.md`.
- Stage the 52 existing non-ignored files under `DSM_Front/android`.
- Stage `DSM_Front/README.md`, `DSM_Front/AGENTS.md`, and existing `docs/superpowers/**` migration/handoff documents.
- Stage `.ai/audits/20260817-release-audit-full-project/README.md`, `.ai/audits/20260817-release-audit-full-project/findings.jsonl`, and the five active `.ai/memory/*.md` files currently changed.
- Modify working-file contents: none in this task.

1. Stage only the frontend product/toolchain migration and inspect `git diff --cached --check`, name-status, and secret scan. Commit as `refactor(front): migrate to Android-only React Native`.
2. Stage only `DSM_Front/android` and inspect the staged file count, ignore exclusions, diff check, and secret scan. Commit as `build(front): track native Android project`.
3. Stage only frontend handoff documents/specs/plans and inspect the staged diff. Commit as `docs(front): document Android Git handoff`.
4. Stage only full-project audit and active memory, validate JSONL/schema/hash counts and memory consistency, then commit as `docs(audit): record release audit state`.
5. Confirm no staged file remains and no approved change was omitted. Do not use `git add -A`, force options, reset, or amend unrelated history.

## Task 6: Push the approved feature branch

**Files:** none

1. Verify HEAD history and that the branch is `codex/front-secure-session-rest-client`.
2. Push only this branch to `origin`; do not push `main`, force-push, open a PR, merge, or deploy.
3. Confirm local HEAD and `origin/codex/front-secure-session-rest-client` resolve to the same commit.

## Task 7: Verify a clean checkout of the pushed branch

**Files:**

- Temporary checkout only under an exact new path within `C:\DEV`
- Repository working files: none

1. Create a new clean checkout from the remote feature branch.
2. Confirm `git ls-files -- DSM_Front/android` returns the expected 52 files and excluded local files are absent.
3. Install exact dependencies with `npm ci` using the verified supported Node runtime.
4. Supply only temporary ignored public development configuration required for build; never print or commit its values.
5. Run Jest, typecheck, lint, and `assembleDebug` with JDK 17.
6. Confirm clean Git status apart from intentionally ignored local/build artifacts.
7. Remove the temporary checkout only after resolving and validating its exact absolute path under the designated temporary parent.

## Task 8: Independent F-016 recheck and SSOT closure

**Files:**

- Modify in one exact-file step: `.ai/audits/20260817-release-audit-full-project/findings.jsonl`
- Modify in later one-file steps as needed: `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md`, `.ai/memory/error-resolution-playbook.md`, `.ai/memory/README.md`

1. Assign the committed/pushed evidence to an implementation-independent reviewer under the release-audit fix-recheck contract.
2. Require the reviewer to challenge remote availability, clean-checkout buildability, ignored-secret boundaries, and any new P0/P1 regression.
3. Main agent alone records `FIXING → FIXED → RECHECKING → RECHECKED` only if evidence and reviewer verdict support every transition.
4. Update active memory to the actual remote and clean-checkout result one file at a time.
5. Run ledger JSON parsing, ID/fingerprint/hash/status validation, UTF-8/secret scans, `git diff --check`, and final Git status.
6. Commit and push the closure documents only under the already approved feature-branch boundary.

## Stop conditions

- Any secret, keystore, machine path file, unknown binary, or unrelated user change enters the prospective stage.
- Frontend or Gradle verification fails and requires source modification.
- The remote branch changed unexpectedly or push would require force.
- Clean checkout cannot reproduce the project without an undocumented credential or paid/external action.
- Independent reviewer returns `FAILED` or `UNKNOWN` for the original F-016 condition.
