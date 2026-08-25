# 오류 해결 플레이북

## 목적과 책임 경계

이 문서는 같은 증상과 root cause가 다시 나타날 때 검증된 해결 절차를 재사용하기 위한 조건부 지식 저장소다.

- `.ai/audits/**/findings.jsonl`: finding의 원문 증거, 심각도, 상태 전이, fix-recheck와 위험 수용 이력
- `.ai/memory/plan.md`: 작업별 계획, 승인 범위, 실행·검증 완료 기록
- 이 문서: 재사용 가능한 증상 식별, 적용 조건, 해결 절차, 검증과 재발 방지 지식

감사 원장과 이 문서가 충돌하면 현재 소스·테스트·Git diff를 먼저 확인하고 불일치를 보고한다. 감사 원장의 과거 fix가 이후 정책으로 대체됐다면 이 문서에는 현재 canonical 해결책을 기록한다.

## 빠른 사용 절차

1. 새 진단 전에 아래 index와 본문을 error signature, component, 예외 코드와 tag로 검색한다.
2. 증상만 비슷한지, 환경·버전·root cause와 사전조건까지 같은지 확인한다.
3. 조건이 맞는 `VERIFIED` record만 현재 승인된 exact writable allowlist 안에서 적용한다.
4. record에 적힌 검증을 현재 checkout에서 다시 실행한다. 과거 통과 기록은 현재 검증을 대신하지 않는다.
5. `MITIGATION_ONLY`는 해결 완료가 아니다. 완화책, 활성화 gate와 잔여 위험만 따른다.
6. 맞는 record가 없으면 새로 진단한다. 해결과 필요한 재검증이 끝난 뒤 record를 추가한다.
7. 기존 해결책이 무효화되면 삭제하지 않고 `DEPRECATED`로 전이해 대체 record를 연결한다.

## 기록 규칙

- ID 형식: `ER-YYYYMMDD-NNN`
- 상태: `VERIFIED | MITIGATION_ONLY | DEPRECATED`
- 같은 root cause는 새 ID를 만들지 않고 기존 record의 적용 조건·절차·검증일을 갱신한다.
- 비밀값, 실제 credential, FCM token, refresh token, 사용자 식별자와 운영 데이터는 기록하지 않는다.
- 로그와 명령 예시는 반드시 placeholder 또는 비식별 값만 사용한다.
- `VERIFIED`에는 통과한 테스트나 `RECHECKED` 등 재현 가능한 근거가 있어야 한다.
- 외부 서비스·실기기·운영 환경을 실행하지 않았다면 잔여 검증으로 명시한다.

## 검색 index

| Resolution ID | 상태 | Component / tags | 대표 증상 |
|---|---|---|---|
| `ER-20260715-001` | `VERIFIED` | Auth, Google OAuth, audience | Google ID token이 의도한 client용인지 강제하지 않음 |
| `ER-20260715-002` | `VERIFIED` | Auth, refresh token, race | 동일 refresh token 동시 요청이 둘 다 성공할 수 있음 |
| `ER-20260715-003` | `VERIFIED` | Task, Category, authorization | 다른 사용자의 category를 Task에 연결할 수 있음 |
| `ER-20260715-004` | `VERIFIED` | Prisma, Serializable, `P2034` | Task와 score가 경합 시 stale 상태로 commit될 수 있음 |
| `ER-20260715-005` | `VERIFIED` | Expo, TypeScript, CSS module, `TS2307` | `*.module.css` import의 type declaration을 찾지 못함 |
| `ER-20260720-001` | `VERIFIED` | FCM, multicast, partial success | 일부 성공 때문에 transient 실패 device가 영구 누락됨 |
| `ER-20260720-002` | `VERIFIED` | FCM, retry, `Retry-After` | 서버가 지시한 긴 retry 시간이 임의 cap으로 잘림 |
| `ER-20260720-003` | `VERIFIED` | Firebase Admin, default app, project identity | 기존 default app을 다른 project 설정으로 재사용함 |
| `ER-20260720-004` | `VERIFIED` | FCM, lease, at-most-once, `UNKNOWN` | 살아 있는 느린 worker와 stale recovery가 중복 발송함 |
| `ER-20260720-005` | `VERIFIED` | FCM, privacy, data-only | 잠금 화면 또는 교차 계정 경로로 Task 정보가 노출될 수 있음 |
| `ER-20260720-006` | `MITIGATION_ONLY` | FCM, cancellation, recall race | send 시작 뒤 Task 취소가 외부 side effect를 회수하지 못함 |
| `ER-20260720-007` | `VERIFIED` | FCM, attempt accounting | 실제 send 없이 claim만으로 retry 횟수가 소진됨 |
| `ER-20260720-008` | `VERIFIED` | FCM, batching, persistence | 뒤 batch 실패가 앞 batch의 결과를 유실시킴 |
| `ER-20260720-009` | `VERIFIED` | FCM token, ownership, TOCTOU | token/FID 소유권 이전과 send가 교차 계정 발송을 만듦 |
| `ER-20260720-010` | `VERIFIED` | Prisma migration, PostgreSQL, drift | 수동 migration이 실제 DB와 schema parity를 보장하지 못함 |
| `ER-20260720-011` | `VERIFIED` | PostgreSQL, index, stale lease | 조건에 없는 중간 column 때문에 복합 index를 활용하지 못함 |
| `ER-20260720-012` | `VERIFIED` | Prisma migration, provider lock | migration history에 provider가 고정되지 않음 |
| `ER-20260720-013` | `VERIFIED` | NestJS, DI, `JwtService` | 보호된 feature module에서 `JwtService`를 해석하지 못함 |
| `ER-20260720-014` | `VERIFIED` | Python, Windows, UTF-8, CP949, compression | locale text I/O가 UTF-8 backup과 primary를 손상시킴 |
| `ER-20260722-001` | `VERIFIED` | Obsidian, IndexedDB, Windows junction, cache | junction 축소 뒤 stale cache에서 Vault 로딩이 멈추고 제거된 파일이 검색됨 |
| `ER-20260725-001` | `VERIFIED` | Windows PowerShell, npm, ExecutionPolicy | `npm.ps1`이 정책에 차단돼 npm script가 시작되지 않음 |
| `ER-20260725-002` | `VERIFIED` | Jest, sandbox, Windows Temp, `EPERM` | test는 통과해도 Jest cache write가 차단돼 exit 1이 됨 |
| `ER-20260809-001` | `VERIFIED` | offline learning site, source exposure, allowlist | 정상 소스의 credential-shaped assignment 때문에 배치 생성이 차단됨 |
| `ER-20260809-002` | `VERIFIED` | offline learning site, fixture token, filename | 안전한 DTO 파일명이 visible fixture token 오탐을 일으킴 |
| `ER-20260809-003` | `VERIFIED` | offline learning site, responsive CSS, overflow | 긴 source path와 SHA-256이 카드·모바일 문서 폭을 밀어냄 |

## 해결 record

### ER-20260715-001 — Google ID token audience 강제

- `resolutionId`: `ER-20260715-001`
- `status`: `VERIFIED`
- 증상/signature: Google 로그인이 token signature만 확인하고 `aud`가 이 서비스의 OAuth client인지 보장하지 않는다. `GOOGLE_CLIENT_ID` 누락이나 빈 문자열도 startup에서 통과한다.
- 적용 조건: `google-auth-library`의 `verifyIdToken`을 사용하고 backend가 단일 Google client ID를 신뢰 경계로 삼는 경우.
- root cause: 환경 계약과 token verification이 같은 audience 값을 필수로 공유하지 않았다.
- 해결 절차:
  1. 환경 검증에서 `GOOGLE_CLIENT_ID`를 non-empty 필수값으로 만든다.
  2. service가 설정을 `getOrThrow`로 읽고 client 초기화와 `verifyIdToken({ audience })`에 같은 값을 사용한다.
  3. 누락·빈 값과 audience 전달을 회귀 테스트한다.
- 검증: `DSM_Back/src/config/env.validation.spec.ts`와 `DSM_Back/src/auth/auth.service.spec.ts`를 실행하고 backend TypeScript 검사를 통과시킨다.
- 재발 방지/금지: token payload의 client ID를 신뢰하거나 검증 실패 시 audience 검사를 생략하지 않는다. `.env.example`에 실제 credential을 넣지 않는다.
- 적용 불가: 여러 client ID를 의도적으로 허용하는 서비스는 허용 목록 계약을 별도로 설계해야 한다.
- 근거: [환경 검증](../../DSM_Back/src/config/env.validation.ts), [Auth service](../../DSM_Back/src/auth/auth.service.ts), [Auth tests](../../DSM_Back/src/auth/auth.service.spec.ts), [구현 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-15`

### ER-20260715-002 — Refresh token 단일 소비와 원자적 rotation

- `resolutionId`: `ER-20260715-002`
- `status`: `VERIFIED`
- 증상/signature: 같은 refresh token으로 동시에 요청하면 둘 다 기존 row를 유효하다고 읽고 replacement token을 만들 수 있다.
- 적용 조건: DB row로 refresh token 수명주기를 관리하고 token rotation을 수행하는 경우.
- root cause: 유효성 read와 revoke·replacement create가 하나의 조건부 transaction이 아니었다.
- 해결 절차:
  1. secret hash를 확인한 뒤 interactive transaction을 시작한다.
  2. `id`, `revokedAt: null`, `expiresAt > now` 조건의 `updateMany`로 기존 token을 소비한다.
  3. update count가 정확히 1인 요청만 승자로 인정한다.
  4. 같은 transaction client로 replacement row를 만든다.
  5. replacement 생성 실패 시 전체 transaction을 rollback한다.
- 검증: 정상 rotation, `updateMany` count 0 경쟁 패자, replacement create 실패 rollback, malformed·revoked·expired·wrong-secret 회귀를 `auth.service.spec.ts`에서 확인한다.
- 재발 방지/금지: read 후 무조건 `update`하거나 revoke와 replacement create를 서로 다른 transaction에서 실행하지 않는다.
- 적용 불가: 완전한 stateless refresh token 정책은 별도의 replay 방지 설계가 필요하다.
- 근거: [Auth service](../../DSM_Back/src/auth/auth.service.ts), [Auth tests](../../DSM_Back/src/auth/auth.service.spec.ts), [구현 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-15`

### ER-20260715-003 — Task category 소유권 경계

- `resolutionId`: `ER-20260715-003`
- `status`: `VERIFIED`
- 증상/signature: 인증 사용자가 다른 사용자의 `categoryId`를 Task create/update에 전달할 수 있다.
- 적용 조건: 사용자 소유 category와 공용 default category가 같은 relation에 저장되는 경우.
- root cause: foreign key 존재 여부만 확인하고 actor의 assign 권한을 확인하지 않았다.
- 해결 절차:
  1. Task mutation과 같은 transaction client로 category를 조회한다.
  2. `id`와 함께 `userId === actor OR isDefault === true` 조건을 적용한다.
  3. 존재하지 않거나 할당할 수 없으면 모두 같은 `NotFoundException`으로 처리한다.
  4. category 검증 실패 뒤 Task·score·schedule write가 없는지 테스트한다.
- 검증: 사용자 소유/default 허용, foreign/missing 거부, mutation 선행 차단을 `tasks.service.spec.ts`에서 확인한다.
- 재발 방지/금지: category를 먼저 조회한 뒤 소유권을 application memory에서 늦게 비교하거나, 권한 오류로 다른 사용자의 resource 존재를 노출하지 않는다.
- 적용 불가: 조직 공유 category처럼 별도 ACL이 있는 경우에는 ACL 조건을 transaction query에 포함해야 한다.
- 근거: [Tasks service](../../DSM_Back/src/tasks/tasks.service.ts), [Task tests](../../DSM_Back/src/tasks/tasks.service.spec.ts), [구현 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260715-004 — Task·score transaction과 Prisma `P2034`

- `resolutionId`: `ER-20260715-004`
- `status`: `VERIFIED`
- 증상/signature: 동시 Task 변경이 기본 `Read Committed`에서 같은 score 기준선을 읽어 stale `DailyScore`나 `User.totalScore`를 commit한다. Serializable conflict는 Prisma `P2034`로 실패한다.
- 적용 조건: Task mutation 뒤 파생 점수를 같은 PostgreSQL DB에서 재계산하는 경우.
- root cause: 원본 mutation과 파생 상태 recompute가 동일한 serializable transaction·client에 묶이지 않았다.
- 해결 절차:
  1. Task service가 최상위 transaction owner가 된다.
  2. Task read/write, schedule sync, 날짜별 score recompute와 user aggregate를 같은 client로 실행한다.
  3. isolation을 `Serializable`로 지정한다.
  4. `P2034`만 전체 callback 단위로 제한 재시도한다. 현재 계약은 최초 실행과 최대 2회 재시도다.
  5. 다른 오류는 재시도하지 않고 전파한다.
- 검증: 동일 transaction client 전달, distinct UTC day 재계산, nested write 실패 시 recompute 미실행, `P2034` 성공 재시도·한도 초과·다른 오류 비재시도를 확인한다.
- 재발 방지/금지: transaction 밖에서 파생 score를 후속 write하거나, `P2034` 발생 지점 일부만 재시도하지 않는다.
- 적용 불가: 외부 API 호출이 transaction callback에 포함되는 흐름은 짧은 DB transaction과 outbox/idempotency 설계로 분리해야 한다.
- 근거: [Tasks service](../../DSM_Back/src/tasks/tasks.service.ts), [Scores service](../../DSM_Back/src/scores/scores.service.ts), [Task tests](../../DSM_Back/src/tasks/tasks.service.spec.ts), [구현 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260715-005 — CSS module `TS2307` 선언

- `resolutionId`: `ER-20260715-005`
- `status`: `VERIFIED`
- 증상/signature: `Cannot find module './*.module.css' or its corresponding type declarations`, TypeScript `TS2307`.
- 적용 조건: bundler는 CSS module을 처리하지만 TypeScript project에 module declaration이 없는 Expo/React 프로젝트.
- root cause: runtime bundler 지원과 TypeScript type resolution은 별도인데 `*.module.css` ambient declaration이 없었다.
- 해결 절차:
  1. project include 범위 안에 `src/types/css-modules.d.ts`를 둔다.
  2. `declare module '*.module.css'`의 default export를 `Record<string, string>`으로 선언한다.
  3. 기존 import나 runtime loader를 불필요하게 바꾸지 않는다.
- 검증: 프런트 `tsc --noEmit --incremental false`가 통과하고 기존 CSS module import가 유지되는지 확인한다.
- 재발 방지/금지: 오류를 숨기려고 `skipLibCheck`, 광범위한 `any`, `@ts-ignore`를 추가하지 않는다.
- 적용 불가: bundler 자체가 CSS module을 지원하지 않는 경우에는 type declaration만으로 runtime 문제가 해결되지 않는다.
- 근거: [CSS module declaration](../../DSM_Front/src/types/css-modules.d.ts), [구현 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-15`

### ER-20260720-001 — FCM multicast 부분 성공의 per-device 영속화

- `resolutionId`: `ER-20260720-001`
- `status`: `VERIFIED`
- 증상/signature: 한 schedule에서 하나 이상의 device가 성공했다는 이유로 schedule 전체를 `SENT` 처리해 transient 실패 device가 재시도되지 않는다.
- 적용 조건: 한 논리 알림을 여러 device token에 multicast하고 target별 응답을 받을 수 있는 경우.
- root cause: 외부 결과는 device별인데 DB 상태와 retry 단위가 schedule 하나였다.
- 해결 절차:
  1. device별 `NotificationDelivery` 상태를 영속화한다.
  2. SDK 응답 순서를 delivery ID와 대응해 target별로 finalize한다.
  3. 명시적 transient 실패만 해당 delivery를 `PENDING`으로 유지한다.
  4. 모든 delivery가 terminal일 때만 schedule aggregate 상태를 결정한다.
- 검증: mixed success/transient, invalid token, retry exhaustion, schedule aggregation을 dispatcher spec에서 확인하고 Prisma schema·migration parity를 검증한다.
- 재발 방지/금지: batch의 `successCount > 0` 또는 일부 성공만으로 논리 작업 전체를 성공 처리하지 않는다.
- 적용 불가: provider가 target별 결과를 제공하지 않으면 같은 방식의 정확한 per-target retry를 보장할 수 없다.
- 근거: [Dispatcher](../../DSM_Back/src/notifications/notification-dispatcher.service.ts), [Dispatcher tests](../../DSM_Back/src/notifications/notification-dispatcher.service.spec.ts), [Schema](../../DSM_Back/prisma/schema.prisma), [F-001 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-002 — `Retry-After` 보존과 fallback backoff 분리

- `resolutionId`: `ER-20260720-002`
- `status`: `VERIFIED`
- 증상/signature: FCM quota/unavailable 응답이 준 미래 `Retry-After`가 application의 1시간 fallback cap으로 잘린다.
- 적용 조건: SDK 오류 객체에서 seconds, date, millisecond 또는 response header 형태의 retry 지시가 노출될 수 있는 경우.
- root cause: provider가 지정한 retry 시각과 application이 계산한 fallback exponential backoff에 같은 cap을 적용했다.
- 해결 절차:
  1. 직접 `retryAfter`, `retryAfterMs`, `headers['retry-after']`, response header를 방어적으로 파싱한다.
  2. 유효한 미래 시각은 길이에 관계없이 그대로 사용한다.
  3. 잘못된 값이나 과거 시각일 때만 bounded exponential fallback을 계산한다.
  4. 숫자 seconds, HTTP date, 긴 지시값, invalid/past 입력을 각각 테스트한다.
- 검증: dispatcher의 Retry-After parameterized tests와 TypeScript 검사를 통과시킨다.
- 재발 방지/금지: provider가 명시한 유효한 미래 지시를 application 편의 cap으로 앞당기지 않는다.
- 적용 불가: SDK가 retry 정보를 전혀 노출하지 않는 런타임에서는 fallback만 사용할 수 있으며 실제 SDK shape를 별도로 확인해야 한다.
- 근거: [Dispatcher retry parser](../../DSM_Back/src/notifications/notification-dispatcher.service.ts), [Retry tests](../../DSM_Back/src/notifications/notification-dispatcher.service.spec.ts), [F-002 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-003 — 기존 Firebase default app project 검증

- `resolutionId`: `ER-20260720-003`
- `status`: `VERIFIED`
- 증상/signature: 프로세스에 이미 초기화된 Firebase default app이 있을 때 현재 `FCM_PROJECT_ID`와 무관하게 재사용된다.
- 적용 조건: 여러 module/test/bootstrap 경로가 Firebase Admin default app을 공유할 수 있는 경우.
- root cause: “default app이 존재한다”는 사실을 “올바른 project app이다”로 간주했다.
- 해결 절차:
  1. 기존 default app의 `options.projectId`를 읽는다.
  2. 현재 필수 `FCM_PROJECT_ID`와 정확히 비교한다.
  3. 불일치하면 startup을 fail-fast한다.
  4. app이 없을 때만 ADC와 명시 project ID로 초기화한다.
- 검증: app 없음, 동일 project 재사용, 다른 project 거부를 provider spec에서 확인한다.
- 재발 방지/금지: test 편의를 위해 다른 project의 global app을 조용히 재사용하거나 production에서 credential fallback을 만들지 않는다.
- 적용 불가: 의도적 multi-project 서비스는 named app과 project별 provider를 별도로 설계해야 한다.
- 근거: [Firebase provider](../../DSM_Back/src/notifications/firebase-messaging.provider.ts), [Provider tests](../../DSM_Back/src/notifications/firebase-messaging.provider.spec.ts), [F-003 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-004 — 불명확한 외부 send를 terminal `UNKNOWN`으로 종료

- `resolutionId`: `ER-20260720-004`
- `status`: `VERIFIED`
- 증상/signature: 느린 worker가 살아 있는 동안 lease가 만료돼 다른 worker가 같은 delivery를 재선점하고 FCM을 중복 발송한다.
- 적용 조건: Task reminder처럼 중복·교차 계정 노출 비용이 누락보다 크고 provider가 exactly-once를 제공하지 않는 경우.
- root cause: DB lease만으로 외부 send의 시작·완료를 원자적으로 표현할 수 없는데 stale recovery가 모든 `PROCESSING`을 retryable로 되돌렸다.
- 해결 절차:
  1. FCM 호출 직전에 all-or-none 조건으로 durable `sendStartedAt` marker를 기록한다.
  2. marker 이전 stale claim만 `PENDING`으로 회수한다.
  3. marker 이후 stale lease, SDK throw, heartbeat unsafe, 응답 누락과 영속화 gap은 terminal `UNKNOWN`으로 종료한다.
  4. 명시적인 per-device transient response만 marker를 지우고 재시도한다.
  5. schedule aggregation이 `UNKNOWN`을 terminal로 취급하는지 확인한다.
- 검증: stale pre/post marker, SDK throw, heartbeat failure, missing response, partial persistence와 no-reclaim 테스트를 실행한다. migration의 `sendStartedAt timestamptz(6)`와 zero drift를 확인한다.
- 재발 방지/금지: 임의 quarantine 시간이 지나면 외부 send가 실패했다고 추정하거나 post-marker delivery를 자동 재발송하지 않는다.
- 적용 불가: 결제·보안 경보처럼 누락보다 중복이 낫다면 outbox, provider idempotency key와 별도 at-least-once 정책을 설계해야 한다.
- 근거: [Dispatcher](../../DSM_Back/src/notifications/notification-dispatcher.service.ts), [Policy tests](../../DSM_Back/src/notifications/notification-dispatcher.service.spec.ts), [Outcome migration](../../DSM_Back/prisma/migrations/20260720_notification_delivery_outcome_policy/migration.sql), [F-004 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-005 — 계정 중립 data-only 알림 payload

- `resolutionId`: `ER-20260720-005`
- `status`: `VERIFIED`
- 증상/signature: 잠금 화면 preview 또는 token ownership race에서 Task title/body/id가 다른 사람이나 잠금 화면에 노출될 수 있다.
- 적용 조건: client가 인증된 API에서 현재 상태를 다시 조회할 수 있는 reminder sync 설계.
- root cause: 신뢰 경계 밖의 OS notification payload에 사용자 작성 내용과 resource 식별자를 포함했다.
- 해결 절차:
  1. outbound message에서 notification title/body와 `taskId`, `scheduleId`, `userId`를 제거한다.
  2. data에는 account-neutral `type=REMINDER_SYNC`, `version=1`만 둔다.
  3. Android/APNs에는 immediate TTL/expiration과 collapse key를 사용한다.
  4. client는 현재 인증 사용자의 API 상태만 조회해 표시한다.
- 검증: exact outbound payload와 금지 field 부재를 dispatcher spec에서 확인한다.
- 재발 방지/금지: “generic title”만으로 충분하다고 보지 말고 data field에도 account/resource 정보를 넣지 않는다.
- 적용 불가: client current-state fetch가 없는 notification-only 제품은 별도의 최소 공개 payload와 사용자 preview 설정 정책이 필요하다.
- 근거: [Dispatcher payload](../../DSM_Back/src/notifications/notification-dispatcher.service.ts), [Payload tests](../../DSM_Back/src/notifications/notification-dispatcher.service.spec.ts), [F-005/F-010 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-006 — FCM send/cancel recall race 완화

- `resolutionId`: `ER-20260720-006`
- `status`: `MITIGATION_ONLY`
- 증상/signature: worker가 send 직전 재검증을 통과해 FCM 호출을 시작한 뒤 Task가 취소·완료·삭제된다.
- 적용 조건: 외부 FCM 호출과 DB Task mutation을 하나의 atomic transaction으로 묶을 수 없는 모든 경우.
- root cause: 이미 시작된 외부 side effect는 DB cancellation로 recall할 수 없다.
- 완화 절차:
  1. claim과 send 직전에 schedule·delivery·Task 상태와 token 소유권을 조건부 재검증한다.
  2. `ER-20260720-005`의 account-neutral data-only payload를 사용한다.
  3. immediate TTL/expiration과 collapse를 적용한다.
  4. 12C client가 authenticated current state를 조회한 뒤 활성 Task만 표시하도록 한다.
  5. 12C와 실기기 검증 전에는 `FCM_DISPATCH_ENABLED=false`를 유지한다.
- 검증: backend payload·재검증·기본 비활성 gate는 확인됐다. 실제 ADC/FCM, client current-state display와 취소 직후 race는 미검증이다.
- 잔여 위험: FCM call 시작 뒤 recall 불가와 client가 표시를 결정한 직후의 Task 취소 race는 남는다.
- 재발 방지/금지: 이 record를 `VERIFIED` 해결책으로 보고 dispatch를 활성화하지 않는다. 외부 send와 DB write가 atomic하다고 주장하지 않는다.
- 근거: [Dispatcher](../../DSM_Back/src/notifications/notification-dispatcher.service.ts), [환경 계약](../../DSM_Back/src/config/env.validation.ts), [F-007 위험 수용 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-007 — 실제 provider 결과 기준 attempt accounting

- `resolutionId`: `ER-20260720-007`
- `status`: `VERIFIED`
- 증상/signature: worker가 claim 직후 send 전에 종료될 때마다 `attemptCount`가 증가해 실제 FCM 시도 없이 최대 횟수를 소진한다.
- 적용 조건: claim, send와 result finalize가 분리된 delivery worker.
- root cause: processing claim 횟수를 외부 provider 실패 횟수로 잘못 사용했다.
- 해결 절차:
  1. claim과 pre-send stale recovery에서는 `attemptCount`를 변경하지 않는다.
  2. 명시적인 per-device FCM failure response를 finalize할 때 정확히 한 번 증가시킨다.
  3. retry 가능 여부와 max attempt 판정은 증가 후 count를 사용한다.
  4. 불명확 post-marker 결과는 attempt 증가 없이 `UNKNOWN`으로 종료한다.
- 검증: pre-send crash, known transient, max-attempt transition, invalid token과 SDK-wide ambiguity를 dispatcher spec에서 확인한다.
- 재발 방지/금지: queue delivery 횟수, claim 횟수와 외부 API attempt 횟수를 같은 counter로 취급하지 않는다.
- 적용 불가: provider 호출 자체를 시작할 때 과금·quota가 확정되는 시스템은 별도 attempt 정의가 필요하다.
- 근거: [Dispatcher](../../DSM_Back/src/notifications/notification-dispatcher.service.ts), [Attempt tests](../../DSM_Back/src/notifications/notification-dispatcher.service.spec.ts), [F-008 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-008 — batch 결과의 즉시 조건부 영속화

- `resolutionId`: `ER-20260720-008`
- `status`: `VERIFIED`
- 증상/signature: 앞 chunk가 성공한 뒤 DB에 결과를 쓰기 전에 뒤 chunk가 throw하면 앞 target을 다시 발송하거나 결과를 잃는다.
- 적용 조건: provider batch limit 때문에 여러 chunk로 외부 호출을 나누는 worker.
- root cause: 모든 chunk가 끝난 뒤 한 번에 결과를 영속화했다.
- 해결 절차:
  1. 각 `SendResponse`를 delivery ID와 claim ID에 대응한다.
  2. target 결과를 받는 즉시 조건부 finalize한다.
  3. 뒤 chunk 실패가 이미 terminal인 앞 delivery를 되돌리지 않게 한다.
  4. marker 이후 아직 결과가 없는 delivery는 `UNKNOWN`으로 종료한다.
- 검증: 앞 chunk success/뒤 chunk throw, claim fence mismatch, 부분 persistence failure와 missing response 테스트를 실행한다.
- 재발 방지/금지: 외부 side effect 전체가 끝날 때까지 성공 결과를 process memory에만 보관하지 않는다.
- 적용 불가: provider가 batch 전체 결과만 원자적으로 제공하는 경우에는 provider 계약에 맞는 다른 전략이 필요하다.
- 근거: [Dispatcher](../../DSM_Back/src/notifications/notification-dispatcher.service.ts), [Batch tests](../../DSM_Back/src/notifications/notification-dispatcher.service.spec.ts), [F-009 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-009 — cross-user token/FID in-place 이전 금지

- `resolutionId`: `ER-20260720-009`
- `status`: `VERIFIED`
- 증상/signature: 전역 unique FCM token/FID row의 `userId`를 새 사용자로 바꾸는 동안 이전 사용자의 delivery가 같은 token으로 발송될 수 있다.
- 적용 조건: token 또는 Firebase Installation ID가 전역 unique이고 account switch가 가능한 서비스.
- root cause: registration upsert가 identity row의 소유자를 in-place mutation해 과거 delivery와 새 owner 사이 TOCTOU를 만들었다.
- 해결 절차:
  1. foreign-owner token/FID 등록을 모든 mutation 전에 `409 Conflict`로 거부한다.
  2. same-user upsert update에서 `userId`를 변경하지 않는다.
  3. Serializable `P2034` retry 뒤 재조회에서도 foreign owner면 같은 409를 반환한다.
  4. logout/account switch client는 기존 Installation/token을 삭제하고 새 identity를 발급받아 새 row로 등록한다.
  5. outbound payload는 `ER-20260720-005`처럼 account-neutral로 유지한다.
- 검증: PENDING/PROCESSING delivery가 있는 foreign owner, mutation 없음, same-user 갱신, P2034 retry 후 foreign owner를 notification service spec에서 확인한다.
- 재발 방지/금지: quarantine 시간이 지났다는 추정으로 owner mutation을 허용하거나 direct DB write로 정책을 우회하지 않는다.
- 적용 불가: 운영자가 명시적으로 device ownership transfer를 지원해야 한다면 기존 identity revoke와 새 identity 발급을 별도 workflow로 설계해야 한다.
- 근거: [Token service](../../DSM_Back/src/notifications/notifications.service.ts), [Token tests](../../DSM_Back/src/notifications/notifications.service.spec.ts), [F-010 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-010 — 실제 PostgreSQL migration parity gate

- `resolutionId`: `ER-20260720-010`
- `status`: `VERIFIED`
- 증상/signature: 수동 작성한 Prisma migration SQL이 정적 schema 검증은 통과하지만 빈 DB 적용 여부와 live schema parity가 확인되지 않는다.
- 적용 조건: migration SQL을 수동 작성하거나 초기 migration을 별도 검토한 PostgreSQL 프로젝트.
- root cause: datamodel validation을 실제 migration 실행과 datasource↔datamodel 비교로 오해했다.
- 해결 절차:
  1. loopback 전용 persistent local PostgreSQL을 건강 상태로 시작한다.
  2. 빈 승인 대상 DB에 `prisma migrate deploy`를 실행한다.
  3. `prisma migrate status`로 적용 이력을 확인한다.
  4. `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --exit-code`로 zero drift를 확인한다.
  5. 중요 type, precision, nullable, FK action과 index를 catalog에서 확인한다.
  6. probe data는 rollback하거나 검증 뒤 삭제한다.
- 검증: 현재 local PostgreSQL 17에 두 migration이 적용됐고 zero drift, catalog와 named-volume persistence가 확인됐다.
- 재발 방지/금지: `prisma validate`만으로 migration 적용 가능성과 live parity가 증명됐다고 보고하지 않는다.
- 적용 불가: 원격·운영 DB에는 별도 승인, backup, rollout·rollback 계획이 필요하다.
- 근거: [Prisma schema](../../DSM_Back/prisma/schema.prisma), [Initial migration](../../DSM_Back/prisma/migrations/20260716_init/migration.sql), [Outcome migration](../../DSM_Back/prisma/migrations/20260720_notification_delivery_outcome_policy/migration.sql), [F-011 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-011 — retry와 stale lease index 분리

- `resolutionId`: `ER-20260720-011`
- `status`: `VERIFIED`
- 증상/signature: `status=PROCESSING AND processingStartedAt < cutoff` 조회가 복합 index의 중간 `nextAttemptAt` 조건을 제공하지 않아 원하는 범위 scan을 사용하지 못한다.
- 적용 조건: retry-due 조회와 stale-processing 조회가 서로 다른 column 조합을 사용하는 PostgreSQL queue table.
- root cause: 두 query shape를 하나의 복합 index에 합쳐 left-prefix 규칙과 맞지 않았다.
- 해결 절차:
  1. retry query용 `(status, nextAttemptAt)` index를 둔다.
  2. stale lease query용 `(status, processingStartedAt)` index를 별도로 둔다.
  3. Prisma schema와 migration SQL을 함께 맞춘다.
  4. representative data와 `EXPLAIN ANALYZE`로 각 query가 의도한 index를 선택하는지 확인한다.
- 검증: local PostgreSQL에서 retry-due와 stale-lease probe가 각각 전용 index를 선택했고 probe transaction은 rollback됐다.
- 재발 방지/금지: “관련 column이 모두 들어 있다”는 이유만으로 query predicate 순서와 무관한 복합 index를 만들지 않는다.
- 적용 불가: 데이터 분포와 query 비율이 다른 운영 DB에서는 planner 통계를 별도로 검증해야 한다.
- 근거: [Prisma indexes](../../DSM_Back/prisma/schema.prisma), [Initial migration](../../DSM_Back/prisma/migrations/20260716_init/migration.sql), [F-012 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-012 — Prisma migration provider lock

- `resolutionId`: `ER-20260720-012`
- `status`: `VERIFIED`
- 증상/signature: `prisma/migrations`에 SQL은 있지만 `migration_lock.toml`이 없어 migration history의 provider가 명시되지 않는다.
- 적용 조건: Prisma Migrate history를 저장소에 관리하는 프로젝트.
- root cause: 수동 initial migration 생성 과정에서 conventional provider lock 파일을 누락했다.
- 해결 절차:
  1. `prisma/migrations/migration_lock.toml`을 추가한다.
  2. `provider = "postgresql"`을 schema datasource provider와 일치시킨다.
  3. 실제 DB에서 `prisma migrate status`를 실행한다.
- 검증: lock과 schema provider 일치, local migrate status up-to-date, diff check를 확인한다.
- 재발 방지/금지: provider 변경을 단순 lock 파일 수정으로 수행하지 않는다. provider migration은 별도 데이터 이전 계획이 필요하다.
- 적용 불가: Prisma Migrate를 사용하지 않는 프로젝트에는 적용하지 않는다.
- 근거: [Migration lock](../../DSM_Back/prisma/migrations/migration_lock.toml), [Schema datasource](../../DSM_Back/prisma/schema.prisma), [F-013 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-013 — NestJS feature module의 `JwtService` DI 경계

- `resolutionId`: `ER-20260720-013`
- `status`: `VERIFIED`
- 증상/signature: AppModule compile 또는 startup에서 `Nest can't resolve dependencies of JwtAuthGuard` / `JwtService` provider를 feature module context에서 찾지 못한다.
- 적용 조건: `JwtAuthGuard`를 Auth module 밖의 controller에 class reference로 적용하는 NestJS module graph.
- root cause: guard export만으로는 guard가 의존하는 `JwtService` provider가 소비 feature module에서 보이지 않았다.
- 해결 절차:
  1. `AuthModule`이 `JwtModule`과 `JwtAuthGuard`를 export한다.
  2. guard를 사용하는 Scores, Categories, Rankings, Tasks, Notifications module이 `AuthModule`을 명시적으로 import한다.
  3. root `AppModule` 전체를 실제 TestingModule로 compile·close하는 회귀 테스트를 둔다.
  4. 외부 side effect는 root compile test에서 비활성 gate로 차단한다.
- 검증: direct AppModule compile, app module spec, e2e health/404, 전체 Jest와 TypeScript를 실행한다.
- 재발 방지/금지: controller unit test에서 guard를 override한 결과만으로 root module DI가 정상이라고 판단하지 않는다. global module로 무작정 확장하지 않는다.
- 적용 불가: guard를 global provider로 등록하는 구조는 global module/provider 계약을 별도로 검증해야 한다.
- 근거: [Auth module](../../DSM_Back/src/auth/auth.module.ts), [App module test](../../DSM_Back/src/app.module.spec.ts), [Task module](../../DSM_Back/src/tasks/tasks.module.ts), [F-014 원장](../audits/20260716-change-gate-notification-12b/findings.jsonl)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260720-014 — Windows locale text I/O의 UTF-8 문서 손상

- `resolutionId`: `ER-20260720-014`
- `status`: `VERIFIED`
- 증상/signature: Python `UnicodeEncodeError: 'cp949' codec can't encode character`, 압축 대상 primary가 0 bytes가 되거나 `*.original.md` 한글이 깨진다. backup readback 비교는 통과할 수 있다.
- 적용 조건: Windows non-UTF-8 locale에서 `Path.read_text(errors='ignore')`, `Path.write_text(text)`처럼 `encoding`을 지정하지 않는 문서 rewrite script.
- root cause:
  1. UTF-8 source를 CP949 + `errors='ignore'`로 읽어 decode 불가 byte를 조용히 버린다.
  2. 손상된 Unicode text를 CP949로 다시 쓴 backup은 같은 locale readback과 같아 내부 검증을 통과하지만 원본 byte hash는 다르다.
  3. compressed output에 CP949가 표현하지 못하는 문자가 있으면 primary를 truncate한 뒤 write가 실패한다.
- 해결 절차:
  1. 실행 전 source SHA-256·bytes를 기록한다.
  2. 실패 즉시 child Python/LLM process를 정확한 PID로 종료하고 primary·backup hash를 확인한다.
  3. backup hash가 pre-image와 다르면 복구 원본으로 사용하지 않는다.
  4. intact 파일은 byte-exact local copy를 먼저 만든 뒤 active 문서를 직접 정리한다.
  5. 손상 primary는 Git base, current plan, architecture, checklist와 검증 evidence에서 재구성하고 byte-exact가 아님을 backup에 명시한다.
  6. corrupt artifact는 quarantine하고 active memory·Git에서 제외한다.
  7. future script는 `encoding='utf-8'`, strict decode, same-directory temp file, validation, atomic replace와 byte hash backup 검증을 모두 구현하기 전 재사용하지 않는다.
- 검증: active Markdown 5개 strict UTF-8 decode, exact backup 3개 pre-image SHA-256 일치, critical status/gate·playbook index/body·relative link·secret scan·`git diff --check`, 잔류 compression process 0을 확인한다.
- 재발 방지/금지: locale default I/O, `errors='ignore'`, primary 직접 truncate/write, text readback equality만으로 backup 무결성을 주장하지 않는다.
- 적용 불가/잔여 위험: 손실된 byte-exact pre-image는 Git/다른 snapshot이 없으면 복구할 수 없다. semantic reconstruction은 반드시 출처와 비정확성을 기록한다.
- 근거: [Memory routing](./README.md), [압축·복구 기록](./plan.md), [복구 context snapshot](./context.original.md)
- `lastVerifiedAt`: `2026-07-20`

### ER-20260722-001 — Obsidian Windows junction 전환 후 stale IndexedDB 복구

- `resolutionId`: `ER-20260722-001`
- `status`: `VERIFIED`
- 증상/signature: Obsidian 1.12.7에서 Vault 내부의 full-source Windows junction을 좁은 문서 junction으로 교체한 뒤 2분 이상 `캐시 불러오는 중...`에 머물거나, 이미 제거된 `node_modules`·AI 지침·과거 agent plan이 Quick Switcher에 남는다.
- 적용 조건: 단일 local Vault의 실제 파일·junction target·비순환 구조는 정상이고, Obsidian IndexedDB LevelDB에 전환 전 full-source 경로가 남아 있으며 일반 재시작과 Vault cache rebuild만으로 회복되지 않는 Windows 환경.
- root cause: Obsidian의 기존 IndexedDB 파일 색인이 제거된 full-source junction과 대량 dependency Markdown record를 계속 참조해 현재의 축소된 Vault 구조와 불일치했다.
- 해결 절차:
  1. 등록 Vault 경로, 현재 junction target, 노출 Markdown 수와 junction loop 부재를 먼저 확인한다.
  2. 편집 가능한 workspace가 로드되지 않고 정상 종료가 계속 실패할 때만 해당 Obsidian 실행 파일의 process를 종료하고 모두 종료됐는지 확인한다.
  3. 해당 Vault의 IndexedDB LevelDB directory를 삭제하지 않고 같은 parent의 식별 가능한 exact backup 경로로 이동한다.
  4. Obsidian을 재실행해 새 cache 생성과 workspace 정상 로드를 확인한다.
  5. 구조 전환으로 불필요해진 제외 필터를 Obsidian Settings UI에서 제거하고 설정 readback으로 반영 여부를 확인한다.
  6. 사용자 action-time 승인 후 `Rebuild vault cache`를 실행한다.
  7. Quick Switcher에서 현재 문서가 검색되고 제거 대상 경로가 검색되지 않는지 양성·음성 검색으로 검증한다.
- 검증: `DSM` 일반 directory, `Current`·`Planning` junction target, Overview internal link 8개와 노출 Markdown 9개를 확인했다. Settings readback은 `userIgnoreFilters: null`이며, Quick Switcher에서 `Overview`와 현재 architecture는 검색되고 `node_modules`, `AGENTS.md`, `superpowers`는 파일 결과 없이 생성 옵션만 표시됐다.
- 재발 방지/금지: cache directory를 즉시 삭제하거나 junction target을 재귀 삭제하지 않는다. 정상 workspace가 열린 상태에서 process를 강제 종료하지 않으며, 새 cache 검증 전 backup을 덮어쓰거나 제거하지 않는다.
- 적용 불가/잔여 위험: 여러 Vault가 같은 이름 또는 cache 후보를 공유하거나 실제 junction loop·손상 문서가 있으면 이 절차를 적용하지 말고 Vault와 cache 매핑부터 별도로 진단한다. 보존한 backup 삭제는 별도 승인 대상이다.
- 근거: [복구 실행 계획과 검증](./plan.md), [현재 Obsidian 구조](./context.md)
- `lastVerifiedAt`: `2026-07-22`

### ER-20260725-001 — PowerShell `npm.ps1` ExecutionPolicy 차단 우회

- `resolutionId`: `ER-20260725-001`
- `status`: `VERIFIED`
- 증상/signature: PowerShell에서 `npm` 실행 즉시 `PSSecurityException`과 “이 시스템에서 스크립트를 실행할 수 없으므로 ... npm.ps1 파일을 로드할 수 없습니다”가 발생하며 npm script가 시작되지 않는다.
- 적용 조건: `Get-Command npm -All`에서 같은 Node 설치의 `npm.ps1`과 `npm.cmd`가 함께 발견되고, PowerShell command resolution이 차단된 `npm.ps1`을 먼저 선택하는 Windows 환경.
- root cause: 프로젝트나 npm package 오류가 아니라 PowerShell ExecutionPolicy가 `.ps1` shim 실행을 거부한 반면 실행 가능한 Windows command shim `npm.cmd`는 정상 설치돼 있었다.
- 해결 절차:
  1. `Get-Command npm -All`로 실제 해석 순서와 `npm.ps1`·`npm.cmd` 경로를 확인한다.
  2. 두 shim이 같은 Node 설치에 속하는지 확인한다.
  3. 시스템 ExecutionPolicy를 변경하지 않고 검증 명령에서 `npm.cmd`를 명시한다.
  4. 원래 실행하려던 전체 npm script를 동일 인자로 다시 실행한다.
- 검증: `npm.cmd`로 backend unit 22 suites·198 tests, e2e 1 suite·2 tests, Nest build, Prisma validate와 Front TypeScript 검사를 실행했다. 정책 변경이나 프로젝트 파일 수정 없이 npm script가 시작됐다.
- 재발 방지/금지: 시스템 전체 ExecutionPolicy를 완화하거나 `Bypass`로 고정하지 않는다. 다른 Node 설치의 shim을 섞어 사용하지 않는다.
- 적용 불가/잔여 위험: `npm.cmd`도 없거나 실행이 실패하면 Node/npm 설치 또는 PATH 문제이므로 별도 진단한다. npm script 내부 실패는 이 record로 해결된 것으로 간주하지 않는다.
- 근거: [Git checkpoint 검증 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-25`

### ER-20260725-002 — managed sandbox의 Jest Windows Temp cache `EPERM`

- `resolutionId`: `ER-20260725-002`
- `status`: `VERIFIED`
- 증상/signature: Jest 결과는 모든 suite/test가 통과했지만 마지막에 사용자 Temp 아래 `jest-transform-cache` 또는 `perf-cache`를 `mkdir`·`open`하다 `EPERM: operation not permitted`로 exit 1이 된다. e2e는 transform cache 생성 전에 중단될 수 있다.
- 적용 조건: workspace만 쓰기 가능한 managed sandbox에서 Jest의 기본 `TEMP`가 sandbox 밖 Windows 사용자 경로를 가리키고, stack trace가 `jest-util`, `@jest/transform` 또는 `@jest/test-sequencer` cache write에서 끝나는 경우.
- root cause: 제품 코드나 test assertion 실패가 아니라 Jest가 sandbox 외부의 기본 Windows Temp cache 경로에 쓰려고 해 filesystem 정책에 차단됐다.
- 해결 절차:
  1. test summary와 stack trace를 분리해 assertion 실패인지 cache write 실패인지 확인한다.
  2. 제품 코드나 Jest 설정을 임의로 바꾸지 않는다.
  3. 현재 task가 허용하면 사용자 승인으로 동일 명령을 sandbox 밖에서 재실행하거나, 계획된 writable temp 경로를 별도 승인 범위로 사용한다.
  4. 재실행의 실제 exit code와 전체 suite/test count를 확인한다.
- 검증: sandbox 밖 동일 checkout에서 backend unit 22 suites·198 tests와 e2e 1 suite·2 tests가 모두 exit 0으로 통과했다.
- 재발 방지/금지: cache write `EPERM`을 assertion 실패로 보고 제품 코드를 수정하지 않는다. 최초 실행의 “tests passed” 문구만으로 성공을 주장하지 않고 exit code를 확인한다.
- 적용 불가/잔여 위험: sandbox 밖에서도 실패하거나 stack trace가 application/test code를 가리키면 실제 test failure로 별도 진단한다. 외부 실행은 항상 현재 사용자 승인·권한 정책을 따른다.
- 근거: [Git checkpoint 검증 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-25`

### ER-20260809-001 — source exposure의 exact path·reason 승인

- `resolutionId`: `ER-20260809-001`
- `status`: `VERIFIED`
- 증상/signature: 보존 대상 application source나 unit fixture의 정상적인 credential-shaped assignment가 `credential-assignment`로 탐지돼 오프라인 학습 배치 생성이 fail-closed된다.
- 적용 조건: 원본 소스를 그대로 보존하는 정적 학습 사이트가 reason 기반 exposure scanner와 수동 검토 gate를 함께 사용하는 경우.
- root cause: reason 하나만으로 승인 범위를 표현하면 동일 reason의 다른 경로·추가 탐지까지 함께 허용할 수 있어, legitimate reviewed occurrence를 안전하게 구분할 수 없었다.
- 해결 절차:
  1. scanner와 `reviewRequired` 기록을 그대로 유지한다.
  2. 승인 대상을 exact source path와 exact reason 집합의 조합으로 제한한다.
  3. 추가 reason이 붙거나 다른 경로에서 같은 reason이 나오면 다시 차단한다.
  4. 검토된 record도 `reviewRequired: true`와 빈 symbol 목록을 유지한다.
  5. 정확한 조합만 허용되고 다른 경로·추가 reason은 거부되는 회귀 테스트를 둔다.
- 검증: `batches.test.mjs`, clean Pilot A·Batch B 생성 검증, 전체 66개 Node 테스트와 Batch B full verifier를 통과했다.
- 재발 방지/금지: reason 전체 wildcard, directory wildcard, scanner 비활성화, `reviewRequired` 제거 또는 matched value 기록으로 우회하지 않는다.
- 적용 불가 또는 잔여 위험: source 내용이 바뀌어 새 탐지 reason이 생기면 기존 승인을 재사용하지 말고 별도 검토한다.
- 근거: [Batch manifest](../../tools/learning-site/manifest.mjs), [Batch tests](../../tools/learning-site/tests/batches.test.mjs), [Batch B 계획](../../docs/superpowers/plans/2026-08-09-offline-learning-site-batch-b.md)
- `lastVerifiedAt`: `2026-08-09`

### ER-20260809-002 — visible fixture token과 파일명 분리

- `resolutionId`: `ER-20260809-002`
- `status`: `VERIFIED`
- 증상/signature: fixture token 노출 검사가 안전한 DTO 파일명의 일부 문자열까지 token으로 해석해 verifier를 실패시킨다.
- 적용 조건: 정적 학습 사이트가 source path·filename metadata와 사용자에게 보이는 설명 text를 같은 HTML에 렌더링하고, 알려진 test fixture literal 노출을 차단하는 경우.
- root cause: 단어 경계 정규식을 전체 visible text에 적용해 token 자체가 아닌 파일명 substring까지 같은 위험으로 분류했다.
- 해결 절차:
  1. preserved source 영역, visible UI text, runtime search data를 분리해 검사한다.
  2. visible UI와 runtime data는 정규화한 exact fixture literal만 거부한다.
  3. filename은 허용하되, 같은 literal을 독립된 문단이나 runtime 값으로 주입한 fixture는 거부하는 음성 테스트를 둔다.
  4. 실제 fixture literal이나 matched value는 보고서·playbook에 복제하지 않는다.
- 검증: 안전한 Batch B 산출물은 통과하고 visible 문단 주입은 실패하는 `batch-b-verify.test.mjs`, 전체 66개 Node 테스트와 full verifier를 통과했다.
- 재발 방지/금지: 전체 페이지 검사를 제거하거나 preserved source 밖의 실제 token literal을 filename 오탐으로 간주해 허용하지 않는다.
- 적용 불가 또는 잔여 위험: 새로운 fixture 형식이나 인코딩이 추가되면 exact normalization 계약을 별도로 확장해야 한다.
- 근거: [Verifier](../../tools/learning-site/verify.mjs), [Batch B verifier tests](../../tools/learning-site/tests/batch-b-verify.test.mjs), [Batch B 계획](../../docs/superpowers/plans/2026-08-09-offline-learning-site-batch-b.md)
- `lastVerifiedAt`: `2026-08-09`

### ER-20260809-003 — 공백 없는 학습 메타데이터의 반응형 줄바꿈

- `resolutionId`: `ER-20260809-003`
- `status`: `VERIFIED`
- 증상/signature: 긴 source path 링크 또는 SHA-256처럼 공백 없는 문자열이 카드 경계를 넘어가고 모바일 문서 전체에 가로 스크롤을 만든다.
- 적용 조건: CSS grid 카드나 metadata 정의 목록 안에 source path, digest처럼 자연 줄바꿈 지점이 없는 문자열을 표시하는 정적 문서.
- root cause: exercise source link 묶음에 독립된 layout·wrap 규칙이 없었고 file overview의 inline `code`에도 unbroken text 줄바꿈 계약이 없었다.
- 해결 절차:
  1. 브라우저에서 `documentElement.scrollWidth`와 `innerWidth`를 같은 viewport에서 비교해 실제 document overflow를 재현한다.
  2. `.exercise-sources`를 gap이 있는 grid로 만들고 link에 `min-width: 0`과 `overflow-wrap: anywhere`를 적용한다.
  3. `.file-overview code`에 `overflow-wrap: anywhere`와 `word-break: break-all`을 적용한다.
  4. CSS contract 회귀 테스트를 RED→GREEN으로 실행하고 실제 1440×900·390×844 브라우저에서 다시 측정한다.
- 검증: exercise 문서는 1440px viewport에서 1501px→1425px, source 문서는 390px viewport에서 587px→375px로 줄어 document overflow가 사라졌다. 전체 66개 Node 테스트, full verifier와 인앱 Chromium QA를 통과했다.
- 재발 방지/금지: `body { overflow-x: hidden }`으로 잘린 내용을 숨기거나, 보존 값에 임의 soft break 문자를 삽입하지 않는다.
- 적용 불가 또는 잔여 위험: source code pane처럼 내부 가로 스크롤이 의도된 영역은 document overflow와 구분해 별도 scroll container로 유지한다.
- 근거: [Site CSS](../../tools/learning-site/assets/site.css), [Style tests](../../tools/learning-site/tests/style.test.mjs), [QA report](../../learning-site/qa-report.md)
- `lastVerifiedAt`: `2026-08-09`

## 새 record 템플릿

```md
### ER-YYYYMMDD-NNN — 제목

- `resolutionId`: `ER-YYYYMMDD-NNN`
- `status`: `VERIFIED | MITIGATION_ONLY | DEPRECATED`
- 증상/signature:
- 적용 조건:
- root cause:
- 해결 또는 완화 절차:
- 검증:
- 재발 방지/금지:
- 적용 불가 또는 잔여 위험:
- 근거:
- `lastVerifiedAt`: `YYYY-MM-DD`
```

새 record를 추가할 때 index도 같은 변경에서 갱신하고, 기존 record와 root cause가 중복되지 않는지 먼저 검색한다.
