# DSM 전체 소스 리뷰 — 2026-09-22

**신규 P2 2건(F-100·F-101)을 확인했고, 이전 P2 7건(F-093~099)은 미수정 상태다.** 이번 탐색에서 추가 P0/P1은 확인하지 않았다. 제품 소스·테스트·설정은 변경하지 않았으며, 두 신규 후보는 finder와 분리된 reviewer 2명씩 독립 반박 검증했다.

기준은 `main@efd77053c71a5e7bf4ec7a4e8e3c034594ad8ae2`와 현재 작업 트리다. 9월20일 이후 제품 diff는 없으며 이전 memory 정리와 리뷰 산출물을 보존했다. [이번 보충 원장](../audits/20260922-release-audit-source-review/findings.jsonl), [라운드·판정 기록](../audits/20260922-release-audit-source-review/README.md), [이전 7건 상세](./2026-09-20-full-code-review.md)를 함께 확인한다.

## 신규 findings — P2 / CONFIRMED, 미수정

### F-100. Google 인증서 요청이 정체되면 로그인 작업을 끝낼 기한이 없음

- 위치: [auth.service.ts](../../DSM_Back/src/auth/auth.service.ts), 56·390–393행.
- 조건·영향: 인증서 캐시가 비었거나 만료된 상태에서 Google certificate endpoint가 연결 후 응답을 끝내지 않으면 로그인 Promise와 provider fetch가 대기한다. 동시 로그인은 각각 인증서 요청을 만들므로 외부 장애 중 대기 작업이 누적될 수 있다. JWT 형식 검사보다 인증서 조회가 먼저여서 합성 invalid token도 이 경로에 들어간다.
- 원인: `OAuth2Client`에 transporter timeout을 설정하지 않는다. 설치된 SDK의 cache-miss 요청에도 deadline이 없다. Gaxios는 timeout 옵션이 있을 때만 AbortSignal을 붙이고, retry는 실패 후 동작하므로 끝나지 않는 요청을 제한하지 않는다. Node 경로는 node-fetch다.
- 현재 근거: 실제 AuthService→OAuth2Client→Gaxios를 사용하고 외부 fetch만 끝나지 않는 메모리 함수로 치환했다. finder는 동시3회, DATA reviewer는 동시3회/5,300ms, FRONT reviewer는 Controller/DTO까지 포함해 동시4회/30ms를 관측했다. 각 요청에 timeout/signal이 없고 관측 중 완료0이었다. 두 reviewer의 warm-cache invalid-token 대조는 외부 fetch0/즉시401이었다. 유한한 관측시간 자체를 무기한 대기의 증명으로 사용하지 않고 실제 코드의 deadline 부재와 함께 판정했다.
- 반박 검토: Front의10초 timeout은 자체 fetch를 중단하며 Backend provider 요청에 전달되지 않는다. DATA reviewer는 현재 Node HTTPS agent 기본 timeout도 active 요청을 강제로 중단하지 않는 구현을 확인했다. 기존 F-062는 지금5초 timeout/abort가 있는 Kakao 메서드로 별도 경로다.
- 수정 방향: Google 인증서 transport에 실제 요청을 중단하는 종료 기한과 제한된 재시도를 설정한다. cold/expired/warm cache, 정체·지연 응답, 동시 호출과 취소 후 자원 해제를 회귀 검증한다. 단순 Promise timeout만으로 외부 fetch를 남기지 않아야 한다.
- 한계: 실제 Google 장애·네트워크 소켓·운영 부하는 실행하지 않았다. 인증 우회가 아닌 조건부 가용성 결함이다.

### F-101. 일반 API가 허용한 긴 제목의 일과를 앱에서 완료·완료 해제하지 못함

- 위치: [product-store.ts](../../DSM_Front/src/features/product/product-store.ts), 533–537행; [task-sync.ts](../../DSM_Front/src/features/product/task-sync.ts), 102행. 일반 입력은 [create-task.dto.ts](../../DSM_Back/src/tasks/dto/create-task.dto.ts)17–19행과 [update-task.dto.ts](../../DSM_Back/src/tasks/dto/update-task.dto.ts)14–17행.
- 조건·영향: 현재 일반 POST/PATCH API 또는 기존 데이터에 제목201자인 Task가 있으면 현재 앱은 목록을 읽지만 해당 일과의 완료·완료 해제에 실패한다. 온라인에서도 동일하며 outbox와 sync 전송은0이다. 사용자에게는 일반 저장소 오류가 표시된다.
- 원인: 일반 DTO에는 제목 상한이 없고 서비스·TEXT 열도 해당 문자열을 허용한다. 반면 완료 toggle은 기존 제목까지 포함한 전체 replacement를 만들며 offline engine은 제목200자 상한으로 enqueue를 거부한다. [product-context.tsx](../../DSM_Front/src/features/product/product-context.tsx)106–110행은 온라인에서도 이 engine을 주입하므로 기존 complete endpoint로 우회하지 않는다.
- 현재 근거: finder와 DATA reviewer는 실제 ValidationPipe→TasksService.create(메모리 DB)→sync 목록 parser→OfflineTaskStorage/OfflineTaskSync→ProductStore를 연결했다. FRONT reviewer는 실제 store/engine/parser를 online=true로 실행하고 HTTP·저장소만 메모리 대역으로 제공했다.

| 조건 | 조회 | 완료 상태 전환 | 현재 관측 |
|---|---|---|---|
| 제목200자 | 정상 | 성공 | DATA: outbox1, FRONT 온라인: apply1 |
| 제목201자·PENDING | 정상 | 실패 | PENDING 유지, outbox/전송0 |
| 제목201자·COMPLETED | 정상 | 실패 | COMPLETED 유지, outbox/전송0 |
| 제목201자 삭제 | 정상 | 삭제 가능 | FRONT 온라인 apply1 |
| 제목을 줄인 뒤 완료 | 정상 | 복구 | FRONT 수정·완료 apply2 |

- 수정 방향: 일반 CRUD·동기화·앱의 필드 계약을 맞추고 이미 저장된 장문 Task의 상태 전환도 처리한다. 새 DTO에 상한만 넣으면 기존 데이터는 남는다. 기존 제목을 자동으로 잘라 데이터가 손실되지 않도록 호환 방식을 정하고200/201자·양방향 완료·온라인/오프라인·기존 데이터 회귀를 검증한다.
- 한계: 해당 Task에 한정된 실패이며 날짜 전체 조회나 다른 Task를 막지 않는다. 제목 축약 수정·삭제는 가능하다. 실제 PostgreSQL·Android UI는 실행하지 않았다. F-076의 기능 부재, F-083의 중복 생성과 다른 root cause다.

## 이전 7건의 현재 상태

모두 P2 / CONFIRMED / 미수정이다. 과거 원장의 판정일과 검증 이력을 이번 날짜로 덮어쓰지 않았다.

| ID | 문제·수정 방향 | 이번 확인 |
|---|---|---|
| F-093 | refresh5xx에 token/grant 보존·재시도 분류 필요 | 실제 SessionController:503은 삭제1·무효화1, network는 offline 보존 |
| F-094 | 30초당 schedule 하나로 reminder5분창 초과; 여러 일정 처리 필요 | dispatcher·조회창·client 호출 소스 대조. 이번 처리량 probe는 미실행 |
| F-095 | 순위 DB 읽기를 같은 snapshot으로 묶어야 함 | 실제 RankingsService/메모리 DB에서1명인데 rank2·percentile200 재현 |
| F-096 | E2E에 운영과 같은 custom WebSocket adapter 필요 | 표준 E2E exit1/No driver 재현 |
| F-097 | setup 재실행 시 기존 prompt/memory를 보존해야 함 | 무조건 overwrite 코드 대조. 파괴적 실행 없음 |
| F-098 | required scalar의 explicit null을 API/저장 계약과 맞춰야 함 | 실제 ValidationPipe에서 Task/Category6개 null 통과 재현 |
| F-099 | 정상 시각 보정 뒤 dedupe history 복구 필요 | 실제 Storage에서 +1h 저장 후 시각 복원: 신규 ID·설정 모두 invalid |

F-094의 현재 Render 설정은 FCM dispatch=false다. F-098은 실제 Prisma engine500 실행이 아니라 pipe·service·schema 불일치이며, F-099는 실제 기기 시각 변경이 아닌 메모리 clock probe다. 자세한 조건·영향·수정 방향은 이전 보고서를 따른다.

## 이번 실행 검증

| 검사 | 결과 |
|---|---|
| Backend unit, no-cache | 43 suites / 960 tests 통과 |
| Front unit, no-cache | 51 suites / 1,156 tests 통과 |
| 양쪽 no-emit typecheck | 통과 |
| production-start | 3 tests 통과 |
| Backend package TS glob non-fixing ESLint | 통과 |
| Front ESLint | 0 errors / 44 warnings |
| 기본 HTTP E2E | **실패, exit1 — F-096** |
| app.e2e-spec 제외 진단 | 7 suites / 165 tests 통과. 전체 E2E 통과 아님 |
| 과거 learning 도구의 독립 paths/runtime/syntax/render/symbols tests | 20 tests 통과. 고정 corpus 전체 generator suite는 미실행 |

명령·로그 위치는 감사 README에 기록했다. 코드 기반 메모리 재현과 단위 테스트는 실제 DB·기기·provider·운영 검증을 대신하지 않는다. build/Docker/migration/실DB·Redis 장애/Android 기기/실제 FCM·OAuth/OEM/외부 배포/최신 dependency advisory 조회는 이번에 실행하지 않았다.

## 범위·남은 gate

Backend Auth/Profile/Task/Category/Score/Ranking/Notification/Realtime·Prisma, Front 인증/API/offline/화면/알림/Realtime·Android native, Docker/Render/초기화·테스트 설정을 영역별로 검토했다. learning-site는 과거 고정 corpus 도구로 별도 경계를 유지했다. 추적 inventory는 Backend src116/test26/prisma11, Front src110/android58, tools30이다. 파일 지도이며 모든 파일의 모든 동작을 실행했다는 수치가 아니다.

R1 도메인별 병렬 조사, R2 오류·종료 경계, R3 입력·직렬화, R4 일반 API와 동기화 호환성, R5 인접 필드 계약, R6 재시작·취소·재시도 정리를 탐색했다. R5/R6의 별도 신규 P0~P2는 연속0이다. R5 description4001자 변형은 같은 R4 계약 불일치로 별도 등록하지 않았다. 제한된 자유 탐색의 신규0은 무결함 증명이 아니다.

**리뷰 산출물 작성과 release-audit 종료는 구분한다.** 미수정 코드9건과 실패한 기본 E2E가 남는다. 기존 canonical92의 외부8건(F-003/F-013/F-015/F-017/F-065/F-067/F-068/F-092) 상태도 유지한다. 특히 실제 A→B 계정 전환 증거 없이 F-092 UNKNOWN을 닫지 않았다. 수정·위험 수용·배포 승인을 추정하지 않았다.

활성 memory에는 이번 결과를 동기화하며 readiness 준비 문구도 실제 계약과 맞췄다: DB 장애는 readiness503/트래픽 제외·복구, Redis만 장애인 경우는 DB fallback·캐시 복구와 readiness 유지 검증이다. 운영에서 이를 실행했다는 의미는 아니다.
