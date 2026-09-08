# `.ai/memory` routing

## Active SSOT

| File | 역할 | Owner |
|---|---|---|
| `plan.md` | 현재 목표·승인·실행 순서 | main agent |
| `context.md` | checkout·감사·구현·검증·위험 | main agent |
| `checklist.md` | 완료 공정과 열린 gate | main agent |

- 위 3개만 active memory다. 이 README는 routing과 byte/hash ledger다.
- 조정 범위는 root `main`, 제품·감사는 `codex/integration-main-review`이다.
- F-011/F-029/F-030 제품·감사 checkpoint `0c6031b862e9c777d2403e2e3b46c7e1d37c3a8e`까지 원격에 있다. 이 memory snapshot이 해당 기준을 후속 기록한다.
- Canonical audit는 83건: `64 CONFIRMED / 2 FIXING / 5 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`. Release-ready가 아니다.

## Current active snapshot — 2026-09-09

| File | Bytes | SHA-256 |
|---|---:|---|
| `plan.md` | 4,184 | `A1E213AD61D7B9F63E8007021F3C3F52332A992D86BE5C1C9780F98F9CDA7DB0` |
| `context.md` | 7,182 | `5B160ACCF9DB04A8A55648A0CDE09A61C0036C56710A63405BADBE5FE92EA5F5` |
| `checklist.md` | 2,911 | `EAEBA953EDD58C27E0B646125DF7B061C1002C54A057ADF59ABF30387FD1A40A` |

- Active 3 합계: 14,277 bytes.
- 2026-09-08 압축 전 기준 16,922 bytes보다 2,645 bytes, 15.6% 작다.
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
