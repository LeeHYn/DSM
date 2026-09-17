# F-013 readiness 계약 보충 — 2026-09-11

기준 `main@6e7988c92369a667c342d67c310b6c1b7c9a1426`에 앞선 memory 정리·F-014 미커밋 변경을 보존하고 readiness 경로를 추가했다. 사용자 `작업 마저 진행해`는 직전 F-013 진단·최소 개선 제안의 진행 지시다. 운영 환경이 없다는 사용자 답변은 유지한다. **저장소 구현·검증은 완료, F-013은 UNKNOWN**이다. 실제 배포의 probe mapping을 입증하지 않았으므로 status/history/validations/fix/recheck를 바꾸지 않고 evidence/residualRisk/updatedAt만 보충했다. 자유 탐색 round나 release 종료로 계산하지 않는다.

## 구현과 범위

- 기존 `/health`는 process/config liveness로 보존했다. `database.configured`는 URL 존재이며 DB 연결 성공을 의미하지 않는다.
- 새 `/health/ready`는 기존 Prisma client의 `SELECT 1` 성공 시200 `{"status":"ready"}`, 실패·1초 응답 대기 초과 시503의 고정 `Database is not ready`를 반환한다. 성공·실패 모두 `Cache-Control: no-store`다.
- 동시 요청은 하나의 query/timeout 결과를 공유한다. Timeout은 Prisma query 취소가 아니다. Underlying query가 끝날 때까지503을 공유해 추가 query 누적을 막고, settle 뒤 다음 probe에서 다시 확인한다. Fast completion의 timer와 late rejection을 처리한다.
- Redis는 DB fallback 가능한 선택적 cache이므로 필수 readiness dependency가 아니다. Schema/dependency/config 추가, Front/Android 변경은 없다.
- README에 liveness·readiness 역할, 외부 timeout 여유·migration/startup 유예와 실제 플랫폼 연결 검증 조건을 명시했다. [Nest health checks](https://docs.nestjs.com/v11/recipes/terminus), [Kubernetes probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/)를 근거로 구분하며 특정 플랫폼을 도입하지 않았다.

제품·문서 exact paths: `DSM_Back/src/health/readiness.service.ts`, `readiness.service.spec.ts`, `health.controller.ts`, `health.controller.spec.ts`, `health.module.ts`(모두 같은 health 디렉터리), `DSM_Back/test/app.e2e-spec.ts`, `DSM_Back/README.md`. 첫 두 파일은 신규다. E2E는 Prisma/RankingCache provider를 대체해 실제 DB·Redis startup 작업을 피하고 전체 AppModule의 경로·DI/filter를 검사한다.

## 현재 실행 증거

환경: Windows, Node22.23.2/npm10.9.8, Nest11/Prisma6.19.3, Docker PostgreSQL17. 로그·helpers는 plan에 허용된 ignored `.local` 경로다.

| 검증 | 결과 |
|---|---|
| HTTP RED | 신규 경로200/503 기대에404: 신규2실패, 기존2통과 |
| 서비스 RED | 최소 query만 있는 구현에서 동시성·timeout3실패/2통과 |
| 최종 전체 Backend | 28 suites / 333 tests 통과 |
| 최종 E2E | 4 tests 통과: liveness·404·readiness200·sanitized503/no-store |
| 정적 검사 | Nest build, source/spec noEmit type, 전체 non-fixing TypeScript ESLint, 변경 TS Prettier 통과 |
| 독립 검토 | `/root/readiness_review`, discovery-review: 발견 사항 없음, 수정 none |

실행 명령은 `.local/readiness-check.ps1`에 있다. `npm test -- --runInBand --cacheDirectory=D:/DSM/.local/jest-readiness`, `npm run test:e2e`의 같은 절대 cache, build, source/spec type, lint, format을 순서대로 실행했다. 서비스5개는 성공·sync/async 오류·동시 query1·999/1000ms·late 성공/거부·timer 정리를 검사한다. 독립 reviewer는 지정 source/diff/log를 대조하고 `git diff --check`를 직접 실행했으며 테스트를 별도로 재실행하지 않았다.

초기 E2E RED의 RankingProjection 초기화 오류는 실제 환경의 선택적 Redis 설정과 불완전한 Prisma fixture 조합이었다. Cache provider override로 외부 초기화 경로를 격리했다. 첫 정적 검사에서는 apply_patch로 혼합된 CRLF/LF와 test format·unsafe mock.calls 접근 때문에 lint85건이 실패했다. 지정 TS를 LF로 통일하고 matcher로 바꾼 뒤 전체 검증을 재실행해 통과했다. 실패 로그는 삭제하지 않고 `.local/logs/readiness-red.log`, `readiness-static.log`에 보존했다.

## 실제 PostgreSQL HTTP 관찰

`.local/readiness-validation.cjs`는 소유 label `dsm.readiness=20260911`의 `dsm-readiness-pg-20260911`을 `127.0.0.1:55347`에 만들었다. 합성 임시 credential만 주입했고 실제 env를 수동 읽거나 변경하지 않았다. ConfigModule `ignoreEnvFile:true`, `NODE_ENV=test`, 실제 HealthModule/Prisma/configureApp와 임의 loopback HTTP 포트를 사용했다. **전체 AppModule production bootstrap 실험은 아니다.** DB에는 migration을 적용하지 않았으며 SELECT1은 빈 DB에서도 성공한다.

| 관찰 | HTTP / 시간 |
|---|---|
| 정상 readiness | 200, 57.39ms |
| 정상 liveness | 200, 4.41ms |
| DB 중지 readiness | 503, 13.55ms |
| DB 중지 liveness | 200, 12.14ms |
| DB 중지 동시20 HTTP | 모두503, 최대1,034.39ms |
| DB 재시작 후 같은 PID29752 readiness | 200, 3.69ms, 첫 poll 성공 |
| 복구 liveness | 200, 5.05ms |
| 정리 | 앱 종료·소유 label 확인 후 task container/anonymous volume 제거 |

총8관찰은 정리1건을 포함한다. Burst는 HTTP 상태·응답 시간 근거이며 DB query수1을 실제 계측한 것은 아니다. Query 공유는 unit call-count 근거다. 재시작·pg_isready 대기는 poll 시간 밖이므로 위 수치는 RTO가 아니다. 실제 연결 오류와 응답 제한을 관찰했지만 network blackhole이나 영구 미종료 query를 실제 DB로 만들지 않았다. 원자료는 `.local/readiness-results.json`, `.local/logs/readiness-db.log`다.

## 잔여 경계와 기록 보존

- F-013 UNKNOWN: 실제 readiness mapping·트래픽 제외/복구·운영 임계값·production bootstrap은 미검증이다. 영구 미종료 query는 계약대로503을 유지하며 event-loop 정체는 timer도 지연시킨다.
- SELECT1은 schema/migration·쓰기 권한·전체 API·OAuth/Firebase·Redis 검증이 아니다. F-014 migration gate와 실제 요청 검증을 대신하지 않는다.
- 다른84행과 F-013 원 이력/판정/fingerprint/fix/recheck를 보존한다. 앞선 F-014를 포함해 Git 기준 대비 변경 finding은 F-013/F-014 두 개뿐이다. Canonical 총85건:57 CONFIRMED/2 FIXING/1 REFUTED/21 RECHECKED/4 UNKNOWN.
- 기존 ER66개를 보존하고 중복 없는 `ER-20260911-002`를 추가한다. 최신 UTF-8/LF·링크·byte/SHA 검증은 memory README에 기록한다. 기존 역사 링크5개와 이전 자동 승인 검토에서 정리가 차단된 untracked Jest cache는 보존한다.

## CCTV 기록

- 수정·추가: 위 제품7경로, memory5파일, audit 원장/README와 이 보고서, plan의 ignored helpers/results/log. 제품 삭제 없음.
- Memory 동기화: Yes. 요청과 무관한 변경: No. 기존 F-014·memory 정리 변경 보존. Commit/push·배포 없음.
- 실행·미실행: 위 표와 잔여 경계 참조. Front/Android는 이번 제품 변경 범위 밖이라 재실행하지 않았다.
- 자원: 이번 task DB/HTTP 종료, 기존 dev DB/Redis는 변경하지 않았다. 기존 cache 정리 차단을 우회하지 않았다.

## 셀프 체크 리마인더

- [x] 최소 승인 범위·기존 로직/변경 보존, 불필요한 추상화·dependency 없음.
- [x] 오류·timeout·동시성·late settlement 회귀와 실제 DB HTTP 검증.
- [x] 비밀정보 미공개, 무제한 query 누적 방지, 외부 검증 한계 명시.
- [x] 원장 상태를 근거 없이 종결하지 않고 plan/context/checklist·playbook·해시 동기화.

다음 작업 후보는 [공정표](../../memory/checklist.md)의 남은 CONFIRMED 우선순위 정리와 외부 운영/OEM·서명 gate다.
