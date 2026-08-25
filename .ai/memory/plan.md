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

# 오프라인 학습 사이트 계획 — 2026-08-08

## 목표와 현재 상태

- 저장소 원본을 생략·리팩터링하지 않고 개발 1년 차가 학습할 수 있는 offline multi-page HTML 사이트를 만든다.
- 조사, root·pilot 선택, 시각 디자인·서면 명세 승인과 Pilot A 상세 구현 계획 작성까지 완료했다. HTML, generator, verifier, CSS, JavaScript와 diagram은 생성하지 않았다.
- 전체 조사 보고서: `.ai/docs/2026-08-08-offline-learning-site-project-analysis.md`.
- 기본 조사 checkout은 `C:\DEV`, branch `codex/m12b-front-prototype-checkpoint`, HEAD `960f02b`다.
- 별도 clean worktree `C:\DEV\.worktrees\front-secure-session-rest-client`, branch `codex/front-secure-session-rest-client`, HEAD `bb712ba`는 corpus에서 제외하며, 사용자는 root `960f02b`를 원본 기준으로 선택했다.

## 조사 기준선

- 기본 제외 directory: `.git` 299 files, `.worktrees` 84,857, 현재 두 `node_modules` 69,536, `DSM_Back/dist` 151, `DSM_Front/.expo` 5.
- 기본 제외 뒤 211 files.
- application text 후보: 124 files, 13,168 lines.
  - `DSM_Back`: 88 files, 8,787 lines.
  - `DSM_Front`: 36 files, 4,381 lines.
- repository support: 55 files, 14,652 lines. 현재 문서는 설명 근거로만 사용하고 agent/audit/backup/과거 plan은 원본 code page에서 제외한다.
- generated lock: 2 files, 21,306 lines.
- media/binary: 29 files.
- sensitive: `DSM_Back/.env` 1 file. 내용·값 비노출, HTML 제외.
- 알려진 provider token 형식과 private-key block 0. credential-assignment heuristic은 5 files·6 matches이며 실제 `.env` 외 문서·test·example 후보는 포함 전 재검토한다.
- 기존 working tree 변경 `.ai/docs/2026-07-15-current-project-architecture.md`는 보존하고 수정하지 않는다.

## 권장 architecture

- 접근 A인 Node.js built-in 기반 정적 generator + verifier를 권장한다.
- output: `learning-site/index.html`, `architecture.html`, `concepts/`, `features/`, `files/`, `exercises/`, `diagrams/`, `assets/`.
- tooling: `tools/learning-site/`의 manifest/generator/verifier.
- remote CDN, remote fetch와 runtime server dependency를 금지한다. `file://`에서 열려야 한다.
- original code와 AI explanation은 별도 DOM region·색·label로 구분한다.
- diagram은 inline pure SVG를 기본으로 하고 confirmed edge=solid, inferred edge=dashed, unknown=`확인 필요` label로 구분한다.
- code display는 HTML escape 외 원문을 바꾸지 않는다. syntax token text를 재결합한 값, logical lines, original bytes SHA-256와 line-ending metadata를 검증한다.
- search data는 local JavaScript로 제공하고 read state·theme은 localStorage만 사용한다.

## 대안

1. 수동 multi-page 작성: 초기 진입은 빠르지만 124 files에서 누락·escape·link·code drift 위험이 높아 비권장.
2. offline SPA bundle: search/state는 쉽지만 `file://` deep-link와 multi-page 요구, 초기 bundle 크기 때문에 2순위.

## 권장 pilot 묶음

- A 승인: Task 변경 → 점수 재계산 + 알림 예약 상태 동기화 15 files.
- B: Social Auth와 refresh rotation 13 files.
- C: Expo 제품 prototype 13 files.
- exact file 목록과 선택 근거는 조사 보고서 11절을 따른다.

## 마일스톤

1. [x] M0 root checkout 전체 file inventory, line count, stack, entrypoint, module, sensitive/generated/excluded 분류.
2. [x] M1 source checkout과 pilot 10~20 files 사용자 선택.
3. [x] M2 정보 구조·visual concept·diagram language 설계 제안, 사용자 승인, workspace asset·서면 명세 고정.
4. [ ] M3 generator/verifier와 source manifest 최소 기반. implementation source는 1~2 files씩 수정·검증한다.
5. [ ] M4 common offline template, CSS/JS와 index/architecture skeleton.
6. [ ] M5 승인된 pilot batch 생성. content batch는 사용자 요구에 따라 10~20 source files로 제한한다.
7. [ ] M6 pilot source↔HTML lines/SHA/link/search/mobile/dark/diagram 검증과 사용자 승인.
8. [ ] M7 나머지 files를 10~20개씩 생성하고 각 batch 뒤 processed/remaining/missing을 보고한다.
9. [ ] M8 전체 navigation/search/read-state/diagram zoom 통합.
10. [ ] M9 전체 source 일치 verifier와 final verification report 생성.

## 다음 단계 exact writable allowlist

승인된 design과 상세 구현 계획을 기록한 단계의 writable allowlist다.

- `C:\DEV\docs\superpowers\specs\2026-08-08-offline-learning-site-design.md`
- `C:\DEV\docs\superpowers\specs\assets\offline-learning-site\01-project-map.png`
- `C:\DEV\docs\superpowers\specs\assets\offline-learning-site\02-task-architecture.png`
- `C:\DEV\docs\superpowers\specs\assets\offline-learning-site\03-file-study-desktop.png`
- `C:\DEV\docs\superpowers\specs\assets\offline-learning-site\04-file-study-mobile.png`
- `C:\DEV\docs\superpowers\plans\2026-08-08-offline-learning-site-pilot-a.md`
- `.ai/memory/plan.md`, `context.md`, `checklist.md` 상태 갱신

## 승인 전 안전 경계

- `learning-site/`, `tools/learning-site/`와 HTML/CSS/JavaScript/SVG 생성 금지.
- 원본 application source, test, config 수정 금지.
- `.env` 내용 조회·노출 금지.
- `.worktrees`를 원본으로 포함하거나 중복 처리 금지.
- 기존 dirty architecture document 수정 금지.
- dependency 설치, network fetch, Git stage·commit·push 금지.

## 승인 gate

- source checkout과 pilot 묶음 선택, visual design 제안·승인은 완료했다.
- 2026-08-08 사용자 `명세 승인`으로 서면 디자인 명세 검토 gate를 통과했다.
- 상세 구현 계획은 `docs/superpowers/plans/2026-08-08-offline-learning-site-pilot-a.md`에 27 tasks로 작성했다.
- 사용자가 실행 방식과 계획을 승인하기 전에는 HTML/generator/verifier를 구현하지 않는다. Git write는 실행 승인과 별도의 명시 승인이 필요하다.

# 외부 PC setup·handoff 문서 계획 — 2026-08-08

## 목표와 승인

- 외부 PC에서 clone 직후 올바른 branch를 선택하고 로컬 환경을 재구성한 뒤, 실제 Git·memory 기준으로 현재 진척도와 다음 작업을 확인해 안전하게 재개할 수 있는 단일 문서를 만든다.
- 최종 산출물은 root `EXTERNAL_PC_SETUP_AND_HANDOFF.md`다.
- 2026-08-08 사용자 `ㄱ`을 root 문서 접근과 설계 명세 진행 승인으로 기록한다.
- 설계 명세: `docs/superpowers/specs/2026-08-08-external-pc-setup-and-handoff-design.md`.

## 설계 계약

- 문서는 확인일 기준 branch·commit snapshot과 외부 PC에서 다시 계산하는 Git·memory 명령을 함께 제공한다.
- `main`이 최신 개발 상태가 아님을 명시하고 기본 재개 branch를 `origin/codex/front-secure-session-rest-client`로 안내한다.
- setup, 환경변수 이름, DB migration, 검증, 현재 완료·진행·미구현 상태, 다음 작업, 승인 gate, Git으로 복원되지 않는 항목과 Windows 복구 절차를 한 파일에 포함한다.
- 실제 secret·credential·token·private key와 `.env` 내용은 조회·기록하지 않는다.
- product source·test·config, 기존 offline learning-site 작업, dirty architecture 문서는 수정하지 않는다.
- Git stage·commit·push와 실제 dependency·Docker·DB·Firebase 실행은 수행하지 않는다.

## 단계와 exact writable allowlist

1. [x] 접근 선택과 설계 승인.
2. [x] 설계 명세 작성·자체 검토.
   - `C:\DEV\docs\superpowers\specs\2026-08-08-external-pc-setup-and-handoff-design.md`
   - `C:\DEV\.ai\memory\plan.md`
3. [x] 사용자 설계 명세 검토.
4. [x] 상세 구현 계획 작성·자체 검토.
   - `C:\DEV\docs\superpowers\plans\2026-08-08-external-pc-setup-and-handoff.md`
5. [x] 최종 root handoff 문서 작성·검증.
   - `C:\DEV\EXTERNAL_PC_SETUP_AND_HANDOFF.md`
6. [x] memory 종료 갱신과 기존 변경 보존 재검증.

## 완료 결과

- 2026-08-08 사용자 선택 `2`로 상세 계획의 현재 session inline 실행을 승인받았다.
- root 문서는 외부 PC setup, Git으로 복원되지 않는 항목, branch·commit snapshot, 검증 명령, 완료·미완료 상태와 승인 Gate를 16개 번호 섹션으로 통합했다.
- 원격 재검증: `origin/main=2e25d98`, checkpoint `960f02b`, 최신 개발 branch `bb712ba`, `origin/main...feature=0/59`, 상세 계획 33 tasks.
- 즉시 다음 작업은 Front **Task 20 React session context**이며 Task 31 change-gate 뒤에 M12C로 진행한다.
- package scripts·환경변수 이름·Compose·migration·내부 링크, trailing whitespace와 secret-like pattern 검사를 통과했다.
- `.env`·credential은 조회하지 않았고 dependency·Docker·DB·Firebase 실행과 Git stage·commit·push는 수행하지 않았다.
- 기존 dirty architecture·offline learning-site·memory 변경은 되돌리거나 덮어쓰지 않았다.

## 실행 중 유지한 경계

- root 문서는 사용자 설계 승인과 inline 실행 승인 뒤에만 생성했다.
- 기존 memory·analysis·architecture 변경을 되돌리거나 덮어쓰지 않는다.
- `.env`, ADC, OAuth token, signing key 접근 금지.
- branch checkout·Git write·dependency install·service 실행·migration 적용 금지.
- **선택 승인 기록**: 2026-08-08 사용자 `A ㄱ`을 직전 제시한 권장 기본값인 `C:\DEV` root checkout + pilot A 15 files 승인으로 기록한다. source 확인 뒤 pilot의 사실 기반 명칭은 “Task 변경 → 점수 재계산 + 알림 예약 상태 동기화”로 정정했다.
- **과거 gate 해소**: source·pilot·visual design·서면 명세·상세 구현 계획 승인 뒤 사용자 `2`로 current root inline/no-Git 실행을 승인해 HTML/generator/verifier 구현 금지를 해소했다.

## Pilot A source 확인에 따른 사실 정정 — 2026-08-08

- `TasksService`는 `NotificationsService`를 호출하지 않는다.
- `create/update/remove/complete`는 `Prisma.$transaction`을 Serializable isolation으로 실행한다.
- transaction 안에서 `Task`, `NotificationSchedule`, `NotificationDelivery`를 Prisma client로 직접 변경하고 `ScoresService.recompute()`를 같은 client와 함께 호출한다.
- 알림 schedule/delivery 변경은 mutation 종류와 일정 관련 변경 여부에 따른 조건부 side effect다.
- `NotificationsService`는 FCM token register/revoke 경계이며 Task mutation의 직접 호출 경로가 아니다.
- 따라서 pilot A 문서와 diagram은 실제 FCM 발송을 다루지 않고, Task mutation과 점수·알림 예약 상태의 원자 동기화까지만 다룬다.

## 디자인·서면 명세 승인과 상세 구현 계획 — Pilot A 승인 완료

- visual direction: technical field notebook + code evidence map.
- true white learning surface, deep ink navigation/code, lime confirmed relationship, amber inferred/confirmation-needed, cool gray border.
- original code는 dark panel의 `원본 코드 · 변경 없음`, AI content는 white panel의 `AI 설명 · 원본 밖`으로 분리한다.
- desktop file page는 62/38 split, mobile은 code/explanation mode switch + bottom explanation sheet다.
- 사용자 `ㄱ`으로 project map, Task architecture, desktop file study, mobile file study의 네 정정 concept을 승인했다.
- 승인본은 `docs/superpowers/specs/assets/offline-learning-site/`의 `01-project-map.png`~`04-file-study-mobile.png`로 복사했다.
- 서면 명세는 `docs/superpowers/specs/2026-08-08-offline-learning-site-design.md`다.
- 사용자 `명세 승인`으로 서면 명세를 승인했다.
- source-like colored bars와 image-generated line-number artifacts는 layout placeholder일 뿐 code/fact spec이 아니다. 실제 구현은 generator가 root source를 읽어 line number와 text를 만든다.
- 홈 학습 경로는 Task 변경에서 점수 재계산과 알림 예약 상태 동기화로 분기한다.
- architecture diagram은 conditional NotificationSchedule/NotificationDelivery 관계를 label하고 NotificationsService·FCM send를 포함하지 않는다.
- `superpowers:writing-plans`로 Pilot A 구현 계획 `docs/superpowers/plans/2026-08-08-offline-learning-site-pilot-a.md`를 작성했다. Node built-in tooling 12 tasks, 1~2-file output checkpoints, full verifier·Browser QA와 memory closure를 포함한 총 27 tasks다.
- 2026-08-08 사용자 `1 ㄱ`으로 Subagent-Driven 실행 방식을 승인했으나 Git write는 승인하지 않았다.
- 실행 preflight에서 현재 `C:\DEV`가 linked worktree가 아닌 일반 checkout이고, Subagent-Driven이 요구하는 격리 worktree·task commit은 Git write 승인 없이는 만들 수 없음을 확인했다.
- `.ai/agents/README.md`가 열거하는 역할 중 `tools/learning-site/**`, `learning-site/**`를 수정할 수 있는 역할이 없으며 `tooling-developer.md`도 존재하지 않는다. 역할 계약상 backend/frontend 역할로 범위를 확장할 수 없어 implementer spawn을 시작하지 않았다.
- 사용자 `2`로 current root inline/no-Git 실행을 승인했다. Git stage·commit·push·branch/worktree는 실행하지 않았다.
- Node built-in generator/verifier, source tokenizer·symbol index, 정적 page renderer, local CSS/JS runtime과 Pilot A 15개 원본 페이지를 구현했다. `learning-site/`는 21 HTML pages + 3 assets + `verification-report.json` + `qa-report.md`로 구성된다.
- 전체 Node test 48개가 통과했다. verifier는 15개 source의 text/SHA-256/bytes/logical lines/line ending, 510 local links/fragments, offline dependency, search/progress와 금지 관계를 PASS로 기록했다. processed=15, remaining=109, missing=0, public exclusion metadata=9다.
- `DSM_Back`·`DSM_Front` Git diff는 비어 있고 `.env` 내용은 조회하지 않았다.
- 사용자 승인으로 `C:\DEV\learning-site`만 제공하는 임시 localhost 서버를 열어 1440×900·390×844 인앱 Chromium QA를 완료했다. 검색·theme/read persistence·설명 탭·mobile sheets·diagram zoom/reset/keyboard/pointer drag·architecture 금지 노드를 확인했다.
- Browser QA에서 hidden notice, desktop 읽음 제어, 검색 metadata 간격, mobile bottom sheets, 한국어 제목 줄바꿈, mobile home 여백 결함을 찾아 테스트를 먼저 추가한 뒤 수정했다. 상세 결과는 `learning-site/qa-report.md`다.
- Pilot A 구현·정적 검증·브라우저 QA를 완료했고, 2026-08-09 사용자 `Pilot A 승인`으로 시범 결과 검토 gate를 통과했다.
- 남은 109 files는 한 번에 생성하지 않는다. 다음 묶음은 10~20개 파일의 독립 기능 단위로 범위를 선택하고, 별도 design spec·상세 계획·사용자 승인 뒤 생성한다.
- 다음 범위 후보는 B `Social Auth와 refresh rotation` 13개와 C `Expo 제품 prototype` 13개다. 현재는 후보 비교·사용자 선택 단계이며 어떤 페이지도 추가 생성하지 않는다.

## 오프라인 학습 사이트 Batch B 설계 탐색 — 2026-08-09

- 사용자 `B ㄱ`으로 다음 묶음을 `Social Auth와 refresh rotation`으로 선택했다. 이 승인은 범위 설계 진행 승인이지 HTML 생성 승인이 아니다.
- 실제 root source 기준 신규 처리 후보는 아래 13개·883줄이며 Pilot A와 중복되지 않는다.
  1. `DSM_Back/src/main.ts` — 11줄
  2. `DSM_Back/src/app.bootstrap.ts` — 58줄
  3. `DSM_Back/src/auth/auth.module.ts` — 13줄
  4. `DSM_Back/src/auth/auth.controller.ts` — 50줄
  5. `DSM_Back/src/auth/auth.service.ts` — 254줄
  6. `DSM_Back/src/auth/guards/jwt-auth.guard.ts` — 49줄
  7. `DSM_Back/src/auth/dto/social-login.dto.ts` — 13줄
  8. `DSM_Back/src/auth/dto/refresh-token.dto.ts` — 7줄
  9. `DSM_Back/src/auth/dto/token-response.dto.ts` — 4줄
  10. `DSM_Back/src/auth/types/jwt-payload.type.ts` — 4줄
  11. `DSM_Back/src/auth/types/social-profile.type.ts` — 6줄
  12. `DSM_Back/src/auth/auth.controller.spec.ts` — 67줄
  13. `DSM_Back/src/auth/auth.service.spec.ts` — 347줄
- 기존 Pilot A의 `app.module.ts`, `schema.prisma`, `prisma.service.ts`는 새 처리 수에 중복 산입하지 않고 관계 근거 링크로 재사용한다.
- 확인된 흐름은 `main.ts → configureApp() → AuthController → AuthService/JwtAuthGuard`다. social login은 Google/Kakao token 검증 뒤 social account 조회·user 생성·token 발급으로 이어지고, Apple은 현재 `ConflictException`으로 명시적 미구현이다.
- refresh는 `<recordId>.<secret>` 파싱, PK `findUnique`, bcrypt 비교, transaction 안 conditional `updateMany` 단일 승자, replacement token 생성 순서다. logout은 access guard 뒤 사용자 소유 refresh token만 revoke하며 malformed/missing/mismatch는 no-op이다.
- `/auth/me`는 현재 checkout에서 `userId`만 반환한다. global bootstrap은 `ValidationPipe`, `HttpExceptionFilter`, `origin: true`·`credentials: true` CORS를 설정하므로 현재 사실과 위험을 그대로 설명한다.
- 다음 단계는 같은 13개 안에서 균형형·refresh 심화형·social login 심화형 중 설명 가중치를 정하고, design spec과 상세 계획을 별도 승인받는 것이다. 승인 전에는 manifest/content/page/output을 수정하지 않는다.

### Batch B 설명 가중치·생성 구조 제안

- 2026-08-09 사용자 선택 `1`로 균형형을 선택했다. Social login, JWT guard, refresh rotation, logout을 고르게 설명하되 `auth.service.ts`와 `auth.service.spec.ts`는 복잡도에 따라 가장 깊게 다룬다.
- 누적 생성 방식은 다음 세 대안을 비교한다.
  1. **stage-aware 누적 batch registry — 권장**: `pilot-a`와 `batch-b`를 별도 정의하고 Batch B 모델은 A∪B를 처리 상태로 계산한다. Pilot A만 재생성하는 경로와 누적 28-file 경로를 모두 재현할 수 있다.
  2. **단일 processed 28-file 목록**: 구현은 단순하지만 Pilot A 기준선 15/109를 독립 재현할 수 없다.
  3. **Batch B output overlay**: 기존 산출물 위에 13개만 수동 추가해 변경량은 작지만 progress/search/verifier가 서로 다른 source of truth를 갖게 되어 비권장이다.
- 권장 정보 구조는 신규 source pages 13개와 overview pages 5개다.
  - `features/social-login.html`
  - `features/refresh-rotation.html`
  - `concepts/jwt-session.html`
  - `diagrams/auth-session-flow.html`
  - `exercises/auth-session.html`
- `index.html`에는 Pilot B 학습 경로를 추가하고, `architecture.html`의 기존 Task 근거 지도는 보존한 채 Auth 요약 카드와 새 diagram 링크만 추가한다.
- Batch B 생성 뒤 예상 누적 상태는 HTML 39개(기존 21 + source 13 + overview 5), processed 28, remaining 96, missing 0이다. 최종 수치는 생성·verifier 출력으로 다시 확정한다.
- 2026-08-09 사용자 `ㄱ`으로 위 stage-aware 누적 registry와 신규 overview 5개 정보 구조를 설계 1절로 승인했다. 이 승인은 구현 승인이 아니며, 나머지 설계 절과 written spec·상세 계획 승인 전에는 tooling이나 output을 수정하지 않는다.

### Batch B 설계 2절 제안 — 데이터 흐름·설명 경계·오류 표시

- **Social login 흐름**: `POST /auth/login` → global `ValidationPipe`와 DTO → controller → provider 검증 → `socialAccount` 조회 → 기존 사용자 재사용 또는 사용자·계정 생성 → access/refresh token 발급으로 설명한다. Google은 configured audience로 `verifyIdToken`, Kakao는 `/v2/user/me`, Apple은 현재 명시적 `ConflictException` 409다.
- **JWT guard 흐름**: Bearer token 추출 → JWT secret으로 검증 → `type === 'access'` 확인 → `request.user` 부착이다. 추출·검증·type 불일치는 모두 401 경계로 표시한다.
- **Refresh rotation 흐름**: `<recordId>.<secret>` 파싱 → PK `findUnique` → revoked/expiry/bcrypt 검증 → transaction 안 conditional `updateMany`로 단일 승자 결정 → replacement refresh 생성과 새 access token 서명 순서다. 동시 요청의 패자는 401이고, replacement 생성 실패는 transaction 전체 실패·rollback 근거를 spec test와 함께 제시한다. transaction을 Serializable로 설명하지 않는다.
- **Logout 흐름**: access guard가 사용자 identity를 확정한 뒤, 전달된 refresh token이 형식·소유권·secret 검증을 모두 만족할 때만 revoke한다. malformed/missing/mismatch는 현재 구현의 no-op으로 표시한다.
- **설명 층위**: 12세 비유는 access token을 짧은 출입증, refresh token을 공개 record id와 비밀 조각이 결합된 갱신 영수증으로 설명하고 DB에는 평문 secret 대신 hash가 저장됨을 밝힌다. junior 층위는 DTO validation, DI/module, provider verification, DB read/write, transaction/concurrency, guard를 정확한 용어로 연결한다. 원본 코드는 그대로 두고 AI 설명·line reference는 코드 바깥에 둔다.
- **사실 표시 규칙**: 확인된 실제 call/write는 solid, provider 분기·기존/신규 사용자·refresh 유효성·race 승패는 conditional, 실제 provider 계정 동작·배포 secret 설정·live provider 가용성은 `확인 필요`로 구분한다. raw secret/token 값은 diagram·search index·site data에 넣지 않는다.
- **명시할 위험·한계**: permissive CORS(`origin: true`, `credentials: true`), JWT secret의 `get` 사용, 첫 social login/user/nickname uniqueness 경합 가능성, Apple 미구현, Google/Kakao live 미검증, mock 기반 service spec의 통합 테스트 한계를 표시한다.
- 2026-08-09 사용자 `ㄱ`으로 위 Auth 데이터 흐름·설명 경계·오류 표시 규칙을 설계 2절로 승인했다. 구현 승인은 아니다.

### Batch B 설계 3절 제안 — 변경 범위·검증·완료 기준

- **Tooling 경계**: `manifest.mjs`는 `pilot-a`와 `batch-b` stage registry 및 누적 path 계산만 담당하고, Batch B 학습 문구·file guide·flow·exercise는 새 `content/batch-b.mjs`에 둔다. `generate.mjs`·`verify.mjs`·`lib/pages.mjs`는 선택된 stage model과 output registry를 소비하도록 확장하되 기존 Pilot A 재생성 계약을 보존한다. 새 표현에 필요한 최소 CSS/JS만 기존 asset source에 추가한다.
- **Output 경계**: 신규 source page 13개와 overview 5개를 생성하고 `index.html`, `architecture.html`, `assets/site-data.js`, verifier report를 Batch B 누적 상태로 재생성한다. 기존 Pilot A page는 같은 source에서 결정적으로 재생성하며 `DSM_Back/**`·`DSM_Front/**`는 수정하지 않는다.
- **TDD 순서**: 먼저 stage membership·15/109 및 28/96 재현·중복 거부 test, 13개 guide 완전성·금지 주장·raw secret 비노출 test, exact output registry·page copy test, Batch B verifier test를 실패 상태로 추가한다. 최소 구현 뒤 전체 test를 실행하고 실제 output은 test와 temporary-directory 생성이 통과한 뒤 갱신한다.
- **정적 검증**: corpus 124 files·13,168 lines 기준선을 유지하고 Batch B는 source fidelity 28개(text, SHA-256, bytes, logical lines, line ending), HTML 39개, processed 28, remaining 96, missing 0을 확인한다. 모든 local link/fragment, offline dependency, search/progress membership, source code의 runtime-data 비복제, 민감 경로·값 비노출을 fail-closed로 검사한다. 최종 숫자는 verifier 실제 출력으로 확정한다.
- **회귀 검증**: 기존 48 tests를 포함한 전체 suite와 새 Batch B tests가 모두 통과해야 하며, Pilot A 전용 생성·검증도 별도로 다시 통과해야 한다. `DSM_Back`·`DSM_Front` diff는 비어 있어야 하고 `.env`는 읽지 않는다.
- **Browser QA**: `C:\DEV\learning-site`만 제공하는 임시 localhost server에서 1440×900과 390×844로 home의 Batch B 경로, Auth 검색·필터, 대표 source page, social/refresh overview, diagram zoom·keyboard/pointer, exercise answer, theme/read persistence와 overflow를 확인한다. QA 후 server를 종료하고 port closed를 확인한다.
- **완료 보고**: 실제 source/page/test/link/progress 수치, known limitation, source diff·server 종료 상태를 batch report에 기록하고 사용자 Batch B 승인을 받는다. 그 승인 전에는 다음 batch를 시작하지 않는다.
- 2026-08-09 사용자 `ㄱ`으로 위 변경 범위·검증·완료 기준을 설계 3절로 승인했다. 이로써 대화형 설계 1~3절이 모두 승인됐다.
- 승인 내용을 `docs/superpowers/specs/2026-08-09-offline-learning-site-batch-b-design.md`에 written design spec으로 작성했다. placeholder, 수치·경로 일관성, 금지 주장, 범위 모호성을 자체 검토했고 controller spec과 refresh rollback의 test 근거 범위를 정확히 한정했다. `git diff --check`와 application source diff empty를 확인했다.
- 2026-08-09 사용자 `ㄱ`으로 written design spec을 승인했고 문서 상태를 상세 구현 계획 승인 대기로 갱신했다.
- `superpowers:writing-plans`로 `docs/superpowers/plans/2026-08-09-offline-learning-site-batch-b.md`를 작성했다. 14 tasks가 stage registry, Auth content, cumulative model, 5개 page, output registry, stage verifier, 전체 회귀, 최대 2-file source/output checkpoints, full report, Browser QA, scope 검증과 memory closure를 고정한다.
- 계획 자체 검토에서 spec coverage, placeholder, interface·renderer·test name·CLI option 일관성을 확인하고 `renderBatchBPath(model, outputPath)`와 Pilot/Batch별 full-verifier test name을 정정했다. `git diff --check`는 통과했고 application source diff는 비어 있다.
- 2026-08-09 사용자 `ㄱ`으로 Batch B 상세 구현 계획을 승인했다. current root inline/no-Git 실행 gate가 열렸으며 `superpowers:executing-plans`와 TDD로 14 tasks를 순서대로 수행한다.
- 실행 workspace는 사용자가 이미 선택한 일반 checkout `C:\DEV`다. 별도 worktree와 subagent는 사용하지 않고, 첫 구현 단계는 Task 1 stage registry의 failing test다.
- Git write는 별도 승인 전 수행하지 않는다. `DSM_Back/**`, `DSM_Front/**`, `.env`, dependency, network, DB·Docker·Firebase와 제품 service 금지는 유지한다.

### Batch B 구현·QA 완료 — 2026-08-09

- `pilot-a` 독립 재현과 `batch-b` 누적 A∪B membership을 지원하는 stage registry, 13개 Auth guide, 5개 Auth overview renderer, stage-aware generator/verifier와 fail-closed exposure 검사를 TDD로 구현했다.
- 실제 산출물은 HTML 39개, source page 28개, local asset 3개다. progress는 processed 28, remaining 96, missing 0, excluded metadata 9다.
- full verifier는 source fidelity, offline dependency, search/progress와 local link·fragment 903개를 모두 PASS로 기록했다. 전체 Node test는 66개, failure 0이다.
- exact source path·reason 조합만 허용하는 reviewed exposure gate를 추가했고 검토 record의 `reviewRequired`와 빈 symbol 목록은 유지했다. fixture token 검사는 filename substring과 독립된 visible literal을 분리한다.
- 인앱 Chromium 1440×900·390×844 QA에서 home Batch B, Auth 검색, source 학습 탭·읽음·theme, social/refresh/JWT overview, diagram 확대·방향키·reset, 6개 exercise와 mobile 설명·목차를 확인했다. console warning/error와 framework overlay는 없다.
- QA에서 exercise source link의 데스크톱 가로 넘침과 source SHA-256의 모바일 가로 넘침을 재현하고 각각 failing CSS contract test 뒤 최소 수정했다. 최종 document width는 exercise 1425/1440, mobile exercise 375/390, mobile source 375/390이다.
- `learning-site/qa-report.md`와 `verification-report.json`을 Batch B 실제 결과로 갱신했다. `DSM_Back/**`·`DSM_Front/**` diff는 비어 있고 `.env` output은 없으며 내용도 읽지 않았다. 임시 localhost server는 종료하고 port closed를 확인했다.
- Git stage·commit·push·branch/worktree는 실행하지 않았다. 2026-08-09 사용자 `Batch B 승인`으로 구현·검증·Browser QA 결과 gate를 통과했다. 다음 batch는 별도 범위 선택·명세·계획 승인 전 시작하지 않는다.

# AI CONTROL SYSTEM v5.1 프로젝트 통합 — 2026-08-15

## 목표

- 첨부된 `AI CONTROL SYSTEM v5.1 (Strict Architecture Edition)`의 개선 규칙을 현재 `.ai/system_prompt.md`에 프로젝트 맞춤형으로 선별 통합한다.
- 현재 프로젝트의 오류 해결 플레이북, memory backup 경계, 역할 기반 서브에이전트 계약과 적대적 검증 워크플로를 보존한다.
- 상충하거나 중복되는 규칙은 병렬로 남기지 않고 현재 SSOT 구조에 맞는 단일 규칙으로 정리한다.

## 사용자 승인과 현재 gate

- 사용자는 2026-08-15 `ㄱ`으로 **기존 v3.0 프로젝트 규칙 보존 + v5.1 호환 규칙 선별 통합** 방식을 선택했다.
- 사용자는 이어서 `ㄱ`으로 대화형 통합 설계를 승인했다.
- 사용자는 written design spec, 상세 구현 계획과 주 에이전트 inline/no-Git 실행을 순서대로 `ㄱ`으로 승인했다.
- Git stage·commit·push는 별도 승인 전 실행하지 않는다.

## 승인 설계

- `.ai/system_prompt.md`를 프로젝트 맞춤형 v5.1로 승격한다.
- 기본 memory는 `plan.md`, `context.md`, `checklist.md` 3개를 유지하고 오류 작업에서만 `error-resolution-playbook.md`를 추가로 읽는다. 첨부 원문의 `memory.md`는 새로 만들지 않는다.
- 한국어 응답, 보고 전 memory 동기화, 검증 가능한 목표, 단순성, 설계 선협의, 회귀 테스트·형제 경로 점검, 컨텍스트 복구, 커밋 메시지 품질과 checklist 기반 다음 작업 제안을 보강한다.
- 서브에이전트 규칙은 기존 역할 문서·exact writable allowlist·감사 독립성 계약을 유지하고, 실제 지원 모델 확인과 lowest sufficient profile 제안만 추가한다. 런타임 상위 지침과 사용자 승인 없이 서브에이전트를 생성하지 않는다.
- Windows/Docker와 긴 명령 규칙은 현재 DSM 환경에 적용되는 조건부 규칙으로 작성한다.
- memory 압축은 기존 `.ai/memory/README.md`와 `*.original.md` 복구 경계를 우선하며, 첨부 원문의 `.ai/archive/` 방식을 강제로 도입하지 않는다.

## 단계별 exact writable allowlist

1. 계획 기록: `.ai/memory/plan.md`, `.ai/memory/checklist.md`
2. written design spec: `docs/superpowers/specs/2026-08-15-ai-control-system-v5-1-integration-design.md`
3. 상세 구현 계획: `docs/superpowers/plans/2026-08-15-ai-control-system-v5-1-integration.md`
4. 구현: `.ai/system_prompt.md`
5. 종료 동기화: `.ai/memory/plan.md`, `.ai/memory/checklist.md`
6. 현재 운영 맥락이 바뀐 경우에만 별도 단계로 `.ai/memory/context.md`

## 성공 기준

- 기존 프로젝트 전용 안전 규칙이 삭제되거나 약화되지 않는다.
- v5.1에서 채택한 규칙은 현재 memory 파일명·역할·승인 gate와 모순되지 않는다.
- `memory.md`나 불필요한 `.ai/archive/` 구조를 새로 만들지 않는다.
- Markdown 구조, 내부 경로, 중복·상충 표현, placeholder, UTF-8과 `git diff --check`를 검증한다.
- 기존 dirty 변경과 제품 소스는 수정하지 않는다.

## Written design spec 상태

- `docs/superpowers/specs/2026-08-15-ai-control-system-v5-1-integration-design.md`를 작성했다.
- placeholder, 필수 절, 경로 존재, 충돌 용어 문맥, whitespace와 `git diff --check`를 자체 검토했다.
- 사용자는 2026-08-15 `ㄱ`으로 written design spec을 승인했다.
- `superpowers:writing-plans`로 `docs/superpowers/plans/2026-08-15-ai-control-system-v5-1-integration.md`를 작성했다. 상단 계약, 실행·서브에이전트 계약, 하단 품질·복구 계약, 전체 정적 검증, memory 종료 동기화의 5 tasks로 구성한다.
- 사용자는 상세 구현 계획과 주 에이전트 inline 실행을 승인했다. 역할 계약에 맞는 시스템 프롬프트 편집 서브에이전트가 없어 서브에이전트는 생성하지 않았다.

## 구현·검증 결과

- `.ai/system_prompt.md`를 `AI CONTROL SYSTEM v5.1 (DSM Project Adapted Edition)`으로 통합했다.
- 한국어·보고 전 memory 동기화, 검증 가능한 milestone, 구조적 설계 선승인, lowest-sufficient 서브에이전트 프로파일, memory 위생, 단순성·회귀 방지, 완료 보고·다음 작업, 커밋 메시지와 컨텍스트 복구 규칙을 추가했다.
- 기존 오류 해결 플레이북, backup 경계, exact writable allowlist, Context Compiler, 적대적 검증과 `ACCEPTED_RISK` 계약을 보존했다.
- `.ai/memory/memory.md`와 `.ai/archive/`는 생성하지 않았다. `context.md`의 제품·환경 snapshot은 바뀌지 않아 이번 종료 동기화에서 수정하지 않았다.
- 첫 patch는 기존 UTF-8 BOM 때문에 문맥 불일치로 변경 없이 중단됐다. BOM 존재를 확인한 뒤 BOM-aware 최소 patch로 제목을 갱신했고 최종 파일의 strict UTF-8과 BOM 보존을 검증했다.
- 필수 heading·계약 문자열, 부정 경계, Markdown 구조, strict UTF-8, `git diff --check`와 `DSM_Back/**`·`DSM_Front/**` diff empty를 확인했다.
- 기존 dirty 변경은 되돌리거나 덮어쓰지 않았고 dependency·network·DB·Docker·Firebase와 Git stage·commit·push는 실행하지 않았다.

# Git branch publish·동기화 계획 — 2026-08-25

## 목표와 현재 상태

- root branch `codex/m12b-front-prototype-checkpoint`의 tracked 수정 6개·untracked 89개를 검토해 `fsr/` worktree를 제외하고 의미별 커밋으로 publish한다.
- 별도 clean worktree `C:\DEV\fsr`의 `codex/front-secure-session-rest-client`는 원격보다 1 commit 앞선 상태이므로 해당 commit을 publish한다.
- `main`과 두 feature branch의 remote ref를 fetch하고, checkout된 worktree가 behind일 때만 fast-forward pull한다.
- 사용자는 2026-08-25 `진행해`로 직전 제안한 fetch → branch별 push → 필요한 `--ff-only` pull 순서를 승인했다.

## 커밋 그룹

1. `feat(learning-site): add offline study batches`
   - `.ai/docs/2026-08-08-offline-learning-site-project-analysis.md`
   - offline learning-site의 2 plans, 2 specs, 승인 PNG 4개
   - 사전 inventory에서 확인한 `learning-site/` 44 files와 `tools/learning-site/` 30 files
2. `docs(project): add handoff and AI workflow`
   - `EXTERNAL_PC_SETUP_AND_HANDOFF.md`
   - external-PC plan/spec, AI-control-system plan/spec
   - `.ai/system_prompt.md`, `.ai/docs/2026-07-15-current-project-architecture.md`
3. `docs(memory): sync project state`
   - `.ai/memory/plan.md`, `context.md`, `checklist.md`, `error-resolution-playbook.md`

## 실행·검증 계획

1. full remote fetch 뒤 branch별 ahead/behind를 재확인한다.
2. `C:\DEV\fsr`의 clean ahead-1 commit을 push한다.
3. root에서 learning-site Node tests·full verifier, backend unit/e2e/build, front TypeScript와 `git diff --check`를 실행한다.
4. 위 세 그룹을 명시적 pathspec으로만 stage·commit하고 각 staged diff를 확인한다.
5. root branch를 push한다.
6. checkout된 worktree가 behind일 때만 `git pull --ff-only`를 실행하고 최종 HEAD·upstream·status를 확인한다.

## 수정 경계와 승인 gate

- 실행 주체: 주 에이전트 직접 실행. 서브에이전트 없음.
- `C:\DEV\fsr` worktree directory 자체를 root commit에 포함하지 않는다.
- stash, reset, clean, force-push, merge, PR, branch/worktree 삭제와 checkout 전환은 금지한다.
- 원격 divergence, 테스트 실패, staged 범위 불일치가 있으면 자동 수정·rebase 없이 중단한다.
- 승인 상태: 사용자 실행 승인 완료.

## 실행·검증 결과

- `git fetch --all --prune` 완료. 새 remote branch `origin/codex/integration-main-review`를 확인했으며 기존 대상 branch divergence는 없었다.
- learning-site Node tests 66개와 full verifier 28 sources가 PASS했다.
- backend unit 22 suites·198 tests와 e2e 1 suite·2 tests는 sandbox Temp cache `EPERM` 뒤 `ER-20260725-002` 절차로 동일 명령을 sandbox 밖에서 재실행해 exit 0을 확인했다.
- backend Nest build와 front TypeScript `--noEmit --incremental false`, staged `git diff --check`가 통과했다.
- root commit `43145b6` `feat(learning-site): add offline study batches`와 `c79a042` `docs(project): add handoff and AI workflow`를 생성해 `origin/codex/m12b-front-prototype-checkpoint`에 push했다.
- `C:\DEV\fsr`의 commit `2a4e991`을 `origin/codex/front-secure-session-rest-client`에 push했다.
- root, `fsr`, `main`의 최종 ahead/behind는 모두 `0/0`이므로 pull은 실행하지 않았다.
- `fsr/` worktree는 root commit에서 제외했고 stash, reset, clean, force-push, merge, PR, branch/worktree 삭제와 checkout 전환은 수행하지 않았다.
- 이 memory 동기화는 승인된 publish 작업의 마지막 closure commit으로 기록한다.
