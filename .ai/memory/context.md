# 현재 프로젝트 맥락 — 2026-08-17

## Main integration review — 2026-08-26

- active: `C:\dsm-integration-review` / `codex/integration-main-review`; Task 14 final-report HEAD `c9e9ba9`, Task 15 exact 4-path memory closure/local handoff complete. `main`·`origin/main` fixed `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`; canonical `2a4e9916765b505037e1c533735d84cd9f251ccf`.
- plan/spec/report: `docs/superpowers/plans/2026-08-25-main-branch-integration-review.md`, `docs/superpowers/specs/2026-08-25-main-branch-integration-review-design.md`, `docs/reviews/2026-08-25-main-integration-conflict-review.md`.
- completed: canonical merge through Task 14 final independent review. Task 11 disposable PostgreSQL evidence: empty 5, canonical 4, corrected seed 1/1/2, forward 5, invariant probe, captured-container cleanup; independent review `APPROVED`.
- Task 12 PASS: exact 승인 뒤 plan `046d67f`/`0ecbf2d`, test-only style `69d3154`. Node `v24.19.0`/npm `11.19.0`; Backend install 882·Prisma/URL cleanup·build·24/215·lint; Front install 988·18/162·type·lint; Android 365; lock roots; offline 66/66·28-source; Git/SDD 모두 PASS.
- Task 13: exact approval, plan `80ab65b`; active 3 actual-state reconciliation과 README compression routing/hash snapshot을 exact 4-path closure로 처리. ignored byte-exact recovery backup과 playbook은 불변.
- Task 14: security plan `2815f6d`, `.codex/config.toml` 단독 삭제 `4533c0c`, report `c9e9ba9`; exact-command/security/verdict re-review clean, original findings all `ADDRESSED`, 신규 P0-P2 없음, Whole-branch `APPROVED`.
- handoff: integration/offline summaries, six pinned remote refs, canonical ancestry, offline `0 1`·four-path allowlist verified; branches remain local and publish 선택은 새 승인 필요.
- offline sibling: `C:\dsm-offline-learning-site` / `codex/offline-learning-site` / `2cbb088`, base `43145b6`, memory source `fb54b5d`; 66 tests·28-source verifier PASS. Integration과 분리.
- push·PR·`main` change·shared/remote DB·deploy 금지. 기존 `dsm-back-dev-db-1` 접근/변경 금지.
- 별도 product audit: `20260817-release-audit-full-project` 26건(confirmed 22, unknown 2, rechecked 2), release-ready 아님. `F-016`/`F-025` RECHECKED; `F-006` written-spec review가 다음 제품 gate.

## Stack·환경

- Backend: NestJS, Prisma v6, PostgreSQL UTC `timestamptz`.
- Front: Android-only React Native `0.83.10`, Community CLI `20.2.0`, React Navigation, `react-native-keychain@10.0.0`, `react-native-config@1.6.1`; Expo runtime/CLI/Router·Web/iOS 제거.
- Google native: `react-native-nitro-google-signin@1.3.0`, `react-native-nitro-modules@0.36.5`.
- integration toolchain: Node `v24.19.0`, npm `11.19.0`, Docker 29.6.1, Microsoft OpenJDK `21.0.12.1`, Android platform 36/build-tools 36.0.0/NDK `27.1.12297006`.
- local product DB legacy: PostgreSQL 17 Alpine `127.0.0.1:5432/dsm`, UTC, `dsm-back-postgres-data`; 4 canonical migrations, zero drift. Integration checks use only named `--rm` disposable DBs.

## Android local environment

- Android Studio Quail 3 `2026.1.3 Patch 1`: `C:\Users\jemie\AppData\Local\Programs\AndroidStudioQuail\android-studio\bin\studio64.exe`.
- SDK `C:\Users\jemie\AppData\Local\Android\Sdk`; JDK 17 `C:\Users\jemie\.jdks\ms-17.0.20`; NDK `27.1.12297006`; API 36 `Medium_Phone` AVD.
- product worktree `C:\DEV\fsr`, Android native 52 files tracked. Long-path Ninja issue resolved by short worktree + generated CMake cache rebuild.
- pure RN Gradle sync/build/install, Metro `index.js`, login render PASS. fresh `assembleDebug` 365 tasks. Expo native modules absent; `org.gradle.parallel=false`, `org.gradle.tooling.parallel=false`.

## Auth·session

- Google/Kakao backend; Apple actual verification pending. Google `GOOGLE_CLIENT_ID` required + audience verification.
- access 15m, refresh 30d. refresh `<recordId>.<secret>`, PK lookup+1 bcrypt; conditional revoke+replacement same transaction; family `sessionId` rotation. refresh/logout user-row `FOR UPDATE` lock.
- Front access memory-only; refresh Android Keychain versioned service. serialized mutation queue, epoch guard, verified delete+tombstone.
- authenticated client: first `401` single-flight refresh, max 1 replay, generation/epoch fences. controller first state `bootstrapping/recovering`; profile/onboarding fences; protocol/storage fail-closed; offline logout local clear + best-effort revoke.
- `/auth/me`, idempotent onboarding, strict API URL/runtime validation, sanitized errors, exact-origin CORS complete.

## Android Google integration

- application ID `com.dsm.dailyup`. adapter owns native ID-token/cancel/sanitized failure; `SessionController.signIn('GOOGLE', token)` owns backend exchange·Keychain·routing.
- `GOOGLE_WEB_CLIENT_ID` and backend `GOOGLE_CLIENT_ID` must share Web OAuth audience; no frontend secret. ID token memory-only, no storage/log/error serialization.
- current debug signer Android OAuth client added separately under user approval; existing clients unchanged. `F-025` RECHECKED. New-PC/release/Play signers need separate clients.
- actual smoke: Google token→`/auth/login`→Keychain, force-stop/relaunch Home+refresh rotation, logout active refresh 0, post-logout Login. `F-026` provider failure→silent cancellation remains `CONFIRMED P2`.
- `DSM_Back/.env` absent. smoke used ignored public client ID as process-only backend audience; no persistent repository config.
- specs: `docs/superpowers/specs/2026-08-12-android-google-provider-login-design.md`, `docs/superpowers/plans/2026-08-12-android-google-provider-login.md`, `docs/superpowers/plans/2026-08-15-android-studio-local-development.md`.

## Task·Ranking·Notification

- Task mutation·schedule sync·score recompute same Serializable transaction; Prisma `P2034` callback max 2 retries. Category actor-owned/default only.
- UTC score 10/20/30 × 1.5/1.3/1.0/0.7, cap 900, 6 tiers. F-006 approved policy: per-user UTC `startAt` day max 20 active; score only same-day non-null `completedAt`+`COMPLETED`; late/early/null=0; data-only projection repair, no remote/prod DB.
- DAILY/WEEKLY/TOTAL ranking complete; Redis/batch/WebSocket pending.
- 12A token lifecycle + Task-`NotificationSchedule` atomic sync; foreign owner token/FID pre-mutation 409.
- 12B ADC only; Cron 30s, schedule 100, delivery 500, lease 5m, heartbeat 60s, max 3 device retries. ambiguous post-`sendStartedAt`→terminal `UNKNOWN`; payload `REMINDER_SYNC`/`version=1`; 12C before `FCM_DISPATCH_ENABLED=false`.
- F-007 cancellation race: `ACCEPTED_RISK` + `MITIGATION_ONLY`.

## 검증 기준선

- integration final matrix: Backend 24 suites/215 tests, Prisma/build/lint; Front 18/162+type/lint; Android 365; lock roots; offline 66/66+28-source; Git/SDD PASS. Task 11 migration/invariant PASS.
- canonical: Backend 23/214 + e2e 2 + build/lint/Prisma; Front 18/162 + type/lint; Android 365 tasks. URL cleanup/product diff/status gates PASS.
- remote clean product checkout `e1f1a123d2822d02d7ccbe33f7cb9bb89f77c5c2`: Android tracked 52, forbidden 0; npm/frontend/Gradle gates PASS. F-016 closure remote HEAD `d9ff792f1b1f8161547e7ef7a63d50f636e615aa`.
- Auth audit F-001~F-005 RECHECKED. Notification audit F-007 only accepted risk, other 12 RECHECKED. dependency audit 32(critical 0; Backend 15, Frontend 17).
- Prisma generate serial with build/e2e due Windows DLL rename `EPERM`.

## Git·외부 경계

- Integration branch only; `main`/origin refs immutable until explicit approval. Offline and Android product branches remain separate.
- Git stage/commit/push/PR/merge/deploy and remote/prod DB/Firebase send need explicit current scope. No force push/reset/drop.
- implementation exact 1~2 files; main owns approvals/shared memory/audit. high risk=`change-gate`; release=`release-audit`.
- credential/token/SHA/client ID full values never Git/memory/chat/log.

## 다음 작업·잔여 위험

1. Product audit later: F-006 → P1 F-003/F-005/F-017 → UNKNOWN F-013/F-015 → P2/P3 + two zero-new-P0~P2 rounds.
2. M12C → Firebase sandbox → dispatch decision → WebSocket → Redis/batch.

- release signing/.env/OAuth provisioning, production, actual multi-connection refresh/logout, Firebase delivery/F-007 race unverified.
- Task/Score/Ranking Android UI prototype, template branding, dependency 32, Apple, parser edge tests, revoked-token hook, UTC Cron pending.

## Memory·지원 환경

- error work searches `error-resolution-playbook.md`; matching `VERIFIED` only, revalidate current checkout. `MITIGATION_ONLY` gates persist.
- `*.original.md` local recovery, excluded from Git/search/handoff/recompression. 2026-08-27 active 3 pre-images are byte-exact date backups.
- `caveman-compress` direct run prohibited by `ER-20260720-014` locale-default I/O; no external upload. Active 3 compressed locally with `apply_patch`; playbook read-only.
- Obsidian 1.12.7: `C:\AiWiki\AiProject\DSM`; `Current`→`C:\DEV\.ai\docs`, `Planning`→`C:\DEV\Planing Document`; stale cache recovery `ER-20260722-001`.
