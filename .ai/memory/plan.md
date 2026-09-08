# DSM 실행 계획 — 2026-09-09

## 목표·경계

- 제품 범위는 Android 전용 DSM v1.3이다.
- 제품·감사 checkout은 `codex/integration-main-review`이며 F-011/F-029/F-030 제품·감사 checkpoint `0c6031b862e9c777d2403e2e3b46c7e1d37c3a8e`까지 원격과 같다. 이 memory snapshot이 해당 기준을 후속 기록한다.
- F-069 제품·감사 변경은 전체 검증 뒤 commit·push됐다. 공개 URL, Front, Android, WebSocket, Prisma schema·migration은 이 변경에 포함하지 않는다.
- 실제 환경 파일, private Gradle property, key·keystore와 recovery snapshot은 읽기·수정·stage하지 않는다.

## Canonical audit

- F-001~F-083, 83건: 64 CONFIRMED / 2 FIXING / 5 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN.
- F-011/F-029/F-030은 cache와 DB fallback의 tie·전체 사용자·UTC anchor 계약을 통일하고 전체·실제 서비스 검증을 마쳐 FIXED다. 독립 fix-recheck가 남았다.
- F-065는 MainActivity의 package affinity 상속을 제거하고 task reparenting을 명시적으로 막은 뒤 merged/packaged manifest, Android build/lint와 emulator task smoke를 통과해 FIXED다. 구형 OS 독립 recheck가 남았다.
- F-069는 PostgreSQL batch projection·Redis cache, 동시성·세대 수명 보강과 실제 서비스·50,000-user 합성 검증을 마쳐 FIXED다. 구현자와 독립된 fix-recheck가 남았다.
- F-067/F-068은 코드 검증을 마쳤으나 실제 privacy/deletion URL·외부 처리·signed device·Play Console 증거가 없어 FIXING이다.
- UNKNOWN은 F-003, F-013, F-017이며 signer·production OAuth·readiness·signed-device 증거가 필요하다. F-066은 Android-only 확정으로 REFUTED다.
- Release-ready가 아니다.

## 완료된 핵심 구현

- F-005 authenticated Product REST·user/epoch scoped store, F-083 Task idempotency·retry fence, F-039/F-040 test·type gate, F-035 Android release fail-closed를 종결했다.
- F-067/F-068은 authenticated account deletion, transaction cascade, Android session/Keychain/store fence, two-step UI와 legal URL gate를 구현했다.
- F-069는 1분 DAILY·WEEKLY·TOTAL window projection, immutable Redis generation, cache-first API, owner lock, stale-writer fencing, freshness gate와 bounded DB fallback을 구현했다.
- Redis write·TTL은 chunk transaction으로 묶고 직전 generation은 30초 reader grace 뒤 만료해 crash orphan과 정상 주기 누적을 제한한다.
- F-065는 minSdk 24와 exported `singleTask` launcher를 유지하면서 MainActivity의 `taskAffinity`를 비우고 task reparenting을 비활성화했다.

## F-069 검증

- Backend unit 25 suites/293, e2e 2, build, full typecheck/lint, Prisma validation과 dependency/lock 검증이 통과했다.
- Fresh PostgreSQL 17·Redis 8 통합 2/2에서 migration 6개, cache-only read, tie rank, lock ownership, stale writer, current/retired TTL을 확인했다.
- 50,000 user·350,000 DailyScore single-host benchmark에서 cold projection 10회 p99는 0.928~1.674초, concurrency 25 cache read 1,000회 p99는 4.628~22.023ms였다.
- 세 기간 active generation은 약 51.6MB였다. Rollover는 약 101.0MB까지 증가한 뒤 30초 grace 후 약 51.6MB로 복귀했다.

## 다음 실행

1. 현재 CONFIRMED P1은 0건이다. 다음 로컬 P2는 canonical 순서와 결합 영향도를 대조해 F-001/F-002 인증 폐기 범위부터 계획한다.
2. F-011/F-029/F-030/F-065/F-069의 구현자 독립 fix-recheck와 F-069 운영 성능·failover 증거를 확보한다.
3. F-067/F-068 공개 URL·외부 삭제 절차·signed-device·Play Console 증거를 확보한다.
4. 남은 finding은 P2→P3 순으로 수정하고, 서로 다른 자유 탐색에서 zero-new-confirmed-P0~P2 연속 두 round를 확보한다.

## 불변 조건

- Audit status는 실제 source/test와 검증 증거를 기준으로만 전이한다. P0/P1 및 보안·권한·transaction·동시성·데이터 무결성 P2 종결에는 독립 검토 2건 이상이 필요하다.
- git add -A를 사용하지 않고 승인 범위의 exact path만 stage한다.
- Recovery 파일은 명시적 복구 승인 없이는 active 입력으로 사용하지 않는다.
