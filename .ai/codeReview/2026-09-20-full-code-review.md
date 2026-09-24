# DSM 전체 코드 리뷰 — 2026-09-20

**신규 P2 7건을 확인했다.** 제품·테스트·설정 코드는 수정하지 않았다. 기존 감사92건과 중복을 대조하고, 각 후보를 finder와 분리된 reviewer가 반박 검증했다. 인증·데이터 일관성·영속 기록 손실 항목은2명, 그 외는1명이 검증했다. 이번 탐색에서 P0/P1을 추가로 확인하지 않았지만 무결함·배포 가능을 의미하지 않는다.

기준은 `main@efd7705`와 사용자 작업 트리다. 이전 memory 압축 변경을 보존했다. 아래 ID는 [새 보충 원장](../audits/20260920-release-audit-code-review/findings.jsonl)의 F-093~099이며 [기존 canonical92](../audits/20260817-release-audit-full-project/findings.jsonl)는 변경하지 않았다.

## Findings — 모두 P2 / CONFIRMED, 수정 전

### F-093. 부팅 중 refresh 5xx가 유효한 로컬 세션을 삭제함

- 위치: [session-controller.ts](../../DSM_Front/src/features/auth/session-controller.ts), 575–585행.
- 조건·영향: 유효 refresh token/offline grant가 있는 cold start나 bootstrap 재시도에서 `/auth/refresh`가500/502/503을 반환하면 token·grant를 지운다. 서버의 일시 장애가 강제 재로그인과 offline workspace 접근 불가로 이어진다.
- 근거: network/timeout만 보존하는 catch에서 나머지 HTTP 오류는 `endUnauthorizedSession`으로 보낸다. cleanup은 grant 무효화·token 삭제를 실행한다. 실제 source+메모리 transport/storage에서 network는 `offline-workspace`·삭제0회, HTTP5xx는 `unauthenticated`·삭제1회였다. 메인도503 대조를 재현했다.
- 수정 방향: refresh의 재시도 가능한 HTTP 오류를 복구 상태로 분류하고 token/grant를 보존한다. cold bootstrap·offline retry·직접 refresh 각각에 검증을 추가한다. 실제401의 정리 경계는 유지한다.
- 범위: F-057은 성공한 refresh 뒤 `/auth/me` 오류로 다른 trigger다. 실기기 Keychain·실서버 장애는 실행하지 않았다.

### F-094. 동시 알림이 전역 처리량 제한으로 만료 후 전송됨

- 위치: [notification-dispatcher.service.ts](../../DSM_Back/src/notifications/notification-dispatcher.service.ts), 113–134·473–482행.
- 조건·영향: FCM을 활성화한 단일 인스턴스에서 서로 다른12명에게 동시에 reminder가 발생하고 앱들이 background/종료 상태이면, 12번째 wake는 가장 빠른 경우에도330초 이후다. [notifications.service.ts](../../DSM_Back/src/notifications/notifications.service.ts)118–122행의5분 조회창에서 일정이 사라져 표시하지 못한다.
- 근거: 30초 Cron마다 첫 schedule 하나의 delivery만 claim하고 send를 한 번 수행한다. batch500은 한 schedule의 token 수다. 내용 없는 `REMINDER_SYNC` 이후 client는 REST로 내용을 가져오며 foreground polling은 이 조건을 보완하지 못한다. 실제 dispatch/claim 메모리 probe에서11번째는300초,12번째는330초였다.
- 수정 방향: token batch와 별개로 여러 due schedule을 제한된 시간·동시성 안에서 계속 처리하도록 한다. 전역 backlog가 TTL을 초과하지 않는 처리율·공정성을 검증하고, 기존 lease·중복 발송 방지를 유지한다.
- 범위: 현재 Render Blueprint는 `FCM_DISPATCH_ENABLED=false`다. 활성화 전 수정할 잠재 결함이며 실제 FCM 처리량·OEM 수신 실험을 했다는 의미는 아니다.

### F-095. 순위 fallback이 서로 다른 DB 상태를 결합함

- 위치: [rankings.service.ts](../../DSM_Back/src/rankings/rankings.service.ts), 114–118행; snapshot 경로76–106행.
- 조건·영향: cache 미설정/장애/miss로 DB fallback을 사용하고 본인 점수 조회와 상위 인원 조회 사이에 점수가 증가하면 본인을 상위 사용자로 센다. 사용자1명·점수0→45 예시에서 `score=0, rank=2, totalUsers=1, percentile=200`을 반환하고 일일 snapshot에 저장할 수 있다.
- 근거: score·higherCount·totalUsers가 transaction 없는 별도 조회다. Task 쓰기의 Serializable transaction은 이 읽기들을 묶지 않는다. 실제 서비스 메모리 probe와 메인의 재현에서 위 결과와 같은 날 snapshot 재사용을 확인했다. Front parser도 이 조합을 받아들인다.
- 수정 방향: 개인 순위·점수·전체 인원을 동일 SQL snapshot 또는 일관된 읽기 transaction에서 계산한다. percentile만 잘라내면 잘못된 순위·점수가 남는다.
- 범위: F-030의 UTC 기준일 불일치와 달리 TOTAL·고정 날짜에서도 발생한다. 실제 PostgreSQL 경합 빈도는 미측정이다.

### F-096. 기본 E2E가 WebSocket adapter 누락으로 종료됨

- 위치: [app.e2e-spec.ts](../../DSM_Back/test/app.e2e-spec.ts), 25–27행.
- 조건·영향: 표준 `test:e2e` 설정으로 AppModule을 초기화하면 custom adapter 없이 gateway를 구성해 기본 socket.io driver를 찾는다. 이 패키지는 사용하지 않으므로 health/readiness assertions 전에 `process.exit(1)`로 전체 명령이 중단된다.
- 근거: 이번 실행에서 `No driver (WebSockets) has been selected`와 app.init27 stack을 확인했다. [main.ts](../../DSM_Back/src/main.ts)는 `RealtimeWsAdapter`를 등록하지만 해당 test harness에는 없다. 문제 파일을 제외한 진단165개 통과는 전체 E2E 통과가 아니다.
- 수정 방향: AppModule 테스트 bootstrap도 운영의 adapter 계약과 맞추거나 공통 초기화 함수를 사용한다. 원하지 않는 socket.io 의존성 설치로 우회하지 않는다.
- 범위: 운영 main에는 adapter가 있으므로 이 finding을 production 서버 부팅 장애로 확대하지 않는다.

### F-097. 초기화 스크립트 재실행이 활성 기록을 지움

- 위치: [setup-ai.ps1](../../setup-ai.ps1), 84–86행.
- 조건·영향: 기존 checkout에서 안내대로 스크립트를 다시 실행하면 현재 v5.3 prompt를 embedded v3.2로 덮어쓰고 plan/context/checklist를0바이트로 만든다. 아직 커밋하지 않은 결정·진행 기록은 Git으로 복구되지 않는다.
- 근거: 존재 검사·백업·재초기화 확인 없이 `Out-File`과 `New-Item -ItemType File -Force`를 호출한다. 링크 생성의 try/catch는 이 작업 뒤에 있어 보호하지 못한다. PowerShell5.1에서 기존 파일의0바이트 덮어쓰기는 [New-Item 공식 Example9](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/new-item?view=powershell-5.1#example-9-use-the--force-parameter-to-overwrite-existing-files), 기본 overwrite는 [Out-File 공식 문서](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/out-file?view=powershell-5.1#-noclobber)로 확인했다.
- 수정 방향: 초기 설치는 없는 파일만 생성하고 기존 지침·memory를 보존한다. reset이 필요하면 별도 명시적 동작과 byte-exact 백업을 요구한다.
- 범위: 파괴적인 실제 재실행·파일 쓰기 probe는 하지 않았다.

### F-098. 필수 scalar의 null PATCH가 검증을 통과함

- 위치: [update-task.dto.ts](../../DSM_Back/src/tasks/dto/update-task.dto.ts), 44–47행; [tasks.service.ts](../../DSM_Back/src/tasks/tasks.service.ts), 294–330행.
- 조건·영향: `{notificationEnabled:null}` 및 title/difficulty/status의 null, Category name/color의 null을 전송하면 `IsOptional`이 검증을 건너뛴다. 서비스는 nullable이 아닌 Prisma 필드로 null을 전달하여 저장 오류와 일반500 경로를 만든다.
- 근거: 실제 ValidationPipe에서6개 null이 통과했고 Prisma DMMF에서는 모두 required였다. 계산용 `??`는 persistence 입력을 고치지 않는다. 실제 updateWithClient 메모리 실행에서도 null이 전달됐다. [task-input.e2e-spec.ts](../../DSM_Back/test/task-input.e2e-spec.ts)70–76행은 mock service로 null 성공을 기대해 이 불일치를 놓친다.
- 수정 방향: 필수 필드는 undefined만 생략으로 허용하고 explicit null을400으로 거부하거나, API가 null을 noop로 정의한다면 쓰기 전에 일관되게 제거한다. description/categoryId처럼 실제 nullable 필드는 별도 계약을 유지한다.
- 범위: 실제 Prisma engine/DB500 응답은 실행하지 않았다. 현재 pipe·service·schema·serializer·exception filter의 계약 불일치다. 날짜 null→epoch인 F-007과 다른 필드/실패 조건이다.

### F-099. 정상 시각 보정 후 신규 알림·설정이 장시간 막힘

- 위치: [notification-storage.ts](../../DSM_Front/src/features/notifications/notification-storage.ts), 71–82·121–126행.
- 조건·영향: 기기 시각이1시간 빠를 때 정상 알림을 표시·저장하고 시각을 정상화하면 과거 이력이 미래 timestamp로 간주된다. 새 reminder ID도 표시하지 못하고 설정 변경은 invalid, 재시작은 corrupt가 된다. 예시에서는 약55분이 지나야 회복된다.
- 근거: 모든 표시 이력에 `displayedAt <= now+5분`을 강제하며 미래 이력은 prune되지 않는다. 실제 Storage/Controller/API parser probe 및 메인 Storage 재현에서 동일 결과를 확인했다. 서버 시각·monotonic clock으로 검증된 새 알림도 과거 이력 때문에 차단된다.
- 반박 검토: 기존 rollback 테스트는 의도적으로 예외를 기대한다. 그러나 정상 시계 보정 뒤 신규 알림 전체를 막아야 한다는 요구나 사용자 위험 수용 근거는 없었다. ±1시간 offset 유지 테스트는 저장 후 보정을 검증하지 않는다.
- 수정 방향: 계정·문서 형식·알림 유효성 경계를 유지하며 정상 시각 보정으로 미래가 된 dedupe 이력을 복구하거나 새 알림 처리를 그 기록과 분리한다. 중복 표시·만료·재시작·설정 보존을 함께 검증한다.
- 범위: Task logical clock F-091과 다른 저장소다. 실제 Android 시간 변경·FCM 실험은 하지 않았다.

## 현재 검증

| 검사 | 결과 |
|---|---|
| Backend unit, no-cache | 43 suites / 960 tests 통과 |
| Front unit, no-cache | 51 suites / 1,156 tests 통과 |
| Backend spec / Front no-emit typecheck | 모두 통과 |
| production-start | 3 tests 통과 |
| Backend package TS 범위 non-fixing ESLint | 통과 |
| Front ESLint | error0 / warning44 |
| 기본 HTTP E2E | **실패, exit1 — F-096** |
| app.e2e-spec 제외 원인 분리 실행 | 7 suites / 165 tests 통과; 전체 E2E 통과 아님 |
| 코드 기반 메모리 재현 | 세션·순위·알림 처리율·null 입력·시각 보정 근거 확보 |

처음 Backend lint를 디렉터리 전체에 적용했을 때 TS project에 포함되지 않은 production-start CJS parser 오류로 exit1이었다. 기존 package script의 TS glob을 non-fixing으로 실행한 후 통과했다. 검증 도구 범위 오류와 제품 finding을 구분했으며 최초 실패도 로그에 보존했다.

단위 테스트 통과는 위의 비검증 interleaving·기기 상태 전이·mock persistence 계약을 보증하지 않는다. 실제 DB/Redis 경합·장애, Android 빌드/기기, FCM/OAuth/OEM, Docker·공개 배포 및 현재 dependency audit는 이번에 실행하지 않았다.

## 범위와 남은 gate

검토는 Backend Auth/Profile/Task/Category/Score/Ranking/Notification/Realtime, Prisma schema/migration, Front session/API/offline/UI/realtime/알림·Android native, Render/Docker/초기화와 테스트 설정을 대상으로 수행했다. 기존 learning-site 도구는 과거 산출물 경계·경로/출력 코드를 확인했고 현재 Android 제품으로 취급하지 않았다. Git 추적 inventory는 Backend src116/test26/prisma11, Front src110/android58, tools30개다. 이 수치는 읽기 대상 지도로 사용했으며 모든 파일·입력 조합의 전수 동적 검증 수가 아니다.

서로 다른 R4(API 소유권·부분 실패·취소)와 R5(화면 상태·페이지/날짜 경계·자원 해제)에서 신규 후보0이었다. R5 메모리 probe는 목록0/100/101행 페이지 처리, 반복 페이지 거부, 윤년/연말 범위와 누락 날짜 응답 거부를 확인했다. 소규모 자유 탐색의 신규0은 무결함 증명이 아니다.

**코드 리뷰 산출물은 작성했지만 release-audit gate는 열려 있다.** 신규7건은 미수정 CONFIRMED이며 기본 E2E가 실패한다. 기존 외부8건 F-003/F-013/F-015/F-017/F-065/F-067/F-068/F-092도 유지된다. 다음 구현은 이번 리뷰와 분리해 승인 범위·수정 파일·회귀 검증을 계획해야 한다. 상세 라운드와 독립 판정은 [감사 README](../audits/20260920-release-audit-code-review/README.md)와 원장에 기록했다.
