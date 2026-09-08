# Full Project Release Audit — 2026-09-08 current state

- Audit ID: `20260817-release-audit-full-project`
- Mode: `release-audit`
- Authoritative checkout: `C:\dsm-integration-review`
- Branch baseline: `codex/integration-main-review@d7400bf`
- Canonical ledger: `findings.jsonl`
- Mutation boundary: the approved F-005 implementation spans seventeen Front source/test paths; F-083 spans eleven Backend/Front paths with overlap in Product code; F-040 changed one Backend integration-test block and F-039 added one test-local timeout. F-035 handoff committed exactly five Android release paths in local commit `d7400bf`. Round 12 revalidated four UNKNOWN findings, and Round 13 refuted F-066 after the user confirmed Android-only. The approved F-067/F-068 work now adds the Backend account-deletion endpoint and PostgreSQL test, Android session/UI/legal-link paths, ProductStore deletion fence, release URL validator and public examples. Dependencies, lockfiles, Jest/TypeScript configs, Prisma schema/migrations, external services and Git publish state were not changed; public legal URLs remain undetermined.

## Interrupted-session recovery

- Parent session `01a07015-7547-7f03-8e7a-681ac5669c6d` stopped after repeated completion-policy errors while aggregating already-finished agent work.
- The parent JSONL has 3,071 strict UTF-8 records with no parse error.
- Nine child rollouts contain 60 assistant finals. The parent received 59; the missing R11 Backend final was recovered from its child rollout.
- The missing R11 candidate is an exact duplicate of R4-BE-001 and is recorded as alias `R11-BE-001` on F-027.
- No Git lock, residual build/test process or malformed canonical JSONL caused the stop.
- Recovery used bounded read-only inventory, dedupe and verification tasks, followed by main-agent-only ledger edits.

## Current canonical state

The recovered ledger contains 83 schema-valid findings.

| Status | Count | IDs requiring attention |
|---|---:|---|
| `CONFIRMED` | 69 | Product fixes require separate plans and approval |
| `FIXING` | 2 | F-067, F-068 — public URL and external release evidence pending |
| `REFUTED` | 1 | F-066 |
| `RECHECKED` | 8 | F-005, F-006, F-016, F-025, F-035, F-039, F-040, F-083 |
| `UNKNOWN` | 3 | F-003, F-013, F-017 |
| `VALIDATING` | 0 | — |

| Severity | Count |
|---|---:|
| `P1` | 10 |
| `P2` | 53 |
| `P3` | 20 |

- Ledger bytes: 320,321.
- Ledger SHA-256: `742EFEA9A9BDC01A674380458F6808B1709E716594F47F38FF906A0BDF7988F8`.
- IDs are contiguous from F-001 through F-083.
- Finding IDs and fingerprint values are unique.
- Every fingerprint value equals SHA-256 of its recorded basis.
- All 83 rows pass the audit JSON Schema. The former F-006 `recheck.profile` schema drift was removed without changing its reviewer identity or verdict.

## Merge and adjudication

Exact candidate aliases were merged instead of creating duplicate findings:

- `R6-AUTH-001 → F-001`
- `R9-FRONT-001 → F-011`
- `R10-BE-003 → F-009`
- `R11-BE-001 → F-027`
- `R9-AOPS-001 → F-015` as contained Android permission evidence

The R7 task-detail notification claim was refuted as an independent defect because the approved payload has no task identifier. Its broader missing-client evidence is retained under F-015 as alias `R7-FRONT-002`.

The following candidates were not added as canonical findings:

- R4-DEPS-001 and R4-DEPS-002: two independent reviewers found no reachable product path.
- R5-FRONT-001 and R7-FRONT-001: the later approved UTC policy supersedes the older local-time expectation.
- Candidate relationships with different code paths or remediations remain separate, including F-028/F-081, F-035/F-016, F-036/F-017, the Round 8 Front/Backend feature pairs, and F-076/F-083.

Recovered additions are grouped as follows:

| Round | Canonical IDs | Result |
|---|---|---|
| 4 | F-027–F-040 | 14 confirmed |
| 5 | F-041–F-051 | 11 confirmed |
| 6 | F-052–F-057 | 6 confirmed |
| 7 | F-058–F-065 | 7 confirmed, 1 unknown |
| 8 | F-066–F-078 | 9 confirmed, 4 unknown |
| 9 | F-079–F-080 | 2 confirmed |
| 10 | F-081–F-083 | 3 confirmed |
| 11 | no new canonical ID | R11 Backend duplicates F-027; cross-stack finder found no new P0–P2 |
| 12 | no new canonical ID | F-065, F-067, F-068 and F-069 revalidated from unknown to confirmed |
| 13 | no new canonical ID | F-066 revalidated from unknown to refuted after Android-only scope confirmation |

F-015 changed from `UNKNOWN` to `CONFIRMED P2`: the approved full-v1.3 scope still includes M12C reminders, while the Android notification permission, client, token lifecycle and settings path remain absent. No scope waiver was found.

F-083 first changed from `VALIDATING` to `CONFIRMED P2` after two independent data-integrity reviewers found that a committed Task create with a lost response could be followed by a second user POST. The approved fix now uses a server-issued UUIDv4 as the Task primary key, preserves it across ambiguous mounted-form retries and reconciles concurrent database creates. Two independent fix-recheck reviewers returned `RECHECKED` after the final correction and verification matrix.

## Existing fix rechecks and UNKNOWN resolution

- F-003: `UNKNOWN`. The external-property signing path, tracked helpers and clean handoff pass local checks. Two independent rechecks found no new P0/P1, but actual upload/Play signers, signer-specific OAuth and signed-device smoke are absent.
- F-005: `RECHECKED`. Its first review was `UNKNOWN` because the standard Jest gate failed and no device smoke existed. The repaired standard gate, current 6-suite/36-test Product matrix and an isolated second reviewer establish removal of prototype-only state; physical-device relaunch remains residual operational risk.
- F-017: `UNKNOWN`. Canonical release env selection, fail-closed validation, tracked example and clean handoff pass local checks. Two independent rechecks found no new P0/P1, but the production endpoint, Web audience, signed cold-start and OAuth/session evidence are absent.
- F-035: `RECHECKED`. Commit `d7400bf` tracks the build script and every required helper/test/template/document path together. Two independent reviewers confirmed the clean-checkout condition is blocked and found no new P0/P1.
- F-039: `RECHECKED`. The complex provider/store/parser/screens scenario alone has a 30-second timeout while the global 15-second limit remains; main and independent standard no-cache runs passed 23 suites/197 tests.
- F-040: `RECHECKED`. Four local runtime dynamic imports now use typed CommonJS loads after the fail-closed environment guard. Default NodeNext and spec CommonJS no-emit checks, actual PostgreSQL execution and an independent fix-recheck passed.
- F-083: `RECHECKED`. The original response-loss retry condition is blocked by the Front attempt ID lifecycle and Backend primary-key replay. Process restart/offline durability remains F-076; actual device socket-cut injection and hard-delete retention remain residual gates.
- F-013 remains `UNKNOWN`: the endpoint does not test DB connectivity, but repository evidence does not establish that production uses it as a readiness probe.
- F-065: `CONFIRMED P3`. Official Android guidance, `minSdkVersion=24` and the launcher's inherited package affinity establish the conditional API 24–29 task-hijacking risk. No malicious-app/device PoC was run.
- F-066: `REFUTED P1`. The user explicitly confirmed the v1.3 release as Android-only. Two independent reviewers found that the current Front contract, approved Android-only design and tracked native inventory match that scope, so the missing iOS project is not a release blocker. The three current v1.3 planning documents now explicitly exclude their retained historical iOS wording from release acceptance; a read-only follow-up review passed. A future return to iOS scope requires a separate deliverable audit.
- F-067: `FIXING P1`. The authenticated 204 endpoint, transactional deletion order, Android session fence, two-stage UI and real PostgreSQL cascade test are implemented. Public web deletion, operator handling, signed-device cold start and Play Console evidence remain open.
- F-068: `FIXING P1`. Login/MyPage legal links and release URL validation are implemented, with placeholder release hosts rejected. Actual public privacy/deletion content, signed-device link opening and Play Console/Data safety evidence remain open. Terms of Service stays outside this finding.
- F-069: `CONFIRMED P2`. An independent reviewer resolved the prior P2/P3 disagreement: NFR-03's batch, Redis, WebSocket and window-function architecture is absent, and weekly personal rank materializes every higher-scoring user group. Production latency remains unmeasured.

Round 12 policy conclusions use current official [Google Play account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en), [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en), and [Android task-affinity risk guidance](https://developer.android.com/privacy-and-security/risks/strandhogg). Play Console, public legal/deletion resources and device exploit behavior were not inspected.

## Recovered non-fixing verification

| Area | Result |
|---|---|
| Backend unit | PASS — 24 suites / 245 tests |
| Backend e2e | PASS — 1 suite / 2 tests |
| Backend Prisma validate | Initial P1012 without process-local URL; PASS with a dummy loopback URL, no DB connection or migration |
| Backend build | PASS |
| Backend ESLint | PASS |
| Backend full no-emit typecheck | Recovery FAIL twice — four TS2307 errors in `task-score-integrity.pg-spec.ts`; later fixed and independently rechecked under F-040 |
| Front typecheck | PASS |
| Front lint | PASS — 0 errors / 30 warnings |
| Front full Jest | Recovery FAIL — 22/23 suites and 179/180 tests passed; the integration timeout was later repaired and independently rechecked under F-039 |
| Front focused retry | PASS — 2/2 with 60-second timeout; does not replace the standard gate |
| Android Groovy behavior checks | PASS |
| Android missing-input, mixed-variant and ENVFILE gates | PASS — each intentionally rejected the invalid release invocation |
| Android `assembleDebug --offline` | PASS — 281 tasks |

The recovery matrix did not run Prisma generate, an actual database, a standalone valid signed release bundle, device persistence/relaunch, Firebase send, Play/OAuth Console or external production checks. The later F-083 and F-040 closures ran only task-owned disposable PostgreSQL instances as described below.

## F-083 implementation closure

- Backend: authenticated `POST /tasks/client-mutation-ids` returns HTTP 200 with a UUIDv4. `POST /tasks` requires that ID, uses it as `Task.id`, returns a matching owner/payload replay before capacity and category checks, and reconciles P2002 or exhausted P2034 outside the transaction. Mismatched, foreign or deleted collisions return the same generic 409.
- Front: mutation-ID preflight is part of create single-flight. A Task POST network, timeout or protocol failure retains the ID for the same canonical input; definite HTTP, authentication and local failures discard it. Success and store disposal also clear it.
- Tests: Backend focused 81, full unit 266 and normal e2e 2 passed. Front focused product 31 and full 197 passed. Backend source/spec typechecks, full Backend lint, Front typecheck/lint and diff checks passed.
- Database: the PostgreSQL 17.10 suite passed 10/10 on two distinct loopback ports. Same-ID concurrent creates produced one Task, one registered score effect and one notification schedule; a different ID produced the second Task. Both exact task containers were removed and Docker Desktop was returned to its prior stopped state.
- Android: offline `assembleDebug` passed 365 tasks and the final production Metro transform passed. Generated validation artifacts were removed.
- Scope: package and lock files, Prisma schema, the existing score-integrity migration, Git refs, remotes and external services were unchanged.

## F-040 implementation closure

- Fix: the PostgreSQL integration test keeps its fail-closed environment setup and uses typed CommonJS loads for four local runtime modules. No TypeScript config, package, lockfile, schema or migration change was needed.
- Static gates: the default repository-wide NodeNext no-emit check and the spec CommonJS no-emit check passed. Target and full Backend ESLint also passed.
- Runtime gates: Backend unit passed 24 suites/266 tests, normal e2e passed 1 suite/2 tests and PostgreSQL 17.10 passed the full 1 suite/10-test disposable database run.
- Recheck and cleanup: `/root/f040_fix_recheck` independently returned `RECHECKED` with no new P0 or P1. Both exact task containers and the temporary migration prefix were removed, and Docker returned to its prior stopped state.

## F-005 and F-039 implementation closure

- Product paths: Home, Ranking, MyPage and TaskSheets use authenticated ProductProvider/ProductStore REST state scoped by user ID and session epoch. Prototype context remains only for theme and toast UI state.
- Product verification: the independent F-005 review passed 6 suites/36 tests, Front typecheck and target lint. Main and independent standard no-cache runs each passed 23 suites/197 tests; full lint remains 0 errors/30 existing warnings.
- Timeout scope: only the full create-edit-complete-undo-delete provider integration scenario has a 30-second limit; the global Jest timeout remains 15 seconds. `/root/f039_fix_recheck` returned `RECHECKED` with no new P0 or P1.
- Residual operation gate: ADB reported zero connected devices, so real backend URL/authentication, process-kill/relaunch, account-switch and network-recovery device smoke remain unverified. The discovery-started ADB daemon was stopped.

## F-003, F-017 and F-035 release configuration handoff

- Handoff: local commit `d7400bf` contains exactly five release paths. The required helper and behavior test are tracked beside the build script, and those paths are clean against HEAD with an empty Git index.
- Negative gates: pure Groovy behavior checks pass. Missing signing properties or canonical env, mixed debug/release tasks and `ENVFILE` override fail before artifact creation without printing fixture values.
- Positive local gates: a temporary public fixture proved canonical release env selection; actual `bundleRelease --dry-run` included validation and `preReleaseBuild`. Front passed 23 suites/197 tests and typecheck, lint had 0 errors/30 warnings, and `assembleDebug` passed 281 tasks.
- Independent review: `/root/release_recheck_a` and `/root/release_recheck_b` both returned `RECHECKED` for F-035 and `UNKNOWN` for F-003/F-017, with no new P0/P1. Actual signing, Play/OAuth, production endpoint and signed-device gates were not run.
- Cleanup: the synthetic clean snapshot, junction, public env fixture and init script were removed. ADB reported zero devices and the discovery-started daemon was stopped.

## F-067 and F-068 repository implementation

- Backend: authenticated `DELETE /auth/me` returns bodyless 204. One transaction locks the User, deletes NotificationDelivery rows that would block either schedule or FCM-token cascades, then deletes the User. Repeating an already-completed deletion is idempotent.
- Android session/UI: account deletion is single-flight and epoch-fenced, retains the session on unconfirmed network/timeout/HTTP failure, clears Keychain only after server confirmation, and disposes ProductStore while pending. MyPage requires two destructive confirmations and resets local account state only after confirmed server deletion.
- Legal links: login and MyPage open a validated HTTPS privacy URL; MyPage also opens the external deletion guide. Release validation rejects missing, blank, credential-bearing, HTTP and `.invalid` legal URLs while allowing an explicit deletion anchor.
- Verification: Backend passed 24 suites/269 unit tests, 1 suite/2 e2e tests, build and full lint. A task-owned PostgreSQL 17.6 run applied all six migrations and removed all ten seeded account-scoped relationships while preserving another user. Front passed 24 suites/226 tests, typecheck and lint with 0 errors/30 warnings. Android `assembleDebug` passed 281 tasks; missing public URL release input failed closed. Disposable containers were removed and Docker returned to stopped.
- Open gates: no public privacy/deletion URLs, external request handling, signed Android device, Play Console or Data safety evidence is available. Both findings therefore remain `FIXING`; independent P1 closure review has not started.

## Termination status

The release audit remains open. It has 69 confirmed findings, two fixes in progress, one refuted finding, three unknowns, eight rechecked findings and no candidate still validating. F-067/F-068 need public legal resources, external deletion handling, signed-device and Play Console evidence. F-003/F-017 need actual signer, OAuth, production endpoint and signed-device evidence; F-013 needs production readiness wiring. Rounds 12 and 13 were targeted revalidation rather than distinct free-exploration rounds, so only Round 11 counts toward the required two consecutive zero-new-confirmed-P0–P2 rounds. This checkout is not release-ready.
