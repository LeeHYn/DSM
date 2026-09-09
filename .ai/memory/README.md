# `.ai/memory` routing

## Active SSOT

| File | 역할 | Owner |
|---|---|---|
| `plan.md` | 현재 목표·승인·실행 순서 | main agent |
| `context.md` | checkout·감사·구현·검증·위험 | main agent |
| `checklist.md` | 완료 공정과 열린 gate | main agent |

- 위 3개만 active memory다. 이 README는 routing과 byte/hash ledger다.
- 현재 PC는 `D:\DSM/main`이며 merge `9e33031`이 원격 main에 반영돼 있다. 548 tests·정적 gate·Android debug와 재부팅 후 Docker 엔진·PostgreSQL/Redis·migration 8개·API HTTP 200 검증을 마쳤다. 소켓 원본은 Computer Use로 삭제했고 공식 per-user 설치를 Explorer에서 복구했다. Desktop 약관 창 수락 결과는 화면 제어 오류로 미확인이다. 자세한 현재 상태는 active 3을 따른다.
- 현재 개발·제품·감사는 `main` 기준이며 기존 integration branch와 로컬 이력은 보존했다.
- F-012 제품·감사 `5642640cfbcd3b5d410f4bdbcbaeecedd106b213`와 외부 PC 문서 `af2ff2640b1fa27111302766baa61aada15b304d`까지 원격에 있다.
- Canonical audit는 83건: `58 CONFIRMED / 2 FIXING / 11 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`. Release-ready가 아니다.

## Current active snapshot — 2026-09-09

| File | Bytes | SHA-256 |
|---|---:|---|
| `plan.md` | 13,744 | `461C733F42216F187C96D4116A6E33EC00D9A1A8DBDF618085D9863E6B1494BD` |
| `context.md` | 11,945 | `126909D41751FAD59EBCFA3EF75CF2F43883186FE6983C7016CA5BAED968F3C7` |
| `checklist.md` | 7,314 | `E52AEE79FD17BAC315F0319E5D745BE5723596DE0E8AB4AC3DA863C5BF15EDDE` |

- Active 3 합계: 33,003 bytes.
- 원격의 압축 snapshot은 16,844 bytes였으며, 현재 PC 설치·재검증·main 병합과 Docker 복구 검증을 추가했다. 해시는 strict UTF-8/LF 파일 bytes 기준이며 repository-local core.autocrlf=input으로 보존한다.
- F-012와 이전 PC checkpoint를 보존했다. 현재 PC 실행 도우미는 `D:\DSM\.local`, 상세 일반 절차는 tracked setup guide에 있다.

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
