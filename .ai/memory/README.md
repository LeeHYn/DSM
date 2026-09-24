# Memory 읽기 안내 — 2026-09-24

| 문서 | 역할 |
|---|---|
| [plan](./plan.md) | 현재 작업 승인·수정 범위, 제품 목표·배포 결정·다음 마일스톤 |
| [context](./context.md) | Git/감사 집계, 구조·계약·진입점, 날짜가 명시된 과거 검증 |
| [checklist](./checklist.md) | 작업 상태, 미종결 finding별 상태·종결 증거·다음 검증 |
| [오류 해결집](./error-resolution-playbook.md) | 조건부 검색: signature·component/tag·환경·root cause |

활성 SSOT는 앞의 3개다. 새 세션·재개·컨텍스트 복구 때 읽고, 같은 세션에서는 변경·불확실한 부분만 재확인한다. README는 routing/무결성 기록이며 제품 상태를 복제하지 않는다.

## MEM-20260920 정리 결과

- MEM-20260920 완료 당시 활성 3개: 17,542 → 11,951 bytes, 31.9% 감소. 이후 REVIEW-20260920/20260922와 FIX-20260922 결과를 반영했으므로 현재 크기는 아래 표를 따른다.
- 오류 해결집: 158,763 → 152,674 bytes. 중복 색인 설명을 줄이고 사라진 경로 5종을 과거 참조로 명시했다.
- record 77개의 본문은 링크 정정 외 그대로 보존했다. ID/index 일치·중복 없음, status/lastVerifiedAt/조건/절차/검증/위험 유지. 과거 검증일을 이번 날짜로 바꾸지 않았다.
- 시작 Git clean·HEAD/로컬 origin/main 대조, 원장92/미종결8 상태 대조, strict UTF-8/LF·상대 링크·허용 파일 범위·diff 검사. 원격 조회·제품 테스트·배포는 재실행하지 않았다.
- 제품/원장·Git index는 변경하지 않았다. recovery inventory는 비어 있었고 새 archive/snapshot도 만들지 않았다.

## 후속 리뷰와 로컬 수정

[9월22일 리뷰](../codeReview/2026-09-22-full-source-review.md)와 [9월20일 리뷰](../codeReview/2026-09-20-full-code-review.md)는 발견 당시 증거다. 후속 [수정·검증 기록](../audits/20260922-change-gate-review-fixes/README.md)에 8건의 수정·독립 RECHECKED와 F-101의 남은 계약 결정을 기록했다. 최신 상태와 외부 gate는 활성3문서·두 보충 원장을 따른다.

FIX-20260922에서 기존 IsOptional/null 해결 record를 확장하고 신규7개를 추가해 playbook은 현재84개다. 같은 원인의 중복 ID는 만들지 않았고 나머지 과거 검증일은 유지했다. MEM-20260920의 압축 수치는 당시 checkpoint다.

## 파일 무결성

UTF-8/LF bytes와 SHA-256. 자기참조를 피하려고 README 해시는 제외한다.

| 파일 | bytes | SHA-256 |
|---|---:|---|
| `plan.md` | 14,868 | `C1E46EB5C9DC4B25CA8E494B620B223DB23667C0CB556929955FC72634DA3965` |
| `context.md` | 10,341 | `32FE95B66578753849B894F10035B8F0721BB23EA84B1F3D5ED9490808898ACB` |
| `checklist.md` | 6,843 | `EDFC6C1952E818A529ADF3393D6F146DC24322E5274D0863C5B948E20BD4807C` |
| `error-resolution-playbook.md` | 162,385 | `FEFAB7C5D0A4345E1ECFCE11409111D25CBA3432D6998579D1CB7A5075968B11` |

## 갱신·복구 경계

- 실제 Git·소스·원장과 대조하고 현재 상태/열린 gate를 유지한다. 완료 상세는 기존 감사 보고서·Git 이력으로 연결하며 과거 증거를 새 실행으로 표현하지 않는다.
- 한 번에 1~2파일을 `apply_patch`로 수정하고 UTF-8/LF·상대 링크·정보 보존·diff를 확인한다. 활성 파일 수정 뒤 위 크기/hash도 갱신한다.
- 같은 root cause는 기존 record를 갱신한다. VERIFIED도 현재 조건에 맞춰 재검증하고, MITIGATION_ONLY는 활성화 gate·잔여 위험을 유지한다. 과거 Expo/web/학습 기록은 현재 Android 제품 계약이 아니다.
- `*.original.md`는 local 복구 snapshot, `*.failed-*`는 실패 산출물이다. 일반 검색·handoff·context compiler·재압축 입력에서 제외하고 명시적 복구 승인 없이 읽기·수정·삭제·이름 변경·stage하지 않는다.
- 실제 env/key/credential/keystore·private Gradle property·local cache를 문서/일반 로그/Git에 넣지 않는다. stage/commit/push는 해당 승인 안에서 exact path만 사용한다.
