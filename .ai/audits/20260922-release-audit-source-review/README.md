# 전체 소스 재리뷰 보충 감사 — 2026-09-22

> 같은 날 후속 FIX-20260922: F-100은 수정 및 독립 fix-recheck를 마쳐 **RECHECKED**, F-101은 기존 sync 계약의 추가 설계가 필요하여 **CONFIRMED**다. [수정·검증 기록](../20260922-change-gate-review-fixes/README.md)과 [현재 원장](./findings.jsonl)을 따른다. 아래는 발견 당시 리뷰 snapshot으로, 제품 diff 없음·E2E 실패 등 당시 증거를 보존한다.

- Audit ID: `20260922-release-audit-source-review`; mode `release-audit`; profile `REVIEW-20260922`.
- 기준: `main@efd77053c71a5e7bf4ec7a4e8e3c034594ad8ae2`. 제품 diff 없음. 이전 memory 정리5파일과 20260920 리뷰3파일의 기존 변경을 보존했다.
- [보고서](../../codeReview/2026-09-22-full-source-review.md), [이번 원장](./findings.jsonl), [기존 canonical92](../20260817-release-audit-full-project/findings.jsonl), [20260920 보충7](../20260920-release-audit-code-review/findings.jsonl).
- 이번 원장: F-100/F-101 **2건 P2 / CONFIRMED / 미수정**. 기존 두 원장의 상태·fingerprint·이력은 그대로 유지한다. canonical92를 자동으로101건으로 표현하지 않는다.

## 라운드·판정

| 라운드 | lens·실행 주체 | 새 원인 | 결과 |
|---|---|---:|---|
| R1 | Auth/Profile/Notification/Realtime, Task/Score/Ranking/Prisma, Front/native3명 + root 운영/도구/검증 | 1 | Google 인증서 timeout F-100 |
| R2 | 오류 매핑·비동기 종료 / review_auth_server; root 배포/도구 경계 대조 | 0 | health·profile/image·provider·Firebase·Realtime |
| R3 | 입력·직렬화·재시도 취소 / review_auth_server | 0 | 실제 pipe/profile/policy 메모리 probe, DB writes0/image slots0/getter calls0 |
| R4 | 일반 API 데이터의 현재 앱 상태 전환 / root 제안→review_auth_server 재현 | 1 | 긴 제목 full replacement 불일치 F-101 |
| R5 | 인접 필드 API 호환성 / review_auth_server | 0 | description4001 변형은 F-101과 동일 root cause로 병합 대조, category/status/owner/tombstone |
| R6 | 재시작·취소·재시도·자원 정리 / review_auth_server | 0 | dispose 뒤 late ACK outbox보존→새 engine 동일 mutation 재전송 성공 |

R5/R6은 서로 다른 lens의 연속 신규0 탐색이다. 가능한 모든 입력/스케줄의 전수 증명이나 외부 검증을 의미하지 않는다. R1에서 '201자 제목이 날짜 전체 조회를 막음' 가설은 parser가 허용해 기각했다. R4는 조회 정상/해당 Task 완료 전환 실패로 조건·영향을 새로 좁혀 재현했다. Redis command deadline 관찰은 실제 pending socket 근거 부족과 기존 F-069 운영 residual 중첩 때문에 신규 finding으로 올리지 않았다.

## 독립 검증

- Finder: 두 finding 모두 `review_auth_server`이며 F-101의 좁힌 가설은 root가 제안했다.
- F-100: `R1-V-DATA`=`review_data_server`, `R1-V-FRONT`=`review_front_native`; 모두 SURVIVED.
- F-101: `R4-V-DATA`=`review_data_server`, `R4-V-FRONT`=`review_front_native`; 모두 SURVIVED.
- 같은 finding의 finder/validator identity를 분리했고 다른 validator의 투표·논리를 전달하지 않았다. 메인만 fingerprint·상태·원장을 기록했다. 판정 기록 timestamp와 probe 경과시간을 구분한다.
- F-100 DATA는 실제 service/SDK를5300ms 관측하고 Node timeout 내장 구현을 읽었다. FRONT는 실제 Controller/DTO까지 연결한30ms 관측이다. 각자의 warm-cache 대조와 코드 확인을 함께 판정 근거로 사용하며 서로의 검증을 수행했다고 기재하지 않았다.
- F-101 DATA는 실제 생성 service+메모리 DB부터 양방향toggle/outbox를 대조했다. FRONT는online store/HTTP대역에서 실제apply횟수·삭제·제목단축복구를 대조했다. 모두 실제 네트워크·Prisma engine·기기 검증은 아니다.
- 이전7건은 현재 소스 대조와 F-093/095/098/099의 현재 actual-source probe, F-096 표준 E2E 실패로 상태를 확인했다. F-094 처리량·F-097 파괴적 실행은 이번에 하지 않았다.

## 현재 실행

루트가 아래 명령을 해당 Backend/Front 디렉터리에서 수행했다.

- Unit: `node node_modules/jest/bin/jest.js --runInBand --no-cache` → Backend43/960, Front51/1156.
- E2E: `node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand --no-cache` → exit1, adapter누락. 같은 명령에 `--testPathIgnorePatterns app.e2e-spec.ts`를 붙인 진단만7/165 통과.
- `node --test test/production-start.test.cjs` →3/3.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` → Front통과; Backend는 추가 `-p tsconfig.spec.json` 통과.
- `node node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts"` → Backend통과. Front `src index.js` → error0/warning44. 자동fix·strict warning budget을 실행하지 않았다.
- Root `node --test tools/learning-site/tests/paths.test.mjs tools/learning-site/tests/runtime.test.mjs tools/learning-site/tests/syntax.test.mjs tools/learning-site/tests/render.test.mjs tools/learning-site/tests/symbols.test.mjs` →20/20. 과거 corpus 전체suite를 현재 제품에 실행한 것은 아니다.
- 로그: `.local/review-20260922-backend-tests.log`, `.local/review-20260922-frontend-tests.log`, `.local/review-20260922-static-checks.log`. Git 제외, 합성 fixture 기반이며 실제 env/credential을 기록하지 않았다.
- build/Docker/실DB·Redis/Android/실제 provider·FCM/OEM/공개 배포/최신 advisory는 미실행이다. 설정·소스 리뷰와 과거 증거를 현재 실행으로 바꾸지 않는다.

## 문서 검증·종료 판단

최종 `discovery-review`에서 review_data_server가 보고서·원장·활성 memory·로그를 대조해 P0~P2 보고 결함 없음을 확인했다. 제안한 F-101 DTO 참조 범위 정밀화를 실제 줄과 대조해 반영했다. 이는 완료된 개별 finding의 독립 판정을 바꾸는 투표가 아닌 산출물 검토다.

최종 검사에서 문서7개 strict UTF-8/LF·BOM 없음, 상대 링크56개, memory4개 bytes/SHA-256, 신규2행의 fingerprint·ID중복 없음·독립 reviewer수·fix/recheck null을 확인했다. 설치된 AJV로 schema의 공통 키워드를 검증했다(메모리에서만 draft2020 marker 제거, schema 파일 변경 없음; native draft2020 검증으로 주장하지 않음). `git diff --check` 통과, cached diff 비어 있음, 제품 diff 없음과 allowlist 준수를 확인했다. canonical92는 HEAD와 byte 동일하며 이전 보충7·보고서 해시도 보존됐다.

리뷰 보고서 산출물은 작성했지만 **release-audit gate는 열려 있다.** 새2건·이전7건은 미수정이며 표준 E2E가 실패한다. canonical92의 UNKNOWN5/FIXING3 외부 gate도 유지한다. 실제 A→B lifecycle 증거는 추가 확보하지 못해 F-092 UNKNOWN을 유지했다. 정적 신규0, synthetic probe, unit 통과는 실제 DB·기기·배포 gate를 대체하지 않는다.
