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
| `ER-20260725-003` | `VERIFIED` | npm, sandbox, cache, `EPERM` | dependency install이 사용자 npm cache write에서 중단됨 |
| `ER-20260725-004` | `VERIFIED` | Prisma, worktree, generated client | fresh worktree에서 생성된 Prisma Client를 찾지 못함 |
| `ER-20260725-005` | `VERIFIED` | Expo CLI, install, config plugin, devDependency | install이 app config를 바꾸고 dev package를 runtime dependency에 둠 |
| `ER-20260726-001` | `VERIFIED` | Jest, Promise queue, microtask, race test | queue 작업 시작 전 상태를 바꿔 in-flight race 기대가 틀리게 실패함 |
| `ER-20260726-002` | `VERIFIED` | ApiError, SecureStore, normalization, error boundary | dependency가 ApiError를 reject하면 고정 공개 오류 대신 원 오류가 노출됨 |
| `ER-20260726-003` | `VERIFIED` | Jest, CommonJS, dynamic import, module reload | runtime `import()` 오류가 대상 모듈 부재 RED를 가림 |
| `ER-20260726-004` | `VERIFIED` | Jest, TypeScript, generic mock, `TS2322` | 고정 반환 mock이 generic method 계약에 할당되지 않음 |
| `ER-20260726-005` | `VERIFIED` | Auth client, delayed `401`, single-flight, token generation | 첫 refresh 완료 뒤 늦은 같은-generation `401`이 refresh를 다시 시작함 |
| `ER-20260726-006` | `VERIFIED` | Promise, synchronous throw, assignment race, cleanup | callback 동기 throw 뒤 rejected promise가 cache에 남음 |
| `ER-20260726-007` | `VERIFIED` | Auth client, logout, account switch, stale replay | completed refresh cache가 이전 세션 요청을 replay함 |
| `ER-20260726-008` | `VERIFIED` | Session controller, SecureStore, verified clear, read failure | token read 실패를 곧바로 blocking error로 처리해 정리 가능한 credential이 남음 |
| `ER-20260726-009` | `VERIFIED` | Session controller, refresh, network, action state | 직접 refresh 실패 뒤 `refreshing` action이 영구 유지됨 |
| `ER-20260726-010` | `VERIFIED` | Session controller, replay `401`, epoch, account switch | delegated cleanup 뒤 재진입한 cleanup이 새 세션 token을 지울 수 있음 |
| `ER-20260726-011` | `VERIFIED` | Session controller, onboarding, state precondition | onboarding 외 상태에서도 완료 PATCH를 호출함 |
| `ER-20260726-012` | `VERIFIED` | Session controller, protocol error, revoke, profile | malformed profile 뒤 발급된 server refresh token을 revoke하지 않음 |
| `ER-20260811-001` | `VERIFIED` | Session controller, profile, epoch, stale success | error path는 fenced지만 늦은 profile 성공이 logout·계정 전환 상태를 덮음 |
| `ER-20260811-002` | `VERIFIED` | Session controller, onboarding, single-flight, epoch | 중복 onboarding PATCH 또는 이전 session promise가 새 session 호출을 가로막음 |
| `ER-20260811-003` | `VERIFIED` | Auth, refresh token family, logout, row lock | refresh successor가 성공한 logout 뒤에도 유효하게 남음 |
| `ER-20260811-004` | `VERIFIED` | Expo Router, Jest, app route, Web export | `src/app` 아래 test module이 production route로 실행됨 |
| `ER-20260811-005` | `VERIFIED` | Prisma generate, Windows DLL, `EPERM`, concurrency | build/test와 병렬 generate가 query engine DLL rename에서 실패함 |
| `ER-20260813-001` | `VERIFIED` | Expo CLI, npm 11, peer dependency, `ERESOLVE`, lockfile | SDK patch 도중 구 Router/LogBox peer가 lock에 남아 두 번째 install이 실패함 |
| `ER-20260813-002` | `VERIFIED` | Expo Font, Expo Asset, npm hoist, Jest, module resolution | `expo-asset`이 Expo 아래에만 중첩돼 top-level `expo-font` import가 실패함 |
| `ER-20260813-003` | `VERIFIED` | Nitro Modules, Jest, TurboModule, native boundary | native Google package import가 Jest에서 `NitroModules`를 찾지 못함 |
| `ER-20260813-004` | `VERIFIED` | Jest, TypeScript, callback arity, `TS2322` | 0-argument mock이 1-argument dependency callback에 할당되지 않음 |
| `ER-20260813-005` | `VERIFIED` | Jest, mock factory, hoist, early binding | mock 객체가 초기화 전 함수를 값으로 캡처해 호출이 0회인 채 `TypeError`로 흐름 |
| `ER-20260813-006` | `VERIFIED` | Expo config plugin, Android, autolinking, Google Sign-In | Android-only explicit client-ID 설정인데 plugin이 iOS/Firebase 설정을 요구해 config가 exit 1 |
| `ER-20260816-001` | `VERIFIED` | ESLint 8, flat config, React Native, package exports | `eslint/config` subpath 또는 nested plugin을 찾지 못해 lint가 시작되지 않음 |
| `ER-20260816-002` | `VERIFIED` | Jest, transform cache, isolated cache | focused test는 통과하지만 기존 cache를 쓴 full suite에서 Keychain mock이 어긋남 |
| `ER-20260816-003` | `VERIFIED` | Metro, Windows Temp, cache, `EPERM` | Metro cache deserialize 실패 뒤 bundle이 멈추거나 reset이 권한 오류로 종료됨 |
| `ER-20260817-001` | `VERIFIED` | Android, Google OAuth, debug signer, Credential Manager, `[16]` | 계정 선택 뒤 `Account reauth failed`로 ID token 전에 Login으로 복귀함 |
| `ER-20260827-001` | `VERIFIED` | Prisma migration, PostgreSQL enum, disposable seed | migration upgrade seed가 존재하지 않는 enum literal로 중단됨 |

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
- 2026-08-16 재검증: installed `caveman-compress/scripts/compress.py`가 `filepath.read_text(errors="ignore")`, 인코딩 미지정 `backup_path.write_text(original_text)`·`filepath.write_text(...)`를 계속 사용해 적용 조건과 정확히 일치했다. active memory 직접 실행과 외부 Claude 전송을 중단하고 날짜가 붙은 byte-exact local backup + `apply_patch` 압축으로 전환했다.
- 근거: [Memory routing](./README.md), [압축·복구 기록](./plan.md), [복구 context snapshot](./context.original.md)
- `lastVerifiedAt`: `2026-08-16`

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
  3. 현재 task가 허용하면 `--cacheDirectory`를 workspace 안의 task-specific 경로로 지정해 같은 test를 재실행한다. e2e도 동일하게 별도 project-local cache를 사용한다.
  4. project-local cache 사용이 불가능하거나 사용자 Temp가 반드시 필요한 명령이면 승인된 sandbox 밖 재실행을 사용한다.
  5. 재실행의 실제 exit code와 전체 suite/test count를 확인하고 task-specific cache는 exact path를 검증한 뒤 정리한다.
- 검증: 2026-08-17 backend default Temp cache는 test 시작 전 `EPERM`으로 중단됐다. 같은 checkout에서 project-local cache를 지정해 unit 23 suites·214 tests와 e2e 1 suite·2 tests가 모두 exit 0으로 통과했다. 기존 sandbox 밖 backend 22 suites·198 tests/e2e 2 tests 통과 이력도 유지한다.
- 재발 방지/금지: cache write `EPERM`을 assertion 실패로 보고 제품 코드를 수정하지 않는다. 최초 실행의 “tests passed” 문구만으로 성공을 주장하지 않고 exit code를 확인한다. workspace root 전체나 사용자 Temp를 broad delete하지 않는다.
- 적용 불가/잔여 위험: sandbox 밖에서도 실패하거나 stack trace가 application/test code를 가리키면 실제 test failure로 별도 진단한다. 외부 실행은 항상 현재 사용자 승인·권한 정책을 따른다.
- 근거: [Git checkpoint 검증 기록](./plan.md)
- `lastVerifiedAt`: `2026-08-17`

### ER-20260725-003 — managed sandbox의 npm cache write `EPERM`

- `resolutionId`: `ER-20260725-003`
- `status`: `VERIFIED`
- 증상/signature: `npm ci`, `npm install` 또는 Expo package install이 dependency
  해석 전에 사용자 `AppData\Local\npm-cache` 아래 파일 open/rename에서
  `EPERM: operation not permitted`로 중단된다.
- 적용 조건: 프로젝트 workspace는 쓰기 가능하지만 npm의 기본 cache가 managed
  sandbox 밖 사용자 경로이며 stack과 실패 경로가 npm cache를 가리키는 경우.
- root cause: package metadata나 dependency conflict가 아니라 package manager가
  sandbox 외부 cache에 쓰려고 해 filesystem 정책에 차단됐다.
- 해결 절차:
  1. 실패 경로가 npm cache인지, `ERESOLVE`·registry·package script 오류가 아닌지
     먼저 구분한다.
  2. package/config를 임의로 바꾸거나 cache를 삭제하지 않는다.
  3. 현재 dependency 변경이 승인된 범위라면 동일한 정확한 명령을 승인된 외부
     환경에서 재실행한다.
  4. `npm ls`와 package/lock root metadata, exact changed-file scope를 확인한다.
- 검증: Backend/Front `npm ci`, Expo SDK 55 dependency 설치와 lock 동기화가 exit
  0으로 끝났고, `npm ls`가 invalid tree 없이 통과했다.
- 재발 방지/금지: cache `EPERM`을 dependency 호환성 오류로 오인해 version을
  임의 변경하거나 global cache를 삭제하지 않는다. 자동 audit fix를 함께 실행하지 않는다.
- 적용 불가/잔여 위험: sandbox 밖에서도 `ERESOLVE`, integrity, registry 또는
  lifecycle script 오류가 나면 별도 dependency 진단이 필요하다.
- 근거: [Front secure session 실행 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-25`

### ER-20260725-004 — fresh worktree의 Prisma Client 생성 누락

- `resolutionId`: `ER-20260725-004`
- `status`: `VERIFIED`
- 증상/signature: dependency 설치 후 Backend test/typecheck가
  `Cannot find module '.prisma/client/default'` 또는 Prisma Client 미초기화 오류로
  시작하지 못하지만 schema와 migration 파일은 존재한다.
- 적용 조건: 새 worktree/node_modules에서 `@prisma/client` package는 설치됐지만
  해당 checkout의 schema로 generated client가 아직 생성되지 않은 경우.
- root cause: generated Prisma Client는 Git tracked source가 아니며 fresh dependency
  tree에 현재 schema 기반 generate 단계가 아직 실행되지 않았다.
- 해결 절차:
  1. package version과 `DSM_Back/prisma/schema.prisma` 경로를 확인한다.
  2. Backend에서 `npx prisma generate`를 실행한다. engine download가 필요한 첫
     실행이면 현재 승인 정책에 따라 network 권한을 요청한다.
  3. `prisma validate`, Backend focused/full test와 TypeScript를 다시 실행한다.
  4. generated output을 Git에 stage하지 않고 status로 제품 파일 변화가 없는지 확인한다.
- 검증: 격리 worktree에서 generate와 validate가 통과한 뒤 Backend baseline 22
  suites·198 tests 및 이후 Task 1~6 회귀 검증이 통과했다.
- 재발 방지/금지: Client 생성 오류를 해결하려고 migration을 apply/reset하거나
  generated node_modules를 commit하지 않는다.
- 적용 불가/잔여 위험: generate 자체가 schema validation 또는 engine checksum
  오류로 실패하면 해당 오류를 별도 진단한다. 이 record는 DB migration 적용을 승인하지 않는다.
- 근거: [Front secure session 실행 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-25`

### ER-20260725-005 — Expo install의 config plugin 및 devDependency 부작용

- `resolutionId`: `ER-20260725-005`
- `status`: `VERIFIED`
- 증상/signature: `npx expo install expo-secure-store`가 package/lock 외에
  `app.json` plugin을 자동 추가하고, npm 11에서 `-- --dev` 형태가 Expo의
  devDependency 옵션이 아니라 npm include 의미로 해석돼 test/lint package가
  `dependencies`에 놓인다.
- 적용 조건: Expo SDK 55 CLI로 package를 설치하며 package 단계와 app-config
  단계가 분리돼 있고, npm 11 계열 argument forwarding을 사용하는 경우.
- root cause: Expo CLI의 알려진 config-plugin 자동 등록 side effect와
  `--dev`를 package-manager 뒤로 전달한 잘못된 argument boundary가 함께 발생했다.
- 해결 절차:
  1. 설치 전 exact status와 app-config content hash를 기록한다.
  2. 개발 package는 Expo CLI의 직접 옵션인 `npx expo install --dev ...`로 설치한다.
  3. `package.json`의 runtime/dev section과 lockfile root metadata를 직접 확인한다.
  4. 자동 app-config 변경이 후속 승인 단계 소유라면 다른 변경을 건드리지 말고 그
     generated line만 제거한 뒤 filtered hash가 원본과 같은지 확인한다.
  5. `npm install --package-lock-only --ignore-scripts`, `npm ls`, `git diff --check`,
     changed-file allowlist를 검증한다.
- 검증: SecureStore는 runtime dependency, Jest/RNTL/ESLint 도구는 devDependencies로
  해석됐고 `npm ls`가 exit 0이었다. Task 7 commit은 package/lock 두 파일만 포함하고
  `app.json` plugin은 승인된 Task 9에서 별도 추가됐다.
- 재발 방지/금지: broad `git restore`로 동시 사용자 app-config 변경을 지우지 않는다.
  `-- --dev`를 SDK 55/npm 11 조합의 dev install 방식으로 재사용하지 않는다.
- 적용 불가/잔여 위험: 다른 Expo/npm version은 local `expo install --help`와
  실제 diff로 option semantics를 다시 확인해야 한다.
- 근거: [Front secure session 실행 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-25`

### ER-20260726-001 — Promise queue race test의 시작 시점 동기화

- `resolutionId`: `ER-20260726-001`
- `status`: `VERIFIED`
- 증상/signature: `resolvedPromise.then(operation)`으로 직렬화한 queue의 race test가
  operation 호출 직후 동기적으로 epoch나 상태를 바꾸면, storage write가 진행 중일
  것으로 기대한 테스트가 write 전 stale guard에서 종료된다. 호출 순서에는 write가
  없고 이후 read가 기존 값을 반환한다.
- 적용 조건: Promise tail에 operation을 연결하는 비동기 queue에서 “작업 도중 상태
  변경”과 후속 queue 순서를 검증하며, 대상 operation 내부에 제어 가능한 gate가 있는 경우.
- root cause: queue 등록은 즉시지만 `then` callback 실행은 다음 microtask다. 테스트가
  operation의 실제 진입을 관찰하지 않고 상태를 먼저 변경해 검증하려는 race 자체를 만들지 못했다.
- 해결 절차:
  1. 실패 호출 trace로 pre-write guard, physical write, post-write guard 중 어디에서
     종료됐는지 구분한다.
  2. deferred fake에 `started: Promise<void>`를 만들고 physical write의 첫 동기
     단계에서 resolve한 뒤 기존 gate를 await한다.
  3. 테스트는 queue 작업을 등록한 후 `await store.started`로 physical write 진입을
     확인하고, 그 다음 epoch 변경과 gate release를 수행한다.
  4. 결과값뿐 아니라 `write → stale clear → queued read → queued clear` exact order와
     queue rejection 이후 후속 operation 성공을 함께 검증한다.
- 검증: Task 15 focused Jest 1 suite·4 tests와 Front 전체 Jest 6 suites·48 tests,
  `expo lint`, TypeScript가 통과했고 독립 검토에서 concurrency finding이 없었다.
- 재발 방지/금지: 단순 sleep, fake timer tick, 임의 microtask flush 횟수로 시작 시점을
  추측하지 않는다. 구현을 통과시키기 위해 call-order 또는 null-result 기대를 약화하지 않는다.
- 적용 불가/잔여 위험: physical operation에 진입 signal을 넣을 수 없는 integration
  test는 observable callback 또는 instrumented adapter 경계를 사용해야 한다. queue 구현
  자체가 synchronous start를 보장한다면 이 record의 microtask 전제부터 재확인한다.
- 근거: [Token-store coordinator tests](../../DSM_Front/src/features/auth/token-store-coordinator.test.ts),
  [Token-store coordinator](../../DSM_Front/src/features/auth/token-store-coordinator.ts),
  [Front secure session 실행 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-26`

### ER-20260726-002 — Dependency ApiError의 고정 오류 계약 우회

- `resolutionId`: `ER-20260726-002`
- `status`: `VERIFIED`
- 증상/signature: dependency 호출을 감싼 catch에서 `cause instanceof ApiError`를
  그대로 rethrow하면, dependency가 다른 kind/message의 `ApiError`를 reject할 때
  adapter가 약속한 고정 public error 대신 원 오류가 노출된다.
- 적용 조건: 외부/native dependency의 unknown rejection을 하나의 고정 domain error로
  정규화해야 하며, 같은 try block 안에서 adapter 자체의 domain error도 만들고 있는 경우.
- root cause: `ApiError`라는 타입을 오류의 출처와 신뢰도 증거로 잘못 사용했다. 넓은
  try/catch가 dependency rejection과 adapter 내부 mismatch를 함께 잡아, 내부 오류의
  이중 wrapping을 피하려는 분기가 dependency 오류까지 신뢰했다.
- 해결 절차:
  1. dependency mock이 고정 계약과 다른 kind/message의 `ApiError`를 reject하는 회귀
     테스트를 먼저 추가하고 public kind/message가 새는 RED를 확인한다.
  2. dependency await만 별도 try/catch로 분리하고 catch된 모든 값은 고정 domain
     error에 `cause`로 넣어 래핑한다.
  3. adapter 자체의 검증 실패나 mismatch 비교는 catch 밖에서 고정 domain error를
     생성해 throw한다.
  4. fixed message/kind, 민감값 비노출, 원래 cause 보존과 기존 success/fallback
     경로를 focused/full test, lint, typecheck로 재검증한다.
- 검증: Task 16 회귀 테스트는 수정 전 `network` kind를 받아 10 pass·1 fail RED였고,
  수정 후 focused Jest 11/11, Front 전체 Jest 7 suites·59 tests, `expo lint`,
  TypeScript가 통과했다. scoped re-review는 P2를 `RECHECKED`로 판정했다.
- 재발 방지/금지: 고정 공개 오류 boundary에서 `instanceof ApiError`만으로 dependency
  오류를 그대로 rethrow하지 않는다. 이중 wrapping 회피를 위해 dependency 호출과
  내부 검증을 같은 try/catch에 넣지 않는다.
- 적용 불가/잔여 위험: 상위 계층이 특정 domain error를 의도적으로 보존해야 하는
  계약이라면 kind/message allowlist와 provenance를 별도 설계해야 한다. 실제 native
  SecureStore의 실기기 삭제·readback 동작은 이후 device 검증이 필요하다.
- 근거: [Native token-store tests](../../DSM_Front/src/features/auth/token-store.native.test.ts),
  [Native token-store adapter](../../DSM_Front/src/features/auth/token-store.native.ts),
  [Front secure session 실행 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-26`

### ER-20260726-003 — Jest CommonJS module reload test의 runtime import 오류

- `resolutionId`: `ER-20260726-003`
- `status`: `VERIFIED`
- 증상/signature: `jest.resetModules()` 뒤 대상 모듈을 runtime `import()`로 다시
  불러오는 테스트가 assertion이나 module resolution 전에
  `A dynamic import callback was invoked without --experimental-vm-modules`로 실패한다.
- 적용 조건: `jest-expo`와 CommonJS test 실행 환경에서 module-scope 상태의 reload
  동작을 검증하고, test 안에서 runtime `import()`를 호출한 경우.
- root cause: 대상 제품 모듈의 동작이나 부재가 아니라 현재 Jest CommonJS runtime이
  동적 ESM import callback을 지원하지 않아 테스트 인프라에서 먼저 중단됐다.
- 해결 절차:
  1. stack trace가 assertion이 아니라 runtime import callback에서 끝나는지 확인한다.
  2. 별도 Jest 설정이나 Node 실험 플래그를 추가하지 않고 typed
     `jest.requireActual<typeof import('./module')>('./module')` helper로 교체한다.
  3. reload 경계에서는 먼저 `jest.resetModules()`를 호출한 뒤 helper로 다시 로드한다.
  4. 구현 전에는 대상 모듈을 찾지 못하는 올바른 RED를 확인하고, 구현 후 같은 테스트가
     GREEN이 되는지 확인한다.
- 검증: Task 17 최초 3개 테스트는 runtime import callback 오류로 실패했다. helper
  교체 후 구현 전에는 3/3 모두 `Cannot find module './token-store.web'`로 올바르게
  실패했고, 구현 후 focused Jest 3/3과 Front 전체 Jest 8 suites·62 tests,
  `expo lint`, TypeScript가 통과했다.
- 재발 방지/금지: 제품 코드 실패를 보기 위해 Jest 설정에
  `--experimental-vm-modules`를 즉흥 추가하지 않는다. 잘못된 infrastructure RED를
  제품 요구사항 RED로 간주하지 않고, 실패 지점과 이유를 먼저 확인한다.
- 적용 불가/잔여 위험: 프로젝트가 ESM Jest runtime으로 전환되거나 실제 dynamic
  import 자체가 검증 대상이면 해당 runtime의 공식 ESM 설정을 별도로 검토해야 한다.
  `jest.requireActual`은 CommonJS reload 테스트에서만 적용한다.
- 근거: [Web token-store tests](../../DSM_Front/src/features/auth/token-store.web.test.ts),
  [Web token-store](../../DSM_Front/src/features/auth/token-store.web.ts),
  [Front secure session 실행 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-26`

### ER-20260726-004 — Generic method용 Jest mock의 고정 반환형 `TS2322`

- `resolutionId`: `ER-20260726-004`
- `status`: `VERIFIED`
- 증상/signature: `jest.fn((request: HttpRequest<unknown>) =>
  Promise.resolve(value))`를 `<T>(request: HttpRequest<T>) => Promise<T>`에
  할당하면 `Promise<Concrete>`는 임의의 `Promise<T>`가 아니라는 `TS2322`가 난다.
- 적용 조건: generic method를 가진 dependency의 테스트 double이 특정 fixture만
  반환하며, `jest.fn(implementation)`이 그 고정 signature를 그대로 추론한 경우.
- root cause: 특정 테스트 scenario용 callback을 모든 `T`에 유효한 generic
  implementation으로 잘못 모델링했다.
- 해결 절차:
  1. 오류가 제품 generic 사용이 아니라 test double 할당 위치를 가리키는지 확인한다.
  2. broad `jest.fn()`을 먼저 만들고 동일한 `.mockImplementation(...)`을 연결한다.
  3. request argument와 반환 fixture의 runtime assertion은 유지하고 type assertion
     또는 `unknown as`로 오류를 숨기지 않는다.
  4. focused test와 전체 TypeScript를 함께 재실행한다.
- 검증: Task 18 TypeScript는 수정 전 `authenticated-client.test.ts:68`에서
  `TS2322`였고, mock construction만 바꾼 뒤 통과했다. runtime focused Jest 8/8,
  이후 전체 Task 18 완료 기준 9 suites·74 tests도 통과했다.
- 재발 방지/금지: 테스트를 통과시키기 위해 `HttpClient` 제품 계약을 약화하거나
  double 전체를 다중 cast하지 않는다. 호출 인자·횟수·결과 assertion도 삭제하지 않는다.
- 적용 불가/잔여 위험: 실제 generic fake 구현이 여러 `T`를 지원해야 한다면 broad
  Jest mock 대신 type-safe generic adapter를 구현해야 한다.
- 근거: [Authenticated client tests](../../DSM_Front/src/lib/api/authenticated-client.test.ts),
  [HTTP client contract](../../DSM_Front/src/lib/api/http-client.ts)
- `lastVerifiedAt`: `2026-07-26`

### ER-20260726-005 — 완료된 refresh 뒤 지연 `401`의 중복 rotation

- `resolutionId`: `ER-20260726-005`
- `status`: `VERIFIED`
- 증상/signature: 같은 만료 access token으로 동시에 시작한 A/B 중 A의 `401`이
  refresh를 완료한 뒤 B의 초기 `401`이 늦게 도착하면 refresh callback이 두 번 호출된다.
- 적용 조건: client가 in-flight promise만 single-flight 상태로 보유하고 완료 즉시
  제거하며, refresh token rotation을 자동 재시도할 수 없는 경우.
- root cause: promise 수명 동안의 중복만 합쳤고, 완료 뒤 도착한 이전 token
  generation 응답을 식별할 결과/세대 정보가 없었다.
- 해결 절차:
  1. 각 요청에 실제 주입한 initial access token을 캡처한다.
  2. 성공 refresh의 `previous token → refreshed token` 한 세대 mapping을 memory에
     보존한다.
  3. 지연 `401`의 previous token이 같고 현재 session이 cached refreshed token을
     계속 소유할 때만 새 refresh 없이 한 번 replay한다.
  4. session ownership이 달라졌다면 `ER-20260726-007` 경계대로 cache를 사용하지 않는다.
  5. 두 개의 독립 deferred 초기 응답으로 A 완료 후 B `401`을 발생시켜 refresh 1회를 검증한다.
- 검증: 회귀 테스트는 수정 전 refresh 1회 기대에 2회를 받는 RED였고, 수정 후
  focused 12/12, 전체 Front 9 suites·74 tests, lint, TypeScript가 통과했다.
- 재발 방지/금지: 단순 sleep이나 refresh promise를 영구 보존하지 않는다. 완료 결과
  cache를 session ownership 확인 없이 사용하지 않는다.
- 적용 불가/잔여 위험: token 문자열만으로 generation을 구분할 수 없는 프로토콜은
  명시적 session epoch/generation ID를 interface에 추가하는 별도 설계가 필요하다.
- 근거: [Authenticated client](../../DSM_Front/src/lib/api/authenticated-client.ts),
  [Authenticated client tests](../../DSM_Front/src/lib/api/authenticated-client.test.ts)
- `lastVerifiedAt`: `2026-07-26`

### ER-20260726-006 — Promise callback 동기 throw의 assignment/cleanup race

- `resolutionId`: `ER-20260726-006`
- `status`: `VERIFIED`
- 증상/signature: cached operation을 `cache = asyncIife()` 형태로 만들 때 내부
  callback이 Promise 반환 전에 동기 throw하면, cleanup이 먼저 `cache = null`을
  실행한 뒤 바깥 assignment가 rejected promise를 다시 저장한다. 이후 호출도 같은
  rejection만 받는다.
- 적용 조건: callback은 Promise 반환 type이지만 test double이나 구현이 동기 throw할
  수 있고, operation promise를 cache해 single-flight로 공유하는 경우.
- root cause: right-hand async function 실행과 cleanup side effect가 left-hand cache
  assignment보다 먼저 일어날 수 있는 JavaScript 평가 순서를 고려하지 않았다.
- 해결 절차:
  1. `Promise.resolve().then(() => callback())`으로 callback 실행을 다음 microtask로 미룬다.
  2. 만들어진 operation을 cache에 먼저 할당한다.
  3. `operation.then(successCleanup, failureCleanup)` 양쪽에서 동일 operation identity일
     때만 cache를 비운다.
  4. 동기 throw의 exact error 전파 뒤 다음 호출이 새 operation으로 성공하는지 검증한다.
- 검증: 수정 전 두 번째 요청도 첫 `Refresh unavailable` 오류를 받는 RED였고, 수정 후
  focused 12/12, 전체 Front 9 suites·74 tests, lint, TypeScript가 통과했다.
- 재발 방지/금지: cleanup이 있는 async IIFE를 cache assignment의 RHS에서 즉시
  실행하지 않는다. rejected child를 방치할 수 있는 `.finally()` cleanup도 피한다.
- 적용 불가/잔여 위험: callback을 반드시 동기 실행해야 하는 API는 cache state
  transition을 먼저 확정하는 별도 state machine이 필요하다.
- 근거: [Authenticated client](../../DSM_Front/src/lib/api/authenticated-client.ts),
  [Authenticated client tests](../../DSM_Front/src/lib/api/authenticated-client.test.ts)
- `lastVerifiedAt`: `2026-07-26`

### ER-20260726-007 — Authenticated request generation의 3단계 session fence

- `resolutionId`: `ER-20260726-007`
- `status`: `VERIFIED`
- 증상/signature: 이전 session A의 delayed `401`이 B session refresh를 시작하거나,
  B 요청이 A의 in-flight refresh에 합류하거나, A refresh 대기 중 logout/B 전환 뒤
  A 요청이 replay된다. completed cache만 확인하면 세 경계 중 일부가 남는다.
- 적용 조건: authenticated client가 완료 refresh mapping을 보존하지만 session epoch를
  직접 받지 않고 `getAccessToken()`만 current-session 관찰점으로 사용하는 경우.
- root cause: initial request, in-flight refresh, completed refresh와 replay 직전 상태를
  하나의 token generation provenance로 묶지 않았다.
- 해결 절차:
  1. 초기 unauthorized 객체와 initial token을 요청별로 보존한다.
  2. refresh 시작 전 current token이 initial token과 같거나, completed mapping의
     previous/refreshed token이 initial/current와 각각 일치해야 한다.
  3. in-flight refresh에 source token을 저장하고 같은 initial token 요청만 합류시킨다.
  4. refresh await 직후 HTTP replay 전에 `getAccessToken() === refreshed token`을 다시
     확인한다. logout 또는 account switch면 원래 initial unauthorized를 반환한다.
  5. mismatch 경로에서는 새 refresh, replay와 `onUnauthorized`를 호출하지 않아 새
     세션을 회전·종료하거나 이전 요청을 새 계정으로 실행하지 않는다.
  6. delayed A→B, cross-generation pending refresh join, refresh 대기 중 logout/B 전환,
     same-generation in-flight/completed reuse를 모두 deterministic test로 검증한다.
- 검증: 세 취약 interleaving이 각각 RED였고 수정 후 focused 15/15, 전체 Front
  17 suites·136 tests, lint, TypeScript가 통과했다. 독립 fix-recheck `RECHECKED`.
- 재발 방지/금지: cache 또는 전역 promise 존재만으로 generation 소유권을 추론하지
  않는다. mismatch된 이전 요청을 현재 세션 refresh/replay에 전달하지 않고 token
  mapping을 로그·persistent storage에 남기지 않는다.
- 적용 불가/잔여 위험: access token publish와 refresh callback resolve 순서가
  보장되지 않는 다른 session interface에서는 명시적 epoch/owner ID가 필요하다.
- 근거: [Authenticated client](../../DSM_Front/src/lib/api/authenticated-client.ts),
  [Authenticated client tests](../../DSM_Front/src/lib/api/authenticated-client.test.ts),
  [Front secure session 실행 기록](./plan.md)
- `lastVerifiedAt`: `2026-08-11`

### ER-20260726-008 — Token read 실패 뒤 verified local cleanup

- `resolutionId`: `ER-20260726-008`
- `status`: `VERIFIED`
- 증상/signature: session bootstrap 또는 refresh에서 token store `read()`가
  storage error를 반환하면 credential 정리를 시도하지 않고 곧바로
  `storage-error/read`에 머문다.
- 적용 조건: refresh-token mutation을 serialized coordinator로 관리하고
  `readAndClear()`가 verified clear/tombstone 경계를 제공하는 session controller.
- root cause: token을 읽지 못한 상태와 token을 안전하게 지우지 못한 상태를 같은
  terminal storage failure로 취급해, 정리 가능한 credential에도 fail-closed clear를
  실행하지 않았다.
- 해결 절차:
  1. current epoch의 storage read failure만 cleanup 대상으로 받는다.
  2. 같은 serialized store 경계의 `readAndClear()`를 실행한다.
  3. verified cleanup 성공 후에만 `unauthenticated`를 publish한다.
  4. cleanup도 실패하면 `storage-error/clear`로 차단한다.
  5. 성공·실패 두 경로를 독립 회귀 테스트한다.
- 검증: 수정 전 두 회귀가 RED였고, 수정 후 focused 27 tests와 전체 Front
  10 suites·101 tests, lint, TypeScript가 통과했다. scoped re-review는 finding을
  `ADDRESSED`로 판정했다.
- 재발 방지/금지: storage read failure를 token 부재로 간주하거나, clear 검증 없이
  로그아웃 성공을 publish하지 않는다.
- 적용 불가/잔여 위험: `readAndClear()` 자체가 read-before-clear라 영구 hardware
  failure에서는 blocking `storage-error/clear`가 정상 결과다. 실제 SecureStore
  device 동작은 별도 smoke evidence가 필요하다.
- 근거: [Session controller](../../DSM_Front/src/features/auth/session-controller.ts),
  [Session controller tests](../../DSM_Front/src/features/auth/session-controller.test.ts),
  [Front secure session 실행 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-26`

### ER-20260726-009 — 직접 refresh 실패의 stable action 복원

- `resolutionId`: `ER-20260726-009`
- `status`: `VERIFIED`
- 증상/signature: authenticated request가 직접 `refreshAccessToken()`을 호출한 뒤
  rotation network/timeout failure가 발생하면 stable state는 남아도 action이
  `refreshing`으로 고착된다.
- 적용 조건: bootstrap과 일반 authenticated request가 같은 refresh method를
  공유하고 transient action을 별도로 publish하는 state machine.
- root cause: network/timeout finalization을 bootstrap caller에만 두어 일반 refresh
  진입점의 rejected exit가 action을 안정 상태로 되돌리지 않았다.
- 해결 절차:
  1. refresh 시작 epoch를 캡처한다.
  2. current epoch의 network/timeout failure에서 stored token을 지우지 않는다.
  3. state를 retryable `offline/bootstrap`, action을 `idle`로 publish한다.
  4. 원래 sanitized error는 요청자에게 그대로 reject해 자동 retry를 만들지 않는다.
  5. network와 timeout을 각각 회귀 테스트한다.
- 검증: 수정 전 두 회귀가 `refreshing` 고착으로 RED였고 수정 후 focused 27,
  전체 101 tests, lint, TypeScript가 통과했다. scoped re-review `ADDRESSED`.
- 재발 방지/금지: bootstrap catch만으로 모든 refresh 호출 경로가 안정화된다고
  가정하거나, network failure에서 refresh token을 clear·자동 재시도하지 않는다.
- 적용 불가/잔여 위험: 별도의 connection state store를 사용하는 앱은 해당 store의
  retry contract에 맞춰 state를 매핑해야 한다.
- 근거: [Session controller](../../DSM_Front/src/features/auth/session-controller.ts),
  [Session controller tests](../../DSM_Front/src/features/auth/session-controller.test.ts)
- `lastVerifiedAt`: `2026-07-26`

### ER-20260726-010 — Delegated replay-401 cleanup 재진입의 epoch fence

- `resolutionId`: `ER-20260726-010`
- `status`: `VERIFIED`
- 증상/signature: authenticated client가 replay `401`에서 session cleanup callback을
  await한 뒤 error를 rethrow하고, 상위 profile handler가 같은 error로 cleanup을 다시
  시작하면 그 사이 sign-in한 새 session token까지 clear될 수 있다.
- 적용 조건: transport layer가 unauthorized cleanup을 소유하고 controller가 profile
  error도 처리하며, subscriber가 unauthenticated publish 직후 새 sign-in을 시작할 수
  있는 구조.
- root cause: cleanup 책임이 두 계층에 걸쳐 있었고 profile operation이 시작한 epoch를
  보존하지 않아 delegated cleanup 뒤 돌아온 error가 이미 stale인지 판별하지 못했다.
- 해결 절차:
  1. profile request 시작 epoch를 handler에 전달한다.
  2. error 처리 시 captured epoch와 current epoch가 다르면 이미 처리됐거나 stale한
     결과로 보고 추가 clear·state publish를 하지 않는다.
  3. cleanup 자체도 전용 cleanup epoch를 캡처하고, await 뒤 epoch가 바뀌면 이전
     상태를 publish하지 않는다.
  4. cleanup 완료 → subscriber sign-in → rethrown unauthorized 순서를 deterministic
     test로 만들고 clear 1회와 새 access/session 보존을 검증한다.
- 검증: 수정 전 새 session이 두 번째 clear 위험에 노출되는 RED였고 수정 후 focused
  27, 전체 101 tests, lint, TypeScript가 통과했다. scoped re-review `ADDRESSED`.
- 재발 방지/금지: in-flight promise dedupe만으로 순차 재진입을 idempotent하다고
  가정하지 않는다. 이전 operation error를 current session cleanup에 전달하지 않는다.
- 적용 불가/잔여 위험: authenticated client가 cleanup callback을 보장하지 않는 다른
  interface는 error에 명시적 handled marker 또는 owner generation이 필요하다.
- 근거: [Session controller](../../DSM_Front/src/features/auth/session-controller.ts),
  [Authenticated client](../../DSM_Front/src/lib/api/authenticated-client.ts),
  [Session controller tests](../../DSM_Front/src/features/auth/session-controller.test.ts)
- `lastVerifiedAt`: `2026-07-26`

### ER-20260726-011 — Onboarding mutation의 stable-state precondition

- `resolutionId`: `ER-20260726-011`
- `status`: `VERIFIED`
- 증상/signature: access token 존재 여부만 검사해 authenticated 또는
  `offline/profile` 상태에서도 onboarding completion PATCH가 실행된다.
- 적용 조건: onboarding 여부가 account-global server timestamp로 표현되고
  controller stable state가 mutation 가능 여부를 소유하는 구조.
- root cause: authentication capability와 onboarding workflow eligibility를 같은
  access-token guard로 취급했다.
- 해결 절차:
  1. access token과 함께 `state.status === 'onboarding'`을 요구한다.
  2. 다른 stable state에서는 API 호출과 action 변경 없이 안전하게 종료한다.
  3. authenticated와 offline/profile 상태를 각각 회귀 테스트한다.
- 검증: 수정 전 두 상태에서 PATCH가 실행되는 RED였고 수정 후 focused 27,
  전체 101 tests, lint, TypeScript가 통과했다. scoped re-review `ADDRESSED`.
- 재발 방지/금지: API 호출 가능 여부만으로 workflow mutation 권한을 결정하지 않는다.
- 적용 불가/잔여 위험: onboarding을 여러 단계로 확장하면 단일 status 대신 명시적
  step transition contract가 필요하다.
- 근거: [Session controller](../../DSM_Front/src/features/auth/session-controller.ts),
  [Session controller tests](../../DSM_Front/src/features/auth/session-controller.test.ts)
- `lastVerifiedAt`: `2026-07-26`

### ER-20260726-012 — Malformed profile 뒤 issued pair revoke

- `resolutionId`: `ER-20260726-012`
- `status`: `VERIFIED`
- 증상/signature: login/refresh pair를 저장한 뒤 `/auth/me` runtime validation이
  protocol error를 반환하면 local token만 clear되고 server refresh token은 만료까지
  유효하게 남는다.
- 적용 조건: pair 발급·local commit 후 별도 profile request로 session state를
  확정하고 logout API가 captured access/refresh pair를 받는 구조.
- root cause: profile protocol failure cleanup이 local state만 소유하고, 방금 발급된
  server credential pair의 revocation 책임을 전달받지 않았다.
- 해결 절차:
  1. cleanup 시작 전에 current access token과 cleanup epoch를 캡처한다.
  2. serialized verified `readAndClear()`가 반환한 refresh token과 captured access를
     사용해 protocol failure에만 server revoke를 한 번 best-effort 호출한다.
  3. revoke failure는 verified local cleanup을 되돌리지 않는다.
  4. await 중 새 epoch가 시작되면 이전 cleanup state를 publish하지 않는다.
  5. bootstrap·sign-in malformed profile과 revoke network failure를 회귀 테스트한다.
- 검증: 수정 전 세 회귀가 revoke 누락으로 RED였고 수정 후 focused 27,
  전체 101 tests, lint, TypeScript가 통과했다. scoped re-review `ADDRESSED`.
- 재발 방지/금지: malformed response를 단순 UI error로 남기거나, local clear만으로
  server credential이 폐기됐다고 주장하지 않는다. token 값은 로그·error에 남기지 않는다.
- 적용 불가/잔여 위험: revoke가 offline이면 server refresh token은 최대 30일 만료까지
  남을 수 있다. local logout 성공 정책과 동일한 accepted operational consequence다.
- 근거: [Session controller](../../DSM_Front/src/features/auth/session-controller.ts),
  [Session controller tests](../../DSM_Front/src/features/auth/session-controller.test.ts),
  [Front secure session 실행 기록](./plan.md)
- `lastVerifiedAt`: `2026-07-26`

### ER-20260811-001 — Profile stale success의 epoch/token fence

- `resolutionId`: `ER-20260811-001`
- `status`: `VERIFIED`
- 증상/signature: `/auth/me` error path는 epoch를 확인하지만 success path가 곧바로
  `publishUser`를 호출해, logout 또는 새 계정 sign-in 뒤 이전 user가 protected state를
  복원하거나 새 token session 위에 이전 profile을 덮는다.
- 적용 조건: credential/session generation을 epoch로 관리하고 profile request가 별도
  async operation인 controller.
- root cause: stale failure만 위험하다고 보고 성공 completion의 소유 session을 검증하지
  않았다.
- 해결 절차:
  1. profile 요청 시작 시 epoch와 현재 access token을 캡처한다.
  2. 응답 성공 뒤 captured epoch/current epoch와 captured/current access token이 모두
     일치할 때만 user state를 publish한다.
  3. deferred profile → logout → success, A profile pending → B sign-in → A success를
     각각 회귀 테스트한다.
- 검증: 두 경로가 RED였고 `befac64` 후 focused session-controller 34/34, 전체 Front
  17 suites·136 tests, TypeScript·lint가 통과했으며 independent recheck `RECHECKED`.
- 재발 방지/금지: error fence만으로 async operation 전체가 session-safe하다고 가정하지
  않는다. 성공·실패 양쪽 completion에 owner generation을 적용한다.
- 적용 불가/잔여 위험: HTTP request 자체는 abort하지 않으며 state 반영만 차단한다.
- 근거: [Session controller](../../DSM_Front/src/features/auth/session-controller.ts),
  [Controller tests](../../DSM_Front/src/features/auth/session-controller.test.ts),
  [Auth change-gate](../audits/20260725-change-gate-front-secure-session/findings.jsonl)
- `lastVerifiedAt`: `2026-08-11`

### ER-20260811-002 — Onboarding completion의 epoch-scoped single-flight

- `resolutionId`: `ER-20260811-002`
- `status`: `VERIFIED`
- 증상/signature: 같은 onboarding state에서 두 PATCH가 실행돼 첫 성공 뒤 두 번째 late
  failure가 state를 훼손하거나, global pending promise가 logout/new sign-in 뒤 새
  account의 onboarding 호출을 이전 operation에 합친다.
- 적용 조건: controller public mutation을 UI 외 여러 caller가 호출할 수 있고 session
  generation이 epoch로 바뀌는 구조.
- root cause: UI disabled/ref를 controller invariant로 오인하거나 single-flight promise를
  session generation에 묶지 않았다.
- 해결 절차:
  1. pending completion을 `{ epoch, operation }`으로 저장한다.
  2. 같은 current epoch만 기존 operation을 반환하고 다른 epoch는 새 PATCH를 시작한다.
  3. resolve/reject cleanup은 record identity가 여전히 같을 때만 pending 값을 지운다.
  4. success/error state mutation은 captured epoch와 onboarding state가 유지될 때만 한다.
  5. same-epoch 두 caller와 A pending → logout → B onboarding을 각각 테스트한다.
- 검증: duplicate/cross-epoch 경로가 RED였고 `befac64` 후 focused 34/34와 independent
  recheck가 통과했다.
- 재발 방지/금지: action label·버튼 disabled를 domain single-flight로 사용하지 않는다.
- 적용 불가/잔여 위험: 보장은 한 `SessionController` 인스턴스 범위다.
- 근거: [Session controller](../../DSM_Front/src/features/auth/session-controller.ts),
  [Controller tests](../../DSM_Front/src/features/auth/session-controller.test.ts)
- `lastVerifiedAt`: `2026-08-11`

### ER-20260811-003 — Refresh/logout의 token-family row-lock 직렬화

- `resolutionId`: `ER-20260811-003`
- `status`: `VERIFIED`
- 증상/signature: 같은 raw refresh token으로 refresh와 logout이 교차하면 refresh가
  successor를 만든 뒤 logout이 revoked predecessor만 다시 처리해 204를 반환하고
  successor가 살아남는다.
- 적용 조건: refresh token rotation을 DB row로 저장하고 여러 device/session을 같은
  user가 가질 수 있는 PostgreSQL/Prisma backend.
- root cause: token lineage가 없고 refresh/logout이 같은 serialization lock과 revocation
  boundary를 공유하지 않았다.
- 해결 절차:
  1. `RefreshToken.sessionId`를 non-null로 추가하고 legacy row는 `sessionId=id`로 backfill한다.
  2. initial login은 새 family default를 쓰고 rotation은 predecessor `sessionId`를 승계한다.
  3. refresh와 logout transaction이 같은 `User` row를 `FOR UPDATE`로 먼저 잠근다.
  4. logout은 ownership/hash가 맞는 revoked predecessor도 family locator로 허용하고
     `{ userId, sessionId, revokedAt: null }`만 `updateMany`한다.
  5. refresh-first/logout-first/two-refresh 순서와 unrelated family exclusion을 검증한다.
- 검증: `bd4354b`, `f99e28b`, focused AuthService 18/18, Backend 전체 23 suites·214 tests,
  build/lint가 통과했다. local DB에 migration 1회 적용 후 4 migrations up-to-date,
  zero drift, live text NOT NULL/index를 확인했고 independent recheck `RECHECKED`.
- 재발 방지/금지: logout 204를 predecessor 한 행 update와 동일시하지 않는다. user 전체
  token revoke로 family 경계를 과도하게 넓히지 않는다.
- 적용 불가/잔여 위험: 실제 multi-connection service interleaving test는 미실행이다.
- 근거: [Auth service](../../DSM_Back/src/auth/auth.service.ts),
  [Auth tests](../../DSM_Back/src/auth/auth.service.spec.ts),
  [Session-family migration](../../DSM_Back/prisma/migrations/20260810_refresh_token_session_family/migration.sql)
- `lastVerifiedAt`: `2026-08-11`

### ER-20260811-004 — Expo Router app tree의 Jest module 오염

- `resolutionId`: `ER-20260811-004`
- `status`: `VERIFIED`
- 증상/signature: `src/app/**` 아래 `.test.tsx`가 Expo Router route manifest와 Web
  bundle에 포함돼 browser에서 `expect is not defined`로 startup이 차단된다.
- 적용 조건: Expo Router file-based routing과 Jest colocated test를 함께 쓰는 SDK 55 app.
- root cause: 일반 React source colocation 규칙을 route discovery root에도 적용했다.
- 해결 절차:
  1. app route tests를 `src/__tests__/app/**`로 이동하고 import를 조정한다.
  2. `src/app`을 재귀 검색해 `.test.[jt]sx?`가 0개임을 강제하는 regression을 둔다.
  3. focused/full Jest와 Web export route list, generated artifact/sentinel scan, browser
     console을 확인한다.
- 검증: `eb0e5d5` 후 17 suites·136 tests, 11-route Web export, desktop/mobile Browser QA와
  independent fix-recheck가 통과했다.
- 재발 방지/금지: Expo Router app tree에 Jest module을 colocate하지 않는다.
- 적용 불가/잔여 위험: 현재 guard는 `.test.*` convention을 고정하며 future `.spec.*`도
  사용하려면 guard pattern을 함께 확장해야 한다.
- 근거: [Route boundary test](../../DSM_Front/src/features/auth/app-route-boundary.test.ts),
  [Auth change-gate](../audits/20260725-change-gate-front-secure-session/findings.jsonl)
- `lastVerifiedAt`: `2026-08-11`

### ER-20260811-005 — Windows Prisma generate의 engine DLL rename `EPERM`

- `resolutionId`: `ER-20260811-005`
- `status`: `VERIFIED`
- 증상/signature: `prisma generate`가 `query_engine-windows.dll.node.tmp<id>`를 최종 DLL로
  rename할 때 `EPERM: operation not permitted`로 실패한다. schema validate는 통과한다.
- 적용 조건: Windows에서 Nest build/Jest/e2e 등 Prisma Client를 load하는 Node process와
  `prisma generate`를 병렬 실행한 경우.
- root cause: 실행 중인 backend process가 기존 query engine DLL handle을 보유한 동안
  generate가 같은 파일을 교체하려 했다.
- 해결 절차:
  1. 오류 path가 `node_modules/.prisma/client/query_engine-windows.dll.node`인지 확인한다.
  2. 같은 worktree의 build/test/dev-server와 generate를 병렬 실행하지 않는다.
  3. 관련 backend command가 종료됐고 임시 DLL이 남지 않았는지 확인한다.
  4. schema나 migration을 바꾸지 않고 `prisma generate`만 단독 재실행한다.
- 검증: build/e2e와 병렬 실행에서 같은 rename `EPERM` 재현 후, 종료 상태에서 단독
  generate가 Prisma Client v6.19.3을 175ms에 생성했다. 이후 build/e2e도 통과했다.
- 재발 방지/금지: DLL 잠금을 schema·migration 오류로 오인해 DB reset/apply, package
  reinstall 또는 engine 파일 강제 삭제를 수행하지 않는다.
- 적용 불가/잔여 위험: 장기 실행 dev server가 같은 client를 load했다면 해당 process를
  명시적으로 종료한 뒤 재시도해야 한다.
- 근거: [Prisma schema](../../DSM_Back/prisma/schema.prisma),
  [Front secure session 실행 기록](./plan.md)
- `lastVerifiedAt`: `2026-08-11`

### ER-20260813-001 — Expo SDK patch의 stale peer lock `ERESOLVE`

- `resolutionId`: `ER-20260813-001`
- `status`: `VERIFIED`
- 증상/signature: npm 11에서 `npx expo install --fix`가 먼저 `expo`와 root version range를
  갱신한 뒤 재진입한 두 번째 install에서 구 `expo-router`와 `@expo/log-box`를 lockfile에서
  읽어 `ERESOLVE could not resolve`로 중단한다.
- 적용 조건: Expo SDK 55 patch update, npm 11.6.2, `expo-router@55.0.17`이
  `@expo/metro-runtime@^55.0.12`와 `@expo/log-box@55.0.13`을 요구하지만 lockfile에는
  Router 55.0.14, Metro Runtime 55.0.11, LogBox 55.0.12가 남은 경우.
- root cause: Expo CLI의 2단계 SDK update가 root version range를 먼저 publish했고, npm
  Arborist가 두 번째 단계에서 호환 불가능한 구 exact peer tuple을 lockfile 기준으로
  전환하려 했다.
- 해결 절차:
  1. `package.json`, lockfile, disk package version을 각각 확인해 partial update인지 구분한다.
  2. registry metadata와 `npm install --dry-run --no-save`로 새 Router/Metro/LogBox tuple이
     자체적으로 호환되는지 확인한다.
  3. `--force`와 `--legacy-peer-deps`를 사용하지 않는다.
  4. partial lock을 task-local ignored 경로에 임시 보존한 뒤 현재 승인된 `package.json`으로
     `npm install --package-lock-only --ignore-scripts`를 실행한다.
  5. 정상 install 뒤 `npm ls --all`, `expo install --check`, full test/typecheck/lint와 exact
     changed-file scope를 검증하고 임시 lock을 제거한다.
- 검증: fresh lock 생성과 compatible install 후 전체 npm tree와 Expo compatibility check가
  exit 0이었다. Front 17 suites·136 tests, TypeScript, ESLint(0 errors)가 통과했다.
- 재발 방지/금지: partial lock에서 같은 install을 반복하거나 peer 검증을 무력화하지 않는다.
  자동 audit fix와 broad dependency update를 함께 수행하지 않는다.
- 적용 불가/잔여 위험: fresh lock에서 특정 runtime import가 nested-only layout 때문에
  실패하면 `ER-20260813-002`를 별도로 적용한다.
- 근거: [Android Google provider login plan](../../docs/superpowers/plans/2026-08-12-android-google-provider-login.md)
- `lastVerifiedAt`: `2026-08-13`

### ER-20260813-002 — npm hoist 차이에 따른 `expo-asset` module resolution 실패

- `resolutionId`: `ER-20260813-002`
- `status`: `VERIFIED`
- 증상/signature: SDK patch 뒤 Jest가 `expo-font/build/FontLoader.js`에서
  `Cannot find module 'expo-asset'`로 여러 UI suite를 시작하지 못한다. lockfile에는
  `node_modules/expo/node_modules/expo-asset`만 있고 top-level entry가 없다.
- 적용 조건: Expo 55.0.28, `expo-font` 55.0.8, `expo-asset` 55.0.18, npm 11.6.2에서
  app이 top-level `expo-font` 또는 `@expo/vector-icons`를 사용하고 fresh lock이 asset을
  Expo dependency 아래에만 배치한 경우.
- root cause: `expo-font` runtime이 `expo-asset`을 import하지만 해당 package metadata가
  이를 직접 dependency로 선언하지 않아, npm의 유효한 nested layout에서는 Node/Jest
  resolver가 sibling package import를 찾을 수 없다.
- 해결 절차:
  1. lockfile과 disk에서 top-level/nested `expo-asset` 위치를 각각 확인한다.
  2. `npm dedupe --dry-run`이 광범위 transitive 변경을 제안하면 적용하지 않는다.
  3. 사용자 승인 뒤 app runtime dependency에 `expo-asset@~55.0.18`을 직접 선언한다.
  4. 최초 실패 UI suites를 focused 재실행한 뒤 full Jest, TypeScript, ESLint, `npm ls
     --all`, `expo install --check`를 실행한다.
  5. Expo config file hash와 Git changed-file allowlist가 보존됐는지 확인한다.
- 검증: direct declaration 전 4 suites가 같은 module-resolution 오류로 실패했고, 추가 후
  focused 4 suites·14 tests와 full 17 suites·136 tests가 통과했다. TypeScript, 전체 npm
  tree, Expo compatibility check는 exit 0이고 ESLint는 0 errors·기존 warnings 2였다.
- 재발 방지/금지: test mock이나 Jest resolver alias로 실제 runtime dependency 누락을
  숨기지 않는다. 하나의 hoist를 위해 broad `npm dedupe`를 실행하지 않는다.
- 적용 불가/잔여 위험: 이후 Expo/`expo-font` release가 dependency metadata를 고치면 direct
  declaration 필요성을 공식 versioned docs와 clean install에서 다시 평가한다.
- 근거: [Front package manifest](../../DSM_Front/package.json),
  [Android Google provider login plan](../../docs/superpowers/plans/2026-08-12-android-google-provider-login.md)
- `lastVerifiedAt`: `2026-08-13`

### ER-20260813-003 — Jest의 eager Nitro TurboModule import 차단

- `resolutionId`: `ER-20260813-003`
- `status`: `VERIFIED`
- 증상/signature: Jest가 native Google package를 import할 때 `Failed to get NitroModules`와
  `TurboModuleRegistry.getEnforcing(...): 'NitroModules' could not be found`로 suite 시작 전에
  실패한다.
- 적용 조건: Jest/Node test runtime에서 import한 React Native package가 module evaluation
  시점에 `NitroModules.createHybridObject(...)`를 호출하고, 실제 native binary는 없는 경우.
- root cause: test 대상 adapter의 injected logic이 아니라 외부 package singleton의 eager
  native-module 초기화가 Jest runtime 경계를 넘어 실행됐다.
- 해결 절차:
  1. stack이 제품 함수 호출 전 package import와 Nitro TurboModule registry에서 끝나는지 확인한다.
  2. test file에서 외부 package 중 제품 module이 참조하는 export와 native method만 mock한다.
  3. adapter factory와 제품 error/normalization logic은 mock하지 않고 injected dependency로
     실제 실행한다.
  4. mock 자체를 assertion 대상으로 삼지 않고 focused Jest, TypeScript와 lint를 재실행한다.
- 검증: mock 전 suite는 0 tests로 native import에서 실패했고, 경계 mock 뒤 adapter 9 tests가
  통과했다. TypeScript와 focused lint도 exit 0이었다.
- 재발 방지/금지: 제품 adapter 전체를 mock해 behavior test를 무효화하거나 Jest를 위해 native
  product import를 임의 dynamic-import 구조로 바꾸지 않는다.
- 적용 불가/잔여 위험: native bridge, autolinking, config plugin과 실제 Credential Manager 동작은
  development build·physical device에서 별도 검증해야 한다.
- 근거: [Google sign-in adapter tests](../../DSM_Front/src/features/auth/google-sign-in.test.ts),
  [Google sign-in adapter](../../DSM_Front/src/features/auth/google-sign-in.ts)
- `lastVerifiedAt`: `2026-08-13`

### ER-20260813-004 — Jest callback arity 추론의 `TS2322`

- `resolutionId`: `ER-20260813-004`
- `status`: `VERIFIED`
- 증상/signature: `jest.fn(() => false)`가 `Mock<boolean, [], unknown>`으로 추론돼
  `(error: unknown) => boolean` dependency에 할당될 때 `TS2322`가 발생한다.
- 적용 조건: Jest 29·TypeScript 5.9에서 test double callback이 argument를 사용하지 않지만
  제품 interface는 하나 이상의 필수 argument를 선언한 경우.
- root cause: Jest가 callback 구현의 실제 0-argument arity를 보존해, 제품 dependency의 필수
  argument tuple과 다른 mock type을 만들었다.
- 해결 절차:
  1. TypeScript 오류가 제품 interface가 아니라 test fake 할당 위치를 가리키는지 확인한다.
  2. mock callback에 제품 계약과 같은 typed argument를 선언한다(예: `(_error: unknown) => false`).
  3. 제품 callback type을 optional로 약화하거나 broad cast로 오류를 숨기지 않는다.
  4. focused Jest와 전체 TypeScript, lint를 재실행한다.
- 검증: 수정 전 `google-sign-in.test.ts`에서 정확한 `Mock<boolean, []>` 대
  `MockInstance<boolean, [error: unknown]>` 오류를 재현했고, argument type 추가 후 adapter
  9 tests, TypeScript와 focused lint가 통과했다.
- 재발 방지/금지: 사용하지 않는 argument라는 이유로 test double의 interface arity를
  삭제하지 않는다. generic return mismatch는 별도 `ER-20260726-004`를 사용한다.
- 적용 불가/잔여 위험: callback 자체가 generic이면 단순 argument 추가로 충분하지 않으므로
  generic mock record의 절차를 따른다.
- 근거: [Google sign-in adapter tests](../../DSM_Front/src/features/auth/google-sign-in.test.ts)
- `lastVerifiedAt`: `2026-08-13`

### ER-20260813-005 — Jest mock factory의 초기화 전 함수 값 캡처

- `resolutionId`: `ER-20260813-005`
- `status`: `VERIFIED`
- 증상/signature: UI handler는 generic failure 경로에 들어가지만 `jest.fn()`으로 만든 adapter
  operation의 호출 수는 0이다. 성공·취소 fixture도 모두 같은 generic error로 바뀐다.
- 적용 조건: Jest 29의 hoisted `jest.mock()` factory가 뒤에서 선언한 `mock*` 변수를 객체
  property 값으로 직접 할당하고, 대상 제품 module이 test top-level import로 먼저 평가되는 경우.
- root cause: mock factory 평가 시점에 `googleSignInAdapter: { acquireIdToken:
  mockAcquireIdToken }`가 초기화 전 값을 캡처했다. 제품 handler는 undefined operation 호출에서
  `TypeError`를 받아 generic failure로 정상화했으므로 원래 mock은 호출되지 않았다.
- 해결 절차:
  1. 제품 handler 진입 여부와 mock call count·generic catch 결과를 함께 확인한다.
  2. factory가 mock 함수 값을 직접 복사하는지 확인한다.
  3. property를 `acquireIdToken: () => mockAcquireIdToken()`처럼 호출 시점에 참조하는 좁은
     wrapper로 바꾼다.
  4. 제품 코드를 우회하거나 error classifier를 약화하지 않고 focused UI와 auth 회귀 suite,
     TypeScript, lint를 재실행한다.
- 검증: 직접 값 캡처에서는 login screen 9 tests 중 4개가 실패했고 adapter mock call은 0이었다.
  호출 시점 wrapper 적용 뒤 9/9, 관련 auth 4 suites·54 tests, TypeScript와 focused lint가 통과했다.
- 재발 방지/금지: mock 초기화 순서를 숨기기 위해 제품 import를 dynamic import로 바꾸거나 제품
  예외 처리를 제거하지 않는다. mock factory에서 뒤 선언된 함수 값의 eager property 할당을 피한다.
- 적용 불가/잔여 위험: factory가 호출 시점 callback 자체를 만들 수 없거나 ESM unstable mock을
  사용한다면 해당 Jest module-loading 계약을 별도로 검증해야 한다.
- 근거: [Login screen tests](../../DSM_Front/src/__tests__/app/index.test.tsx),
  [Login screen](../../DSM_Front/src/app/index.tsx)
- `lastVerifiedAt`: `2026-08-13`

### ER-20260813-006 — Android-only explicit Google client-ID에서 config plugin 충돌

- `resolutionId`: `ER-20260813-006`
- `status`: `VERIFIED`
- 증상/signature: `react-native-nitro-google-signin`을 `expo.plugins`에 문자열로 추가한 뒤
  `expo config --type prebuild --json`이 exit 1하고 유효한 config JSON을 출력하지 않는다.
- 적용 조건: Expo SDK 55, `react-native-nitro-google-signin@1.3.0`, Android-only milestone,
  `GoogleOneTapSignIn.configure({ webClientId: <explicit public Web client ID> })`를 사용하며 iOS
  URL scheme과 Google Services plist/json을 아직 승인·구성하지 않은 경우.
- root cause: package 1.3.0 config plugin은 platform-neutral config 평가에서 iOS URL scheme 또는
  Google Services file을 필수로 요구하고 iOS Podfile mod도 등록한다. Android native module
  자체는 설치 dependency에서 Expo React Native autolinking으로 발견된다.
- 해결 절차:
  1. package의 설치된 `app.plugin.js`와 plugin source, versioned README를 확인한다.
  2. Android explicit client-ID 경로에서는 가짜 iOS scheme, placeholder Google Services file,
     client secret을 추가하지 않는다.
  3. package를 runtime dependency로 유지하되 해당 config plugin을 `expo.plugins`에 등록하지 않는다.
  4. 승인된 `expo.android.package`를 설정하고 `expo config --type prebuild --json`을 실행한다.
  5. `expo-modules-autolinking react-native-config --platform android` 출력에 package와
     `NitroGoogleSigninPackage`가 있는지 확인하고 native folder가 생성되지 않았는지 검증한다.
- 검증: plugin 등록 상태에서 Expo config는 exit 1이었다. 미등록 후 package
  `com.dsm.dailyup`이 해석됐고 Android autolinking이 Google/Nitro native package를 발견했으며
  config·diff check가 통과했다. `android/`·`ios/`은 생성되지 않았다.
- 재발 방지/금지: config 통과를 위해 가짜 iOS OAuth 값이나 Google Services 파일을 만들지 않는다.
  이후 package plugin이 Android-only option을 공식 지원하면 installed source와 clean config에서
  다시 평가한다.
- 적용 불가/잔여 위험: iOS 또는 Firebase/`autoDetect`를 도입할 때는 plugin과 실제 승인된
  URL scheme/Google Services 설정이 필요하다. EAS Android build와 physical-device 동작은 미검증이다.
- 근거: [Google login design](../../docs/superpowers/specs/2026-08-12-android-google-provider-login-design.md),
  [implementation plan](../../docs/superpowers/plans/2026-08-12-android-google-provider-login.md),
  [Expo app config](../../DSM_Front/app.json)
- `lastVerifiedAt`: `2026-08-13`

### ER-20260816-001 — ESLint 8과 React Native flat-config/plugin 해석 충돌

- `resolutionId`: `ER-20260816-001`
- `status`: `VERIFIED`
- 증상/signature: ESLint 8.57에서 `ERR_PACKAGE_PATH_NOT_EXPORTED: eslint/config`가 발생하거나 `eslint-plugin-react-hooks`를 root에서 찾지 못한다.
- 적용 조건: `@react-native/eslint-config@0.83.x`, ESLint 8, `FlatCompat`를 사용하는 npm install에서 plugin들이 config package 아래에 nested된 경우.
- root cause: config가 ESLint 9 전용 helper를 사용했고 legacy shareable config의 plugin 해석 기준이 package 설치 위치와 달랐다.
- 해결 절차: `eslint/config` helper 없이 flat config 배열을 export하고 `FlatCompat.resolvePluginsRelativeTo`를 `@react-native/eslint-config` package directory로 지정한다.
- 검증: `npm run lint` exit 0, errors 0. 기존 style/no-void warnings는 별도 cleanup 대상이다.
- 재발 방지/금지: lint를 끄거나 plugin rule을 임의 제거하지 않는다. ESLint major 변경 시 official React Native config 호환성을 함께 재검증한다.
- 근거: [ESLint config](../../DSM_Front/eslint.config.js)
- `lastVerifiedAt`: `2026-08-16`

### ER-20260816-002 — 이전 Jest transform cache로 native mock identity 불일치

- `resolutionId`: `ER-20260816-002`
- `status`: `VERIFIED`
- 증상/signature: Keychain test는 focused fresh cache에서 11/11 통과하지만 기존 cache를 재사용한 full run에서 정상 case만 고정 storage error로 실패한다.
- 적용 조건: Jest preset/module mapper/native mock 설정을 변경한 뒤 같은 project-local cache directory를 재사용한 경우.
- root cause: 이전 transform/module-resolution 상태가 cache에 남아 test가 설정한 mock과 production import가 같은 identity를 보지 못했다.
- 해결 절차: 제품 코드를 바꾸기 전에 focused fresh cache로 재현성을 분리하고, verified project-local Jest cache만 제거한 뒤 unique fresh cache로 full suite를 실행한다.
- 검증: fresh cache full run에서 18 suites, 161 tests 전부 통과했다.
- 재발 방지/금지: cache-only 실패를 제품의 fail-closed storage 동작을 약화해 해결하지 않는다. Windows sandbox에서는 system Temp 대신 project-local cache를 사용한다.
- 근거: [Jest config](../../DSM_Front/jest.config.js), [Keychain tests](../../DSM_Front/src/features/auth/token-store.native.test.ts)
- `lastVerifiedAt`: `2026-08-16`

### ER-20260816-003 — Metro Windows cache 손상과 sandbox reset 권한 오류

- `resolutionId`: `ER-20260816-003`
- `status`: `VERIFIED`
- 증상/signature: `Unable to deserialize cloned data` 뒤 Metro full crawl이 오래 걸리거나 `--reset-cache`가 `%LOCALAPPDATA%\Temp\metro-cache`의 `EPERM`으로 종료된다.
- 적용 조건: React Native 0.83 Metro on Windows, sandbox가 user Temp 삭제를 제한하고 project root에 대형 test cache가 남은 경우.
- root cause: 손상된 Metro disk cache와 불필요한 project-local test cache crawl, sandbox의 user Temp 삭제 제한이 겹쳤다.
- 해결 절차: Metro를 중지하고 exact project-local `.jest-cache-*`만 경로 검증 후 제거한다. `npm start -- --port 8081 --reset-cache`를 필요한 Temp 권한으로 실행하고 `Dev server ready` 뒤 앱을 재시작한다.
- 검증: reset 뒤 Metro가 `index.js` bundle을 다시 생성했고 Android Studio 설치 앱이 Community bundle을 요청했다.
- 재발 방지/금지: source/build output을 포괄 삭제하거나 broad Temp delete를 하지 않는다. 삭제 대상은 exact cache path로 제한한다.
- 적용 불가/잔여 위험: 최초 clean transform은 수 분 걸릴 수 있으므로 진행률과 CPU를 확인한다.
- 근거: [Metro config](../../DSM_Front/metro.config.js), [Android local plan](../../docs/superpowers/plans/2026-08-15-android-studio-local-development.md)
- `lastVerifiedAt`: `2026-08-16`

### ER-20260817-001 — Android Studio debug signer OAuth 누락으로 Google 로그인이 `[16]`에서 중단됨

- `resolutionId`: `ER-20260817-001`
- `status`: `VERIFIED`
- 증상/signature: Android emulator에서 Google 계정을 선택해도 Credential Manager가
  `[16] Account reauth failed`를 반환하고 앱이 Login으로 복귀한다. backend `/auth/login`과
  Keychain refresh token 생성 전이다.
- 적용 조건: React Native Android 앱이 PC별 기본 debug keystore로 서명되고, package와 Web OAuth
  audience는 맞지만 현재 debug signer의 SHA-1이 같은 Google Cloud project의 Android OAuth
  client에 등록되지 않은 경우.
- root cause: 기존 Android OAuth clients는 package만 일치하고 현재 Android Studio debug signer와
  fingerprint가 달랐다. Credential Manager/native adapter는 이 signer trust 실패를 사용자 취소와
  같은 cancellation 계열로 축약했다.
- 해결 절차:
  1. 앱의 Web client와 선택한 Google Cloud project의 Web client가 같은지 값 비출력 digest 비교로 확인한다.
  2. 현재 APK/debug keystore signer와 기존 same-package Android clients를 값 비출력 digest로 비교한다.
  3. 기존 client를 덮어쓰지 않고 `com.dsm.dailyup`과 현재 PC debug signer용 Android OAuth client를
     별도로 생성한다. 전송·영구 생성 직전에 사용자 action-time 승인을 받는다.
  4. 생성 UI 오류만 믿지 않고 client list/detail을 다시 읽어 matching client가 정확히 존재하는지 확인한다.
  5. Google ID-token→backend exchange→relaunch/refresh→logout→post-logout relaunch까지 검증한다.
- 검증: matching client 생성 뒤 Google ID-token fetch와 sign-in이 성공했다. disposable DB에
  user/social/session이 생성됐고, 재실행은 authenticated Home과 refresh rotation을 복구했다.
  logout 뒤 active refresh token은 0이었고 재실행도 Login을 유지했다. 독립 validator 2명이
  historical finding을 `SURVIVED`, 구현자와 분리된 reviewer가 external fix를 `RECHECKED`로 판정했다.
- 재발 방지/금지: SHA-1·client ID·token 완전값을 Git, memory, chat, log에 남기지 않는다. 다른 PC의
  debug keystore나 release/Play signer를 기존 client에 덮어쓰지 말고 signer별 client로 등록한다.
  Cloud UI가 일반 오류를 표시해도 같은 요청을 즉시 반복하지 말고 list/detail의 실제 최종 상태를 먼저 읽는다.
- 적용 불가/잔여 위험: 이 record는 현재 PC debug signer만 다룬다. release/Play signing, 다른 PC,
  production environment provisioning과 앱의 silent cancellation 분류 결함 `F-026`은 별도 gate다.
- 근거: [Android local runbook](../../DSM_Front/README.md),
  [Android Gradle config](../../DSM_Front/android/app/build.gradle),
  [release audit](../audits/20260817-release-audit-full-project/README.md)
- `lastVerifiedAt`: `2026-08-17`

### ER-20260827-001 — Prisma upgrade seed의 PostgreSQL enum literal 불일치

- `resolutionId`: `ER-20260827-001`
- `status`: `VERIFIED`
- 증상/signature: canonical migration prefix까지 적용된 PostgreSQL에서 upgrade seed가
  `invalid input value for enum`과 psql exit `3`으로 중단되고 forward migration과 invariant probe가 실행되지 않는다.
- 적용 조건: Prisma schema와 초기 migration이 PostgreSQL enum을 정의하고, canonical-prefix upgrade를
  disposable database와 고정 seed로 검증하는 경우.
- root cause: 검증 계획의 seed literal이 canonical enum 정의와 대조되지 않아 존재하지 않는 값을 사용했다.
- 해결 절차:
  1. 오류에 표시된 enum을 Prisma schema와 enum 생성 migration 양쪽에서 확인한다.
  2. seed를 그 교집합의 유효 literal로 최소 수정한다.
  3. 실패한 canonical extraction은 증거로 보존하고, 사전 부재가 확인된 새 extraction 경로와 새 disposable container를 사용한다.
  4. empty final chain, canonical prefix, seed, forward delta, invariant probe를 처음부터 다시 실행하고 captured container ID만 정리한다.
- 검증: PostgreSQL 17에서 empty chain 5개와 canonical prefix 4개를 각각 deploy/status 확인했다.
  유효 enum seed가 `1/1/2` rows로 적용된 뒤 forward chain 5개와 dedupe/index invariant probe가 exit `0`;
  두 task container 이름과 process `DATABASE_URL`은 종료 후 부재했다. 독립 reviewer verdict는 `APPROVED`였다.
- 재발 방지/금지: enum 값을 관용 이름으로 추측하지 않는다. 실패한 ignored extraction을 삭제·덮어쓰기·재사용하지 않고,
  기존/shared/remote database에서 재현하지 않는다.
- 적용 불가 또는 잔여 위험: enum을 사용하지 않거나 seed 없이 검증하는 migration에는 적용하지 않는다.
  disposable 검증은 실제 운영 database history의 확인이나 배포 승인을 대체하지 않는다.
- 근거: [Task 11 plan](../../docs/superpowers/plans/2026-08-25-main-branch-integration-review.md),
  [Prisma schema](../../DSM_Back/prisma/schema.prisma),
  [forward migration](../../DSM_Back/prisma/migrations/20260825_integration_backend_deltas/migration.sql)
- `lastVerifiedAt`: `2026-08-27`

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
