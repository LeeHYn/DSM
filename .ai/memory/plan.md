# DSM 실행 계획 — 2026-09-09

## 목표·경계

- 제품 범위는 Android 전용 DSM v1.3이다.
- 제품·감사 checkout은 `codex/integration-main-review`이며 F-007/F-008/F-009 checkpoint `317253cff1fd938b847017697f049582720261f9`까지 원격과 같다. 이 memory snapshot이 해당 기준을 후속 기록한다.
- 이번 범위는 새 temporal-integrity migration 1개를 추가했고 Front, dependency, Prisma schema와 기존 migration은 변경하지 않았다.
- 실제 환경 파일, private Gradle property, key·keystore와 recovery snapshot은 읽기·수정·stage하지 않는다.

## Canonical audit

- F-001~F-083, 83건: 59 CONFIRMED / 2 FIXING / 10 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN.
- F-007/F-008/F-009는 PATCH null·completion metadata·Task interval 계약과 PostgreSQL active-row CHECK 검증을 마쳐 FIXED다. 독립 fix-recheck와 production legacy scan이 남았다.
- F-001/F-002는 refresh-authenticated server-first logout과 access `sid` 활성-family 검사, 전체·실제 PostgreSQL·Android 검증을 마쳐 FIXED다. 독립 fix-recheck가 남았다.
- F-011/F-029/F-030은 cache와 DB fallback의 tie·전체 사용자·UTC anchor 계약을 통일하고 전체·실제 서비스 검증을 마쳐 FIXED다. 독립 fix-recheck가 남았다.
- F-065는 MainActivity의 package affinity 상속을 제거하고 task reparenting을 명시적으로 막은 뒤 merged/packaged manifest, Android build/lint와 emulator task smoke를 통과해 FIXED다. 구형 OS 독립 recheck가 남았다.
- F-069는 PostgreSQL batch projection·Redis cache, 동시성·세대 수명 보강과 실제 서비스·50,000-user 합성 검증을 마쳐 FIXED다. 구현자와 독립된 fix-recheck가 남았다.
- F-067/F-068은 코드 검증을 마쳤으나 실제 privacy/deletion URL·외부 처리·signed device·Play Console 증거가 없어 FIXING이다.
- UNKNOWN은 F-003, F-013, F-017이며 signer·production OAuth·readiness·signed-device 증거가 필요하다. F-066은 Android-only 확정으로 REFUTED다.
- Release-ready가 아니다.

## 완료된 핵심 구현

- F-005 authenticated Product REST·user/epoch scoped store, F-083 Task idempotency·retry fence, F-039/F-040 test·type gate, F-035 Android release fail-closed를 종결했다.
- F-067/F-068은 authenticated account deletion, transaction cascade, Android session/Keychain/store fence, two-step UI와 legal URL gate를 구현했다.
- F-001/F-002는 access JWT와 refresh family를 `sid`로 결합했다. 명시적 logout은 서버 family 폐기 성공 뒤에만 Keychain·prototype 상태를 지우며 실패하면 인증 상태와 안전한 재시도 안내를 유지한다.
- F-007/F-009는 absent와 null 날짜를 분리하고 create·merged PATCH의 `endAt > startAt`를 service와 staged DB CHECK로 강제한다. F-008 전이 로직은 기존 `e2bda53`에서 이미 구현됐다.
- F-069는 PostgreSQL window projection과 fenced Redis generation을 cache-first로 제공하고, F-011/F-029/F-030 DB fallback도 같은 rank·population·UTC 계약으로 통일했다.
- F-065는 minSdk 24와 exported `singleTask` launcher를 유지하면서 MainActivity의 `taskAffinity`를 비우고 task reparenting을 비활성화했다.

## 최근 완료 증거

- F-007/F-008/F-009는 focused 91, Backend 314, e2e 2, build·type·lint·format·Prisma와 PostgreSQL 17 fresh 3/3·legacy upgrade를 통과했다. 제품·감사 `317253cff1fd938b847017697f049582720261f9`와 직전 closure memory는 원격에 있고 당시 작업 트리는 깨끗했다.

## F-012 실행 계약 — 승인됨

- 사용자는 2026-09-09 `ㄱ`으로 공개 API 보존형 일일 멱등화, exact writable allowlist와 검증 계약을 승인했다.
- 재현 조건은 인증 사용자의 `POST /rankings/snapshot` 반복 호출이다. 현재 service는 매번 `RankingSnapshot.create`를 실행하며 uniqueness·retention·time bucket이 없다. Front와 다른 Backend source에는 이 POST의 소비자가 없지만, 승인된 Milestone 11 API 계약에는 endpoint가 명시돼 있다.
- 오류 해결 playbook의 기존 F-012는 NotificationDelivery index 문제로 root cause가 다르며 현재 문제에 적용할 VERIFIED record는 없다. 현재 ranking controller/service focused baseline은 2 suites/15 tests가 통과한다.
- 추천안은 공개 API를 보존하고 사용자·period·UTC 날짜당 최초 snapshot 하나만 만드는 것이다. 같은 날짜의 반복 호출은 기존 row를 반환해 durable write와 ranking 재계산을 생략하고, 세 period를 합쳐 사용자당 하루 최대 3개로 row 증가를 제한한다.
- 새 nullable `snapshotDate` DATE, non-null `NOT VALID` CHECK와 non-null row 대상 unique index를 추가한다. Legacy row는 null로 보존해 migration을 비파괴적으로 적용하고 신규·수정 row부터 날짜와 uniqueness를 강제한다. Production legacy 분류·backfill·중복 해소·constraint validation은 별도 gate다.
- 대안은 저장소 소비자가 없는 공개 POST와 service method를 제거하는 것이다. DB 변경은 없지만 기존 Milestone 11 API 계약과 외부 미확인 client를 깨뜨릴 수 있어 추천하지 않는다.
- 제품 writable allowlist는 `DSM_Back/src/rankings/rankings.service.spec.ts`, `DSM_Back/src/rankings/rankings.service.ts`, `DSM_Back/prisma/schema.prisma`, 새 `DSM_Back/prisma/migrations/20260909_bound_ranking_snapshot_writes/migration.sql`, 새 `DSM_Back/test/ranking-snapshot-idempotency.pg-spec.ts`다. 각 구현 단계는 1~2개 파일만 수정한다.
- 기록 allowlist는 canonical audit의 `findings.jsonl`·`README.md`, active memory 4파일과 검증된 새 해결이 중복되지 않을 때의 `error-resolution-playbook.md`다. Controller/API response, Front, Android, dependency, 기존 migration은 제외한다.
- 성공 기준은 unit RED/GREEN에서 same-day 재사용·UTC 경계·period 분리·무 write를 확인하고, 실제 PostgreSQL fresh·legacy upgrade·동시 최초 호출에서 정확히 한 row를 증명한 뒤 focused/full unit·e2e·build·type·lint·format·Prisma·ledger 검증을 통과하는 것이다. 데이터 무결성 P2 change-gate를 적용하며 자체 검토 뒤 FIXED까지만 전이한다.

## 후속 실행

1. F-012의 승인된 일일 멱등화 regression·service·schema/migration·PostgreSQL 검증을 순서대로 실행한다.
2. 열 개 FIXED finding의 구현자 독립 fix-recheck, F-008/F-009 legacy-state scan·CHECK validation과 F-069 운영 증거를 확보한다.
3. F-067/F-068 공개 URL·외부 삭제·Play 증거를 확보하고 남은 P2→P3를 진행한다.

## 불변 조건

- Audit status는 실제 source/test와 검증 증거를 기준으로만 전이한다. P0/P1 및 보안·권한·transaction·동시성·데이터 무결성 P2 종결에는 독립 검토 2건 이상이 필요하다.
- git add -A를 사용하지 않고 승인 범위의 exact path만 stage한다.
- Recovery 파일은 명시적 복구 승인 없이는 active 입력으로 사용하지 않는다.
