# DSM 현재 맥락 — 2026-09-09

## Checkout·책임 경계

- 조정 checkout은 `C:\DEV`의 `main`, 제품·감사 checkout은 `C:\dsm-integration-review`의 `codex/integration-main-review`다.
- F-012 제품·감사 checkpoint `5642640cfbcd3b5d410f4bdbcbaeecedd106b213`까지 원격 upstream에 있다. 이 memory snapshot이 해당 기준을 후속 기록한다.
- 제품 범위는 Android 전용 DSM v1.3이다. Backend는 NestJS·Prisma 6·PostgreSQL, 클라이언트는 React Native Community CLI 기반 Android다.
- Canonical audit는 `.ai/audits/20260817-release-audit-full-project/findings.jsonl`이다. Root 완료와 release-ready 판정은 구분한다.

## Canonical audit 상태

- F-001~F-083, 83건: `58 CONFIRMED / 2 FIXING / 11 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`.
- Ledger는 352,219 bytes, SHA-256 `CF538F3AD9FBF186F51DDAEB1B7601D9C1B232F2415BC7C11314AE1DF69DA15C`이다. UTF-8/LF, schema, 연속 ID, fingerprint 고유성·basis hash와 status history 검증이 통과했다.
- `RECHECKED`: F-005, F-006, F-016, F-025, F-035, F-039, F-040, F-083. `UNKNOWN`: F-003, F-013, F-017. `REFUTED`: F-066. `FIXING`: F-067, F-068. `FIXED`: F-001, F-002, F-007, F-008, F-009, F-011, F-012, F-029, F-030, F-065, F-069.
- 열한 개 `FIXED` 항목은 구현자 자체 검증을 마쳤으며 독립 fix-recheck 전에는 `RECHECKED`로 올리지 않는다.

## 구현 결정

- F-005/F-083은 authenticated user-scoped 제품 상태와 Task idempotency를 종결했다. F-067/F-068은 account deletion·session fence·legal URL gate를 구현했으나 외부 URL·Play 증거가 남았다.
- F-001/F-002는 access JWT와 refresh family를 `sid`로 결합하고 Android가 server-first logout 실패를 재시도 가능하게 유지한다. F-007/F-009는 null·parse·merged interval을 service와 staged CHECK에서 방어하며 F-008 completion 전이는 `e2bda53`에서 구현됐다.
- F-011/F-029/F-030/F-069는 cache·DB fallback의 tie·전체 사용자·UTC 계약, PostgreSQL window projection과 fenced Redis generation을 제공한다. F-065는 MainActivity의 package affinity를 비우고 reparenting을 막는다.
- F-012는 공개 POST를 유지하고 사용자·period·UTC 날짜당 immutable snapshot 하나만 허용한다. Service의 선행 조회와 conflict-safe insert를 partial unique index가 보강한다.

## 로컬 검증 checkpoint

- F-001/F-002는 Backend 304·Front 229·Android 456·PostgreSQL 1/1, F-007/F-008/F-009는 Backend 314·PostgreSQL fresh 3/3·legacy upgrade를 통과했다.
- F-011/F-029/F-030은 Backend 297·PostgreSQL/Redis 2/2, F-069는 Backend 293·통합 2/2와 50,000-user 합성 benchmark, F-065는 manifest·build·lint·API 36 smoke를 통과했다. 합성 수치는 production SLO 증거가 아니다.
- F-012는 focused 18, Backend 317, e2e 2와 모든 정적 gate를 통과했다. PostgreSQL fresh·legacy 3/3, legacy row 2개 보존, 20개 동시 호출 1 ID를 확인했다.
- 모든 task-owned service·container·임시 prefix를 제거하고 Docker Desktop을 원래의 정지 상태로 복구했다.

## F-012 종결

- 반복 호출마다 row를 생성하던 원인은 service와 schema에 idempotency bucket과 uniqueness가 없었던 것이다. UTC 날짜 bucket, 선행 재사용, conflict-safe insert와 DB 제약으로 신규 증가량을 사용자당 하루 최대 세 period로 제한했다.
- Nullable bucket과 staged CHECK는 과거 row를 재작성하지 않는다. 실제 7-migration legacy DB의 같은 날짜 row 두 개가 null bucket으로 보존된 채 upgrade됐고 이후 신규 null·중복 write는 거부됐다.
- Canonical 상태는 `FIXED`; 제품·감사 commit은 `5642640cfbcd3b5d410f4bdbcbaeecedd106b213`이다. 독립 fix-recheck와 production legacy 정리가 남았다.

## 잔여 위험·외부 gate

- F-069은 실제 운영 cardinality, Redis capacity, query plan, managed failover와 p50/p95/p99가 미측정이다. Cache miss가 projection 후에도 남으면 bounded window-query fallback이 DB sort 부하를 만들 수 있다. WebSocket delta는 F-074 범위다.
- F-065 app-side 설정은 공식 Android 문서상 구형 OS의 모든 StrandHogg 변형에 대한 완전한 보장이 아니다. API 24~29 malicious-app PoC, OEM patch matrix와 독립 fix-recheck가 남았다.
- F-067/F-068 공개 privacy/deletion URL과 외부 삭제 절차가 없고 Google Play 앱 이름·내부 삭제 경로·Data safety 증거를 최종 대조하지 않았다.
- F-001/F-002는 offline에서 명시적 logout을 완료할 수 없고 보호 REST 요청마다 indexed family 조회가 추가된다. Commit 전 승인된 in-flight 요청, production latency·availability와 독립 fix-recheck가 남았다.
- F-007/F-008/F-009는 독립 fix-recheck가 남았다. F-008의 역사적 contradictory row와 same-value COMPLETED의 legacy null은 자동 보정하지 않으며, F-009는 production invalid-row scan·정정 또는 soft-delete 뒤 CHECK validation이 필요하다.
- F-012 legacy snapshot은 null bucket으로 남아 있다. Production에서 날짜 정책을 정해 분류·backfill·중복 해소한 뒤 CHECK를 validate해야 하며 SQL-only partial index의 migration drift도 감시해야 한다.
- 실제 upload/Play signer, production OAuth, signed-device cold start·link open, readiness mapping과 운영 DB·Firebase 증거가 미완료다.
- 현재 CONFIRMED P1은 0건이다. 다음 finding은 canonical 우선순위와 새 계획·승인을 기준으로 선택한다.

## 안전·복구 규칙

- `C:\DEV\DSM_Back\.env`, 실제 `.env`, key·keystore와 private Gradle property는 읽기·수정·stage하지 않는다.
- F-012 범위 밖인 controller/API response, Front, Android, dependency와 기존 migration은 변경하지 않았다.
- `*.original.md`, `*.failed-*`는 historical recovery이며 active 입력이 아니다. 명시적 복구 승인 없이는 읽기·수정·삭제·stage하지 않는다.
- 제품·memory·audit 수정은 `apply_patch`로 수행하고 `git add -A` 없이 exact path만 stage한다.
