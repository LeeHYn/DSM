# `.ai/memory` routing

## Active SSOT

| File | 역할 | Owner |
|---|---|---|
| `plan.md` | 현재 목표·승인·실행 순서 | main agent |
| `context.md` | checkout·감사·구현·검증·위험 | main agent |
| `checklist.md` | 완료 공정과 열린 gate | main agent |

- 위 3개만 active memory다. 이 README는 routing과 byte/hash ledger다.
- 조정 범위는 root `main`, 제품·감사는 `codex/integration-main-review`이다.
- F-012 제품·감사 checkpoint `5642640cfbcd3b5d410f4bdbcbaeecedd106b213`까지 원격에 있다. 이 memory snapshot이 해당 기준을 후속 기록한다.
- Canonical audit는 83건: `58 CONFIRMED / 2 FIXING / 11 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`. Release-ready가 아니다.

## Current active snapshot — 2026-09-09

| File | Bytes | SHA-256 |
|---|---:|---|
| `plan.md` | 5,641 | `659E91FD5AF709C5630A04C49A521ECB27F90E252E8F9A45F1BF4A701C338E14` |
| `context.md` | 6,072 | `27443618CDE9B7D5ECB060C94CDF40050EF40E9D932B04766FBA7A55B2488079` |
| `checklist.md` | 4,436 | `3726BEC35AA7BDD0DA430C47B82ED018654DB8FC55F6C137BB9E7B14914C95BB` |

- Active 3 합계: 16,149 bytes.
- 2026-09-08 압축 전 기준 16,922 bytes보다 773 bytes 작다.
- 승인 전 진단 반복을 F-012 종결 계약으로 압축하고 현재 checkpoint, 검증 결과, 열린 legacy·독립 recheck gate와 안전 경계를 보존했다.

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
