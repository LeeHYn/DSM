# `.ai/memory` routing

## Active SSOT

| File | 역할 | Owner |
|---|---|---|
| `plan.md` | 현재 목표·승인·실행 순서 | main agent |
| `context.md` | checkout·감사·구현·검증·위험 | main agent |
| `checklist.md` | 완료 공정과 열린 gate | main agent |

- 위 3개만 active memory다. 이 README는 routing과 byte/hash ledger다.
- 조정 범위는 root `main`, 제품·감사는 `codex/integration-main-review`이다.
- 제품·감사 기준 커밋 `02681c7`은 원격 통합 브랜치에 게시됐다.
- Canonical audit는 83건: `69 CONFIRMED / 2 FIXING / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`. Release-ready가 아니다.

## Current active snapshot — 2026-09-08

| File | Bytes | SHA-256 |
|---|---:|---|
| `plan.md` | 3,626 | `213BEB06AC2AFBA929F56352B17C9FCA0D4D590DA81C8BA4A1D65C6E29D175E9` |
| `context.md` | 5,036 | `46C9E281FD42756194A792615A43E2A95D647FCD644EABD01F25A37B07B922DB` |
| `checklist.md` | 2,295 | `836AD90DD11E58B45EB0ED2456506F43F029661FF2158D6565F05A0ADB6A4A63` |

- Active 3 합계: 10,957 bytes.
- 직전 active 3 합계 16,922 bytes보다 5,965 bytes, 35.3% 감소했다.
- 중복된 세션 연대기·검증 반복·과거 snapshot 표를 제거하고 현재 결정, 검증 수치, 열린 gate, 안전 경계만 유지했다.

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
