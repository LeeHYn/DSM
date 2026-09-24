# 전체 코드 리뷰 보충 감사 — 2026-09-20

> 2026-09-22 후속: F-093~F-099 7건은 수정 및 독립 fix-recheck를 마쳐 **RECHECKED**다. [수정·검증 기록](../20260922-change-gate-review-fixes/README.md)과 [현재 원장](./findings.jsonl)을 따른다. 아래는 발견 당시 리뷰 snapshot이며, 당시의 미수정·E2E 실패 기록을 보존한다. canonical92와 외부 gate는 그대로다.

- Audit ID: `20260920-release-audit-code-review`, mode `release-audit`, baseline `main@efd77053c71a5e7bf4ec7a4e8e3c034594ad8ae2`.
- 사용자 요청: 전체 코드 리뷰. 제품 수정·배포·Git stage/commit/push 없이 검토한다.
- 시작 시 memory 정리 5개 파일이 수정 상태였으며 그대로 보존했다. 리뷰에 필요한 문서·원장·무시되는 로컬 로그만 추가/갱신했다.
- [보고서](../../codeReview/2026-09-20-full-code-review.md), [이번 원장](./findings.jsonl), [기존 canonical92](../20260817-release-audit-full-project/findings.jsonl).
- 이번 원장: F-093~F-099 **7개 P2 / CONFIRMED**. 기존 원장의 92개 상태·fingerprint·이력은 변경하지 않았다. 서로 다른 원장을 함께 읽되 기존 canonical92가 자동으로99건이 됐다고 표현하지 않는다.

## 탐색·판정

| 라운드 | lens / 실행 주체 | 새 후보 | 판정 |
|---|---|---:|---|
| R1 | Auth/알림, Task/Score/Ranking, Front lifecycle 3명 병렬 + 메인 운영/도구 | 5 | F-093~097 CONFIRMED |
| R2 | 요청·입력 경계와 설정 조합 자유 탐색 / backend_auth | 1 | F-098 CONFIRMED; 날짜 null F-007과 별도 scalar 조건 |
| R3 | 재시작·복구·취소 순서 자유 탐색 / backend_data | 1 | F-099 CONFIRMED; Task logical clock F-091과 별도 저장소 |
| R4 | API 소유권·부분 실패·취소 자유 탐색 / backend_data | 0 | 신규 후보 없음, 조사 한계 명시 |
| R5 | 화면 빈 상태·페이지 경계·날짜 범위·자원 해제 자유 탐색 / backend_data | 0 | 실제 함수 메모리 probe 및 정적 대조, 신규 확정 P0~P2 0 |

R4/R5는 서로 다른 lens의 연속 신규0 라운드다. 각 자유 탐색은 약4~5분의 제한된 조사이며 가능한 모든 입력·스케줄 조합의 전수 증명이 아니다.

독립 validator는 F-093: backend_auth/backend_data, F-094: backend_data, F-095: frontend/backend_auth, F-096: frontend, F-097: backend_auth/frontend, F-098: frontend, F-099: backend_auth/frontend. 각 finder와 validator identity는 다르고 다른 validator의 판정은 전달하지 않았다. 인증·데이터 일관성·영속 기록 손실은 2명, 처리량/오류 계약/테스트 harness는 1명이 검증했다. 원장 timestamps는 이번 턴 판정 기록 시각이다.

초기 Task sync 두 SELECT 후보는 현 client 전체 날짜 refresh로 수렴하여 별도 P2 근거 부족으로 제출하지 않았다. 기존 F-092도 새 lifecycle 통과 재현을 확보하지 못해 중복 등록하지 않았다.

## 실행 검증과 한계

- Backend unit **43 suites / 960**, Front unit **51 suites / 1,156**, production-start **3**, 두 no-emit typecheck 통과.
- Backend는 package script와 동일한 TS glob을 non-fixing lint하여 통과. 처음 디렉터리 전체 lint는 TS project 밖의 production-start CJS parser 오류로 exit1; 이를 숨기지 않고 로그에 보존했다.
- Front lint **0 errors / 44 warnings**. strict warning budget 통과로 주장하지 않는다.
- **기본 HTTP E2E exit1**: F-096. 문제 harness 제외 진단만 **7 suites / 165 tests** 통과.
- F-093/F-095/F-098/F-099는 메인도 현재 클래스/pipe/DMMF를 메모리에서 실행했다. F-094는 독립 reviewer의 실제 dispatch/claim 메모리 실행과 메인의 소스 대조. F-097은 AST/공식 PowerShell 동작 대조이며 파괴적 실행 없음.
- 로컬 로그: `.local/review-20260920-backend-tests.log`, `.local/review-20260920-frontend-tests.log`, `.local/review-20260920-static-checks.log`. Git 제외, 민감한 env 값 없이 fixture 기반 실행.
- 새 build/Docker/DB migration/실DB 경합/실기기/FCM/OAuth/OEM/외부 배포/현재 dependency advisory 조회는 수행하지 않았다.

## 종료 판단

**요청한 코드 리뷰 보고서는 작성했으나 release-audit gate는 열려 있다.** 신규7개는 미수정 CONFIRMED이고 기본 E2E가 실패한다. 기존 F-003/F-013/F-017/F-065/F-092 UNKNOWN 및 F-015/F-067/F-068 FIXING의 외부 증거도 그대로 필요하다. 두 자유 탐색 신규0은 제품·DB·실기기·배포 gate를 대체하지 않는다. 사용자 위험 수용이나 구현 승인을 추정하지 않았다.
