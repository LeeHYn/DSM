# 12B Notification Change Gate

- audit id: `20260716-change-gate-notification-12b`
- mode: `change-gate`
- 승인: 2026-07-16 사용자가 branch A와 12B 구현·아키텍처 문서 갱신을 승인
- 확장 승인: 2026-07-19 사용자가 `per-device delivery 확장 승인`을 명시
- 지속형 로컬 개발 DB migration 적용: 2026-07-19 승인, 2026-07-20 Docker Engine·PostgreSQL 17·migration·영속성 검증 완료
- worker 구현 승인: 2026-07-20 사용자가 직전 제시한 `F-007`~`F-010` 안전성 보완과 Firebase provider·dispatcher·Cron 구현에 `ㄱ`으로 승인
- 외부 side-effect 정책 승인: 2026-07-20 사용자가 F-004/F-010 수정과 F-007 data-only/current-state 완화 후 recall 불가 잔여 위험 수용안을 `승인`
- 원격·운영 DB migration·Firebase credential 조회·실제 메시지 발송·배포: 제외

## 범위

- Firebase Admin ADC 초기화와 dispatch 활성화 gate
- `NotificationSchedule` claim·lease·retry·상태 전이
- Task·User 설정 재검증과 FCM token 수명주기
- branch A 초기 migration과 Prisma schema parity
- Nest scheduler 중첩 실행과 다중 인스턴스 경쟁
- payload privacy, partial failure와 Firebase error classification

## 라운드

### Round 1

- finder lens: `claim-lease-retry-task-cancellation-data-integrity`
- finder lens: `firebase-adc-token-lifecycle-error-classification-privacy`
- baseline: 백엔드 Jest 18 suites·146 tests 통과, TypeScript 통과
- Firebase/privacy P2 `F-001`~`F-005`: 독립 reviewer 2명 판정이 모두 `SURVIVED`, `CONFIRMED`
- concurrency finder 후보 `F-007`, `F-008`, `F-010`, `F-011`: 두 독립 reviewer가 모두 `SURVIVED`, `CONFIRMED`
- partial chunk 후보 `F-009`: `SURVIVED`, `UNKNOWN`, 제3 reviewer `SURVIVED`로 다수 판정 `CONFIRMED`
- `F-004`는 두 finder가 같은 live-worker lease 만료 원인을 발견해 alias를 병합

### Round 2

- runtime integration lens에서 기존 Auth/JWT module 경계 때문에 `AppModule` DI compile과 기존 e2e가 실패하는 `F-014` P1을 발견
- 두 독립 validator가 feature module·AppModule·e2e 반박 probe 뒤 모두 `SURVIVED`로 판정해 `CONFIRMED`
- 결함은 12B 이전부터 존재하지만 전체 API server와 새 Cron 시작을 막으므로 change-gate에 포함했고, 승인된 Auth/JWT module 경계 수정과 독립 fix-recheck로 `RECHECKED`했다.

## 현재 구현 상태

2026-07-19 확장 승인을 받아 `NotificationDelivery` 스키마와 Branch A 초기 migration을 구현하고 지속형 로컬 PostgreSQL에 적용했다. 2026-07-20 추가 승인으로 token transfer와 Task cancellation 보완, ADC provider, 30초 Cron dispatcher와 module wiring을 구현했다. 원격·운영 DB와 Firebase credential·메시지 호출은 계속 제외한다.

dispatcher는 schedule 100개·delivery 500개 제한, 짧은 Serializable claim, 5분 lease·60초 heartbeat, device별 조건부 결과 영속화, 명시적 known failure 최대 3회, `Retry-After`와 invalid token revoke를 사용한다. `sendStartedAt` all-or-none marker 이후 불명확 결과는 terminal `UNKNOWN`으로 끝내며 자동 재발송하지 않는다. payload는 Task/account 정보가 없는 data-only `REMINDER_SYNC`·version이고 Android/APNs immediate TTL·collapse 설정을 사용한다. 첫 fix-recheck에서 유효한 장시간 `Retry-After`가 1시간으로 단축되는 반례를 발견해 future server 지시는 그대로 보존하고 상한은 fallback에만 적용하도록 보정했다.

최종 변경 기준 backend Jest 22 suites·198 tests, 기존 e2e 1 suite·2 tests, direct AppModule compile, TypeScript, Prisma validation, 변경 파일 non-fix ESLint·Prettier와 `git diff --check`가 통과했다.

스키마와 전체 초기 SQL은 `npx prisma validate`, 정적 schema/SQL parity와 `git diff --check`를 통과했다. 독립 schema review와 adversarial validation에서 확인된 retry due·stale lease index 분리 `F-012` P2와 `migration_lock.toml` 추가 `F-013` P3는 승인 범위에서 수정됐고 독립 fix-recheck에서 모두 `RECHECKED`됐다. 실제 PostgreSQL `EXPLAIN ANALYZE`와 `prisma migrate status`도 통과해 두 finding의 로컬 런타임 잔여 검증을 해소했다.

두 번째 재부팅 뒤 Docker Engine 29.6.1과 Compose 5.3.0을 기동했다. PostgreSQL 17 컨테이너는 `healthy`, `unless-stopped`, `127.0.0.1:5432`, `dsm-back-postgres-data` named volume 상태다. `20260716_init`과 `20260720_notification_delivery_outcome_policy` 적용·status, datasource↔datamodel zero drift, `sendStartedAt` nullable `timestamptz(6)`, 10개 application table, 12개 FK action, 두 delivery index query plan과 재시작 marker 영속성을 검증했다. probe·marker 데이터는 rollback 또는 삭제해 잔류하지 않는다.

`F-011`은 위 실제 migration·parity gate로 `FIXED` 처리했고, 구현자와 분리된 `/root/db_runtime_recheck`가 local migration SQL SHA-256과 `_prisma_migrations.checksum`의 exact match, zero drift와 live catalog를 읽기 전용으로 재확인해 `RECHECKED` 판정했다. 승인된 로컬 DB 범위에서 신규 P0·P1은 없었다.

현재 finding 상태의 핵심은 다음과 같다.

- `F-001`~`F-005`, `F-008`, `F-009`: 독립 fix-recheck `RECHECKED`
- `F-004`: durable send marker·terminal `UNKNOWN` at-most-once 정책으로 자동 중복 재발송 조건 차단, 독립 `RECHECKED`
- `F-007`: account-neutral data-only payload·send 직전 재검증으로 완화. send 시작 뒤 recall 불가와 12C client 표시 직후 취소 race만 사용자 `ACCEPTED_RISK`; 12C 전 dispatch 비활성
- `F-010`: cross-user token/FID in-place 이전을 mutation 전 409로 거부하고 account-neutral payload 적용, 독립 `RECHECKED`
- `F-011`: `RECHECKED`, 로컬 migration checksum·schema parity·live catalog 확인 완료
- `F-012`: `RECHECKED`, 실제 PostgreSQL query plan 확인 완료
- `F-013`: `RECHECKED`, 실제 migrate status 확인 완료
- `F-014`: Auth/JWT module 경계 수정, AppModule compile·e2e 복구와 독립 fix-recheck 완료로 `RECHECKED`

현재 원장의 13개 finding 중 F-007만 사용자 `ACCEPTED_RISK`, 나머지 12개는 `RECHECKED`다. 미해결 `CONFIRMED`, `FIXED`, `RECHECKING`, `UNKNOWN`과 P0·P1은 없다.

## 종료 조건

`.ai/agents/verification-workflow.md`의 `change-gate`를 따른다.

- 확정 finding은 모두 `RECHECKED` 또는 사용자 승인 `ACCEPTED_RISK`
- 미해결 P0·P1 없음
- P2 처리 상태 명시
- 전체 정적·unit 검증 통과
- 실제 로컬 PostgreSQL 검증과 원격·운영 DB·Firebase·배포 미검증 위험을 분리해 기록

## 종료 판정

- 2026-07-20 change-gate의 정적·unit·로컬 DB 종료 조건을 충족했다.
- 이 판정은 실제 Firebase 발송이나 배포 승인이 아니다.
- 12C authenticated current-state fetch/display와 logout/account-switch Installation rotation을 구현·검증하기 전까지 `FCM_DISPATCH_ENABLED=false`를 유지한다.
- 별도 test project/device의 ADC·FCM sandbox, 실제 다중 worker PostgreSQL 경쟁, 원격·운영 DB와 배포는 후속 gate다.
