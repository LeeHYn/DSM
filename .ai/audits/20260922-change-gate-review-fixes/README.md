# 로컬 리뷰 결함 수정 — 2026-09-22

- Audit ID: `20260922-change-gate-review-fixes`; mode `change-gate`; profile `FIX-20260922`.
- 사용자 지시: “현재 따로 승인 없이 처리 가능한 부분을 수정 진행해”. [계획](../../memory/plan.md)에 기록한 로컬 수정·회귀·독립 재검토 범위로 실행했다. 기준 HEAD는 `efd77053c71a5e7bf4ec7a4e8e3c034594ad8ae2`, 기존 문서 변경을 보존했다.
- 결과: **F-093~F-100 8건 수정·RECHECKED**, F-101은 계약 결정 필요로 **CONFIRMED 유지**. 이번 8건의 change-gate 검증을 마쳤으나 전체 release-audit는 열려 있다.
- 상태 SSOT: [20260920 보충7](../20260920-release-audit-code-review/findings.jsonl), [20260922 보충2](../20260922-release-audit-source-review/findings.jsonl). 원 발견·fingerprint·독립 반박 검증을 보존하고 `CONFIRMED→FIXING→FIXED→RECHECKING→RECHECKED` 이력을 추가했다. 별도 중복 원장은 만들지 않았다.
- [canonical92](../20260817-release-audit-full-project/findings.jsonl)는 변경 없음: RECHECKED83 / UNKNOWN5 / FIXING3 / REFUTED1. 외부8건은 이번 수정으로 닫히지 않는다. 기존 두 전체 리뷰 보고서는 발견 당시 snapshot으로 보존한다.

## 수정과 독립 재검토

| ID | 수정 및 원 조건 차단 | 수정 전후 회귀 | 독립 fix-rechecker |
|---|---|---|---|
| F-093 | refresh500~599를 일시 오류로 취급해 token/grant·offline 재시도 유지; 401/storage fail-closed 유지 | RED11 → session117 PASS | review_auth_server |
| F-094 | tick당 여러 schedule 처리, 최대100개·신규 claim 시작20초 예산; 같은 tick에서 이미 처리한 schedule 제외 | 핵심 RED3 → dispatcher52 PASS; 12사용자1tick | review_front_native |
| F-095 | 점수·상위 사용자 수·전체 사용자 수를 동일 RepeatableRead transaction client로 읽음 | 3기간·snapshot RED4 → rankings18 PASS | review_auth_server |
| F-096 | E2E AppModule init 전 운영 RealtimeWsAdapter 등록 | driver exit1 → app/input/name71 및 전체 E2E176 PASS | review_auth_server |
| F-097 | 존재하는 prompt/memory/entry 보존, 누락 파일만 생성; PowerShell5 한국어용 UTF-8 BOM | 기존 prompt 덮어쓰기 RED → 6파일2회 byte 보존·신규 생성·한국어 heading PASS | review_auth_server |
| F-098 | required scalar PATCH는 undefined만 생략하고 null 거부; nullable description/categoryId 유지 | Task4/Category2 null RED6 → HTTP71 PASS | review_auth_server |
| F-099 | 유효 미래 표시 이력을 정상 시각 anchor로 보정·직렬 저장, 동일 ID의24시간 중복 억제와 재시작 유지 | storage RED4 →48 PASS; 알림 전체245 PASS; reviewer3 suites113 PASS | review_data_server |
| F-100 | 실제 Google SDK transport timeout5000ms·retry0, AbortSignal 취소; cache/audience/서명 유지 | 실제 SDK RED2 → auth64 PASS; 동시 cold3요청 취소 | review_front_native |

구현: F-093/099=review_front_native, F-094=review_auth_server, F-095/100=review_data_server, F-096/097/098=root. 각 rechecker는 해당 원 finder·구현자와 분리했고 다른 rechecker의 판정을 보지 않았다. 모두 직접 소스와 focused 테스트를 확인했으며 신규 P0/P1을 찾지 못했다.

- F-094: visited는 transaction commit 뒤에만 갱신한다. reviewer의 실제 claim 메모리 probe는 P2034 재시도2회 모두 visited=[]이고 commit 뒤만 추가됨을 확인했다. 취소된 schedule은 다음 건으로 진행한다. transport 상한2·기존 lease/send marker·30초 send deadline을 유지한다. **20초는 신규 claim을 시작하는 예산이며 전체 tick의 절대 deadline은 아니다.**
- F-095: adversarial DB 대역은 첫 읽기 뒤 score를0→45로 바꾸어 혼합 snapshot을 재현했다. 올바른 transaction client/isolation에서만 같은 snapshot을 반환하도록 검증했다.
- F-097: 실제 workspace에 setup을 실행하지 않았다. 고유 OS temp fixture에서 symlink 권한 실패를 대역으로 만들고 검증했다. cleanup 전 절대 경로가 고유 prefix의 temp 직계 하위인지 확인한다. 기존 symlink 성공 경로는 실행하지 않았다.
- F-098: HTTP ValidationPipe에서 service 호출 전에 null을 거절한다. POST notificationEnabled:null의 기존 기본값 의미는 유지한다.
- F-099: 첫 보정 anchor를 보존하여 재시도 때24시간을 연장하지 않는다. reviewer가 실제 storage/controller/API parser 연결 probe로 신규1회표시·기존 중복차단·만료payload거부·설정/재시작을 확인했다. 저장1회실패 시 원문/snapshot 유지,60초 뒤 재시도와 재시작에서도 최초 anchor를 유지했다. native expiry/서버 TTL 계약은 변경하지 않았다.
- F-100: 실제 SDK/Gaxios를 사용하되 fetch만 메모리 대역으로 검증했다. 동시3요청의5초 abort·401 수렴·추가 fetch/DB쓰기 없음, warm-cache 재사용과 expired-cache 재시도0을 확인했다. 동시 요청 수를 묶는 singleflight는 추가하지 않았다.

## 현재 실행 결과

[검증 runner](../../scripts/verify-review-fixes.ps1)의 backend/frontend/checks 그룹을 실행했다. 아래 명령은 각 package 디렉터리 기준이다.

| 검증 | 명령 | 결과 |
|---|---|---|
| Backend unit | `node node_modules/jest/bin/jest.js --runInBand --no-cache` | 43 suites /970 tests PASS |
| Front unit | 같은 명령 | 51 suites /1,175 tests PASS |
| 전체 HTTP E2E | `node node_modules/jest/bin/jest.js --runInBand --no-cache --config test/jest-e2e.json` | 8 suites /176 tests PASS; 제외 패턴 없음 |
| Production startup | `node --test test/production-start.test.cjs` | 3/3 PASS |
| Backend types | `node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.spec.json` | PASS |
| Front types | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS |
| Backend lint | `node node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts"` | PASS |
| Front lint | `node node_modules/eslint/bin/eslint.js src index.js` | error0 / 기존 warning44 |
| Setup fixture | root에서 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .ai/scripts/test-setup-ai.ps1` | PASS; final BOM delta 뒤 root·reviewer 재실행 PASS |
| Whitespace | `git diff --check` | PASS |

Focused 명령은 해당 package의 같은 Jest 실행에 표의 test 이름을 지정했다: Front `session-controller.test.ts`, `notification-storage.test.ts`; Backend `notification-dispatcher.service.spec.ts`, `rankings.service.spec.ts`, `auth.service.spec.ts`. HTTP71은 E2E config에 `app.e2e-spec.ts task-input.e2e-spec.ts name-input.e2e-spec.ts`를 지정한 결과다. 독립 reviewer의 알림113은 storage/controller/native 세 test를 지정했다.

- 로컬 로그: `.local/fix-20260922-backend.log`, `.local/fix-20260922-frontend.log`, `.local/fix-20260922-checks.log`. Git 제외이며 실제 env/credential을 기록하지 않았다.
- 중간 실패: 위 RED를 먼저 확인했다. F-100의 테스트 generic 타입2건·unsafe lint1건을 수정한 뒤 최종 검증이 통과했다. PowerShell5에서 setup의 한글이 깨진 문제는 script BOM과 한국어 heading 회귀로 보완했다. reviewer 실행정책 차단은 자식 프로세스 한정 Bypass로 해결했으며 시스템 정책을 바꾸지 않았다.
- 실DB/Redis 경합·운영 성능, 실제 Google/socket/provider/FCM, Android/OEM·기기 시각 변경·Keychain, symlink 생성 성공, build/Docker, 신규 dependency advisory는 실행하지 않았다. 로컬 통과를 외부 gate/배포 완료로 표현하지 않는다.

## 남은 F-101과 후속 설계 범위

일반 REST는 title201/description4001 등 기존 장문 값을 허용한다. 현재 앱 조회는 성공하지만 완료/완료 해제는 전체 task를 sync replace에 넣으므로 새 sync 한도에서 거부되어 outbox에 들어가지 못한다. 해당 task의 제목/설명을 한도 안으로 줄이면 복구되고 삭제·다른 task는 이 조건의 영향을 받지 않는다.

[기존 승인 설계](../../docs/2026-09-11-confirmed-closure-plan.md)는 “replace는편집필드전체snapshot”, “새sync만title200/description4000/요청16KiB를제한한다.”를 정했다. 한도를 단순히 늘리면 bounded sync 계약이 바뀌고, 일반 REST에 한도를 추가해도 기존 데이터는 남는다. online endpoint로만 우회하면 offline 의미가 달라진다. 따라서 이번 로컬 오류 수정에서 정책을 임의 선택하지 않고 F-101을 CONFIRMED로 유지한다.

후속 제안은 **기존 장문 필드를 전송하지 않는 상태 전용 sync operation**이다. 계약 확장 결정 후 Backend DTO/policy/service/controller와 Front operation/outbox/store를 함께 바꾸고 owner·LWW·idempotency·서버 완료시각/점수·terminal delete·요청16KiB를 유지해야 한다. 기존 저장 outbox/구버전 operation 호환, 장문 title/description 양방향toggle·offline/restart/replay·동시 편집·삭제 경합을 검증한다. 데이터 재작성·한도 제거·risk acceptance는 수행하지 않았다.

## 기록 무결성

활성 memory·playbook에는 현재 결과와 과거 snapshot을 구분했다. F-098은 같은 IsOptional/null 원인의 기존 ER-20260909-001을 확장하고 나머지7개는 새 해결 record로 추가했다.

- 원장101행(92+7+2)의 schema 공통 keyword 검증 PASS. 설치된 AJV6에 schema 사본의 dialect marker만 제거해 검사했으며 native Draft2020 validator 실행은 아니다. 보충9행의 원 fingerprint/validations/evidence/이력·F-101 원문 보존,8건 fix/recheck·분리 identity PASS.
- canonical92는 HEAD와 byte 일치,9월20일 원 리뷰 보고서는 수정 전 SHA-256과 일치한다.9월22일 원 리뷰 보고서도 후속 수정 대상에서 제외하여 보존했다. Git index는 비어 있다.
- 변경30경로 모두 기존 문서 또는 exact allowlist에 포함한다. 문서/원장12개 strict UTF-8/LF(BOM 없음), 상대 링크294개, playbook 본문/index84개 고유·일치, memory4파일 크기/SHA-256 PASS. PowerShell5용 setup script BOM은 의도된 예외다.
- `git diff --check` PASS. 실환경 검증·commit·push·배포는 실행하지 않았다.
- 독립 문서 QC(review_auth_server): 8건/F-101 상태·수치·과거 snapshot·역할 독립성·외부 gate·후속 설계 범위에서 P2 이상 모순/누락 없음. 문서만 읽었으며 테스트를 재실행하지 않았고 memory hash는 root가 별도로 검증했다.
