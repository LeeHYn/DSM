# Round17 — Task mutation 입력 검증

2026-09-11, audit `20260817-release-audit-full-project`, targeted change-gate/fix-recheck. 사용자 `그래`는 확정57건 우선순위와 다음 수정 승인이다. 구현자 /root, 프로파일 P-TASK-20260911, 독립 reviewer2명 검토 완료. 기준 main@6e7988c + 기존 F-014/F-013/지침·memory 미커밋 변경. 이 보고서는 현재 두 finding의 수정 범위만 다룬다.

## 원인과 수정

- F-041/P2: 전역 enableImplicitConversion이 JSON 문자열 false를 boolean true로 바꾼 뒤 IsBoolean이 통과했다. Create/Update의 notificationEnabled에 `@Type(() => Object)`를 지정해 reflected Boolean 강제 변환을 피하고 원래 JSON 타입을 IsBoolean으로 검사한다. 문자열을 boolean으로 해석하지 않고400으로 거부한다. 실제 false/true와 기존 IsOptional의 null/생략은 보존한다.
- F-079/P2: 기본 IsDateString은 형식 검사만으로 불가능한 Gregorian 날짜를 통과시켰다. startAt/endAt 네 decorator에 `{ strict: true }`를 적용한다. 2026-02-30·2026/2100 비윤년2월29일·4월31일을 mutation service 전에 거부한다. 윤년2028/2000·Z/+09:00/-05:00 필드는 보존한다.
- 서비스·전역 pipe·의존성·DB schema·timezone 정책을 변경하지 않는다. TaskQueryDto/조회 날짜는 F-010의 별도 경계, timezone suffix 계약은 F-059의 별도 범위다. 직접 서비스 호출의 날짜 파싱은 기존 계약을 따른다.
- 제품 exact paths: `DSM_Back/src/tasks/dto/create-task.dto.ts`, `DSM_Back/src/tasks/dto/update-task.dto.ts`, 신규 `DSM_Back/test/task-input.e2e-spec.ts`. 앞선 readiness/startup 변경은 보존했다.
- 근거: 설치된 class-transformer0.5.1 TransformOperationExecutor는 explicit Type metadata를 implicit reflected type보다 먼저 선택한다. class-validator0.15.1 IsDateString은 strict 옵션을 validator에 전달한다. [공식 변환기 문서](https://github.com/typestack/class-transformer#implicit-type-conversion), [공식 validator 문서](https://github.com/typestack/class-validator#validation-decorators).

## 현재 실행 증거

| 검사 | 결과 |
|---|---|
| 수정 전 HTTP RED | 28실패/30통과: non-boolean12와 달력 오류16이400 대신201/200. 원 실패 로그 보존 |
| 수정 후 전체 E2E | 58/58, 2 suites (Task HTTP54 + 기존 app4) |
| Backend unit | 333/333, 28 suites |
| build/source+spec type | 통과 |
| 전체 non-fixing ESLint/변경 파일 Prettier | 통과 |
| git diff --check | 통과 |

명령은 `.local/task-input-check.ps1 -Phase red|green|unit|static` 각각 실행했다. 원자료는 `.local/logs/task-input-red.log`, `task-input-green.log`, `task-input-unit.log`, `task-input-static.log`. 최초 static 검사에서 test mock 호출 인자의 any member 접근 lint1개가 실패했다. 인자 목록을 unknown[]로 좁힌 뒤 E2E/정적 검사를 다시 통과했고, 실패는 static log 앞부분에 보존했다. RED의28실패는 제품 결함 재현이며 lint 실패와 구분한다.

HTTP 검증은 실제 configureApp의 pipe/filter와 TasksController를 사용하되 인증 guard와 TasksService만 합성 fixture로 바꾼다. 잘못된 입력마다400과 create/update 호출0을 확인해 persistence 경로 진입을 막았음을 검증한다. 양성 테스트는 DTO 필드 전달을 확인하며 실제 Task interval/DB 쓰기 성공을 주장하지 않는다. 테스트 종료 시 HTTP 앱을 닫았다. 운영·실제 OAuth/FCM·PG write·Front/기기는 이번에 실행하지 않았다. 전역 pipe를 거치지 않는 내부 service 호출은 이 HTTP 계약의 보호 범위가 아니다.

## 독립 검토 및 원장

| 독립 reviewer | F-041 | F-079 | 수행한 검증 |
|---|---|---|---|
| /root/task_input_review_a | RECHECKED | RECHECKED | exact diff·원 로그·변환기/validator 소스·diff check, 쓰기 없는 설치 패키지 boolean/date probe |
| /root/task_input_review_b | RECHECKED | RECHECKED | exact diff·원 로그·변환기/validator 소스·diff check |

두 reviewer 모두 발견 사항 없음, 신규 P0/P1 없음이며 구현자와 분리·상대 판정 미열람을 확인했다. 테스트 전체는 메인이 실행했고 두 reviewer는 실제 로그를 검토했다. A의 추가 probe는 비boolean7종 거부·boolean/null/undefined 보존, 불가능 날짜4종 기본 true→strict false/정상3종 strict true를 확인했다. B는 HTTP400 + 양 service 호출0이 해당 mutation 진입 차단에 충분하다고 판정했다. 양성 DTO 전달을 실제 interval/PG/provider 성공으로 확대하지 않는다는 한계는 두 판정에 모두 명시됐다.

F-041/F-079에 CONFIRMED→FIXING→FIXED→RECHECKING→RECHECKED를 추가했다. 기존 fingerprint·원 증거·validations·상태 이력을 보존하고 F-079의 기존 PG 미검증 위험을 남겼다. F-041의 역사적 NEW→CONFIRMED 전이는 수정하지 않는다. 이번 두 행 외83행은 시작 snapshot과 동일하다. Git 기준 대비 변경은 기존 F-013/F-014를 포함한4행이며81행을 보존한다. 현재85건은55 CONFIRMED(P2=37/P3=18),2 FIXING,1 REFUTED,23 RECHECKED,4 UNKNOWN이다. 자유 탐색 횟수는 증가하지 않으며 전체 release-ready는 아니다.

원장 schema85건·fingerprint·57행 우선순위 중복/누락·기존 이력/다른 행·ER67개 보존, 새 ER2개/색인·memory/hash·UTF-8/LF·신규 링크·diff는 `.local/task-input-record.cjs --final`과 메인 snapshot 대조로 검증한다. Commit/push 없이 로컬 변경으로 남긴다.

전체57건의 실행 제안과 외부 조건은 [우선순위 목록](2026-09-11-confirmed-priorities.md), 현재 다음 행동은 [checklist](../../memory/checklist.md)를 따른다.
