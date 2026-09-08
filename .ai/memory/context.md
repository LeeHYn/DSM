# DSM 현재 맥락 — 2026-09-08

## Checkout·책임 경계

- 조정: `C:\DEV`, `main`. 제품·감사: `C:\dsm-integration-review`, `codex/integration-main-review@74406a0`.
- 통합 제품 커밋은 `02681c7`, 압축 memory 후속은 `74406a0`이며 모두 원격에 게시됐다. Root 완료와 제품 release-ready 판정은 구분한다.
- Canonical audit는 integration의 `.ai/audits/20260817-release-audit-full-project/findings.jsonl`이다.
- Root `.ai/memory`의 active SSOT는 `plan.md`, `context.md`, `checklist.md`; `README.md`는 routing·hash ledger다.
- Backend는 NestJS·Prisma v6·PostgreSQL, Front는 React Native Community CLI 기반 Android 앱이다.

## Canonical audit

- F-001~F-083, 83건: `69 CONFIRMED / 2 FIXING / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`; 심각도는 `P1 10 / P2 53 / P3 20`.
- Ledger는 320,321 bytes, SHA-256 `742EFEA9A9BDC01A674380458F6808B1709E716594F47F38FF906A0BDF7988F8`.
- Strict UTF-8 JSON, schema, contiguous ID, fingerprint uniqueness·basis hash, status history 검증이 통과했다.
- `RECHECKED`: F-005, F-006, F-016, F-025, F-035, F-039, F-040, F-083.
- `UNKNOWN`: F-003, F-013, F-017. `REFUTED`: F-066. `FIXING`: F-067, F-068.
- Round 12·13은 targeted revalidation이므로 자유 탐색 연속 조건에 포함하지 않는다. Round 11만 zero-new-confirmed-P0~P2 한 번으로 계산한다.

## 게시된 구현

- F-005: Home·Ranking·MyPage·TaskSheets가 authenticated REST와 userId/epoch scoped ProductStore를 사용한다. Prototype context에는 theme·toast UI 상태만 남겼다.
- F-083: Backend는 필수 UUIDv4 `clientMutationId`를 Task PK로 사용한다. 동일 owner·payload replay는 side effect 없이 반환하고 mismatch·foreign·deleted는 정보 비노출 409로 처리한다. `P2002`·`P2034` 경쟁은 동일 ID 재조회로 수렴한다.
- F-083 Front는 preflight부터 single-flight이며 POST 시작 뒤 ambiguous 오류에만 ID를 유지한다. 성공·definite 오류·dispose에서 해제한다.
- F-067: 인증된 `DELETE /auth/me`가 204를 반환한다. User row lock 뒤 blocking NotificationDelivery를 먼저 삭제하고 User cascade를 수행하며 반복 호출은 멱등적이다.
- F-067 Android session은 삭제를 single-flight와 epoch로 fence한다. 서버 확인 전 실패에는 세션을 유지하고, 성공 뒤 Keychain을 지우며 ProductStore를 dispose한다. MyPage는 두 단계 파괴 확인을 요구한다.
- F-068: 로그인과 MyPage가 HTTPS privacy 링크를 열고 MyPage가 외부 삭제 안내를 제공한다. Release는 URL 누락, HTTP, credential, `.invalid` host를 거부한다.
- F-066: Android-only 범위를 현재 v1.3 기획 문서 3개에 명시했다.

## 검증 스냅샷

| 범위 | 통과 결과 | 열린 한계 |
|---|---|---|
| F-083 | Backend full 266·e2e 2, Front full 197, 양쪽 type/lint, PostgreSQL concurrency 10/10, Android debug 365, Metro, 독립 recheck 2건 | process restart/offline durable intent, device socket-cut, 구버전 rollout |
| F-005/F-039 | Product 36, Front 23 suites/197, typecheck·lint, 독립 recheck | physical device relaunch |
| F-040 | NodeNext/spec typecheck, Backend 266·e2e 2, PostgreSQL 10/10, lint, 독립 recheck | 원 condition 잔여 위험 없음 |
| F-035 | Groovy/Gradle release gates, Front 197, Android debug 281, 독립 recheck | actual signer·OAuth·signed device |
| F-067/F-068 | Backend 24 suites/269·e2e 2·build/lint, PostgreSQL 17.6 cascade 1/1, Front 24 suites/226·typecheck·lint 0/30, Android debug 281, URL 누락 차단 | 공개 URL·외부 처리·signed device·Play Console·독립 closure recheck |

- F-067 PostgreSQL test는 6개 migration 뒤 대상 사용자의 10개 계정 범위 관계를 제거하고 다른 사용자를 보존했다.
- F-067 최종 검토에서 서버 204 후 Keychain 정리 중 중복 호출 경합을 재현·수정했으며 session test 44개와 Front 전체 226개가 통과했다.
- Disposable PostgreSQL container와 ADB/Docker 보조 process는 종료했다.

## 운영·보안 한계

- 공개 privacy/deletion URL과 운영자 삭제 요청 절차가 없다. Google Play 앱 내부·외부 삭제 경로와 Data safety 증거는 아직 충족 확인되지 않았다.
- 실제 upload/Play signer, production OAuth, signed-device cold start·link open, production readiness mapping, 운영 DB·Firebase 검증은 미완료다.
- `C:\DEV\DSM_Back\.env`, keystore, private Gradle property는 memory·commit 대상이 아니다.
- Dependency·lockfile와 Prisma schema·migration은 이번 통합에서 변경하지 않았다.

## 복구·중단 기록

- 이전 세션 중단 원인은 완료된 결과 집계 중 반복 completion-policy error였다. 당시 Git lock, 잔류 test/build process, ledger 손상은 없었다.
- Parent/child strict UTF-8 parse와 누락된 R11 Backend final 회수를 완료했다.
- 기존 `*.original.md`·`*.failed-*`는 historical recovery일 뿐 active 입력이 아니다. 현재 압축에서 읽거나 수정하거나 stage하지 않았다.
