# DSM 실행 계획 — 2026-09-09

## 목표·경계

- 제품 범위는 Android 전용 DSM v1.3이다.
- 제품·감사 checkout은 `codex/integration-main-review`이며 F-012 제품·감사 checkpoint `5642640cfbcd3b5d410f4bdbcbaeecedd106b213`까지 원격과 같다. 이 memory snapshot이 해당 기준을 후속 기록한다.
- F-012 범위는 ranking service/spec, Prisma schema, 새 snapshot migration·PostgreSQL spec이다. 공개 controller/API shape, Front, Android, dependency와 기존 migration은 변경하지 않았다.
- 실제 환경 파일, private Gradle property, key·keystore와 recovery snapshot은 읽기·수정·stage하지 않는다.

## Canonical audit

- F-001~F-083, 83건: 58 CONFIRMED / 2 FIXING / 11 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN.
- F-012는 공개 snapshot API를 유지하면서 사용자·period·UTC 날짜당 1행으로 신규 write를 제한해 FIXED다. Legacy 정리·CHECK validation과 독립 fix-recheck가 남았다.
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

## F-012 종결 계약

- 2026-09-09 사용자 `ㄱ` 승인에 따라 공개 API를 보존하고 사용자·period·UTC 날짜당 최초 snapshot 하나만 생성한다. 같은 날 반복 호출은 기존 immutable row를 반환해 ranking 재계산과 durable write를 생략한다.
- `snapshotDate DATE`와 non-null `NOT VALID` CHECK, non-null row 대상 partial unique index가 신규·수정 write를 제한한다. `createMany(skipDuplicates)` 뒤 winner를 읽어 동시 최초 호출도 한 row로 합친다.
- Legacy row 두 개가 같은 날짜에 있어도 null bucket으로 보존한 채 7→8 migration upgrade가 성공했다. 신규 null·중복은 거부됐고 fresh·legacy DB 모두 committed 3/3 spec을 통과했다.
- F-012는 canonical audit에서 `FIXED`다. 구현자 독립 recheck가 없으므로 `RECHECKED`가 아니며, production legacy 분류·backfill·중복 해소·CHECK validation은 별도 gate다.

## 후속 실행

1. 열한 개 FIXED finding의 구현자 독립 fix-recheck, F-008/F-009/F-012 legacy-state scan·정리와 staged CHECK validation을 수행한다.
2. F-069 운영 cardinality·capacity·latency·failover 증거를 확보한다.
3. F-067/F-068 공개 URL·외부 삭제·Play 증거를 확보하고 남은 P2→P3를 진행한다.

## 외부 PC clone·개발 문서 — 종결

- 사용자 승인 결과는 `af2ff2640b1fa27111302766baa61aada15b304d`이다. 기준 문서는 `docs/setup/windows-clone-and-development.md`이며 Root·Backend README가 연결하고, 2026-08-08 handoff 문서는 역사 기록으로 표시했다.
- 가이드는 integration clone, Node 22+, JDK 17, Android SDK 36, safe local env, Docker·Prisma, Android·OAuth, Git hygiene와 Windows 문제를 다룬다. compose가 요구하는 non-secret PostgreSQL 기본값도 `.env.example`에 추가했다.
- compose config·ignore·tracked script·Markdown link·diff 검증을 통과했다. 제품 코드·dependency·migration·audit은 변경하지 않았다.

## 불변 조건

- Audit status는 실제 source/test와 검증 증거를 기준으로만 전이한다. P0/P1 및 보안·권한·transaction·동시성·데이터 무결성 P2 종결에는 독립 검토 2건 이상이 필요하다.
- git add -A를 사용하지 않고 승인 범위의 exact path만 stage한다.
- Recovery 파일은 명시적 복구 승인 없이는 active 입력으로 사용하지 않는다.
