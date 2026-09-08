# `.ai/memory` routing

## Active SSOT

| File | 역할 | Owner |
|---|---|---|
| `plan.md` | 현재 목표·승인·실행 순서 | main agent |
| `context.md` | checkout·감사·구현·검증·위험 | main agent |
| `checklist.md` | 완료 공정과 열린 gate | main agent |

- 위 3개만 active memory다. 이 README는 routing과 byte/hash ledger다.
- 조정 범위는 root `main`, 제품·감사는 `codex/integration-main-review`이다.
- F-069 제품·감사 checkpoint `c3205dfa2e5e04524513ef8e11beba737af074e0`은 원격 통합 브랜치와 같다. 이 memory snapshot이 해당 기준을 후속 기록한다.
- Canonical audit는 83건: `68 CONFIRMED / 2 FIXING / 1 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`. Release-ready가 아니다.

## Current active snapshot — 2026-09-08

| File | Bytes | SHA-256 |
|---|---:|---|
| `plan.md` | 3,534 | `991B8FADEACEFA921767AB02706472FB781B5FD91A9AD1FD77E2C32290C82167` |
| `context.md` | 5,898 | `690277584583CD306A1CFF872BE85A963DED2BB02D149161F888BB66F3DB2B36` |
| `checklist.md` | 2,052 | `51A5782A9DB6A4990B00C9A0C3A8B1C85B71ED9FF7D08404BF183B8C4049E605` |

- Active 3 합계: 11,484 bytes.
- 2026-09-08 압축 전 기준 16,922 bytes보다 5,438 bytes, 32.1% 작다.
- 중복된 세션 연대기·검증 반복·과거 snapshot 표를 제외하고 F-069 결정, 검증 수치, 열린 gate와 안전 경계를 보존했다.

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
