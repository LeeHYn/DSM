# 목표

DSM full-stack을 단계 구현한다. 기능 + test + 문서 + 승인·검증 이력을 함께 유지한다. 현재 제품 목표: front 실제 auth/API 연결과 12C notification client gate 후 sandbox FCM 검증.

# Memory SSOT

- `plan.md`: 현재 목표, 기술 계약, 승인, 다음 실행 계획
- `context.md`: 현재 구현·환경·위험 snapshot
- `checklist.md`: `[ ]|[/]|[x]` 공정 상태
- `error-resolution-playbook.md`: 오류 발생 시 조건부 검색하는 검증 해결 지식
- `*.original.md`: local recovery only. Git·일반 검색·handoff·재압축 제외.
- 상세 architecture: `.ai/docs/2026-07-15-current-project-architecture.md`
- 상세 audit: `.ai/audits/20260716-change-gate-notification-12b/findings.jsonl`
- 압축 전 전체 계획: `.ai/memory/plan.original.md`

# 현재 상태 — 2026-07-20

- M1~M11 완료: project setup, Auth, Task, Category, refresh O(1), DailyScore, Ranking.
- M12A 완료: FCM token lifecycle + Task-`NotificationSchedule` 원자 동기화.
- M12B backend·local DB·change-gate 완료. 실제 FCM sandbox와 12C client gate 미완료이므로 parent status `[/]`.
- backend Jest 22 suites·198 tests, e2e 1 suite·2 tests, direct AppModule compile, TypeScript, scoped ESLint·Prettier, Prisma validation, 2 migrations up-to-date·zero drift, `git diff --check` 통과.
- audit 13 findings: F-007 `ACCEPTED_RISK`, 나머지 12 `RECHECKED`. 미해결 P0/P1 없음.
- front design Phase 1 prototype 완료; 실제 OAuth/backend/FCM/WebSocket/DB 연결 미구현.
- 2026-07-25 Front secure session·REST API client 설계·명세·상세 TDD 구현 계획을 완료했고, 사용자 승인에 따라 subagent-driven 방식으로 구현을 시작한다.

# 다음 작업

## 권장 순서

1. Front secure session + REST API client
2. M12C:
   - notification permission
   - logout/account-switch Firebase Installation/token rotation
   - data-only signal 수신
   - authenticated current-state fetch/display
   - cancelled/completed/deleted Task 표시 금지
3. 별도 Firebase test project/device에서 ADC·FCM sandbox
4. evidence 확인 후 `FCM_DISPATCH_ENABLED` 활성 판단
5. M13 WebSocket realtime ranking
6. M14 Redis/batch caching

## 다음 단계 승인 전 경계

- front 제품 파일 수정 금지
- 실제 Firebase credential 조회·message send 금지
- 원격/운영 DB 접근·migration 금지
- deploy·Git write 금지
- 다음 계획은 exact 1~2-file stage와 verification을 먼저 기록하고 사용자 승인 후 실행

## Front secure session·REST API client 승인 설계 — 2026-07-25

### 범위

- 이번 설계는 iOS/Android secure session, Web QA용 비지속 세션, 경량 `fetch` REST client, `/auth/login` 교환 인터페이스, 계정 전역 최초 온보딩 상태와 CORS 축소를 포함한다.
- Google/Kakao provider token 획득 SDK, Task/Category/Ranking 실제 API 연결, FCM 12C, WebSocket은 후속 범위다.
- 사용자는 보완된 전체 설계를 2026-07-25 `진행해`로 승인했다.
- 사용자는 2026-07-25 `1 ㄱ`으로 상세 TDD 계획 커밋, exact 1~2-file 단계의 제품 코드 구현과 subagent-driven 실행을 승인했다. 이 승인은 계획에 명시된 단계별 로컬 Git commit까지 포함하되 push·deploy·Firebase 실제 전송·원격/운영 DB 작업과 local DB migration 실제 적용은 포함하지 않는다.

### 확정 계약

- architecture는 dependency를 추가하지 않는 경량 `fetch` client + 명시적 session state machine을 사용한다.
- access token은 memory only다. refresh token은 iOS/Android `expo-secure-store`, Web memory only이며 Web 새로고침은 의도적으로 로그아웃된다.
- SecureStore는 platform-specific module로 분리하고 config plugin을 사용한다. 자동 bootstrap을 방해하는 `requireAuthentication`은 사용하지 않는다.
- token storage mutation은 직렬화하고 `sessionEpoch` 검사를 결합해 logout·login·refresh late-write resurrection을 차단한다.
- refresh는 single-flight이며 인증 요청은 성공한 refresh 뒤 최대 1회만 replay한다. refresh network error는 자동 retry하지 않는다.
- bootstrap network failure는 token을 보존한 offline-retry 상태다. refresh 401, protocol/storage failure는 fail-closed logout이다.
- offline logout은 local token을 항상 제거하고 server revoke는 best-effort다. 서버 token이 30일 만료까지 남을 수 있는 위험은 사용자 승인 정책이다.
- 계정 전역 최초 온보딩은 `User.onboardingCompletedAt`으로 관리한다. 완료 API는 멱등적으로 최초 시각을 보존하고 canonical timestamp를 200 응답으로 반환한다.
- `/auth/me`는 `userId`와 `onboardingCompletedAt`을 반환한다.
- `EXPO_PUBLIC_API_BASE_URL`에는 공개 URL만 저장하고 runtime validation을 수행한다. production은 HTTPS, local development는 loopback/private-network HTTP만 허용한다.
- auth/token 응답은 TypeScript 타입 외 runtime shape validation을 통과해야 한다. token·Authorization header는 log/error에 기록하지 않는다.
- CORS는 browser origin exact allowlist, `credentials: false`, Origin 없는 Native·CLI 요청 허용 정책이다.
- Expo Router protected routes는 screen을 한 번만 선언하고 bootstrap/offline/unauthenticated/onboarding/authenticated 상태로 분기한다.
- 회전 refresh 응답 유실 후 다음 복원에서 강제 로그아웃될 수 있는 기존 backend 한계는 이번 milestone의 known limitation이며 자동 retry로 은폐하지 않는다.

### 문서·구현 단계

1. 승인 설계를 `docs/superpowers/specs/2026-07-25-front-secure-session-rest-client-design.md`에 기록하고 자체 검토한다.
2. 상세 TDD 계획을 `docs/superpowers/plans/2026-07-25-front-secure-session-rest-client.md`에 작성한다.
3. 구현은 별도 사용자 승인 후 exact 1~2-file 단계로 수행한다.
4. backend onboarding/CORS → front config/token store → REST client → session state/router → UI wiring → 통합 검증 순으로 진행한다.

### 검증·감사 gate

- backend: unit/e2e/build/Prisma validate·migration status·local persistent DB zero drift.
- front: Jest `jest-expo` + React Native Testing Library, TypeScript, Expo SDK 55 Flat ESLint, Web QA, iOS/Android SecureStore 실제 기기 smoke.
- 보안·동시성·DB migration 변경이므로 구현 완료 전 `change-gate`를 수행한다.
- 실제 provider OAuth E2E는 provider SDK 후속 단계 전까지 완료로 주장하지 않는다.

# 핵심 기술 계약

## Backend/DB

- NestJS + Prisma v6 + PostgreSQL. 모든 persisted time은 UTC `timestamptz`.
- test에서 Prisma actual connection 차단.
- Jest: `tsconfig.spec.json`, CommonJS.
- Docker local DB: Desktop 4.82.0, Engine/CLI 29.6.1, Compose 5.3.0, WSL 2.7.10.
- PostgreSQL 17 Alpine: `127.0.0.1:5432`, UTC, healthcheck, `unless-stopped`, named volume `dsm-back-postgres-data`.
- migrations:
  - `20260716_init`
  - `20260720_notification_delivery_outcome_policy`
- local migration apply·status·datasource↔datamodel zero drift·catalog·FK·index query plan·restart persistence 검증 완료.
- 원격/운영 DB는 별도 승인.

## Auth

- Access TTL 15분, Refresh TTL 30일.
- Google/Kakao 구현; Apple actual verification 보류.
- `GOOGLE_CLIENT_ID` non-empty required; Google client와 `verifyIdToken.audience`에 같은 값.
- refresh format `<recordId>.<secret>`; PK lookup + 1 bcrypt compare.
- rotation: `revokedAt=null`, `expiresAt>now` conditional `updateMany` single winner + replacement create 같은 transaction.
- malformed/missing/revoked/expired/wrong-secret은 401.
- `AuthModule` exports `JwtModule` + `JwtAuthGuard`; protected feature modules import `AuthModule`.

## Task/Category/Score

- Task endpoints: create/list/get/update/soft-delete/complete.
- Task mutation, schedule sync, score recompute는 같은 Serializable transaction.
- Prisma `P2034`만 전체 callback 최대 2회 retry; 다른 error 즉시 전파.
- Category assign: actor-owned 또는 default만. foreign/missing 모두 NotFound.
- score: difficulty 10/20/30, factor 1.5/1.3/1.0/0.7, daily cap 900, 6 tiers.
- update가 UTC day 이동 시 old/new distinct day 재계산.

## Ranking

- DAILY=오늘 capped score, WEEKLY=최근 7일, TOTAL=`User.totalScore`.
- rank=`higherCount+1`; percentile=`round(rank/totalUsers*100,2)`.
- current calculation + leaderboard + snapshot. Redis/batch/WebSocket은 후속.

## Front Phase 1

- Expo SDK 55 + Expo Router, Noto Sans KR, dark-first.
- routes: login/tutorial/home/ranking/my; custom tabs.
- local Task CRUD, optimistic rollback, loading/empty/error/offline, theme/logout.
- Browser QA: 909×540 and 390×844.
- root `/` vs `(tabs)/index` conflict 때문에 logout login-compatible route는 `/explore`.
- production auth/API/FCM/WebSocket/DB 미연결.

# Notification 12A/12B 계약

## Packages/environment

- Node `>=22`
- `firebase-admin@14.1.0`
- `@nestjs/schedule@6.1.3`
- ADC only; service-account JSON/env private key 금지
- `FCM_PROJECT_ID` required
- `FCM_DISPATCH_ENABLED=false` default/12C 전 유지

## Token lifecycle

- `PUT /notifications/fcm-tokens`: create/same-user refresh/reactivate.
- `DELETE /notifications/fcm-tokens`: active owned token idempotent revoke.
- response에 token/userId 미노출.
- global unique token/FID foreign-owner registration은 mutation 전 409.
- upsert update에서 `userId` 변경 금지.
- account switch는 12C client가 old Installation/token 삭제 후 새 identity 발급·등록.

## Schedule/delivery

- Task create/update/remove/complete transaction에서 future active PENDING Task schedule sync.
- schedule/delivery 상태 상수 공유.
- per-device `NotificationDelivery`로 partial result·retry 독립 관리.
- retry due index `(status,nextAttemptAt)`, stale lease index `(status,processingStartedAt)`.
- provider lock: `migration_lock.toml`, PostgreSQL.

## Dispatcher

- Cron 30초; schedule claim max 100, delivery max 500.
- short Serializable claim; lease 5분, heartbeat 60초.
- send 직전 Task/schedule/delivery/token owner 재검증.
- `attemptCount`는 claim 수가 아닌 명시적 per-device failure response에서 1회 증가; max 3.
- valid future `Retry-After` seconds/date/header는 cap 없이 보존. invalid/past만 bounded exponential fallback.
- invalid token code는 delivery fail + token revoke.
- chunk 결과는 delivery ID + claim ID fence로 즉시 persist.
- all deliveries terminal 후 schedule aggregate.

## F-004 at-most-once

- FCM 직전 all-or-none `sendStartedAt` durable marker.
- pre-marker stale claim만 `PENDING` recovery.
- post-marker stale lease, SDK throw, heartbeat unsafe, missing response, persistence gap은 terminal `UNKNOWN`.
- 명시적 device transient response만 marker clear + retry.
- post-marker 자동 재발송 금지. 누락 가능성을 중복/교차 계정 노출보다 우선.

## F-007 accepted risk

- FCM call 시작 뒤 DB cancellation으로 recall 불가.
- mitigation: send 직전 revalidation, immediate TTL/expiration, collapse, account-neutral data-only signal, default dispatch disabled.
- 12C client는 authenticated current state 조회 후 활성 Task만 표시.
- send-start→cancel, display-decision→cancel 좁은 race는 사용자 `ACCEPTED_RISK`.
- `MITIGATION_ONLY`; 해결·`RECHECKED`로 표시 금지.

## F-010 identity/privacy

- cross-user token/FID in-place transfer 제거·409.
- outbound payload:
  - data `type=REMINDER_SYNC`, `version=1`
  - no notification/title/body/`taskId`/`scheduleId`/`userId`
  - Android TTL 0 + collapse key
  - APNs expiration 0 + background collapse

# 검증·감사 계약

- 고위험 auth/permission/data integrity/transaction/concurrency/time/external integration은 `.ai/agents/verification-workflow.md`의 `change-gate`.
- release 전 전체 감사는 `release-audit`.
- finder=`investigator`; 반박 validation/fix-recheck=`reviewer`; implementer와 rechecker 분리.
- P0/P1 2 independent validators; 보안·권한·transaction·동시성·data-integrity P2도 2.
- status: `NEW → VALIDATING → CONFIRMED|REFUTED|UNKNOWN → FIXING → FIXED → RECHECKING → RECHECKED`; 사용자만 `ACCEPTED_RISK`.
- confirmed fix는 별도 plan + user approval + exact allowlist 필수.
- main만 `.ai/audits/` ledger 수정.
- static review는 real DB/runtime/external service/deploy 검증 대체 불가.

# 오류 해결 playbook

- 오류 전 `error-resolution-playbook.md`를 signature/component/code/tag로 검색.
- symptom + environment/version/root cause 일치 `VERIFIED`만 현재 승인 범위에서 적용.
- 과거 PASS는 현재 검증 대체 불가.
- `MITIGATION_ONLY`는 gate·residual risk 유지.
- 새 검증 해결은 main이 중복 root cause·secret 부재 확인 후 index/body 갱신.
- 현재 22 records: 과거 품질 5 + audit mapping 13 + Windows CP949 compression 복구 1 + Obsidian cache 복구 1 + Windows npm/Jest 검증 환경 복구 2. Audit F-007만 `MITIGATION_ONLY`.

# Sub-agent 운영 계약

- 공통 SSOT: `.ai/agents/README.md`.
- roles: `investigator`, `context-compiler`, `planner`, `backend-developer`, `frontend-developer`, `reviewer`.
- 제품 code/test/config 조사·구현·review는 적합 role sub-agent 사용.
- main owns plan, approval, shared memory, file ownership, diff integration, audit ledger.
- assignment required: role, objective, read scope, exact writable allowlist, forbidden scope, verification, done condition.
- one stage 1~2 exact files; parallel ownership overlap 금지.
- error task는 playbook match ID/none + applicability + current revalidation 보고.
- Context Compiler는 multi-doc/handoff 의미 손실 위험 때만 사용; SSOT 원문 대체 금지.

# 주요 완료·승인 ledger

| 날짜 | 사용자 승인/결정 | 완료 범위 | 계속 제외 |
|---|---|---|---|
| 2026-07-15 | 품질 보완 5건 | Google audience, refresh race, Category owner, Task-score atomicity, CSS module | 나머지 review findings |
| 2026-07-16 | branch A + architecture 갱신 | packages, schema·initial SQL, 12B static implementation | actual DB/Firebase |
| 2026-07-19 | `per-device delivery 확장 승인` | `NotificationDelivery` model·migration·worker scope | actual Firebase |
| 2026-07-19 | Docker Desktop + persistent PostgreSQL 승인 | Docker/WSL install, local DB, migrations, runtime DB validation | remote/prod DB |
| 2026-07-19 | frontend requirements 승인 | 15-screen requirements doc | product implementation |
| 2026-07-19 | `design Phase 1 프런트 구현 승인` | prototype product files + Browser QA | production integrations |
| 2026-07-20 | worker 진행 `ㄱ` | Firebase provider/dispatcher/Cron + safety fixes | actual FCM |
| 2026-07-20 | F-014 진행 `ㄱ` | Auth/JWT module DI + root compile/e2e | production runtime |
| 2026-07-20 | F policy `승인` | F-004/F-010 fix, F-007 narrow risk acceptance | 12C·sandbox |
| 2026-07-20 | `오류 해결 플레이북 도입 승인` | 18 records + system integration | product code |
| 2026-07-20 | `memory 압축 및 Anthropic 전송 승인` | memory compression + local backup + approved external transfer | Git write |

# `.ai/memory` 압축·복구 기록 — 2026-07-20

## 기준선

- `plan.md`: 121,943 bytes, SHA-256 `97e4fa12ec703221896ea4aa4fc3da33389366338180cd2c761c8a00357c7404`
- `error-resolution-playbook.md`: 34,495 bytes, SHA-256 `631c80de3f7da6255c2dfefefdfc722cd08f72f177c06eb9f59e21f718ac77cd`
- `context.md`: 12,141 bytes, SHA-256 `b5d9047f0ebf8760e87b34d1e4ea1e416646ce7dd90db277cd661b8d6a2f82f0`
- `checklist.md`: 14,513 bytes, SHA-256 `ddd82735434dd98f4d5b61fd5376d74da41d8dda97f2669bbc4c3bfc39f06556`
- secret/key/credential URL pattern 0.

## Anthropic skill 결과

- 사용자 외부 전송 승인 후 Claude CLI OAuth expired 401 발견; `claude auth login` 재인증 성공.
- Windows subprocess executable·stdin UTF-8 호환을 runtime에서 보완.
- default model: `plan.md` 15분 timeout, `context.md` 5분 timeout. primary write 전 종료; orphan Python/Claude exact PID cleanup.
- Haiku/low/tools-disabled `context.md` 응답은 수신했으나 skill의 `Path.read_text/write_text`가 Windows locale CP949를 사용:
  - UTF-8 source를 CP949+`errors=ignore`로 읽어 backup 손상
  - compressed output의 U+8BAF를 CP949로 쓰다 실패
  - primary 0 bytes
- skill 안전 보장 위반으로 추가 Anthropic 실행 중단.

## Local fallback

- exact backups:
  - `plan.original.md` = 기준 hash
  - `checklist.original.md` = 기준 hash
  - `error-resolution-playbook.original.md` = 기준 hash
- `context.original.md`: byte-exact 복구 불가를 명시한 semantic reconstruction. Git HEAD + plan + checklist + architecture + validation evidence 사용.
- corrupt CP949 artifact는 `context.original.failed-cp949.bin`으로 quarantine; active/Git 제외.
- active `context.md`, `checklist.md`, `plan.md`는 current-state 중심으로 직접 압축.
- playbook은 이미 structured conditional knowledge라 active 본문 유지; default memory read 대상 아님.
- `.ai/memory/README.md`가 active/backup routing을 소유.

## 최종 결과

- active bytes:
  - `plan.md` 14,419
  - `context.md` 3,506
  - `checklist.md` 3,564
  - `error-resolution-playbook.md` 37,124
  - `README.md` 2,114
- default 3-file read는 148,597→21,489 bytes, 85.5% 감소.
- strict UTF-8, Markdown fence, relative link, active secret pattern, playbook 19 index/body, exact backup 3 hash와 대상 `git diff --check` 통과.
- `ER-20260720-014`에 CP949 원인·복구·재발 방지 절차를 추가해 playbook은 최종 19 index/body다.
- `context.original.failed-cp949.bin`, `*.original.md`는 Git ignored. 제품 code, DB, Firebase message, deploy, Git stage·commit·push 미실행.

# 계속 유지할 위험·보류

- actual multi-instance PostgreSQL + Firebase delivery 미검증.
- F-004 at-most-once는 duplicate 대신 missed reminder/`UNKNOWN` 가능.
- F-007 recall/display cancellation race accepted only after documented mitigation; 12C 미구현.
- F-010 actual concurrent registration + real device 미검증; direct DB write 제한.
- remote/prod migration·planner behavior 미검증.
- Apple Sign In actual verification 미구현.
- refresh revoked-token reuse detection hook, UTC midnight score Cron 보류.
- front production integration, WebSocket, Redis/batch 미구현.

# 완료 기준

다음 작업 시작 전:

1. 이 파일·`context.md`·`checklist.md` 확인.
2. 오류 작업이면 playbook 검색.
3. actual source/test/Git diff로 memory와 일치 확인.
4. plan + exact allowlist + user approval.
5. 구현 후 proportional tests·independent review·memory 갱신.

# Obsidian 개인 Vault junction 연결 계획

## 목표와 발견 상태

- `C:\AiWiki`는 현재 존재하며 비어 있다. 이 경로를 개인 Obsidian Vault root로 사용한다.
- 이전의 중첩 폴더 `C:\AiWiki\ai 위키`는 사용자가 제거했으며 현재 존재하지 않는다.
- `C:\AiWiki\AiProject`는 여러 프로젝트를 담는 실제 directory로 생성한다.
- 계획된 mapping: `C:\AiWiki\AiProject\DSM` → `C:\DEV`.
- `C:\AiWiki\AiProject`와 `C:\AiWiki\AiProject\DSM`은 현재 존재하지 않아 기존 파일·폴더와 충돌하지 않는다.
- `DSM_Back/node_modules`와 `DSM_Front/node_modules`에는 Markdown이 각각 925개·706개 있어 Obsidian 검색 오염 가능성이 있다.

## 실행 단계

1. 사전 조건 재검증
   - `C:\AiWiki`가 실제 directory이며 `C:\AiWiki\AiProject`와 `C:\AiWiki\AiProject\DSM`이 존재하지 않는지 확인한다.
   - `C:\DEV`가 현재 Git project root인지 확인한다.
2. 프로젝트 컨테이너 생성
   - 일반 directory `C:\AiWiki\AiProject`를 생성한다.
   - 이후 다른 프로젝트는 이 directory 아래에 서로 다른 이름의 sibling junction으로 추가한다.
3. DSM junction 생성
   - 생성 경로: `C:\AiWiki\AiProject\DSM`
   - target: `C:\DEV`
   - 기존 `C:\DEV` 내용은 이동·복사·수정하지 않는다.
4. junction 검증
   - `C:\AiWiki\AiProject`가 junction이 아닌 일반 directory인지 확인
   - reparse point `LinkType=Junction`, target `C:\DEV` 확인
   - junction을 통한 `README.md`, `docs/`, `Planing Document/` 접근 확인
   - junction 내부에 Vault를 되가리키는 순환 경로가 없는지 확인
5. Vault 등록과 색인 제외
   - Obsidian의 `Open folder as vault`에서 `C:\AiWiki`를 선택한다.
   - Obsidian UI에서 최소 `AiProject/DSM/DSM_Back/node_modules`와 `AiProject/DSM/DSM_Front/node_modules`를 제외한다.
   - `.obsidian` 내부 설정 파일은 Obsidian이 소유하도록 두고 직접 생성·편집하지 않는다.
6. 공유 memory 종료 기록
   - `C:\DEV\.ai\memory\plan.md`
   - `C:\DEV\.ai\memory\context.md`
   - `C:\DEV\.ai\memory\checklist.md`

## exact writable allowlist

- 일반 directory: `C:\AiWiki\AiProject`
- junction reparse point: `C:\AiWiki\AiProject\DSM`
- 완료 기록: `C:\DEV\.ai\memory\plan.md`
- 완료 기록: `C:\DEV\.ai\memory\context.md`
- 완료 기록: `C:\DEV\.ai\memory\checklist.md`

## 범위와 안전 조건

- 제품 코드, DB, Docker, Firebase, `.obsidian` 내부 파일, Git stage·commit·push는 직접 변경하지 않는다.
- junction 생성 시 예상 밖 경로가 이미 존재하거나 target이 `C:\DEV`와 다르면 덮어쓰지 않고 중단한다.
- junction 제거는 원본 `C:\DEV`를 삭제하지 않지만 이번 범위에는 제거 작업을 포함하지 않는다.

## 승인 게이트

- 현재는 경로 재검증과 이 계획 교체만 완료했다.
- `AiProject` 일반 directory와 `DSM` junction 생성, Obsidian에서 `C:\AiWiki` Vault 등록·색인 제외와 공유 memory 완료 갱신은 사용자 승인 후 수행한다.
- 이전의 `C:\AiWiki\AiProject` 직접 junction 승인은 경로 변경으로 효력이 없으며 새 구조에 대한 승인을 받는다.
- 승인 문구 예시: `DSM junction 연결 승인`
- **승인 기록**: 2026-07-20 사용자가 `DSM junction 연결 승인`으로 위 구조의 directory·junction 생성, Vault 등록과 색인 제외를 명시적으로 승인했다.

## 구현 완료 기록 — 2026-07-20

- 일반 directory `C:\AiWiki\AiProject`를 생성했다.
- `C:\AiWiki\AiProject\DSM` junction을 생성했고 target이 정확히 `C:\DEV`임을 확인했다.
- junction을 통해 `README.md`, `docs`, `Planing Document`에 접근할 수 있고 `C:\DEV` root에 역방향 reparse point가 없어 순환 경로가 없음을 확인했다.
- Obsidian 1.12.7에서 `C:\AiWiki`를 Vault로 등록했다. Obsidian이 소유하는 `.obsidian` 설정은 UI를 통해서만 생성·변경했다.
- 제외 경로 `AiProject/DSM/DSM_Back/node_modules/`, `AiProject/DSM/DSM_Front/node_modules/`를 저장하고 Obsidian UI와 `.obsidian/app.json` readback으로 일치 확인했다.
- 제품 코드, DB, Docker, Firebase와 Git stage·commit·push는 변경하지 않았다.
- **상태**: **연결·Vault 등록·색인 제외·검증 완료**

# Obsidian DSM 문서 큐레이션 계획 — 2026-07-21

## 감사 결론

- `C:\DEV`의 문서형 파일은 `.git`·`node_modules` 제외 기준 41개이며 모두 Markdown이다.
- Obsidian에서 보이는 비-dot 경로 문서는 16개지만, 현재 구현을 가장 정확히 설명하는 `.ai/docs` 4개는 dot directory 아래라 검색되지 않는다.
- 보이는 문서 중 AI 진입 지침·starter README 7개는 Wiki 검색 노이즈다.
- `docs/superpowers/plans` 4개는 완료된 agent 실행 이력이며 현재 상태로 오인될 수 있다.
- `Planing Document`의 v1.3 문서 4개는 목표·기획 기준으로 유효하지만 WebSocket·Redis·offline sync·FCM token schema·일일 Task 20개 제한을 현재 구현처럼 읽을 위험이 있다.
- 보이는 문서 사이에 Obsidian internal link나 MOC가 없다.

## 목표

- 기존 `C:\AiWiki\AiProject\DSM` → `C:\DEV` junction은 유지한다.
- 최신 `.ai/docs` 4개를 보이는 별도 junction으로 노출한다.
- AI 지침, starter README와 agent 실행 이력을 Obsidian 검색에서 제외한다.
- DSM 전용 Overview를 추가해 현재 문서·기획 문서·소스의 역할을 연결한다.
- v1.3 기획 문서 4개 상단에 “목표 문서이며 현재 구현 상태가 아님” 경고와 최신 architecture 링크를 추가한다.

## 단계별 실행

1. junction 단계
   - `C:\AiWiki\AiProject\DSM-Current`가 없고 target `C:\DEV\.ai\docs`가 실제 directory인지 확인한다.
   - `C:\AiWiki\AiProject\DSM-Current` → `C:\DEV\.ai\docs` junction을 생성한다.
   - 기존 `C:\AiWiki\AiProject\DSM` junction과 `C:\DEV`는 변경하지 않는다.
2. Obsidian 검색 정리 단계
   - Obsidian UI의 제외 파일 목록에 아래 경로를 추가하고 기존 node_modules 제외를 보존한다.
   - `AiProject/DSM/AGENTS.md`
   - `AiProject/DSM/CLAUDE.md`
   - `AiProject/DSM/GEMINI.md`
   - `AiProject/DSM/DSM_Back/README.md`
   - `AiProject/DSM/DSM_Front/AGENTS.md`
   - `AiProject/DSM/DSM_Front/CLAUDE.md`
   - `AiProject/DSM/DSM_Front/README.md`
   - `AiProject/DSM/docs/superpowers/plans/`
3. Overview 단계
   - `C:\AiWiki\AiProject\DSM Overview.md`를 생성한다.
   - 최신 문서 4개, v1.3 기획 문서 4개, source README를 역할별로 연결하고 현재/목표/역사를 구분한다.
4. 기획 문서 경고 단계
   - 아래 4개 파일을 두 파일씩 수정해 동일한 상태 경고와 최신 architecture 링크를 추가한다.
   - `C:\DEV\Planing Document\DSM_Docu_v1.3.md`
   - `C:\DEV\Planing Document\Information_Architecture_v1.3.md`
   - `C:\DEV\Planing Document\Requirements_Analysis_v1.3.md`
   - `C:\DEV\Planing Document\System_Architecture_v1.3.md`
5. 검증과 종료 기록
   - junction target, 순환 부재, 기존 DSM junction 보존을 확인한다.
   - Obsidian Quick Switcher에서 최신 architecture와 Overview가 검색되고 제외 대상이 검색되지 않는지 확인한다.
   - 네 개 기획 문서의 경고·링크와 Overview의 internal link 대상을 검사한다.
   - Git diff가 위 기획 문서 4개와 공유 memory에만 한정되는지 확인한다.

## exact writable allowlist

- junction reparse point: `C:\AiWiki\AiProject\DSM-Current`
- Obsidian UI 소유 설정: `C:\AiWiki\.obsidian\app.json`
- Vault Overview: `C:\AiWiki\AiProject\DSM Overview.md`
- 기획 문서: `C:\DEV\Planing Document\DSM_Docu_v1.3.md`
- 기획 문서: `C:\DEV\Planing Document\Information_Architecture_v1.3.md`
- 기획 문서: `C:\DEV\Planing Document\Requirements_Analysis_v1.3.md`
- 기획 문서: `C:\DEV\Planing Document\System_Architecture_v1.3.md`
- 완료 기록: `C:\DEV\.ai\memory\plan.md`
- 완료 기록: `C:\DEV\.ai\memory\context.md`
- 완료 기록: `C:\DEV\.ai\memory\checklist.md`

## 안전 경계

- 제품 코드, DB, Docker, Firebase, dependency, 기존 junction target과 Git stage·commit·push는 변경하지 않는다.
- `.obsidian/app.json`은 직접 편집하지 않고 Obsidian UI를 통해서만 변경한다.
- junction 경로가 이미 존재하거나 target이 예상과 다르면 덮어쓰지 않고 중단한다.
- 과거 계획 문서는 삭제·이동하지 않고 Obsidian 색인에서만 제외한다.
- 기획 문서의 본문 요구사항은 이번 작업에서 재작성하지 않고 상태 경고만 추가한다.

## 승인 게이트

- 2026-07-21 사용자의 `수정 진행해`는 감사 결과에 따른 문서 정리 의사로 기록한다.
- 프로젝트 실행 규칙에 따라 이 exact 계획을 사용자에게 보고하고 별도 승인 후 구현한다.
- 승인 문구 예시: `DSM 문서 정리 승인`
- **승인 기록**: 2026-07-21 사용자가 `DSM 문서 정리 승인`으로 위 exact allowlist와 단계별 정리를 승인했다.
- **상태**: 승인·구현 완료. 단, 기존 전체-source junction 아래의 dependency 파일 hard isolation은 Obsidian 1.12.7 제한으로 보류.

## 구현·검증 기록 — 2026-07-21

- `C:\AiWiki\AiProject\DSM-Current` junction을 생성했고 target이 정확히 `C:\DEV\.ai\docs`임을 확인했다. 최신 Markdown 4개가 노출된다.
- `C:\AiWiki\AiProject\DSM Overview.md`를 생성해 Current 4개, Planning v1.3 4개, source README를 역할별로 연결했다.
- v1.3 기획 문서 4개 상단에 현재 구현 문서가 아니라는 경고와 최신 architecture 링크를 추가했다.
- AI 지침, starter README, 완료된 agent 실행 계획과 두 `node_modules` 경로를 Obsidian UI 제외 목록에 저장했다.
- junction target 2개, Overview internal link 9개, 기획 문서 경고·링크 4개, Obsidian 설정 readback과 `git diff --check`를 검증했다.
- Obsidian UI에서 Overview가 정상 렌더링되고 Current/Planning 역할 구분이 표시됨을 확인했다.
- **잔여 제한**: Obsidian 1.12.7의 `Excluded files`는 Windows junction 아래 dependency 파일을 hard-ignore하지 않는다. 경로 필터와 `/.*\/node_modules\/.*/` 정규식을 저장하고 Vault cache를 재구축했지만 Quick Switcher에 `node_modules` README·asset이 남았다. 기존 `DSM` junction 보존이라는 승인 경계를 지키기 위해 junction 교체·제거는 수행하지 않았다.
- 제품 코드, DB, Docker, Firebase와 Git stage·commit·push는 변경하지 않았다.

# Obsidian DSM 일반 컨테이너 전환 계획 — 2026-07-21

## 목표 구조

```text
C:\AiWiki\AiProject\DSM\              # 일반 directory
├─ Overview.md                         # Vault 전용 문서 안내
├─ Current\                            # junction → C:\DEV\.ai\docs
└─ Planning\                           # junction → C:\DEV\Planing Document
```

- `C:\DEV` 전체는 더 이상 Vault 내부 junction으로 노출하지 않는다.
- 제품 source는 원래 위치 `C:\DEV`에 그대로 유지하며 이동·복사·수정하지 않는다.
- 최신 구현 문서와 v1.3 기획 문서만 DSM 컨테이너 아래에 노출한다.

## 단계별 실행

1. 안전 전환
   - 기존 `C:\AiWiki\AiProject\DSM`이 `C:\DEV`를 가리키는 junction인지 재검증한다.
   - 기존 `C:\AiWiki\AiProject\DSM-Current`가 `C:\DEV\.ai\docs`를 가리키는 junction인지 재검증한다.
   - 두 junction reparse point만 제거한다. target의 파일은 삭제하지 않는다.
   - `C:\AiWiki\AiProject\DSM`을 일반 directory로 생성한다.
2. 문서 junction 재배치
   - `C:\AiWiki\AiProject\DSM\Current` → `C:\DEV\.ai\docs`
   - `C:\AiWiki\AiProject\DSM\Planning` → `C:\DEV\Planing Document`
   - container 자체는 `LinkType`이 없어야 하고 두 child만 junction이어야 한다.
3. Overview·기획 링크 갱신
   - `C:\AiWiki\AiProject\DSM Overview.md`를 `C:\AiWiki\AiProject\DSM\Overview.md`로 이동한다.
   - Current 링크를 `AiProject/DSM/Current/...`, Planning 링크를 `AiProject/DSM/Planning/...`로 갱신한다.
   - source README internal link는 제거하고 원본 경로 `C:\DEV\README.md`를 명시한다.
   - 기획 문서 4개의 최신 architecture 링크도 새 Current 경로로 갱신한다.
4. Obsidian 정리
   - 더 이상 존재하지 않는 full-source 경로용 제외 필터 11개를 Obsidian UI에서 제거한다.
   - Vault cache를 재구축한다.
5. 검증
   - `DSM` 일반 directory, `Current`·`Planning` junction target, 원본 target 보존을 확인한다.
   - Overview internal link 8개가 모두 존재하는지 확인한다.
   - Quick Switcher에서 Overview와 최신 architecture는 검색되고 `node_modules`·AI 지침·과거 agent plan은 검색되지 않는지 확인한다.
   - 기획 문서 4개의 경고·새 architecture 링크와 `git diff --check`를 확인한다.

## exact writable allowlist

- 제거·재생성: `C:\AiWiki\AiProject\DSM`
- 제거: `C:\AiWiki\AiProject\DSM-Current`
- junction 생성: `C:\AiWiki\AiProject\DSM\Current`
- junction 생성: `C:\AiWiki\AiProject\DSM\Planning`
- 이동 전 Vault 문서: `C:\AiWiki\AiProject\DSM Overview.md`
- 이동 후 Vault 문서: `C:\AiWiki\AiProject\DSM\Overview.md`
- Obsidian UI 소유 설정: `C:\AiWiki\.obsidian\app.json`
- 기획 문서: `C:\DEV\Planing Document\DSM_Docu_v1.3.md`
- 기획 문서: `C:\DEV\Planing Document\Information_Architecture_v1.3.md`
- 기획 문서: `C:\DEV\Planing Document\Requirements_Analysis_v1.3.md`
- 기획 문서: `C:\DEV\Planing Document\System_Architecture_v1.3.md`
- 완료 기록: `C:\DEV\.ai\memory\plan.md`
- 완료 기록: `C:\DEV\.ai\memory\context.md`
- 완료 기록: `C:\DEV\.ai\memory\checklist.md`

## 안전 경계

- junction 제거 전 `LinkType`과 target이 예상과 다르면 중단한다.
- junction target인 `C:\DEV`, `C:\DEV\.ai\docs`, `C:\DEV\Planing Document`는 삭제·이동·복사하지 않는다.
- `Remove-Item`은 검증된 junction reparse point에만 사용하며 recursive delete는 사용하지 않는다.
- 제품 코드, DB, Docker, Firebase, dependency와 Git stage·commit·push는 변경하지 않는다.
- `.obsidian/app.json`은 직접 편집하지 않고 Obsidian UI로만 변경한다.

## 승인 게이트

- 2026-07-21 사용자의 `C:\AiWiki\AiProject\DSM을 일반 컨테이너로 전환` 요청을 구조 변경 의사로 기록했다.
- 프로젝트 실행 규칙에 따라 위 exact 구조와 allowlist를 별도 승인받은 뒤 실행한다.
- 승인 문구 예시: `DSM 일반 컨테이너 전환 승인`
- **승인 기록**: 2026-07-21 사용자 `DSM 일반 컨테이너 전환 승인`
- **상태**: 구조·문서 링크 전환, Obsidian cache 복구와 최종 검증 완료

## Obsidian cache 정체 복구 보완 계획 — 2026-07-21

### 확인된 현상

- 일반 컨테이너와 `Current`·`Planning` junction, Overview 8개 링크는 정상이다.
- Obsidian 1.12.7은 전환 전 IndexedDB cache를 읽으며 2분 이상 `캐시 불러오는 중...`에 머문다. 현재 Vault 파일은 Overview 1개, Current 4개, Planning 4개뿐이고 junction loop는 없다.
- 플레이북에서 `obsidian|indexeddb|cache|quick switcher|node_modules` 일치 record는 찾지 못했다.
- Computer Use helper는 일시적으로 active request에 걸렸으나 kernel reset 후 회복됐다. `Alt+F4`, UI 닫기 버튼, 추가 대기는 모두 앱 종료·복구로 이어지지 않았고 Obsidian process 4개가 계속 실행 중이다.

### 복구 절차

1. 정상 종료를 다시 확인한다. 로딩 화면에서 종료가 계속 무시되는 경우에만 실행 파일 경로가 기존 Obsidian 설치 경로와 일치하는 process 4개를 강제 종료하고 모두 종료됐는지 확인한다.
2. 단일 등록 Vault가 `C:\AiWiki`인지 다시 확인한다.
3. 기존 IndexedDB LevelDB directory를 삭제하지 않고 exact backup 경로로 이동한다.
4. Obsidian을 다시 실행해 새 cache가 생성되고 Vault가 정상 로드되는지 확인한다.
5. Settings UI가 접근 가능해지면 더 이상 필요하지 않은 제외 필터 11개를 UI에서 제거하고 `Rebuild vault cache`를 실행한다.
6. Quick Switcher에서 Overview·현재 architecture는 검색되고 `node_modules`는 검색되지 않는지 확인한다.
7. 실패하면 새 cache를 보존한 뒤 기존 backup을 원래 경로로 복원하고 중단한다.
8. 검증된 해결을 `error-resolution-playbook.md`에 중복 없이 기록한다.

### 추가 exact writable allowlist

- 이동 전 cache: `C:\Users\jemie\AppData\Roaming\obsidian\IndexedDB\app_obsidian.md_0.indexeddb.leveldb`
- 이동 후 backup: `C:\Users\jemie\AppData\Roaming\obsidian\IndexedDB\app_obsidian.md_0.indexeddb.leveldb.pre-dsm-20260721`
- 새로 생성되는 cache: `C:\Users\jemie\AppData\Roaming\obsidian\IndexedDB\app_obsidian.md_0.indexeddb.leveldb`
- 해결 기록: `C:\DEV\.ai\memory\error-resolution-playbook.md`

### 안전 경계와 승인

- cache directory는 삭제하지 않고 같은 parent 아래 exact backup 경로로만 이동한다.
- 강제 종료는 현재 `캐시 불러오는 중...` 창의 Obsidian process에만 한정하며, editable workspace가 로드된 경우 수행하지 않는다.
- `C:\AiWiki`의 문서와 junction target, 제품 source, Git, DB, Docker, Firebase는 변경하지 않는다.
- 단일 Vault·cache 경로 또는 process 종료 상태가 예상과 다르면 즉시 중단한다.
- 승인 문구: `Obsidian cache 복구 승인`
- **승인 기록**: 2026-07-21 사용자 `진행`을 직전 요청한 `Obsidian cache 복구 승인`으로 해석
- **상태**: 승인·실행·검증 완료

### 실행·검증 결과 — 2026-07-22

- 전환 전 IndexedDB cache를 삭제하지 않고 `app_obsidian.md_0.indexeddb.leveldb.pre-dsm-20260721`로 이동했으며, Obsidian 재실행 후 새 cache와 editable workspace가 정상 생성됐다. 기존 backup은 그대로 보존했다.
- 사용자 action-time 승인에 따라 obsolete 제외 필터 11개를 Settings UI에서 제거하고 보관함 cache를 재구축했다. `C:\AiWiki\.obsidian\app.json` readback은 `userIgnoreFilters: null`이다.
- Quick Switcher 양성 검색에서 `Overview`와 `current-project-architecture`가 현재 DSM 경로로 검색됐다. 음성 검색 `node_modules`, `AGENTS.md`, `superpowers`는 기존 파일 결과 없이 새 파일 생성 옵션만 표시됐다.
- `DSM`은 `LinkType`이 없는 일반 directory이고, `Current`와 `Planning`은 각각 `C:\DEV\.ai\docs`, `C:\DEV\Planing Document`를 가리키는 junction이다. 과거 `DSM-Current`와 root의 `DSM Overview.md`는 존재하지 않는다.
- Overview internal link 8개는 모두 존재하며 노출 Markdown은 Overview 1개, Current 4개, Planning 4개의 총 9개다. 기획 문서 4개도 새 Current architecture 링크를 사용한다.
- 전체 working tree의 `git diff --check`가 exit 0으로 통과했다. 기존 LF→CRLF 안내 외 whitespace 오류는 없다.
- 재사용 가능한 복구 절차를 `ER-20260722-001` `VERIFIED` record로 `error-resolution-playbook.md`에 추가했다.
- 제품 코드, DB, Docker, Firebase와 Git stage·commit·push는 이 복구 작업에서 변경하지 않았다.

# 누적 작업 Git checkpoint 계획 — 2026-07-25

## 범위와 승인

- 대상은 사용자에게 보고한 현재 working tree 전체다. `git status --porcelain=v1 -uall` 기준 tracked 수정 34개와 untracked 실제 파일 45개이며 staged 파일은 없었다.
- 포함 범위는 agent·audit·memory·architecture 문서, notification 12B backend·migration·Docker 설정, Front Phase 1 prototype, design reference와 v1.3 기획 문서다.
- ignore된 `DSM_Back/.env`, `node_modules`, memory recovery backup과 생성물은 포함하지 않는다.
- Git write는 `codex/m12b-front-prototype-checkpoint` branch 생성, 전체 snapshot stage, commit, `origin` push로 한정한다. main 직접 push, PR, merge, force-push와 deploy는 수행하지 않는다.
- **승인 기록**: 2026-07-25 사용자 `1번 진행해`를 직전 제시한 “현재 작업 트리 전체 검토 후 commit·push” 승인으로 해석한다.

## publish 전 검증

- 실제 credential pattern 검사에서 placeholder와 환경변수 참조 외 비밀값은 발견되지 않았다. `DSM_Back/.env`는 Git ignore 상태다.
- backend unit 22 suites·198 tests와 e2e 1 suite·2 tests가 fresh exit 0으로 통과했다.
- Nest build, Prisma validate, Front TypeScript `--noEmit --incremental false`, `git diff --check`가 통과했다.
- Front `expo lint`는 ESLint config가 없어 자동 설치를 시도했고 sandbox network에서 중단됐다. 승인 범위를 확대해 lint config를 생성하지 않았으며 이번 checkpoint의 미실행 제한으로 남긴다.
- Docker Engine은 현재 비가동이므로 실제 local DB·FCM runtime은 이번 publish에서 재검증하지 않았다. 기존 12C·sandbox gate를 유지한다.
- Windows PowerShell `npm.ps1` 차단과 managed sandbox Jest Temp `EPERM` 해결은 `ER-20260725-001`, `ER-20260725-002`로 기록했다.
- **상태**: 승인·범위 검토·검증 완료. `codex/m12b-front-prototype-checkpoint` branch에 checkpoint commit `743fb2b`를 생성해 `origin` push 완료. PR·merge는 요청 범위가 아니므로 미실행.

# Front secure session·REST client 실행 체크포인트 — 2026-07-25

- 승인된 상세 계획: `docs/superpowers/plans/2026-07-25-front-secure-session-rest-client.md`
- 격리 브랜치/worktree: `codex/front-secure-session-rest-client`,
  `C:\DEV\.worktrees\front-secure-session-rest-client`
- Task 1~17 구현·로컬 커밋·독립 검토 완료. Task 18 fix round 2 진행 중.
  - Backend: onboarding timestamp schema/migration, current-user service/controller,
    strict CORS parser/bootstrap/config.
  - Front: Expo SecureStore/Jest/ESLint 기반, strict API URL, safe `ApiError`,
    auth response validators, one-attempt JSON transport, public auth API,
    rejection-safe token-store coordinator, verified-clear Native SecureStore adapter,
    reload 시 로그아웃되는 Web module-memory token store, authenticated client.
- 독립 검토 수정 라운드:
  - Task 10: bracketed IPv6 loopback과 빈 query/fragment delimiter 보완.
  - Task 12: whitespace-only refresh-token segment 보완.
  - Task 13: non-2xx body-read 오류와 nullish rejection 분류 보완.
- Task 15에서 refresh-token storage 작업을 단일 queue로 직렬화하고,
  write 전후 epoch 검증·stale write 정리·logout read-and-clear 순서를 고정했다.
  비동기 race test는 physical write 시작 signal 후 epoch를 바꾸도록 동기화했다.
- Task 16에서 versioned SecureStore key와 logout tombstone을 적용하고, delete 후
  null 검증 실패 시 tombstone write/readback으로 강제 로그아웃 상태를 확인한다.
  native rejection은 기존 `ApiError` 여부와 무관하게 고정 storage error로 정규화한다.
- Task 17은 브라우저 저장소를 사용하지 않는 module memory store로 구현했다. 같은
  module의 인스턴스는 상태를 공유하고 `clear()`는 `null`, module reload는 빈 상태다.
  독립 검토는 `CLEAN`이었다.
- Task 18은 current access token 주입, 최초 `401` refresh single-flight, 원 요청당
  최대 1회 replay와 replay `401` session 종료 callback을 구현했다. 늦게 도착한
  동일 token generation의 `401`은 마지막 성공 refresh 결과를 재사용하며, 동기
  refresh throw도 tracked promise를 오염시키지 않는다. 독립 검토 P1/P2는 수정
  라운드 1에서 `ADDRESSED`됐지만 supplemental review가 logout/account-switch 뒤
  old-session token replay 가능성을 새 `Important`로 확인해 라운드 2를 진행한다.
- 전체 Front 검증: Jest 9 suites/72 tests, `expo lint`, TypeScript 통과.
- Prisma migration 파일은 생성·검증만 했으며 실제 개발 DB에는 미적용.
  migration 적용은 별도 action-time 승인 대상이다.
- Front dependency audit 55건(critical 1 포함)은 자동/force fix 없이 별도
  dependency-security triage로 이관한다.
- 현재 구현 단계: Task 18 fix round 2.
- Task 18 검토가 닫힌 뒤 다음 구현 시작점: Task 19 session state machine.
- 원격 push, PR, merge, 배포는 수행하지 않았다.
