# `.ai/memory` routing

## Active SSOT

| File | 역할 | Owner |
|---|---|---|
| `plan.md` | 현재 목표·승인·실행 순서 | main agent |
| `context.md` | checkout·감사·구현·검증·위험 | main agent |
| `checklist.md` | 완료 공정과 열린 gate | main agent |

- 위 3개만 active memory다. 이 README는 routing과 byte/hash ledger다.
- 조정 범위는 root `main`, 제품·감사는 `codex/integration-main-review`이다.
- F-007/F-008/F-009 제품·감사 checkpoint `317253cff1fd938b847017697f049582720261f9`까지 원격에 있다. 이 memory snapshot이 해당 기준을 후속 기록한다.
- Canonical audit는 83건: `59 CONFIRMED / 2 FIXING / 10 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`. Release-ready가 아니다.

## Current active snapshot — 2026-09-09

| File | Bytes | SHA-256 |
|---|---:|---|
| `plan.md` | 4,887 | `54420B4A3E292C45090C253EC2E9E5103EBE5445B8D5ED0BC663B29419F84F93` |
| `context.md` | 7,403 | `9A32E654DBDE9E21359EEE0216407FD926DC3584A76C420BCBCD4891B85008EA` |
| `checklist.md` | 3,790 | `2CE4AE478719B6D8CB7A4D38A89CA4DD30B371A44300FFA07A46BB464549FE55` |

- Active 3 합계: 16,080 bytes.
- 2026-09-08 압축 전 기준 16,922 bytes보다 842 bytes, 5.0% 작다.
- 중복된 세션 연대기·검증 반복·과거 snapshot 표를 제외하고 F-001/F-002 인증 폐기와 F-007/F-008/F-009 시간 무결성 결과, 다음 F-012, 열린 gate와 안전 경계를 보존했다.

## Recovery 정책

- 기존 `*.original.md`는 historical recovery snapshot, `*.failed-*`는 실패 산출물이다. Active SSOT가 아니다.
- Recovery 파일은 일반 검색·handoff·재압축 입력에서 제외한다.
- 명시적 복구 승인 없이는 읽기·수정·삭제·이름 변경·stage하지 않는다.
- 이번 정리는 기존 recovery inventory를 변경하거나 새 snapshot을 stage하지 않았다.

## 안전한 갱신 절차

1. Active 3을 실제 Git·audit·검증 출력과 대조한다.
2. Strict UTF-8로 읽고 current-state 정보만 갱신한다.
3. Active 3의 byte 수와 SHA-256를 다시 계산해 이 README에 기록한다.
4. Secret pattern, audit schema, Markdown, `git diff --check`를 검증한다.
5. `DSM_Back/.env`, private key·keystore·Gradle property와 recovery 파일을 제외하고 exact path만 stage한다.

Windows 비 UTF-8 locale의 암시적 인코딩 도구를 사용하지 않는다. `git add -A`를 사용하지 않는다.
