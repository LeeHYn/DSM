# F-084/F-085 수정 및 F-069 재검증

사용자 `수정 진행해` 승인에 따라 `main@61ce21e`에서 캐시 유실 오류와 날짜 의존 통합 테스트를 수정했다. 제품 수정은 Backend reader 1개와 테스트 2개다. 공개 API·Redis 저장 형식·dependency·Prisma schema/migration·Front·Android는 변경하지 않았다.

## 변경과 회귀 증거

`RankingCacheService.readLeaderboard`는 complete marker의 `entryCount`가 0 이상의 safe integer인지 확인한다. 읽은 목록 길이가 `min(limit, entryCount)`와 일치할 때만 cache hit로 처리한다. 목록이 유실·잘림 상태이거나 marker가 없거나 잘못됐으면 `null`을 반환해 기존 bounded refresh/DB fallback으로 넘긴다. 정상 0명 projection의 `[]` 응답은 보존한다. Hash entry 유실은 기존 파싱 검사에서 miss로 처리한다.

추가 unit test 11개를 먼저 실행해 **수정 전 7 FAIL / 4 PASS**, 수정 후 **11/11 PASS**를 확인했다. 조건은 목록 유실·잘림, marker 부재/잘못된 JSON/누락된 count/음수/분수, 정상 빈 projection, 요청 limit와 실제 population 차이, 목록 읽기 이후 hash 유실이다.

`ranking-projection.pg-redis-spec.ts`는 **2026-09-08 정오와 2026-09-15 UTC 자정**을 각각 실행한다. Fixture의 score 날짜를 reference 기준으로 만들고 Jest는 Date만 고정하며 Redis/socket/monotonic timer는 실제 시간을 사용한다. 각 case 종료 시 시계를 먼저 복원하고 해당 fixture 사용자만 정리한다. 외부 runner의 Date shim은 더 이상 필요하지 않다.

Prisma `$disconnect()` 뒤 자동 재접속만으로 통과하지 않도록 `$queryRaw`와 현재 개인 순위 fallback의 Prisma 읽기 6종을 spy한다. 각 날짜에서 DAILY/WEEKLY/TOTAL의 개인·leaderboard 호출 6건이 모두 cache hit이며 DB 읽기 0회임을 확인한다. 실제 Redis의 목록 유실·잘림·잘못된 marker는 DB fallback 1회와 올바른 3명 순위 반환을 검증한다. 이때 경쟁 순위 `1,2,2`도 유지된다.

## 검증

| Gate | 결과 |
|---|---|
| Cache regression RED/GREEN | 7 FAIL/4 PASS → 11/11 PASS |
| Backend unit | 27 suites / 328 tests PASS |
| Backend E2E | 2/2 PASS |
| Fresh PostgreSQL 17 / Redis 8 | migration 8개 적용, 최종 2개 날짜 × 6 tests = 12/12 PASS |
| Healthy cache reads | 날짜별 6회, 총 12회 현재 fallback DB read 0 |
| 손상 generation | 날짜별 missing/truncated/invalid-marker → 실제 DB fallback과 정상 3행 |
| Empty population | 날짜별 정상 empty generation → [] |
| Static | Nest build, source/spec no-emit typecheck, full non-fixing ESLint, changed-file Prettier PASS |
| 최종 matrix 편집 후 | spec typecheck·해당 test lint/format·PG/Redis 12/12 추가 검증 PASS |

검증 로그는 ignored `.local/logs/ranking-fix-red.log`, `ranking-fix-unit.log`, `ranking-fix-e2e.log`, `ranking-fix-static.log`, `ranking-fix-pg.log`다. 첫 단일 날짜 integration 6/6과 최종 matrix 12/12를 구별해 로그에 보존했다. Front·Android는 변경이 없어 이번에 재실행하지 않았다. 과거 Round 14의 실패·판정 보고서는 그대로 보존한다.

## 독립 검토

저장소 verification-workflow의 P2 데이터 무결성 종결 규칙에 따라 구현자 `/root`와 별개인 `/root/ranking_fix_review_a`, `/root/ranking_fix_review_b`가 targeted Round 15에서 F-069/F-084/F-085를 각각 검토했다. 다른 reviewer 판정을 제공하지 않고 원 finding·정확한 최종 diff·현재 실행 로그와 harness를 직접 대조했다. 두 reviewer 모두 세 항목에 **RECHECKED**, 신규 P0/P1 발견 없음으로 일치했다.

| 항목 | Reviewer A | Reviewer B | 핵심 근거 |
|---|---|---|---|
| F-069 | RECHECKED | RECHECKED | 매분 projection·cache-first 유지, 기존 재검증을 막던 회귀 해소, 날짜별 cache call 6회 DB read 0 |
| F-084 | RECHECKED | RECHECKED | marker 수와 기대 목록 길이 검증, 실제 손상 3종 fallback과 정상 empty 유지 |
| F-085 | RECHECKED | RECHECKED | 두 날짜 상대 fixture와 Date-only clock, teardown 전 시계 복원·finally의 DB spy 복원 |

Canonical 상태는 85건 중 **58 CONFIRMED / 2 FIXING / 0 FIXED / 1 REFUTED / 20 RECHECKED / 4 UNKNOWN**이다. 과거 F-069의 실패 이력과 Round 14 보고서는 보존했다. 이번 관련 세 항목만 전이하며 무관 82행은 원문 그대로 유지한다.

## 잔여 경계

- Reader가 완료 표식을 확인하기 위해 Redis GET 한 번을 추가한다. 운영 cardinality·capacity·managed Redis failover·query plan·p50/p95/p99와 이전 합성 benchmark의 production 적합성은 검증하지 않았다.
- 불완전 cache는 기존 경로를 따른다. Freshness 판정이 즉시 재계산을 생략하면 DB fallback이 응답하며 다음 batch가 cache를 갱신한다. 운영 DB 부하와 가용성 gate는 유지한다.
- API 24~29 Android 공격/OEM 증거(F-065), Task/snapshot production legacy 정리·CHECK validation, signer/OAuth/readiness·legal URL/Play gate는 이번 범위에서 변경하지 않았다.
- 정상 snapshot·tie·UTC 계약 등 기존 종결 finding은 재개하지 않는다. Round 15는 targeted이므로 두 자유 탐색 round 종료 조건에 포함하지 않는다. 전체 release-ready를 의미하지 않는다.

## CCTV·셀프 체크

- 수정 범위: reader, 새 unit spec, PG/Redis integration spec의 3개 제품/test 파일과 audit·memory·playbook 기록 8개 파일.
- 실제 env·credential·key·keystore·recovery snapshot은 조회·수정·stage하지 않는다. 정확한 파일만 stage하며 dependency/schema/migration은 보존한다.
- 검증용 `dsm-ranking-fix-pg-20260910`·`dsm-ranking-fix-redis-20260910`는 ownership label 확인 후 제거했다. 기존 dev 서비스는 유지했다.
- Canonical 85행 schema·fingerprint·상태 이력, 무관 finding 82행 원문 보존과 memory byte/hash 일치를 검증했다. 새 Markdown 링크는 정상이다. 과거 playbook의 기존 부재 링크 5개는 기준 commit과 동일함을 확인해 보존했으며 해당 recovery 원문은 읽지 않았다.
- 다음 작업 후보는 F-014의 production migration 실행 경로 검토다. 운영 legacy 데이터 정리와 구형 Android 공격 검증은 별도 환경·범위로 진행한다.
