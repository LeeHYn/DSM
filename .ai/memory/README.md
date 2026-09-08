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
| `plan.md` | 6,944 | `E372613ED27FF8B910D29FF882669A63BBD4FACC45C531D86907315FD7EF922B` |
| `context.md` | 5,666 | `243BAC93079D8A9C6EFD4B56D2FC334C80FF33C6901E41BDA4E2EFE7C7EDDF0F` |
| `checklist.md` | 4,107 | `1A2D6021579FFD45E89D0582E8401BAC96F7733CAFC047A15B84F983CDFE6AE8` |

- Active 3 합계: 16,717 bytes.
- 2026-09-08 압축 전 기준 16,922 bytes보다 205 bytes, 1.2% 작다.
- 중복된 세션 연대기·검증 반복·과거 snapshot 표를 제외하고 최근 종결 결과, F-012 진단·선택지·exact allowlist, 열린 gate와 안전 경계를 보존했다.

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
