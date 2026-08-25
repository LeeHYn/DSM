# 목표

DSM full-stack을 단계 구현한다. 기능·test·문서·승인·검증 이력을 함께 유지한다. 현재 최우선 목표는 완료된 current-PC Google session smoke와 `F-016` Android Git handoff를 기준선으로 보존하면서, 열린 full-project release-audit의 다음 confirmed P1 `F-006`을 별도 계획·승인 아래 수정·독립 recheck하는 것이다. audit 종료 전 M12C 완료 또는 release-ready로 표시하지 않는다.

# Main branch integration review — 2026-08-26

- 실행 계획: `docs/superpowers/plans/2026-08-25-main-branch-integration-review.md` (16 tasks·71 checks), 설계: `docs/superpowers/specs/2026-08-25-main-branch-integration-review-design.md`.
- 격리 worktree `C:\dsm-integration-review`, branch `codex/integration-main-review`; `main`과 `origin/main`은 `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`에서 변경하지 않는다.
- canonical 제품 ref는 `origin/codex/front-secure-session-rest-client` `2a4e9916765b505037e1c533735d84cd9f251ccf`; Task 0~3 완료, Task 4 local non-squash merge가 진행 중이다.
- 사용자가 `1번으로 실행 승인`과 2026-08-26 `ㄱ`으로 Task 4 네 충돌 경로 보정을 승인했다. 보정 commits: `e9e265a`, `aaef828`, `fa2fc88`, `5079b0e`.
- 오프라인 학습 사이트는 미래의 별도 `codex/offline-learning-site` branch/worktree `C:\dsm-offline-learning-site`에만 둔다. 기준은 `43145b6`, memory source는 `fb54b5d`; `396fc0a`에서는 추출하지 않는다.
- push, PR, `main` 변경, shared/remote DB 접근, 배포는 별도 사용자 승인 전 금지한다.
- **Task 4 완료**: merge `a639ac2`는 canonical `2a4e991`를 exact second parent로 보존하며 제품 subtree가 byte-identical하다. 독립 reviewer는 findings 없이 승인했고 보고서 closure는 `0141b9f`다.
- **Task 5 BLOCKED (2026-08-26)**: backend `npm ci --no-audit --no-fund`는 exit `0`으로 882 packages를 설치했으나, 다음 exact command `npm run prisma:validate`가 clean worktree에 `DATABASE_URL`이 없어 Prisma `P1012`로 exit `1`이 됐다. 계획의 required-check stop condition에 따라 Prisma generate/build/test/lint와 frontend/npm/Android 검증은 실행하지 않았다. tracked status는 clean이다.
- reviewed amendment 후보: Task 5 backend validate/generate 직전에 process-scoped parse-only URL `postgresql://dsm_validation:dsm_validation@127.0.0.1:1/dsm_validation?schema=public`을 설정하고 즉시 제거한다. port `1`을 사용해 예기치 않은 DB 연결은 성공하지 못하게 하며 existing/shared/remote DB에는 접근하지 않는다. plan amendment와 사용자 승인 전 재실행하지 않는다.
- **Task 5 amendment 승인 (2026-08-26)**: 사용자가 정확히 `Task 5 amendment 승인`으로 위 process-scoped parse-only URL 보정과 Task 5 재실행을 승인했다. 승인 범위는 implementation plan의 Task 5 backend validate/generate 환경 precondition 보정뿐이며, 실제 DB 연결·shared/remote DB 접근·제품 수정·push·PR·`main` 변경·배포는 포함하지 않는다.
- **Task 5 amendment 반영 완료**: implementation plan Task 5에 parse-only URL 설정, validate 실패 시 정리·중단, generate 뒤 무조건 정리·exit 전달, DB 연결 명령 금지를 추가했다. `git diff --check`, 16 tasks·71 checks, URL 1회·정리 2회·단일 plan path를 검증하고 commit `68557d7` `docs: amend baseline validation environment`로 기록했다.
- Task 5 blocker report commit의 exact allowlist는 subject `docs: record baseline validation block`, path `docs/reviews/2026-08-25-main-integration-conflict-review.md` 하나다. memory closure commit의 exact allowlist는 subject `docs(memory): record baseline validation block`, paths `.ai/memory/plan.md`, `.ai/memory/checklist.md` 두 개다.
- Task 5 amendment approval closure commit의 exact allowlist는 subject `docs(memory): approve baseline validation amendment`, paths `.ai/memory/plan.md`, `.ai/memory/checklist.md` 두 개다. approved Task 5 plan-amendment commit의 exact allowlist는 subject `docs: amend baseline validation environment`, path `docs/superpowers/plans/2026-08-25-main-branch-integration-review.md` 하나다.
- Task 5 plan-amendment closure commit의 exact allowlist는 subject `docs(memory): record baseline validation amendment`, paths `.ai/memory/plan.md`, `.ai/memory/checklist.md` 두 개다.

# Memory SSOT

- `plan.md`: 목표·계약·승인 경계·다음 계획
- `context.md`: 구현·환경·검증·위험 snapshot
- `checklist.md`: `[ ]|[/]|[x]` 공정 상태
- `error-resolution-playbook.md`: 오류 작업의 검증 해결 지식
- `README.md`: active/recovery routing·압축 검증
- `*.original.md`: local recovery snapshot. Git·일반 검색·handoff·재압축 제외.
- 상세 architecture: `.ai/docs/2026-07-15-current-project-architecture.md`
- notification audit: `.ai/audits/20260716-change-gate-notification-12b/findings.jsonl`
- front auth audit: `.ai/audits/20260725-change-gate-front-secure-session/findings.jsonl`
- full project audit: `.ai/audits/20260817-release-audit-full-project/findings.jsonl`

# 현재 상태 — 2026-08-17

- M1~M11 완료: setup, Auth, Task, Category, refresh O(1), DailyScore, Ranking.
- M12A 완료. M12B backend·local DB·change-gate 완료. M12C와 실제 FCM sandbox 미완료라 parent는 `[/]`.
- Front secure session·REST client Task 1~33, Web QA, local DB migration, authentication change-gate 완료.
- Android Google Tasks 1~7과 과거 EAS development APK는 완료 이력으로 보존한다. 현재 frontend는 Android-only React Native Community CLI로 전환해 Expo/EAS runtime·CLI·Router를 제거했다.
- Android Studio, SDK `C:\Users\jemie\AppData\Local\Android\Sdk`, JDK 17 `C:\Users\jemie\.jdks\ms-17.0.20`, API 36 `Medium_Phone` AVD를 호스트에서 확인했다.
- 순수 React Native Gradle sync·fresh `assembleDebug`·APK install·Metro bundle·로그인 화면 렌더를 확인했다. Windows Ninja path 문제를 피하도록 worktree는 `C:\DEV\fsr`를 유지한다.
- disposable PostgreSQL에 migration 4개를 적용하고, frontend ignored public client ID를 출력 없이 backend process env audience로 연결해 Google 계정 인증 화면까지 진입했다.
- value-redacted 비교로 앱 Web client와 Google Cloud project의 Web client 일치를 확인했고, 기존 Android clients 두 개가 현재 Android Studio debug signer와 불일치함을 확인했다. 사용자 승인 뒤 현재 signer용 Android OAuth client를 별도로 생성했다.
- 재시도에서 Google ID token→`/auth/login`→Keychain session이 성공했다. force-stop/relaunch는 Home과 refresh rotation을 복구했고, logout은 active refresh token을 0으로 만든 뒤 재실행에서도 Login을 유지했다.
- current debug OAuth blocker `F-025`는 독립 validator 2명과 fix-recheck를 거쳐 `RECHECKED`; provider reauth/OAuth 실패를 silent cancellation으로 삼키는 `F-026`은 `CONFIRMED P2`다.
- full-project release-audit는 26건(confirmed 22, unknown 2, rechecked 2)으로 열려 있다. `F-016`과 `F-025`는 `RECHECKED`; confirmed P1/P2와 UNKNOWN이 남아 release-ready가 아니다.
- branch `codex/front-secure-session-rest-client`; Android-only 기준선, F-016 closure와 active memory의 upstream 기준선은 `d9ff792f1b1f8161547e7ef7a63d50f636e615aa`다. F-006 설계 문서 커밋은 local-only ahead 1이며 push·PR·merge·deploy·remote DB·Firebase send 없음.

# 핵심 기술 계약

## Backend·DB

- NestJS + Prisma v6 + PostgreSQL. persisted time은 UTC `timestamptz`.
- local PostgreSQL 17 Alpine: `127.0.0.1:5432/dsm`, UTC, healthy, `unless-stopped`, volume `dsm-back-postgres-data`.
- migrations: `20260716_init`, `20260720_notification_delivery_outcome_policy`, `20260725_user_onboarding_completed_at`, `20260810_refresh_token_session_family`; 4 up-to-date, zero drift.
- Task mutation·schedule sync·score recompute는 같은 Serializable transaction. Prisma `P2034`만 callback 전체 최대 2회 retry.
- Category는 actor-owned/default만. score는 UTC day, difficulty 10/20/30, factor 1.5/1.3/1.0/0.7, cap 900, 6 tiers.

## Auth·Front session

- Google/Kakao backend 구현; Apple actual verification 보류. Access TTL 15분, Refresh TTL 30일.
- Google은 `GOOGLE_CLIENT_ID` non-empty + ID token audience 일치 필수.
- refresh `<recordId>.<secret>`; PK lookup + 1 bcrypt compare. conditional revoke winner + replacement create는 같은 transaction.
- refresh family `sessionId`를 rotation에서 보존. refresh/logout은 같은 user-row `FOR UPDATE` lock으로 직렬화하고 logout은 제시 family의 active token만 revoke.
- React Native `0.83.10` Android-only + React Navigation. access token은 memory only, refresh token은 Android `react-native-keychain@10.0.0`에 저장한다. Web/iOS target은 제거했다.
- Native store: versioned key, serialized mutation queue, epoch guard, verified delete, tombstone fallback.
- API URL·response runtime validation, one-attempt transport, sanitized fixed errors, token/Authorization log 금지.
- authenticated client: 첫 `401`만 refresh single-flight, 원 요청 최대 1회 replay, generation/epoch fences로 logout·account-switch 뒤 stale refresh/replay 차단.
- session controller: bootstrap/sign-in/refresh/profile/onboarding/logout state 분리. profile·onboarding epoch fence, offline bootstrap token 보존, refresh 401·protocol/storage failure fail-closed, offline logout local clear + best-effort revoke.
- `User.onboardingCompletedAt`, `/auth/me`, 멱등 `/auth/me/onboarding`, exact-origin CORS(`credentials: false`) 완료.

## Android Google

- application ID `com.dsm.dailyup`.
- `react-native-nitro-google-signin@1.3.0`, `react-native-nitro-modules@0.36.5`, `react-native-config@1.6.1`, React Native `0.83.10`.
- provider adapter가 Google ID token 획득·취소·sanitized failure만 소유. 기존 `SessionController.signIn('GOOGLE', token)`이 DSM exchange·Keychain·routing을 소유.
- `GOOGLE_WEB_CLIENT_ID`는 ignored `.env.local`의 public native build config이며 backend `GOOGLE_CLIENT_ID`와 같은 Web OAuth client를 가리켜야 한다. client secret은 frontend 금지.
- ID token은 exchange 중 memory에서만 사용. 저장·log·error serialization 금지.
- React Native Community CLI Android autolinking을 사용한다. Expo config plugin·prebuild·EAS는 현재 개발 경로가 아니다.
- Google OAuth consent는 External testing. Web+Android OAuth client와 EAS development env/signing/cloud APK 구성 완료. credential·SHA-1·client ID 완전값은 Git·memory·chat 기록 금지.
- 설계: `docs/superpowers/specs/2026-08-12-android-google-provider-login-design.md`
- 구현 계획: `docs/superpowers/plans/2026-08-12-android-google-provider-login.md`
- local Android 계획: `docs/superpowers/plans/2026-08-15-android-studio-local-development.md`

## Notification 12A/12B

- Node `>=22`, `firebase-admin@14.1.0`, `@nestjs/schedule@6.1.3`; ADC only. 12C 전 `FCM_DISPATCH_ENABLED=false`.
- token lifecycle + Task-`NotificationSchedule` 원자 동기화. foreign-owner token/FID는 mutation 전 409.
- Cron 30초, schedule claim 100, delivery 500, lease 5분, heartbeat 60초, per-device 최대 3회 명시적 failure retry.
- send 직전 Task/schedule/delivery/token owner 재검증. `sendStartedAt` 뒤 모호 결과는 terminal `UNKNOWN`; 자동 재발송 금지.
- payload는 account-neutral data-only `REMINDER_SYNC`/`version=1`; task/schedule/user ID·notification text 금지.
- F-007 cancellation race는 사용자 `ACCEPTED_RISK`, `MITIGATION_ONLY`; 해결·`RECHECKED` 표시 금지.

# 검증 기준선

- Front Android-only gate: Jest 18 suites/162 tests, TypeScript, ESLint 0 errors(style/no-void warnings 18), Community CLI config/autolinking과 Expo runtime leakage check 통과.
- Backend: Jest 23 suites/214 tests, e2e 1 suite/2 tests, Nest build, non-fixing lint, Prisma validate/generate 통과.
- Local DB: 4 migrations up-to-date, zero drift, live `sessionId text NOT NULL`, `(userId, sessionId)` index, refresh-token NULL/total `0/0`.
- auth change-gate F-001~F-005 전부 `RECHECKED`; 미해결 P0/P1·`UNKNOWN`·`ACCEPTED_RISK` 없음.
- notification audit는 F-007만 `ACCEPTED_RISK`; 나머지 12건 `RECHECKED`.
- EAS Android development build는 `FINISHED`와 archive 존재를 재검증했다.
- 순수 React Native `assembleDebug`: `BUILD SUCCESSFUL in 19m 1s`, 365 tasks. Android Studio Gradle sync 뒤 Expo modules가 사라졌고 `Run app` build/install도 성공했다.
- 2026-08-17 fresh gate: Backend 23 suites/214 + e2e 2, build/ESLint/Prisma; Frontend 18 suites/162, typecheck/ESLint; disposable DB migration 4개; Android assembleDebug 365 tasks 전부 통과했다.
- 원격 feature branch clean checkout에서 `npm ci`, Frontend 18 suites/162, typecheck, ESLint, Community CLI config와 `assembleDebug` 365 tasks가 통과했다. Android 52개 추적, 금지 파일 0개, clean status와 APK SHA-256을 확인했다.
- audit ledger는 26행 JSON parse, unique ID/fingerprint, SHA-256 재계산, severity별 validation 정적 계약을 통과했다. F-016 독립 recheck 반영 뒤 status count는 confirmed 22·unknown 2·rechecked 2다. 완전한 Draft 2020-12 validator는 설치하지 않았다.
- Backend Prettier는 66 files에서 실패했다. npm audit는 Backend 15건, Frontend 17건, critical 0이다.
- Prisma generate는 Windows DLL rename `EPERM` 방지를 위해 backend build/e2e와 직렬 실행한다.

# 다음 실행 계획

1. 다음 P1 `F-006` 데이터 무결성 문제를 새 plan과 exact 1–2-file stages로 분해하고 사용자 승인을 받는다. 남은 P1 `F-003`, `F-005`, `F-017`도 같은 절차로 처리한다.
2. UNKNOWN `F-013`, `F-015`의 readiness·notification release scope 증거를 확정한다.
3. `F-026`을 포함한 confirmed P2/P3를 수정·독립 recheck하고, 서로 다른 자유 탐색 2회에서 신규 confirmed P0–P2 0건을 연속 달성한다.
4. audit 종료 후 M12C: permission, Firebase token rotation, data-only signal, authenticated current-state client를 진행한다.
5. 별도 Firebase test project/device에서 ADC·FCM sandbox 후 dispatch 활성 여부를 판단한다.
6. M13 WebSocket realtime ranking → M14 Redis/batch caching.

# F-016 Android Git handoff 계획 — 2026-08-17

- 상태: 완료. 설계·구현 계획 승인, 검증, 의도별 commit, feature branch push, clean checkout 재현과 독립 fix-recheck까지 마쳤고 audit `F-016`은 `RECHECKED`다.
- 설계 SSOT: `docs/superpowers/specs/2026-08-17-f016-android-git-handoff-design.md`.
- 선택안: `android/`만 단독 commit하지 않고 현재 Android-only React Native 전환 기준선 전체를 검증한 뒤 의도별 commit과 current feature branch push, clean-checkout 검증으로 handoff를 닫는다.
- 이유: `android/` 52개가 모두 untracked이고, 네이티브 프로젝트가 요구하는 `package.json`, entrypoint, navigation/config/toolchain 변경도 미커밋이라 Android-only 기준선이 분리될 수 없다.
- Git 경계: 작업 시작 시 branch는 origin보다 36 commits ahead였고, 승인된 push 뒤 현재 feature branch는 origin과 동기화됐다. `main` direct push·force push·PR·merge는 금지하고 `codex/front-secure-session-rest-client`만 사용한다.
- 보안 경계: `.env.local`, `android/local.properties`, debug/release keystore, `.idea`, `.gradle`, build/cache, credential·token·OAuth 식별자 완전값은 stage·문서·출력에서 제외한다.
- 완료 근거: commit `846cf1968ae0b729e0525ccb2af82f6fc5bd8e20`이 Android-only product와 native 52개를 추적했다. clean checkout 기준선은 `e1f1a123d2822d02d7ccbe33f7cb9bb89f77c5c2`, F-016 closure까지 포함한 current remote HEAD는 `d9ff792f1b1f8161547e7ef7a63d50f636e615aa`다.
- clean handoff: 별도 checkout에서 npm install/test/type/lint/autolinking과 Gradle debug APK를 재현했다. `.env.local`, `local.properties`, keystore, `.gradle`, `.idea`, build/cache는 추적되지 않는다.
- 독립 recheck: reviewer `f016_fix_rechecker_c`가 corrected commit range, remote/clean tree, wrapper/config, APK metadata/hash와 secret/local 경계를 확인해 `RECHECKED`; 신규 P0/P1 없음.
- 후속: `F-016` RECHECKED 뒤 `F-006`을 별도 data-integrity change-gate로 설계·승인·TDD한다.

# F-006 Task score integrity 계획 — 2026-08-17

- 상태: 정책·설계 승인(`ㄱ`) 후 formal spec 작성·self-review 중. 제품 코드, migration, DB 적용 전 implementation plan과 별도 승인이 필요하다.
- 설계 SSOT: `docs/superpowers/specs/2026-08-17-f006-score-integrity-design.md`.
- 승인 정책: 과거·미래 Task 생성은 유지하되 사용자별 UTC `startAt` 날짜당 active Task 최대 20개, `completedAt`이 같은 UTC 날짜인 COMPLETED Task만 점수 인정, 기존 900점 cap 유지.
- Task 상태 계약: generic update의 완료 전환은 `completedAt=now`, 완료 상태 이탈은 null, 반복 complete는 기존 non-null timestamp를 보존한다.
- score 계약: 등록 수는 `startAt` 날짜 기준을 유지하고 same-day completion만 난이도 점수에 포함한다. late/early/null completion은 상태만 보존하고 점수는 0이다.
- 기존 데이터: schema 변경 없이 data-only Prisma migration으로 `DailyScore`, `User.totalScore`와 tier를 canonical Task에서 재계산한다. Task timestamp와 historical `RankingSnapshot`은 변경하지 않는다.
- 구현 경계: Task service+spec, Score service+spec, migration+real-DB e2e의 exact 2-file stages. remote/prod DB 적용 없음.
- 검증: unit TDD, UTC boundary, 20개 create/move, completion state, disposable PostgreSQL 17 migration repair와 19+2 concurrent create, backend full gate, 구현자와 분리된 `fix-recheck`.
- 오류 플레이북: `ER-20260715-004`는 Serializable stale-score/P2034 concurrency 해결이지만 이번 F-006의 arbitrary-date eligibility·20-count 누락과 root cause가 달라 직접 재사용하지 않는다. 기존 transaction retry 계약만 보존한다.
- 다음 정지점: spec 문서 commit 뒤 사용자 written-spec review. 승인 전 제품 source/test/migration 수정 금지.

# 승인·안전 경계

- 실제 credential/token 조회·출력·문서화, physical-device 조작, Firebase send, remote/prod DB, deploy는 별도 action-time 승인 필요.
- DB reset/drop, force push, main direct push 금지.
- Git stage·commit·push·PR·merge는 명시 승인 전 금지.
- 한 구현 단계는 exact 1~2 files. 기존 사용자 변경 보존.
- 오류 작업은 먼저 `error-resolution-playbook.md`를 signature/component/code/tag로 검색. 환경·version·root cause 일치 `VERIFIED`만 현재 checkout에서 재검증.
- auth/permission/data integrity/transaction/concurrency/time/external integration은 `.ai/agents/verification-workflow.md`의 `change-gate`; release 전 `release-audit`.
- finder·validator·implementer·fix-recheck 분리. main만 audit ledger/shared memory 수정. confirmed fix는 새 plan + 사용자 승인 + exact allowlist 필요.

# 잔여 위험·보류

- 현재 PC의 native provider-token/session lifecycle smoke는 통과했다. Google OAuth client는 Git 밖의 persistent external state이고 backend audience는 이번 process에만 임시 연결했으므로 repository release provisioning은 여전히 없다.
- Android native project는 feature branch에 52개 파일이 추적·push되어 clean checkout 재현이 가능하다. `main` 통합은 아직 하지 않았다.
- release signing과 release `.env` provisioning이 없어 production artifact/start path가 닫히지 않는다.
- 핵심 Task/Score/Ranking Android UI는 prototype state·고정 data를 사용한다.
- 임의 날짜 Task 즉시 완료가 누적 점수/TOTAL ranking에 반영되는 integrity blocker가 있다.
- Expo runtime은 없지만 launcher/splash/app name에 Expo/template branding이 남아 있다.
- 각 PC의 기본 debug keystore가 다르므로 새 PC는 `signingReport`의 debug SHA-1을 같은 Google Cloud project의 `com.dsm.dailyup` Android OAuth client로 별도 등록해야 한다. 전체 fingerprint/client ID는 Git·memory·chat 기록 금지.
- session controller의 최초 snapshot은 `bootstrapping/recovering`; 저장 세션 cold start 첫 프레임에 Login route를 노출하지 않는다.
- Node 문서 계약 `>=20.19.4 <21 || >=22.0.0`은 direct testing dependency의 `^22.13.0 || >=24` engine과 충돌한다. 수정 전 clean-PC 권장 runtime은 현재 검증된 Node 24다.
- 비-Expo 라이브러리 2개가 호환성 metadata로 `@expo/config-plugins`를 transitive lock dependency로 포함하지만 Expo runtime·CLI·autolinking에는 참여하지 않는다.
- actual multi-connection PostgreSQL refresh/logout interleaving 미실행.
- actual Firebase delivery와 F-007 race는 완화·gate 유지.
- dependency audit 32건(critical 0; Backend 15, Frontend 17) 별도 triage.
- Task parser hash/non-string 명시 test, Apple verification, revoked-token reuse hook, UTC midnight score Cron 보류.
- M12C, WebSocket, Redis/batch 미구현.

# `.ai/memory` 압축·정리 — 2026-08-16

- `caveman-compress` 스크립트는 `read_text(errors="ignore")`·인코딩 미지정 `write_text()`를 사용해 `ER-20260720-014` 적용 조건과 일치하므로 실행 금지. 외부 Claude 전송 없음.
- 기존 `*.original.md`는 비접근·비덮어쓰기. 새 날짜 backup에 byte-exact pre-image 보존.
- active 3문서는 current-state·계약·gate 중심 local-only 압축. 상세 완료 이력은 linked spec/plan/audit/source가 소유.
- README가 backup hash·크기·압축률과 최종 검증을 기록한다.
- 제품 code/test/config, Android artifact, DB, Docker, Firebase, Git write는 범위 밖이다.

# 완료 기준

1. 시작·종료 시 active 3문서와 actual source/test/Git 상태 대조.
2. 오류 작업은 playbook match·적용 가능성 기록.
3. plan + exact allowlist + 사용자 승인 후 실행.
4. proportional verification·필요 시 independent review.
5. 최종 memory 동기화, 미실행 검증·잔여 위험·승인 gate 보고.
