# 구형 Android·격리 운영 모사 검증 — 2026-09-10~11

사용자는 구형 Android와 운영 환경 검증을 요청했고, 실제 운영 환경은 아직 없다고 확인했다. 기준은 `main@07aaa3585e532fb834a1feaf66dca46e01fd4073`이다. 제품 소스·manifest·dependency·schema·migration을 변경하지 않고 현재 구현의 실행 증거를 보강한다. 실제 production 또는 전체 release 통과 판정은 아니다.

## Android 실행 행렬

최종 동일 프로토콜 실행은 2026-09-11에 수행했다. Google 공식 AOSP default x86_64 이미지, task 전용 AVD, 현재 debug APK와 Metro를 사용했다. APK SHA-256는 `C6E607A2D1FBD369B46CD96323A3C8EB248809FFF8741156B073B974F4416E1B`이며 소스 변경 없이 동일 파일을 여섯 버전에 설치했다. 로그인 화면의 표시·초기 PID/JS startup·task 경로를 검증했으며 실제 OAuth 인증은 수행하지 않았다.

| API | 보안 패치 속성 | SDK image revision | 로그인 화면 / 초기 app PID fatal |
|---|---|---:|---|
| 24 | 2017-06-05 | 8 | 표시 확인 / 0 |
| 25 | 2018-01-01 | 1 | 표시 확인 / 0 |
| 26 | 2018-04-05 | 1 | 표시 확인 / 0 |
| 27 | 2018-01-05 | 1 | 표시 확인 / 0 |
| 28 | 2018-08-05 | 4 | 표시 확인 / 0 |
| 29 | 2019-09-05 | 8 | 표시 확인 / 0 |

Probe는 권한·입력·네트워크 코드 없는 표시 전용 native Activity다. DailyUp과 control package 각각에 맞춘 affinity를 선언한다. Control은 targetSdk36/minSdk24의 native singleTask launcher로 기본 affinity를 유지한다. 실제 DSM은 기존 `taskAffinity=""`, `allowTaskReparenting="false"` 설정을 유지한다.

각 대상에서 probe를 NEW_TASK로 실행 → HOME → 대상 MAIN/LAUNCHER intent 실행 → task dump → 직접 Back 1회 순서로 측정했다. 이후 대상을 다시 실행하고 APP_SWITCH로 Recents 화면을 연 뒤 MAIN/LAUNCHER intent로 재진입했다. Recents 카드 탭을 자동화한 것은 아니다.

| API | Control / probe task | DSM / probe task | 직접 Back 후 control / DSM | DSM 재실행 task → Recents 후 task |
|---|---|---|---|---|
| 24 | 4 / 4 | 7 / 6 | Probe / Launcher | 8 → 8 |
| 25 | 6 / 6 | 9 / 8 | Probe / Launcher | 10 → 10 |
| 26 | 4 / 4 | 7 / 6 | Probe / Launcher | 8 → 8 |
| 27 | 18 / 18 | 21 / 20 | Probe / Launcher | 22 → 22 |
| 28 | 11 / 11 | 13 / 12 | Probe / Launcher | 14 → 14 |
| 29 | 16 / 16 | 18 / 17 | Probe / Launcher | 19 → 19 |

모든 행에서 기본 affinity control의 같은-task 공유가 재현됐고 현재 DSM은 probe와 분리됐다. 직접 Back 시 control은 probe로, DSM은 런처로 이동했다. Back으로 종료한 DSM을 다시 실행하면 새 task가 생길 수 있다. 재진입 검증은 이 재실행 task와 Recents 화면 이후의 task를 비교한 것이며 최초 task가 영구 유지된다는 뜻이 아니다.

초기 앱 PID의 `ReactNativeJS Running "main"`와 `FATAL EXCEPTION` 0건을 확인했다. Startup log에는 React context가 준비되기 전 발생한 nonfatal lifecycle SoftException 경고가 포함될 수 있다. 전체 후속 시나리오의 모든 로그가 무오류라고 주장하지 않는다.

이미지 fingerprint:

- API24: `Android/sdk_phone_x86_64/generic_x86_64:7.0/NYC/4174735:userdebug/test-keys`
- API25: `Android/sdk_phone_x86_64/generic_x86_64:7.1.1/NYC/4931657:userdebug/test-keys`
- API26: `Android/sdk_phone_x86_64/generic_x86_64:8.0.0/OSR1.180418.004/4931640:userdebug/test-keys`
- API27: `Android/sdk_phone_x86_64/generic_x86_64:8.1.0/OSM1.180201.023/4931629:userdebug/test-keys`
- API28: `Android/sdk_phone_x86_64/generic_x86_64:9/PSR1.180720.012/4923214:userdebug/test-keys`
- API29: `Android/sdk_phone_x86_64/generic_x86_64:10/QSR1.210820.001/7663313:userdebug/test-keys`

이 결과는 측정한 affinity/back-stack 경로에 대한 양성 대조 실험이다. Native control은 수정 전 DSM 전체 APK의 복제본이 아니고 ADB shell이 명시적 intent를 전달하므로 일반 악성 앱의 모든 실행 조건을 재현하지 않는다. 실제 OEM matrix·다른 StrandHogg 변형·서명된 release APK를 검증하지 않아 F-065는 UNKNOWN을 유지한다. Android 공식 문서도 앱 설정만으로 가능한 완화를 제한적으로 설명하고 OS patch가 필요한 변형을 구분한다. [Android StrandHogg 안내](https://developer.android.com/privacy-and-security/risks/strandhogg), [activity affinity 계약](https://developer.android.com/guide/topics/manifest/activity-element#aff).

## 운영 모사 방법과 부하 결과

PostgreSQL 17/Redis 8의 전용 컨테이너를 각각 `127.0.0.1:55344`, `127.0.0.1:56381`에 생성했다. DB 이름은 `f069_ranking_benchmark_ops_20260910`, Redis DB는 15이며 fixture 외 데이터가 없는 상태에서 기존 migration 8개를 적용했다. 컨테이너 이름과 `dsm.ops-validation=20260910` label을 검증한 뒤에만 중지·재시작·제거했다. 기존 `dsm-back-dev` 서비스와 데이터는 유지했다.

현재 committed `DSM_Back/test/ranking-projection.pg-redis-bench.ts`를 수정 없이 실행했다. 공식 도구 설치·이미지 다운로드가 같은 호스트에서 진행 중이었으며, 부하 측정은 Android emulator 실행 전에 종료됐다. 단일 Windows 호스트의 합성 측정이며 외부 서비스의 성능 수치는 아니다. [원시 benchmark JSON](2026-09-10-operations-benchmark.json)을 함께 보존한다.

| 항목 | 결과 |
|---|---|
| 데이터 | User 50,000 / DailyScore 350,000 / 7일 |
| Projection 표본 | DAILY/WEEKLY/TOTAL 각각 cold refresh 10회 |
| Cache 표본 | TOTAL TOP 100·개인 순위 각각 1,000회, 동시성 25 |
| DAILY projection p50 / 최대 | 680.590 / 799.065 ms |
| WEEKLY projection p50 / 최대 | 950.437 / 1,029.727 ms |
| TOTAL projection p50 / 최대 | 714.253 / 786.985 ms |
| TOP 100 cache p50 / p95 / p99 | 11.340 / 15.718 / 17.046 ms |
| 개인 순위 cache p50 / p95 / p99 | 2.799 / 4.294 / 5.068 ms |
| Generation key / 전체 key | 9 / 12 → 18 / 21 → 31초 후 9 / 12 |
| Redis used memory | 최초 51,266,928 → rollover 101,029,344 → grace 후 51,606,336 bytes |

10개 projection 표본의 p95/p99는 최댓값과 같다. 안정적인 tail latency 추정이나 용량 보장이 아니다. Cold는 Redis projection을 비운 상태를 가리키며 DB·OS 페이지 캐시를 비우지 않았다. Cache 측정은 `RankingCacheService` 직접 호출이며 JWT 검증·HTTP 경로 지연이 포함되지 않는다. 기존 benchmark와 날짜·기기·부하 조건이 달라 단순 수치 차이를 성능 개선으로 해석하지 않는다. User.totalScore와 DailyScore가 독립 합성값으로 생성되므로 이 dataset으로 점수 합산 정합성을 판정하지 않았다. 숫자로 정의된 production SLO도 없다.

## 연결 단절과 복구

최신 fault run은 `2026-09-10T12:29:22.245Z~12:30:11.447Z`에 수행했고 assertion을 포함한 관찰 16건이 완료됐다. 현재 날짜와 같은 데이터로 DAILY/WEEKLY/TOTAL의 leaderboard 100명과 개인 순위 기준값을 먼저 저장했다. 같은 Prisma·cache·projection·service 인스턴스를 유지하면서 task 컨테이너를 실제 중지했다. Prisma query event로 DB query 수를 측정했다. HTTP는 현재 RankingsController·HealthController·JwtAuthGuard를 사용하는 격리 Nest testing application이며 합성 JWT·활성 session fixture를 사용했다. 전체 배포 서버·ingress·scheduler 모사는 아니다.

| 조건·관찰 | 결과 | 관찰 시간 |
|---|---|---:|
| 정상 leaderboard HTTP | 200 / 100명 | 42.494 ms |
| PG 중지, warm cache 서비스 | 6조회 기준값 일치 / DB query 0 | 54.109 ms |
| PG 중지, warm cache 보호 HTTP | 500 | 50.758 ms |
| PG 중지, `/health` | 200 / status ok / configured true | 6.746 ms |
| PG 중지, cold leaderboard | P1001로 실패 | 4,112.773 ms |
| PG 중지, cold 개인 순위 | P1001로 실패 | 4,098.983 ms |
| PG 복구, 같은 서비스 | 6조회 일치 / DB query 3 | 2,628.666 ms |
| PG 복구, 보호 HTTP | 200 | 17.036 ms |
| Redis 중지, DB fallback | 6조회 일치 / DB query 12 | 1,725.786 ms |
| Redis 중지, 보호 HTTP | 200 | 64.905 ms |
| 양쪽 중지, leaderboard | P1017로 실패 | 1.632 ms |
| 양쪽 중지, 개인 순위 | P1001로 실패 | 2,049.601 ms |
| 양쪽 중지, 보호 HTTP | 500 | 2,048.847 ms |
| 양쪽 복구, 같은 서비스 | 6조회 일치 / DB query 3 | 2,877.416 ms |
| 재구성된 warm cache | 6조회 일치 / DB query 0 | 40.442 ms |
| 양쪽 복구, 보호 HTTP | 200 | 19.074 ms |

PG 장애에서 cache 서비스 성공이 보호 API 가용성을 뜻하지 않는 이유는 `JwtAuthGuard`가 매 요청마다 DB의 활성 refresh session을 조회하기 때문이다. DB 장애 시 인증을 완료하거나 잘못된 빈 랭킹을 성공으로 돌려주지 않았다. `/health`는 설정값 존재만 검사하므로 DB readiness로 사용하면 장애를 드러내지 못한다. 실제 배포의 probe wiring은 환경이 없어 확인할 수 없으며 F-013을 닫지 않는다.

장애별 시간은 대부분 단일 관찰이다. 복구 전의 고정 대기 2.5초/6초는 표의 호출 시간에 포함되지 않으므로 전체 장애 복구시간으로 표시할 수 없다. Redis의 2초 설정은 연결 timeout이며 이미 연결된 서버의 응답 정지에 대한 전체 요청 deadline을 증명하지 않는다. 이번 실험은 `docker stop/start`로 발생하는 연결 단절·재접속만 다뤘다. Network blackhole, managed failover, 다중 인스턴스, rolling deployment, TLS·백업/restore·알림 전달·실제 ingress는 미실행이다.

## Fresh / legacy 데이터 검사

부하 DB에 올바른 Task 2개와 기간별 snapshot 3개만 별도 fixture로 추가했다. Legacy 실험은 같은 task 컨테이너의 새 DB `ops_legacy_validation_20260910`에서 기존 6개 DDL → 문제 fixture → 후속 2개 DDL 순서로 진행했다. 데이터 정정이나 CHECK validation은 실행하지 않았다.

| 읽기 전용 검사 | Fresh fixture | Legacy fixture |
|---|---:|---:|
| Task 행 | 2 | 2 |
| 활성 endAt ≤ startAt | 0 | 1 |
| 활성 status COMPLETED / completedAt 모순 | 0 | 1 |
| Snapshot 행 | 3 | 2 |
| snapshotDate null | 0 | 2 |
| 동일 사용자·기간·UTC일 legacy 중복 그룹 | 0 | 1 |
| Non-null bucket 중복 그룹 | 0 | 0 |
| Non-null bucket와 snapshotAt UTC 날짜 불일치 | 0 | 0 |
| Temporal / snapshot CHECK validated | false / false | false / false |
| Snapshot partial unique index | 1 | 1 |

Legacy 이상 행이 보존되고 검사에서 검출되는 것을 확인했다. NOT VALID CHECK의 false 상태는 staged rollout 설계이며 새 DB의 이상 0건과 별개다. 실제 운영 데이터의 backfill·정정·constraint validation 완료 증거는 없다. `ER-20260909-002/003`의 경계를 유지한다.

## 실행 이력·독립 검토·CCTV

- 메인은 ignored `.local/ops-validation.ps1`·`ops-validation.cjs` 및 `.local/android-old-validation.ps1`와 credential 없는 native probe source를 작성했다. 재현용 로그·화면·task dump는 `.local`에 보존하며 제품 Git tree는 변경하지 않았다.
- 최초 Android helper는 PowerShell 함수 이름과 `adb` 실행 이름 충돌, 이어서 device shell의 `$` 확장으로 probe component를 잘못 호출했다. 정상 앱 화면만 실행된 첫 결과는 공격 검증으로 계산하지 않았다. 함수 이름 분리·adb.exe 명시·component escape·명령 출력 오류 검사를 적용하고 API29 전체 실험을 다시 실행했다. 첫 파일들은 `android-old-lab/initial-api29*`와 누적 로그에 보존했다.
- 초기 Recents→Back 키 조합은 OS마다 다른 화면으로 돌아가 Back 결과를 직접 비교하기 어려웠다. 중간 API27 실험은 Recents 이후 DSM 종료 시 다른 task의 probe가 전면으로 돌아오기도 했다. 이를 모든 경로 차단으로 해석하지 않고, 최종 여섯 버전은 대상 launch 직후 직접 Back과 별도 Recents→MAIN 재진입으로 절차를 통일했다. 이전 trial task dump는 별도 prefix로 보존했다.
- 09-10 API26 실행은 앱 시작 전 `logcat -c`의 `failed to clear the main log`로 중단됐다. 09-11 재개 시 로그 삭제를 필수로 요구하지 않고 현재 boot 로그의 앱 PID를 기준으로 검사했다. Emulator 종료 직후 serial 제거 지연도 다음 실행의 방어 검사에 걸렸으며, 종료 후 최대 15초 대기를 추가해 순차 실행했다. 이 실패들은 제품 오류나 통과 결과로 계산하지 않았다.
- 최초 ops fixture는 실제 enum LOW 대신 EASY를 사용해 scan 전에 Prisma validation 오류가 났다. `ER-20260827-001`과 같은 fixture enum 불일치이며 helper만 수정했다. 기존 오류 로그를 보존하고 전체 fault run을 다시 실행해 최신 16관찰과 scan이 완료됐다.
- Prisma CLI는 `Environment variables loaded from .env`를 출력했다. 명시적인 fixture DATABASE_URL이 우선 적용되어 로그의 datasource는 격리 DB였다. 실제 env 값을 수동 열람·출력하거나 파일을 수정하지 않았지만 CLI 자동 로더가 `.env`에 접근하지 않았다고 주장하지 않는다.
- Computer Use로 Docker Desktop의 `Engine running`, task 컨테이너 2개와 기존 `dsm-back-dev`를 확인했다. 이후 ownership label 확인을 거쳐 task 컨테이너만 제거했고 기존 개발 PG/Redis healthy를 재확인했다.
- 위 Docker 정리·healthy 증거는 09-10 실행 시점이다. 09-11 재개 시 Docker engine pipe는 없었으며 Backend 3000 listener도 없었다. 이 재개는 Android와 기록 검증을 수행했고 기존 개발 서비스를 새로 시작하거나 수정하지 않았다.
- 읽기 전용 investigator가 Backend 실험 계약을 조사했고 `/root/ops_evidence_review`가 helper·소스·JSON·로그를 독립 비교했다. 유일한 필수 기록 정정은 위 `.env` 자동 로더 경계였다. 제한적 benchmark·16관찰·fresh/legacy 결과는 근거와 일치한다는 판정이다.
- `/root/android_final_review`가 최종 여섯 API의 source·task dump·개별/통합 JSON·screenshot을 독립 대조했고 제한된 주장에 발견 사항 없음으로 판정했다. 실제 Recents 카드 탭 미실행, 초기 PID 로그 범위, Back 이후 재실행 task 비교라는 세 경계를 반영했다. F-065 전체 종결 근거는 아니라는 판정이다.
- 09-11 최종 Android aggregate 검증에서 동일 APK·최신 프로토콜·정확한 component/task ID·직접 Back 목적지·재진입 task 유지·초기 PID의 JS 시작과 fatal 0을 assertion했다. Task emulator serial 부재를 확인한 뒤 소유권을 검증한 Metro process tree와 task ADB를 종료했다. 8081/5037/5580 listener가 없음을 확인했다. SDK 이미지·AVD와 합성 검증 자료는 재사용을 위해 보존했다.
- 기록은 F-065 보충 증거와 현재 잔여 위험만 갱신한다. 상태·이전 상태 이력·fix/recheck는 보존하며 무관 84행은 원문 그대로 유지한다. 제품 tree는 기준 commit과 동일하므로 이번 문서 작업에서 Backend/Front 전체 unit/build를 다시 실행하지 않았다.
- 최종 기록 검사: Draft 2020-12 schema 85행, 연속 ID·fingerprint digest, 상태 수·F-065 상태 이력·무관 84행 보존, active memory의 strict UTF-8/byte/hash, report 상대 링크와 benchmark 원본 hash, 승인 경로 및 제품 무변경 검증을 통과했다. `git diff --check` 오류도 없었다.

## 남은 실행 조건

실제 운영 환경이 생기면 `/health`와 DB readiness의 배포 연결, migration 실행 pipeline, 운영 데이터 scan/backfill/VALIDATE, 정의된 SLO 아래 인증 HTTP 부하·장애·복구를 확인해야 한다. Android는 실제 OEM 기기·보안 패치별 변형과 서명된 release APK·실제 OAuth 경로를 별도 검증해야 한다. 이번 기록은 기존 미종결 release gate를 해제하지 않는다.
