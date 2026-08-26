# 프로젝트 공정표 — 2026-08-17

## Main branch integration review — 2026-08-26

- [x] 사용자 구조·명세·Subagent-Driven 실행 승인
- [x] exact runtime/executor gate와 six pinned refs 검증
- [x] SDD ignore preflight·ledger 생성
- [x] Task 3 branch/overlap/checkpoint inventory·독립 review
- [x] Task 4 네 충돌 경로 plan amendment 승인·검증·commits `e9e265a` / `aaef828` / `fa2fc88` / `5079b0e`
- [x] Task 4 canonical `2a4e9916765b505037e1c533735d84cd9f251ccf` local non-squash merge `a639ac2`·독립 review clean·closure `0141b9f`
- [x] Task 5 canonical baseline validation
  - [x] backend `npm ci --no-audit --no-fund` exit `0` (882 packages)
  - [x] 최초 backend `prisma:validate` — `DATABASE_URL` 누락 Prisma `P1012`, exit `1`, 안전 중단 이력
  - [x] 승인 보정 뒤 backend validate/generate·URL 제거·build·23 suites/214 tests·non-fixing lint PASS
  - [x] frontend 18 suites/162 tests·typecheck·lint 0 errors/18 warnings·Android 365-task build PASS
  - [x] tracked dirty 0·canonical 제품 diff 0·URL absent·main refs 불변
  - [x] process-scoped parse-only `DATABASE_URL` plan amendment 사용자 승인
  - [x] 승인된 plan amendment 반영·검증·commit `68557d7` (16 tasks·71 checks, URL 1회, 정리 2회)
  - [x] 독립 review P2 SSOT closure finding — fix rounds 1~3, 원 finding `ADDRESSED`, 신규 breakage 없음, `APPROVED`
- [x] 별도 `codex/offline-learning-site` branch/worktree 생성·memory extraction·검증
  - [x] base `43145b6` → commit `2cbb088`, ancestry `0 1`, 정확한 memory 4-path allowlist
  - [x] ignored `expo-env.d.ts` 환경 복원·LF verifier materialization 후 Node 66/66·28-source `PASS`
  - [x] independent discovery review — findings 없음, `APPROVED`
- [x] Task 7 `c79a042` AI-control history·compatible v5.1 guidance port
  - [x] commits `1bacf47` / `1d36d70`, source blob exact, product diff 0
  - [x] independent discovery review — findings 없음, `APPROVED`
- [x] Task 8 foundation capability classification
  - [x] 네 foundation commits·11 capabilities 비교, active-schedule partial index만 조건부 `PORT`
  - [x] ranking-snapshot unique invariant P2 누락 보정 commit `c070880`·fix-recheck `RECHECKED`
- [/] Task 9 active-schedule database invariant
  - [x] canonical migration 4개·index 부재·pre-deployment authority 확인
  - [x] migration SQL·contract test exact 2-file 작업, targeted Jest 1/1 PASS
  - [x] 최초 Prisma validate `DATABASE_URL` 부재 P1012 exit 1·generate/build/DB 명령 미실행
  - [x] process-scoped parse-only URL amendment 사용자 승인
  - [x] plan amendment commit `0e19c5f` (16 tasks·71 checks, URL 총 2회, 정리 총 4회)
  - [ ] validate/generate 뒤 URL absent·build·migration diff·독립 review·closure
- [ ] 나머지 integration tasks·전체 validation·최종 독립 review
- [ ] 별도 사용자 승인 전 push·PR·`main` 변경·shared DB 접근·배포 금지

## 완료

- [x] M1~M5: 계획·NestJS/Expo 초기화·Prisma/PostgreSQL 기반
- [x] M6 Auth: Google/Kakao, JWT access/refresh, bcrypt, logout, guard, `/auth/me`
- [x] M7 Task CRUD
- [x] M8 Category CRUD + user/default/foreign-owner 경계
- [x] M9 Refresh O(1): `<recordId>.<secret>`, PK lookup + 1 bcrypt compare
- [x] M10 DailyScore: UTC recompute, cap 900, 6 tiers
- [x] M11 Ranking: DAILY/WEEKLY/TOTAL, percentile, leaderboard, snapshot
- [x] M12A: FCM token lifecycle + Task-`NotificationSchedule` 원자 동기화
- [x] M12B backend·local DB·change-gate
  - [x] per-device delivery, ADC provider, Cron, lease/heartbeat, finalize/retry
  - [x] durable send marker + terminal `UNKNOWN` at-most-once
  - [x] cross-user token/FID 409 + account-neutral payload
  - [x] F-007 완화 + 사용자 `ACCEPTED_RISK`; 나머지 findings `RECHECKED`
- [x] Front secure session·REST client Task 1~33
  - [x] onboarding/CORS/API validators/public·authenticated clients
  - [x] Native SecureStore verified clear + Web memory store
  - [x] session state/context/routing + login/onboarding/recovery/logout UI
  - [x] refresh single-flight·generation/epoch fences·onboarding single-flight
  - [x] refresh-token family + refresh/logout user-row lock
  - [x] Web export 11 routes·responsive QA·auth change-gate
- [x] 지원 체계: agent roles, context compiler, verification workflow, playbook, Docker local DB, Obsidian routing

## 현재 진행 상태

- [/] M12 notification
  - [x] 12A 기반
  - [x] 12B backend·local DB·change-gate
  - [ ] Native actual device/provider-token evidence
  - [ ] 12C authenticated current-state client
  - [ ] 실제 ADC·FCM sandbox/test device
- [x] Front secure session·REST client 제품·Web QA·auth change-gate
- [/] Android Google provider login
  - [x] Tasks 1~7 local 구현·검증
  - [x] Google OAuth consent/Web+Android client
  - [x] EAS project·development env·signing·cloud APK `FINISHED`
  - [x] Android Studio local 환경
    - [x] host SDK/JDK/NDK·Gradle sync·debug APK
    - [x] API 36 system image·`Medium_Phone` AVD 설치·연결
  - [ ] backend `GOOGLE_CLIENT_ID` 동일 Web audience 영구 release provisioning
  - [x] disposable local backend process에 동일 Web audience 연결(값 비출력·비영구)
  - [x] current pure-RN debug APK emulator install·launch·Google 계정 인증 화면 진입
  - [x] 사용자 Google 계정 UI 완료
  - [x] provider smoke 실패 증거 확보: `[16] Account reauth failed`, backend/Keychain 이전
  - [x] current debug package/SHA Android OAuth 불일치 확인·별도 matching client 생성·독립 recheck
  - [x] emulator Google login→backend exchange→reload/refresh→verified logout actual session smoke
  - [ ] Task 10 authentication change-gate·final sync
- [ ] PR·merge·배포

## Android Google 완료 증거

- [x] application ID `com.dsm.dailyup`
- [x] provider dependencies + React Native 0.83 Android compatibility
- [x] blank-safe Web client-ID config boundary TDD
- [x] native Google ID-token adapter TDD
- [x] login UI → `SessionController.signIn('GOOGLE', token)` 연결 TDD
- [x] Android package/autolinking/public env 계약
- [x] EAS internal development APK profile
- [x] Android-only local gate: Jest 18 suites/162 tests, TypeScript, lint 0 errors(warnings 18), Community CLI autolinking/Expo runtime leakage
- [x] EAS signing SHA-1을 사용한 Android OAuth client 생성; 값 기록 금지 준수
- [x] Web OAuth client를 EAS development env에 저장; 완전값 기록 금지 준수
- [x] EAS Android development build archive 확인
- [x] worktree `C:\DEV\fsr` 이동으로 Windows Ninja/CMake path 오류 해결
- [x] Expo runtime/CLI/Router/SecureStore/dev-client 제거; React Navigation/Keychain/Config/Community CLI 전환
- [x] Web/iOS target과 Expo 전용 source/assets/config 제거
- [x] pure React Native `assembleDebug`: `BUILD SUCCESSFUL in 19m 1s`, 365 tasks
- [x] Android Studio Gradle sync·`Run app` build/install·Metro `index.js`·로그인 화면 확인
- [x] Android project Git 추적 경계: build/cache/local.properties/`*.keystore` 제외
- [x] release의 debug signing 재사용 제거; final incremental `assembleDebug` 365 tasks 통과
- [x] independent review P1/P2 조치: new-PC debug OAuth 등록 runbook, cold-start bootstrapping, exact Node/npm-ci 계약
- [x] legacy `eas.json`·미사용 `dsmfront:` BROWSABLE scheme 제거
- [x] local APK 231,200,412 bytes + SHA-256 검증
- [x] Android Studio 호스트 SDK 설치·AVD 연결
- [x] actual Google token exchange·Keychain reload·refresh rotation·verified logout evidence

## 2026-08-17 full-project release audit

- [x] Backend unit 214, e2e 2, build, ESLint, Prisma validate
- [x] Frontend Jest 162, typecheck, ESLint, npm tree, Community CLI config
- [x] disposable PostgreSQL 17 migration 4개·backend health
- [x] fresh assembleDebug 365 tasks·signer/install/launch/Metro/login render
- [x] 3개 free-exploration lens + 독립 validator 2명 + disagreement tie-break
- [x] audit ledger 26행 JSON parse·ID/fingerprint/hash·static schema contract
- [x] `F-025` external Android OAuth fix: independent validators 2명 `SURVIVED`, fix-recheck `RECHECKED`
- [x] `F-016` Android Git handoff: native 52개 추적·feature branch push·clean checkout build·independent fix-recheck `RECHECKED`
- [/] audit open: confirmed 22, unknown 2, rechecked 2; release-ready 아님
- [/] P1 5건 remediation + 독립 recheck — `F-016` 완료, 4건 남음
- [ ] P2/UNKNOWN remediation·scope evidence
- [ ] 서로 다른 2개 자유 탐색 round에서 신규 confirmed P0~P2 0건 연속

## 다음 실행 순서

1. [x] Google Cloud same-project의 current debug package/SHA Android OAuth 불일치 확인·matching client 생성
2. [x] emulator Google account 인증·로그인 재시도
3. [x] login→reload/bootstrap→profile→refresh rotation→logout verified-clear smoke
4. [/] release-audit confirmed P1 5건 중 `F-016` 완료, 4건 plan·승인·수정·recheck 남음
   - [x] `F-016` Android Git handoff
     - [x] 설계·memory plan 작성 및 사용자 승인
     - [x] 구현 계획 작성
     - [x] dirty worktree provenance·commit 경계 검수
     - [x] ignore·secret·diff boundary 검증
     - [x] frontend Jest 18/162·typecheck·lint 0 errors·Community CLI gate
     - [x] Android Studio JDK 17 Gradle build: 281 tasks, `BUILD SUCCESSFUL in 6m 10s`
     - [x] 의도별 staged diff 검수·commit
     - [x] current feature branch push·remote HEAD 일치
     - [x] clean checkout `npm ci`·Jest 162·typecheck·lint·Community CLI·`assembleDebug` 재현 검증
     - [x] independent fix-recheck `RECHECKED`·audit/memory closure
   - [/] 다음 P1 `F-006` data-integrity change-gate
     - [x] 과거·미래 Task 유지, UTC `startAt` 날짜당 active Task 20개, same-day `completedAt` score eligibility 정책 승인
     - [x] formal design spec 작성·self-review
     - [ ] written-spec review 뒤 implementation plan·별도 승인
     - [ ] exact 2-file stages TDD·disposable PostgreSQL migration/concurrency 검증
     - [ ] implementation-independent fix-recheck·audit closure
5. [ ] UNKNOWN 2건 readiness/notification scope 증거 확정
6. [ ] 나머지 P2/P3 처리·release-audit 종료 조건 충족
7. [ ] M12C
   - [ ] notification permission
   - [ ] logout/account-switch Firebase Installation/token rotation
   - [ ] data-only signal 수신
   - [ ] authenticated current-state fetch/display
   - [ ] cancelled/completed/deleted Task 표시 금지
8. [ ] Firebase test project/device ADC·FCM sandbox
9. [ ] evidence 후 `FCM_DISPATCH_ENABLED` 활성 판단
10. [ ] M13 WebSocket → M14 Redis/batch

## 계속 유지할 gate

- [x] Native device session smoke 전 M12C 진입 완료 표시 금지 — smoke 확보, M12C는 여전히 미시작
- [ ] credential·token·SHA-1·client ID 완전값 출력·Git·memory 기록 금지
- [ ] 실제 Firebase credential/message send는 별도 승인 전 금지
- [ ] remote/prod DB migration·reset·drop 별도 승인 전 금지
- [ ] Git stage·commit·push·PR·merge·deploy 명시 승인 전 금지
- [ ] F-007 `ACCEPTED_RISK`/`MITIGATION_ONLY`를 `RECHECKED`·해결로 표시 금지
- [ ] 고위험 변경은 `change-gate`; release 전 `release-audit`

## 보류·별도 triage

- [ ] dependency audit 32건(critical 0; Backend 15, Frontend 17)
- [ ] actual multi-connection PostgreSQL refresh/logout interleaving
- [ ] Task parser hash/non-string 명시 test
- [ ] Apple Sign In actual verification
- [ ] revoked refresh-token reuse hook
- [ ] UTC midnight score Cron
- [ ] Redis/batch·WebSocket·automatic ranking snapshot

## `.ai/memory` 압축·정리 — 2026-08-16

- [x] active memory·Git·Android APK actual 상태 대조
- [x] `caveman-compress` 안전 감사 — `ER-20260720-014` locale 손상 조건 재확인
- [x] 기존 `*.original.md` 비접근·비덮어쓰기
- [x] local-only 계획·exact 1~2-file stages 사용자 승인
- [x] `plan.20260816.original.md` byte-exact backup + `plan.md` 압축·갱신
- [x] `context.20260816.original.md` byte-exact backup + `context.md` 압축·갱신
- [x] `checklist.20260816.original.md` byte-exact backup + `checklist.md` 압축·갱신
- [x] `README.md` backup hash·크기·압축률·routing 갱신
- [x] `error-resolution-playbook.md`의 `ER-20260720-014` 현재 소스 재검증 반영
- [x] strict UTF-8·backup hash·Markdown·gate·secret·stale path·playbook 정합성
- [x] exact allowlist·`git diff --check`·Git status 최종 확인
