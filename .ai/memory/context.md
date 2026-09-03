# 현재 프로젝트 맥락 — 2026-08-17

## Main integration review — 2026-08-26

- active `C:\dsm-integration-review`/`codex/integration-main-review`, local HEAD `d8d6937`; origin push는 exact remote·branch·177-commit payload 승인 부족으로 process 시작 전 `BLOCKED`, remote ref `6fa66eb`, divergence `0 177`. `main`/`origin/main` `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`, canonical `2a4e9916765b505037e1c533735d84cd9f251ccf`. SSOT: `docs/superpowers/plans/2026-08-25-main-branch-integration-review.md`, `docs/superpowers/specs/2026-08-25-main-branch-integration-review-design.md`, `docs/reviews/2026-08-25-main-integration-conflict-review.md`.
- Task 11 PostgreSQL: empty 5/canonical 4/seed 1·1·2/forward 5/invariant/captured cleanup PASS, review `APPROVED`. Task 12: plans `046d67f`/`0ecbf2d`, style `69d3154`, Node `v24.19.0`/npm `11.19.0`; Backend install 882·24/215, Front install 988·18/162+type/lint, Android 365, lock/offline 66/66+28-source, Git/SDD PASS.
- Task 13 plan `80ab65b`, active 3+README exact 4-path closure. Task 14 plan `2815f6d`, `.codex/config.toml` 삭제 `4533c0c`, report `c9e9ba9`; original findings `ADDRESSED`, 신규 P0-P2 없음, Whole-branch `APPROVED`. Task 15 local handoff·memory closure complete.
- offline `C:\dsm-offline-learning-site`/`codex/offline-learning-site`/`2cbb088`, base `43145b6`, source `fb54b5d`; ancestry `0 1`, four paths, 66 tests·28-source PASS. Six pinned refs·canonical ancestry verified; integration과 분리·local-only.
- integration branch origin publish 미완료·local-only. PR·`main`/shared·remote DB/deploy 및 `dsm-back-dev-db-1` 접근 금지. Product audit `20260817-release-audit-full-project`: 26건(confirmed 21, unknown 2, rechecked 3), release-ready 아님; `F-006`/`F-016`/`F-025` RECHECKED.

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
- UTC score 10/20/30 × 1.5/1.3/1.0/0.7, cap 900, 6 tiers. F-006 implemented/`RECHECKED`: per-user UTC `startAt` day max 20 active; score only same-day non-null `completedAt`+`COMPLETED`; late/early/null=0; completion timestamp transitions; data-only projection repair, no remote/prod DB. Migration follows current `20260825` chain and uses explicit `BEGIN`+Serializable+`COMMIT`, timezone-independent UTC bounds, required `DailyScore` metadata, all-User zero/tier enum projection and literal score/tier oracles. Achievement rate is numerator-first half-up in app+SQL, preserving max-20 behavior and canonicalizing legacy 57/800 to 7.13.
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
- F-006 runtime: Node 24.19.0/npm 11.19.0/Prisma 6.19.3; unit 24 suites/245, e2e 2, focused Tasks 54/policy 18/Scores 11, PostgreSQL 17.11 r2 9/9, Prisma validate/generate/build/full ESLint PASS. Target migration SHA-256 `AA496C2C2D029D26C58083E888E360F79AA7EA8D10C876CF664F841BD16E291A`; atomic rollback/exactly-once/19+2 concurrency PASS; listener cleanup 0.

## Git·외부 경계

- Integration branch origin push `BLOCKED`; remote transfer 0, local-only. `main`/offline/Android product refs는 불변·분리.
- 추가 Git stage/commit/push, PR/merge/deploy와 remote/prod DB/Firebase send는 새 승인 필요. No force push/reset/drop.
- implementation exact 1~2 files; main owns approvals/shared memory/audit. high risk=`change-gate`; release=`release-audit`.
- credential/token/SHA/client ID full values never Git/memory/chat/log.

## 다음 작업·잔여 위험

1. F-006 구현·disposable PostgreSQL 17.11·독립 recheck·audit closure 완료. Audit은 confirmed 21/unknown 2 때문에 열린 상태; direct DB write와 운영 migration은 별도 gate다. Git action은 미승인 상태로 중단한다.
2. 남은 P1/UNKNOWN/P2-P3 audit → M12C → Firebase sandbox → dispatch decision → WebSocket → Redis/batch.

- release signing/.env/OAuth provisioning, production, actual multi-connection refresh/logout, Firebase delivery/F-007 race unverified.
- Task/Score/Ranking Android UI prototype, template branding, dependency 32, Apple, parser edge tests, revoked-token hook, UTC Cron pending.
- 2026-08-31 F-006 execution은 exact 8 product paths, spec/plan, audit pair와 active memory만 변경했다. Shared/remote/prod DB, Firebase, deploy, offline branch와 Git stage/commit/push/PR/merge는 실행하지 않았다.
- Docker 29.6.1/Desktop 4.82.0 backend는 stale runtime socket으로 불용이었다. Official EDB portable PostgreSQL 17.11을 ignored task runtime의 새 data dirs/loopback ports로 대체했고 service 설치 없이 종료했다. Docker container/image/volume과 기존 product DB는 불변이다.

## Memory·지원 환경

- error work searches `error-resolution-playbook.md`; matching `VERIFIED` only, revalidate current checkout. `MITIGATION_ONLY` gates persist.
- `*.original.md` local recovery, excluded from Git/search/handoff/recompression. Post-Task15 `30441ca` active 3 pre-images are byte-exact ignored backups; existing backups unchanged.
- `caveman-compress` direct run prohibited by `ER-20260720-014`; no external upload. Local `apply_patch` pass reduced active 3 from 32,501 to 28,737 bytes(11.6%); playbook read-only.
- Obsidian 1.12.7: `C:\AiWiki\AiProject\DSM`; `Current`→`C:\DEV\.ai\docs`, `Planning`→`C:\DEV\Planing Document`; stale cache recovery `ER-20260722-001`.
