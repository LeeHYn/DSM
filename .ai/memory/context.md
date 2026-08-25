# 현재 프로젝트 맥락 — 2026-08-17

## Main integration review — 2026-08-26

- 격리 위치: `C:\dsm-integration-review` / `codex/integration-main-review`.
- 고정 ref: `main`·`origin/main` `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`; canonical `origin/codex/front-secure-session-rest-client` `2a4e9916765b505037e1c533735d84cd9f251ccf`.
- 계획: `docs/superpowers/plans/2026-08-25-main-branch-integration-review.md`; Task 4는 승인된 네 경로(`plan.md`, `context.md`, `checklist.md`, root `.gitignore`)만 해결한다.
- exact 검증 toolchain: Node `v24.19.0`, npm `11.19.0`, Docker client/server `29.6.1`, Microsoft OpenJDK `21.0.12.1`, Android platform 36/build-tools 36.0.0/NDK 27.1.12297006.
- 오프라인 사이트는 별도 `codex/offline-learning-site` / `C:\dsm-offline-learning-site`; 기준 `43145b6`, memory source `fb54b5d`, `396fc0a` 제외.
- push, PR, `main` 변경, shared/remote DB 접근, 배포 금지.

- **상태**: M1~M12A 완료. M12B backend·local DB·change-gate 완료; M12C·실제 FCM sandbox 미완료라 parent `[/]`. Front secure session·REST client Task 1~33·Web QA·auth change-gate 완료.
- **Android Google**: 현재 Android Studio debug signer용 OAuth client를 value-redacted 검증·사용자 승인 아래 추가했다. Google ID token→backend session→Keychain reload/refresh rotation→logout revoke→post-logout Login actual smoke가 통과했다.
- **Release audit**: `20260817-release-audit-full-project`는 canonical 26건(confirmed 22, unknown 2, rechecked 2)으로 열려 있다. `F-016` Android Git handoff와 `F-025` external OAuth fix는 독립 fix-recheck 뒤 `RECHECKED`; confirmed P1/P2와 UNKNOWN이 남아 release-ready가 아니다.
- **다음 gate**: confirmed P1 `F-006`은 정책·설계 승인 후 written spec review 단계다. implementation plan·별도 승인·TDD·독립 recheck → 남은 P1 3건 → UNKNOWN `F-013`·`F-015` 확정 → P2/P3와 자유 탐색 종료 조건. M12C는 audit 종료 뒤 진행한다.
- **실행 위치**: branch `codex/front-secure-session-rest-client`, worktree `C:\DEV\fsr`.

## Stack·환경

- Backend: NestJS, Prisma v6, PostgreSQL UTC `timestamptz`.
- Front: Android-only React Native `0.83.10`, Community CLI `20.2.0`, React Navigation, `react-native-keychain@10.0.0`, `react-native-config@1.6.1`. Expo runtime/CLI/Router, Web/iOS target 제거.
- Google native: `react-native-nitro-google-signin@1.3.0`, `react-native-nitro-modules@0.36.5`.
- Test: Jest + `tsconfig.spec.json` CommonJS. unit test에서 Prisma actual connection 차단.
- Local DB: PostgreSQL 17 Alpine, `127.0.0.1:5432/dsm`, UTC, healthy, `unless-stopped`, volume `dsm-back-postgres-data`.
- Applied migrations: `20260716_init`, `20260720_notification_delivery_outcome_policy`, `20260725_user_onboarding_completed_at`, `20260810_refresh_token_session_family`; 4 up-to-date, zero drift.

## Android local environment

- Android Studio Quail 3 `2026.1.3 Patch 1`: `C:\Users\jemie\AppData\Local\Programs\AndroidStudioQuail\android-studio\bin\studio64.exe`.
- Android SDK: `C:\Users\jemie\AppData\Local\Android\Sdk`; host Android Studio에서 실제 확인.
- JDK 17: `C:\Users\jemie\.jdks\ms-17.0.20`.
- NDK: `27.1.12297006`.
- Android project: `C:\DEV\fsr\DSM_Front\android`; pure React Native Gradle project 52개 파일이 feature branch에 추적·push됐다. 별도 clean checkout의 동일 tree에서 Gradle build가 재현되어 `F-016`은 `RECHECKED`다. `org.gradle.parallel=false`, `org.gradle.tooling.parallel=false` 유지.
- API 36 `Medium_Phone` AVD 연결. `assembleDebug`: `BUILD SUCCESSFUL in 19m 1s`, 365 tasks. Android Studio `Run app`: Gradle build·install 성공.
- Gradle sync 후 project tree에는 app과 Community autolink native modules만 남고 Expo modules는 없다. Metro `index.js` bundle과 로그인 화면 렌더를 확인했다.
- 이전 `build.ninja still dirty after 100 tries`는 긴 worktree path가 Nitro prefab CMake 입력을 Windows path 한계로 보이게 한 문제. worktree를 `C:\DEV\fsr`로 이동하고 generated build/CMake cache를 재생성해 해결.

## Auth·session

- Google/Kakao backend 구현; Apple actual verification 보류. Google `GOOGLE_CLIENT_ID` 필수·audience 검증.
- access TTL 15분, refresh TTL 30일. refresh `<recordId>.<secret>`, PK lookup + 1 bcrypt compare.
- conditional revoke single winner + replacement create 동일 transaction. refresh family `sessionId` rotation 보존.
- refresh/logout은 같은 user-row `FOR UPDATE` lock으로 직렬화; logout은 제시 family active token만 revoke.
- Front access token memory only. refresh token은 Android Keychain의 versioned service에 저장한다.
- token store: serialized queue + epoch guard, Native verified delete + tombstone fallback, Web reload 뒤 empty.
- authenticated client: 첫 `401` refresh single-flight, 최대 1회 replay, generation/epoch fences.
- session controller: 최초 `bootstrapping/recovering`, stable state/action 분리, profile·onboarding epoch fence, offline bootstrap token 보존, refresh 401·protocol/storage failure fail-closed, offline logout local clear + best-effort revoke.
- `User.onboardingCompletedAt`, `/auth/me`, 멱등 `/auth/me/onboarding`, strict API URL/runtime validators/sanitized errors/exact-origin CORS 완료.

## Android Google integration

- application ID `com.dsm.dailyup`.
- adapter가 native ID token 획득·취소·sanitized failure만 소유; 기존 `SessionController.signIn('GOOGLE', token)`이 DSM exchange·SecureStore·routing 소유.
- `GOOGLE_WEB_CLIENT_ID`와 backend `GOOGLE_CLIENT_ID`는 같은 Web OAuth client audience여야 한다. frontend client secret 금지.
- ID token은 exchange 중 memory only; 저장·log·error serialization 금지.
- Community CLI Android autolinking을 사용한다. Expo config plugin·prebuild·EAS는 현재 local 개발 경로에서 제거했고 legacy `eas.json`·custom scheme도 삭제했다.
- Google OAuth consent External testing, Web+Android OAuth client, EAS development env/signing/cloud APK 완료. credential·SHA-1·client ID 완전값은 Git·memory·chat 기록 금지.
- 현재 PC debug signer용 Android OAuth client는 같은 project에 별도 등록했고 `F-025` external fix가 `RECHECKED`다. 기존 clients는 변경하지 않았다. 새 PC·release/Play signer는 각자 별도 등록이 필요하다.
- `DSM_Back/.env`는 계속 부재한다. 이번 smoke는 ignored frontend public client ID를 출력 없이 process env로만 backend `GOOGLE_CLIENT_ID`에 주입했으며 repository config로 영구 저장하지 않았다.
- spec: `docs/superpowers/specs/2026-08-12-android-google-provider-login-design.md`.
- implementation plan: `docs/superpowers/plans/2026-08-12-android-google-provider-login.md`.
- Android Studio plan: `docs/superpowers/plans/2026-08-15-android-studio-local-development.md`.

## Task·Ranking·Notification

- Task mutation·schedule sync·score recompute 동일 Serializable transaction. Prisma `P2034`만 최대 2회 retry.
- Category actor-owned/default only. UTC score 10/20/30 × 1.5/1.3/1.0/0.7, cap 900, 6 tiers.
- F-006 승인 정책: UTC `startAt` 날짜당 active Task 최대 20개. 점수는 `COMPLETED`이고 non-null `completedAt`이 같은 UTC 날짜 범위일 때만 인정한다. 과거·미래 Task 생성은 유지하고 late/early/null completion은 0점이다. 기존 projection은 data-only migration으로 재계산하되 remote/prod DB에는 적용하지 않는다.
- DAILY/WEEKLY/TOTAL ranking·leaderboard·snapshot 완료. Redis/batch/WebSocket 미구현.
- 12A: FCM token lifecycle + Task-`NotificationSchedule` 원자 동기화. foreign-owner token/FID는 mutation 전 409.
- 12B: ADC only, Cron 30초, schedule 100, delivery 500, lease 5분, heartbeat 60초, per-device 최대 3회 failure retry.
- `sendStartedAt` 뒤 모호 결과 terminal `UNKNOWN`; 자동 재발송 금지. payload는 account-neutral data-only `REMINDER_SYNC`/`version=1`.
- 12C 전 `FCM_DISPATCH_ENABLED=false`. F-007 cancellation race는 사용자 `ACCEPTED_RISK` + `MITIGATION_ONLY`.

## 검증 기준선

- Front: Jest 18 suites/162 tests, TypeScript, ESLint 0 errors(style/no-void warnings 18), Community CLI config/autolinking과 Expo runtime leakage check 통과.
- Backend: Jest 23 suites/214 tests, e2e 1 suite/2 tests, Nest build, non-fixing lint, Prisma validate/generate 통과.
- Disposable PostgreSQL 17: 4 migrations 순차 적용, backend `/health` 응답 확인. permanent local volume은 기존 role 불일치 때문에 변경하지 않았다.
- Android fresh `assembleDebug`: 365 tasks, `BUILD SUCCESSFUL in 2m 28s`; current debug signer install·launch·Metro 1029-module bundle·로그인 화면 확인. 기존 다른 signer APK는 emulator exact package만 제거 후 재설치했다.
- Remote clean checkout: HEAD `e1f1a123d2822d02d7ccbe33f7cb9bb89f77c5c2`, Android tracked 52·forbidden tracked 0·Git status clean. `npm ci`, Jest 18/162, typecheck, ESLint, Community CLI config와 `assembleDebug` 365 tasks가 통과했고 APK SHA-256을 확인했다.
- Android actual auth/session: Google ID-token fetch와 `/auth/login` 성공, user/social/active refresh 생성, force-stop/relaunch Home 복구와 refresh rotation, logout 후 active refresh 0, post-logout relaunch Login 확인.
- Backend Prettier check는 66 TS files에서 실패했다. dependency audit는 Backend 15건(critical 0/high 7/moderate 6/low 2), Frontend 17건(critical 0/high 11/moderate 5/low 1)이다.
- Local DB: 4 migrations up-to-date, zero drift, `sessionId text NOT NULL`, `(userId, sessionId)` index, refresh-token NULL/total `0/0`.
- Auth audit F-001~F-005 전부 `RECHECKED`; 미해결 P0/P1·`UNKNOWN`·`ACCEPTED_RISK` 없음.
- Notification audit는 F-007만 `ACCEPTED_RISK`; 나머지 12건 `RECHECKED`.
- EAS Android development build `FINISHED`; archive 존재 재검증.
- Prisma generate는 Windows engine DLL rename `EPERM` 때문에 backend build/e2e와 직렬 실행.

## Git·외부 경계

- Android-only 기준선·F-016 handoff closure·audit/memory의 upstream 기준선은 `d9ff792f1b1f8161547e7ef7a63d50f636e615aa`다. F-006 설계 문서 커밋은 local-only ahead 1이다.
- 추가 Git stage·commit·push와 PR·merge·deploy, remote/prod DB, Firebase send는 새 실행 범위 확인 전 진행하지 않는다.
- 제품 단계 exact 1~2 files. main이 승인·memory·diff·audit ledger 소유.
- 고위험 변경은 `change-gate`; release 전 `release-audit`.

## 다음 작업·잔여 위험

1. release-audit 다음 confirmed P1 `F-006`부터 별도 plan·승인·TDD·독립 recheck하고, 남은 P1 `F-003`, `F-005`, `F-017`을 이어서 처리한다.
2. UNKNOWN `F-013`·`F-015`의 배포 readiness·notification release scope 증거를 확정한다.
3. confirmed P2/P3를 처리하고 신규 자유 탐색 2회 zero-new-P0~P2 종료 조건을 충족한다.
4. M12C → Firebase sandbox → dispatch 판단 → WebSocket → Redis/batch.

- 현재 PC의 Native provider/Keychain/session lifecycle actual evidence는 확보했다. external OAuth client 삭제·변경 시 재발할 수 있고 production 환경은 미검증이다.
- provider failure를 silent cancellation으로 삼키는 `F-026`은 `CONFIRMED P2`로 남아 있어 별도 제품 수정·검증이 필요하다.
- release signing과 release `.env` provisioning은 미구성이다. debug signing 재사용은 제거했고 배포 signer/OAuth identity와 환경 계약은 별도 작업이다.
- 핵심 Task/Score/Ranking frontend는 아직 prototype state·고정 data를 사용한다.
- Expo runtime은 제거됐지만 Android launcher/splash bitmap과 app name은 Expo/template 값이 남아 있다.
- new-PC debug signing은 PC별 기본 keystore의 SHA-1을 같은 Google Cloud project에 `com.dsm.dailyup` Android OAuth client로 등록해야 한다. 전체값 기록 금지; README/runbook에 절차가 있다.
- Node `>=20.19.4 <21 || >=22.0.0`, clean clone은 `npm ci`가 재현 경로다.
- `@expo/config-plugins`는 non-Expo library의 transitive compatibility metadata로만 lock에 남고 runtime/autolinking에는 없다.
- actual PostgreSQL multi-connection refresh/logout interleaving 미실행.
- dependency audit 32건(critical 0): Backend 15, Frontend 17. direct runtime/backend와 tooling/frontend를 분리 triage해야 한다.
- Task parser hash/non-string test, Apple verification, revoked-token reuse hook, UTC midnight score Cron 보류.

## Memory·지원 환경

- 오류 작업 전 `error-resolution-playbook.md` 검색; 환경·root cause 일치 `VERIFIED`만 현재 checkout에서 재검증. `MITIGATION_ONLY` gate 유지.
- `*.original.md`는 local recovery snapshot; Git·일반 검색·handoff·재압축 제외.
- 2026-08-16 새 날짜 backup을 byte-exact 보존하고 active 3문서를 current-state 중심 local-only 압축.
- `caveman-compress`는 `ER-20260720-014` Windows locale 손상 조건이 현재 소스에도 남아 직접 실행 금지. 외부 업로드 없음.
- Obsidian 1.12.7: `C:\AiWiki\AiProject\DSM`, `Current`→`C:\DEV\.ai\docs`, `Planning`→`C:\DEV\Planing Document`; stale IndexedDB 복구는 `ER-20260722-001`.
