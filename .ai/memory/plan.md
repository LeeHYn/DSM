# DSM 실행 계획 — 2026-09-09

## 목표·경계

- 제품 범위는 Android 전용 DSM v1.3이다.
- 제품·감사 checkout은 `codex/integration-main-review`이며 F-001/F-002 제품·감사 checkpoint `a323dcad531e971ad792e8e9a20a47de29ab8c41`까지 원격과 같다. 이 memory snapshot이 해당 기준을 후속 기록한다.
- F-001/F-002는 기존 refresh-family schema를 재사용했으며 Prisma schema·migration과 dependency는 변경하지 않았다.
- 실제 환경 파일, private Gradle property, key·keystore와 recovery snapshot은 읽기·수정·stage하지 않는다.

## Canonical audit

- F-001~F-083, 83건: 62 CONFIRMED / 2 FIXING / 7 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN.
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
- F-069는 PostgreSQL window projection과 fenced Redis generation을 cache-first로 제공하고, F-011/F-029/F-030 DB fallback도 같은 rank·population·UTC 계약으로 통일했다.
- F-065는 minSdk 24와 exported `singleTask` launcher를 유지하면서 MainActivity의 `taskAffinity`를 비우고 task reparenting을 비활성화했다.

## 다음 실행

1. 현재 CONFIRMED P1은 0건이다. 다음 canonical P2 중 결합된 Task 무결성 범위인 F-007/F-008/F-009의 null date, status/completedAt, startAt/endAt 계약을 함께 진단한다.
2. F-001/F-002/F-011/F-029/F-030/F-065/F-069의 구현자 독립 fix-recheck와 F-069 운영 성능·failover 증거를 확보한다.
3. F-067/F-068 공개 URL·외부 삭제 절차·signed-device·Play Console 증거를 확보한다.
4. 남은 finding은 P2→P3 순으로 수정하고, 서로 다른 자유 탐색에서 zero-new-confirmed-P0~P2 연속 두 round를 확보한다.

## 불변 조건

- Audit status는 실제 source/test와 검증 증거를 기준으로만 전이한다. P0/P1 및 보안·권한·transaction·동시성·데이터 무결성 P2 종결에는 독립 검토 2건 이상이 필요하다.
- git add -A를 사용하지 않고 승인 범위의 exact path만 stage한다.
- Recovery 파일은 명시적 복구 승인 없이는 active 입력으로 사용하지 않는다.
