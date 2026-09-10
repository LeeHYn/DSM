# 수정 11건 독립 검증 — 2026-09-10

사용자가 선택한 독립 검증을 `D:\DSM/main@2da4817b27d8359649e38e0e37ccb73d05979b91`에서 수행했다. 제품 코드는 변경하지 않았다. 기존 수정 11건 중 **9건 RECHECKED, F-069는 회귀 재현으로 CONFIRMED 복귀, F-065는 구형 Android 증거 부족으로 UNKNOWN**이다. 전체 release audit는 열려 있다.

## 검토와 판정

Audit `20260817-release-audit-full-project`의 targeted Round 14다. `/root/fix_recheck_a`와 `/root/fix_recheck_b`는 P2 열 건의 원 condition·fix diff·현재 소스·테스트 증거를 서로의 판정 없이 검토했다. 두 reviewer 모두 **9 RECHECKED / F-069 FAILED**로 일치했다. 구현자는 과거 `/root`이며 reviewer와 분리돼 있다. Android는 `/root/fix_recheck_android`가 독립 검토했다. 테스트 실행·결과 병합·원장 갱신은 메인만 수행했다.

| 항목 | A | B | 최종 상태와 근거 | 남은 범위 |
|---|---|---|---|---|
| F-001 로그아웃 실패 | RECHECKED | RECHECKED | 서버 family 폐기 성공 후 로컬 token 삭제, 실패 시 인증 상태·재시도 유지 | 오프라인 명시적 로그아웃, stale token best-effort 정리 |
| F-002 access JWT 폐기 | RECHECKED | RECHECKED | JWT sid와 활성 family 검사, 폐기 후 access·refresh 401, 다른 family 보존 | commit 전 허용된 요청, 운영 DB 조회 지연·가용성 |
| F-007 PATCH 날짜 null | RECHECKED | RECHECKED | absent/null 구별, DTO·service가 쓰기 전에 거부 | 기존 epoch 데이터 자동 복구 없음 |
| F-008 완료 시각 | RECHECKED | RECHECKED | 완료 진입 시 timestamp, 이탈 시 null, 동일 transaction | legacy 모순 행·same-status COMPLETED/null 정리 |
| F-009 Task 시간 순서 | RECHECKED | RECHECKED | create·merged PATCH와 active-row CHECK가 역전·0길이 거부 | 운영 legacy 정리 후 CHECK validation |
| F-011 동점 순위 | RECHECKED | RECHECKED | cache·DB projection의 competition RANK와 userId 정렬 일치 | 관측 시점 차이·limit의 동점 그룹 절단 |
| F-012 snapshot 중복 | RECHECKED | RECHECKED | 사용자·period·UTC 날짜별 immutable 1행, 동시 20호출 동일 ID | legacy 분류·backfill·중복 해소·CHECK validation·index drift |
| F-029 활동 없는 사용자 | RECHECKED | RECHECKED | 전체 User LEFT JOIN, 누락 점수 0, limit 전 순위 계산 | 운영 분포, 별도 캐시 유실 회귀 F-084 |
| F-030 UTC 자정 | RECHECKED | RECHECKED | 요청 reference 하나가 score/count/cache/projection/snapshot에 전달됨 | 자정 직전 시작한 요청은 이전 기간으로 일관되게 완료 |
| F-069 cache·batch | FAILED | FAILED | 원 architecture 부재는 해소됐으나 부분 캐시 유실 P2 회귀로 CONFIRMED 복귀 | F-084 수정·독립 재검증, 실제 운영 부하·failover·latency |
| F-065 task affinity | — | — | Android reviewer UNKNOWN: source·merged·packaged 설정 일치, 원 취약 기기 공격 조건 미검증 | API 24~29 악성 APK PoC·OEM 패치·기기 회귀 |

정적 검토에서 수정 diff의 신규 P0/P1은 발견하지 못했다. F-069의 원 수정 종결 실패와 F-084의 새 원인은 연결된 기록이며 서로 독립적인 제품 장애 두 건이라는 뜻은 아니다.

신규 F-084와 F-085는 finder들과 분리된 `/root/fix_recheck_android`, `/root/ranking_candidate_validator`가 각각 독립 반박했다. 두 후보 모두 두 reviewer가 SURVIVED와 제안 심각도에 동의했다. 정상 빈 population·유효 limit·쓰기 fencing·fallback 및 제품 날짜 오류라는 반박을 검토했고, 실제 재현과 소스가 해당 반박을 해소했다. 다른 validator의 판정은 공유하지 않았다.

Canonical 상태는 85건 중 **61 CONFIRMED / 2 FIXING / 0 FIXED / 1 REFUTED / 17 RECHECKED / 4 UNKNOWN**이다. 무관 기존 72행의 원문, 재검증 11건의 과거 history·fix·validation·evidence를 보존했고 85행 전체 Draft 2020-12 schema·fingerprint·연속 이력 검증이 통과했다.

## 새 문제

**F-084 / P2 — 비어 있지 않은 Redis generation의 목록 유실을 정상 빈 결과로 반환.** `ranking-cache.service.ts:162-165`는 `LRANGE`가 빈 결과이면 `[]`를 반환한다. 완료 marker에는 entryCount가 있지만 `activeGeneration:344`는 존재만 검사한다. `rankings.service.ts:57-59`는 truthy인 배열을 정상 cache hit로 받아 복구와 DB fallback을 생략한다.

실제 격리 Redis에서 정상 3명 projection을 만든 뒤 해당 generation의 leaderboard 키 하나만 삭제했다. marker와 entries hash가 남아 있는 상태에서 아래 결과를 확인했다. 정상 빈 population과 불완전 generation을 구별하고 후자를 cache miss로 처리할 필요가 있다. 이 작업에서는 수정하지 않았다.

```json
{"markerEntryCount":3,"entriesHashRows":3,"leaderboardKeyExists":0,"directCacheResult":[],"serviceResult":[],"result":"FAIL"}
```

이는 부분 키 유실의 실제 재현이다. 운영 eviction 정책·발생 빈도는 측정하지 않았다. Reader가 이전 generation을 읽은 후 중단되고 30초 retirement TTL 경과 후 목록을 읽는 순서도 소스로 성립하지만 해당 interleaving을 별도 실행하지 않았다.

**F-085 / P3 — 고정 fixture와 실제 날짜 불일치로 ranking 통합 테스트 실패.** `ranking-projection.pg-redis-spec.ts:53`은 2026-09-08 reference를 사용하지만 공개 service 호출은 `new Date()`를 쓴다. 2026-09-10 실행에서 DAILY rank 기대값 3과 실제값 1이 달라졌다. 검증 runner에서만 Date를 fixture에 맞춘 재실행은 2/2 통과했다. Committed test는 미수정이다. `$disconnect()` 후 Prisma의 자동 재접속 가능성은 별도 검증 한계이며 날짜 결함의 fingerprint에 혼합하지 않는다.

## 현재 실행 증거

| 검증 | 결과 | 해석 |
|---|---|---|
| Backend unit | 26 suites, 317/317 PASS | auth/guard/Task/순위·UTC 경계 포함 |
| Front unit | 24 suites, 229/229 PASS | 독립 cache로 logout/API/context/MyPage 회귀 포함 |
| E2E | 1 suite, 2/2 PASS | test process의 선택적 Redis를 분리 |
| Fresh PostgreSQL | Auth 1/1, Task 3/3, Snapshot 3/3 PASS | DB마다 전체 8개 migration deploy |
| 원 PG/Redis integration | 1/2 PASS, 1 FAIL | 총 DB suite 8/9; 날짜 fixture mismatch를 원 로그에 보존 |
| 날짜 정렬 후 원 PG/Redis integration | 2/2 PASS | 제품·committed test 변경 없이 검증용 Date만 정렬 |
| Legacy DDL upgrade | Task 3/3, Snapshot 3/3 PASS | 이전 6개 DDL → legacy Task 1/snapshot 2 → 현재 2개 DDL. 3행 보존·잘못된 Task soft-delete 성공 |
| refresh/logout 동시 호출 | 10/10 PASS | 순서 교대, 대상 family active 0·다른 family 1. refresh 6회가 폐기 전 성공; 강제 interleaving 아님 |
| 실제 DB 중지 후 현재 날짜 cache read | 6/6 PASS | owned PostgreSQL 컨테이너 stop·Running=false, DAILY/WEEKLY/TOTAL 개인+목록 조회 |
| 부분 Redis 목록 유실 | FAIL, 오류 재현 | 실제 사용자 3명이 있는데 cache/service 모두 빈 배열 |
| Android XML·APK | 독립 XML assertion 4/4, apkanalyzer PASS | affinity 빈 값·reparenting false·exported singleTask 일치; 설치 system image API 36만 존재 |

Legacy 검증은 실제 PostgreSQL에서 기존·신규 migration SQL을 순서대로 적용한 DDL 검증이다. Production 데이터 정리나 운영 migration 이력을 검사했다는 의미가 아니다. 처음 작성한 추가 auth harness는 서로 다른 token에 같은 synthetic tokenHash를 넣어 unique 제약에 실패했다. 검증용 입력만 고쳐 해당 단계부터 재개했으며 최초 오류도 로그에 보존했다.

현재 실행한 주요 명령은 `.local/fix-recheck.ps1 -Phase backend|frontend|e2e|postgres|android`, `.local/fix-recheck-probes.cjs`와 `--resume-auth`다. 실제 원 테스트는 저장소의 네 PG spec을 그대로 실행했고, date alignment helper와 추가 probe는 ignored 로컬 검증 도구다. 새 build/lint/production benchmark·실기기 테스트는 실행하지 않았다. 제품 tree가 기준 commit과 같으므로 이전 build/type/lint 결과를 이번에 재실행했다고 표현하지 않는다.

API 36 smoke나 빈 affinity 설정은 취약한 구형 OS에 대한 공격 차단 증거가 아니다. [Android task-affinity 위험 문서](https://developer.android.com/privacy-and-security/risks/strandhogg)와 [activity 속성 문서](https://developer.android.com/guide/topics/manifest/activity-element)를 reviewer가 대조했다. API 24~29 패치 수준·악성 matching-affinity APK 공격 전후·launcher/recents/외부 인증 복귀 검증이 필요하다.

## 기록과 경계

현재 로그는 `D:\DSM\.local\logs\fix-recheck-backend.log`, `fix-recheck-frontend.log`, `fix-recheck-e2e.log`, `fix-recheck-postgres.log`, `fix-recheck-probes.log`, `fix-recheck-android.log`다. `.local`은 ignored이며 Git에 올리지 않는다. 원 실패와 보정 재검증은 위 표와 canonical ledger에 함께 기록한다.

검증 컨테이너 `dsm-fix-recheck-pg-20260910`, `dsm-fix-recheck-redis-20260910`는 label `dsm.fix-recheck=20260910` 확인 후 제거했다. 기존 `dsm-back-dev` DB·Redis와 Backend는 종료·변경하지 않았다. 실제 env·키·keystore·recovery snapshot은 조회·수정·stage하지 않았다.

## CCTV 기록·셀프 체크

- Tracked 변경은 이 보고서, audit `findings.jsonl`/`README.md`, 활성 memory `plan.md`/`context.md`/`checklist.md`/`README.md`의 7개 파일이다. 제품·dependency·migration·committed test 변경은 없다.
- 메모리를 현재 판정과 동기화했고 UTF-8/LF·audit schema·fingerprint·상태 이력·기존 72개 무관 finding 원문 보존을 확인했다. 정확한 7개 tracked 경로만 stage한다.
- 원 실패·추가 harness 오류·미실행 기기/운영 검증을 숨기지 않는다. 사용자 요청과 무관한 수정은 없다.
- 수정 11건 검토의 완료와 전체 release-ready는 구분한다. Round 14는 targeted 검증이므로 연속 두 번의 자유 탐색 종료 조건에 포함하지 않는다.
- 다음 권장 작업은 F-084의 cache miss 처리와 회귀 테스트, F-085의 날짜 독립 fixture·실제 cache-only assertion 보강이다. 별도 제품 수정 계획에서 다루며 운영 legacy 정리와 구형 Android 증거 gate는 유지한다.
