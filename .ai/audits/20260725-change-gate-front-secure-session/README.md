# Front Secure Session Change Gate

- audit id: `20260725-change-gate-front-secure-session`
- mode: `change-gate`
- execution approval: the user authorized the detailed 33-task implementation plan, local verification, and local commits; no push, PR, merge, deploy, remote DB, Firebase credential, or message-send authority was granted
- authoritative workspace: `C:\DEV\.worktrees\front-secure-session-rest-client`

## Scope

- token confidentiality and Native/Web refresh-token storage
- login/logout/refresh races, epoch fencing, refresh single-flight, and replay limits
- onboarding idempotency, stale response handling, and migration integrity
- strict CORS, no-bypass session routing, and Web route/build integrity
- Backend auth token rotation and logout semantics

## Round 1 finder assignments

- `/root/auth_gate_confidentiality_finder`: token confidentiality, platform storage, logout clearing, exact-origin CORS, no-bypass routing — no new candidate after authoritative-worktree rerun
- `/root/auth_gate_concurrency_finder`: login/logout/refresh concurrency, single-flight/replay, storage queue, onboarding stale response — `F-001` through `F-003`
- `/root/auth_gate_integrity_finder`: onboarding/data integrity, auth rotation, migration/schema, Web route integrity — `F-004`
- main-agent Task 29 runtime QA: Expo Router bundled Jest files under `src/app`, causing `expect is not defined`; registered as `F-005` and repaired in `eb0e5d5` before audit closure

An initial finder result that inspected the root checkout instead of this worktree was discarded and was not registered. All three finder scopes were rerun or completed against the authoritative worktree. Fingerprints were normalized and SHA-256 hashed by the main agent; no candidates were merged as duplicates.

## Current evidence baseline

- Front: 17 Jest suites / 129 tests pass; TypeScript passes; ESLint exits 0 with two existing `require()` warnings; Web export passes with 11 routes and no test route or test-token sentinel artifacts.
- Browser QA: 909×540 and 390×844 login render; Google action cannot bypass auth and stays on `/`; reload returns unauthenticated; console error/warning log is empty.
- Backend: 23 Jest suites / 211 unit tests, 1 suite / 2 e2e tests, build, exact scoped lint, Prisma validate/generate, and diff check pass.
- Local PostgreSQL: migration `20260725_user_onboarding_completed_at` applied once; three migrations up to date; datasource/datamodel diff exit 0; live column is nullable `timestamp with time zone(6)`.
- Native iOS/Android SecureStore device smoke and provider-token OAuth acquisition are not available and remain external gates.

## Current status

- `F-001` stale profile success after a session change: two independent `SURVIVED` verdicts, `CONFIRMED`.
- `F-002` delayed old-session 401 refreshing/replaying through the new session: two independent `SURVIVED` verdicts, `CONFIRMED`.
- `F-003` parallel onboarding completion late-failure state corruption: two independent `SURVIVED` verdicts, `CONFIRMED`.
- `F-004` refresh/logout successor-token race: two independent `SURVIVED` verdicts, `CONFIRMED`.
- `F-005` Jest files inside the Expo Router app tree: two independent `SURVIVED` verdicts on the original condition; commit `eb0e5d5` passed independent fix recheck and is `RECHECKED`.
- No finding is `REFUTED`, `UNKNOWN`, or `ACCEPTED_RISK`.
- The change-gate is open and is not a deployment approval.

Closure is blocked by the four confirmed P1/P2 findings. Project policy requires a new exact 1–2-file implementation scope and user approval before moving any of them to `FIXING`.

## Approved remediation design — 2026-08-10

The user replied `ㄱ` after the exact remediation and local-DB scope was presented. Implementation remains split into 1–2-file stages:

1. `F-001` and `F-003`: modify only `DSM_Front/src/features/auth/session-controller.ts` and `DSM_Front/src/features/auth/session-controller.test.ts`. Successful profile publication must remain bound to its captured epoch/state, and onboarding completion must be controller-level single-flight with stale success/error suppression.
2. `F-002`: modify only `DSM_Front/src/lib/api/authenticated-client.ts` and `DSM_Front/src/lib/api/authenticated-client.test.ts`. Before starting refresh for an initial 401, require the current access token to still match the request's captured token generation; a changed session rejects the stale recovery without refresh or replay.
3. `F-004` schema stage: modify only `DSM_Back/prisma/schema.prisma` and create `DSM_Back/prisma/migrations/20260810_refresh_token_session_family/migration.sql`. Add a non-null session-family identifier, backfill each legacy token with its own existing token id, and index user plus family without rewriting token secrets.
4. `F-004` service stage: modify only `DSM_Back/src/auth/auth.service.ts` and `DSM_Back/src/auth/auth.service.spec.ts`. Initial login creates a family, rotation preserves it, refresh/logout take the same per-user database row lock, and authenticated logout revokes every active token in only the presented token's family. This serializes predecessor/successor creation against family logout without logging out unrelated sessions.

Every behavior change follows RED→GREEN focused tests. The new migration is applied only after schema, unit, e2e, build, lint, Prisma, and diff gates pass, and only to the already approved loopback Docker target `127.0.0.1:5432/dsm`; any target mismatch stops execution. Push, PR, merge, deploy, remote DB, Firebase credential, and message-send actions remain prohibited.
