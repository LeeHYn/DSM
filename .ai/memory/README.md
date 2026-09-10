# `.ai/memory` routing

## Active SSOT

| File | 역할 | Owner |
|---|---|---|
| `plan.md` | 25,604 | `DABC0CBB92E0E59DB474C688A1D187BA9BD60B211425B573B20EC72D86C0EA11` |
| `context.md` | 16,046 | `21294397A40A6451ADA3C8A6E96ABF01230C88155B847E477B473EDCB405F74D` |
| `checklist.md` | 9,439 | `473DA763BEB8A91B9AE71F60A706E6E2AF7F4CDE136B98A43529617B5BCA4773` |

- 위 3개만 active memory다. 이 README는 routing과 byte/hash ledger다.
- 현재 PC는 `D:\DSM/main`이며 merge `9e33031`이 원격 main에 반영돼 있다. 548 tests·정적 gate·Android debug와 Docker·DB·API 검증을 마쳤다. 2026-09-10 Computer Use에서 정상 설치본의 약관·온보딩 차단 없는 대시보드를 확인하고 PostgreSQL/Redis healthy·migration 8개 up-to-date·API HTTP 200을 재검증해 세팅 확인을 마쳤다. 소켓 원본 삭제와 공식 per-user 설치 복구 이력, 현재 실행 상태는 active 3을 따른다.
- 현재 개발·제품·감사는 `main` 기준이다. 사용자 승인으로 고유 offline 자료를 보존하고 merge `35b3944`에 모든 비교 tip 이력을 연결했다. 원격 codex 5개·로컬 integration 1개 삭제 후 main 하나만 남았다. 상세 결과와 보류 기능은 active 3과 `docs/reviews/2026-09-10-branch-consolidation.md`를 따른다.
- F-012 제품·감사 `5642640cfbcd3b5d410f4bdbcbaeecedd106b213`와 외부 PC 문서 `af2ff2640b1fa27111302766baa61aada15b304d`까지 원격에 있다.
- Canonical audit는 83건: `58 CONFIRMED / 2 FIXING / 11 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`. Release-ready가 아니다.

## Current active snapshot — 2026-09-10

| File | Bytes | SHA-256 |
|---|---:|---|
| `plan.md` | 18,466 | `A78FF285751E81B13E5FDBE3316C11B8FBA1B0AE68C109ECE7D4530EF55069BD` |
| `context.md` | 13,595 | `1CF3C6B876B72C46FCE07057E23AEF487585F3A7C1404E0038F943A03EC8F7B3` |
| `checklist.md` | 8,134 | `D1F87C497DC60225E42C6E859E7D323B7396C52135E53FB236FBE022E73D62B6` |

- Active 3 합계: 51,089 bytes.
- 이전 압축 snapshot 16,844 bytes에서 현재 PC 세팅·main 통합·Round 14 검증·Round 15 랭킹 수정의 현재 상태와 외부 gate를 추가했다. 해시는 strict UTF-8/LF 파일 bytes 기준이며 repository-local core.autocrlf=input으로 보존한다.
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
