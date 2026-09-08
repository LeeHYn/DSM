# DSM 실행 계획 — 2026-09-08

## 목표·승인

- 제품 범위는 Android 전용 DSM v1.3이다.
- 사용자는 F-067/F-068을 공개 URL 미정 상태로 구현하도록 승인했고, 2026-09-08 현재 검증된 통합 변경의 commit/push와 `.ai/memory` 압축·정리·갱신도 승인했다.
- 제품·감사 커밋 `02681c7`과 압축 memory HEAD `74406a0`은 `origin/codex/integration-main-review`에 push했다.
- 비밀 파일, 기존 `*.original.md`, `*.failed-*`, dependency·lockfile, Prisma schema·migration은 이번 publish 범위에서 제외한다.

## 현재 상태

- Canonical audit는 F-001~F-083, 83건이다: `69 CONFIRMED / 2 FIXING / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`.
- `RECHECKED`: F-005, F-006, F-016, F-025, F-035, F-039, F-040, F-083.
- `UNKNOWN`: F-003, F-013, F-017. 실제 signer·production OAuth·readiness wiring·signed device 증거가 필요하다.
- F-066은 사용자 Android-only 확정과 독립 검토 2건으로 `REFUTED`다.
- F-067/F-068은 저장소 구현과 회귀 검증을 완료했지만 공개 privacy/deletion URL, 외부 요청 처리, signed device, Play Console/Data safety 증거가 없어 `FIXING`이다.
- Release-ready가 아니다.

## 완료된 구현

- F-005: Android 제품 화면을 authenticated Task·Score·Ranking REST와 userId/epoch scoped ProductStore에 연결했다.
- F-083: UUIDv4 `clientMutationId` 기반 Task create replay, 충돌 비노출, Front single-flight·ambiguous retry fence를 구현하고 실제 PostgreSQL 동시성 10/10과 독립 recheck 2건을 통과했다.
- F-039/F-040: 표준 Front timeout과 Backend NodeNext/spec typecheck gate를 복구했다.
- F-035: Android release configuration을 fail-closed로 구성하고 독립 recheck를 통과했다.
- F-067/F-068: 인증된 `DELETE /auth/me`, transaction cascade, Android session/Keychain/ProductStore fence, 두 단계 삭제 UI, privacy/deletion 링크와 release URL gate를 구현했다.
- Android-only 범위를 v1.3 기획 문서에 명시했다.

## 승인된 publish 결과

1. [x] 원격 fetch 후 integration과 root가 behind 0인지 확인.
2. [x] 제품·감사·계획 48개 exact path를 `02681c7`로 commit·push.
3. [x] Integration active memory 3개를 10,957 bytes로 압축하고 4개 memory path를 `74406a0`으로 commit·push.
4. [x] Root active memory 3개와 routing README를 압축·검증.
5. [x] Root active memory 4개만 commit·push하고 두 remote branch equality를 확인.

## 다음 실행 순서

1. F-067/F-068 실제 `PRIVACY_POLICY_URL`, `ACCOUNT_DELETION_URL`과 외부 삭제 요청 처리 절차를 준비한다.
2. Signed Android device와 Play Console/Data safety 증거를 확보한 뒤 독립 P1 recheck 2건을 수행한다.
3. F-003/F-017 signer·OAuth·signed-device, F-013 readiness wiring을 검증한다.
4. 남은 finding은 별도 계획·승인 후 P1→P2→P3 순으로 수정한다.
5. 서로 다른 자유 탐색에서 zero-new-confirmed-P0~P2를 연속 두 round 확보한 뒤 release-ready를 재판정한다.

## 불변 조건

- `C:\DEV\DSM_Back\.env`와 private Gradle property·key는 읽기·출력·stage 금지다. `git add -A`를 사용하지 않는다.
- Audit ledger와 실제 source/test가 충돌하면 source와 현재 검증 결과를 우선 확인하고 불일치를 기록한다.
- P0/P1 및 보안·권한·transaction·동시성·데이터 무결성 P2 종결에는 독립 검토 2건 이상이 필요하다.
- Recovery 파일은 active context가 아니며 명시적 복구 승인 없이는 읽기·수정·삭제·이름 변경·stage하지 않는다.
