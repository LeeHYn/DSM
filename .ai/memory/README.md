# `.ai/memory` routing

## Active memory

| File | 역할 | 읽기 시점 | update owner |
|---|---|---|---|
| `plan.md` | 목표·계약·승인·다음 계획 | 모든 작업 시작/종료 | main |
| `context.md` | 구현·환경·검증·위험 snapshot | 모든 작업 시작/종료 | main |
| `checklist.md` | `[ ]|[/]|[x]` 공정 상태 | 모든 작업 시작/종료 | main |
| `error-resolution-playbook.md` | 검증된 오류 해결 지식 | 오류 발견·진단·수정 전 | main; sub-agent는 match 보고 |

Current release audit: [`20260817-release-audit-full-project`](../audits/20260817-release-audit-full-project/README.md). Confirmed/unknown 상태와 독립 validation의 canonical source는 해당 `findings.jsonl`이다.

## Recovery files

- `*.original.md`: local recovery snapshot. Git ignored. 일반 검색·handoff·context compiler·재압축 제외.
- `*.failed-*`: 실패한 압축 산출물. active SSOT·복구 원본 아님.
- backup 읽기·복원·삭제·덮어쓰기·rename은 명시적 복구/감사 목적과 사용자 승인 필요.

### 2026-08-16 byte-exact pre-image

| File | Bytes | SHA-256 |
|---|---:|---|
| `plan.20260816.original.md` | 26,170 | `75427FF0FB5F8A377414449F3C86EAFCE413CE7675768CABB1A81BB79C091D12` |
| `context.20260816.original.md` | 9,908 | `457C40D585CAAF7CC93152033EF2A97C7D8E3DB19438E4CF674A78E68FA11A7B` |
| `checklist.20260816.original.md` | 7,875 | `DDE17CBA870396816578EE9F0C3AB659B83BDB85578D2B28D6CBD2477C6E268F` |

### Older retained pre-image — 2026-08-11

- `plan.original.md`: 49,819 bytes, SHA-256 `a5274ba42568446bdafa5ec7ee49c3d55cb65e0386827b10d29ec47f5420c909`
- `context.original.md`: 9,946 bytes, SHA-256 `238f1da76e2201282de0b2155a67bed77193159ebedb66c3819f93a254b91bf4`
- `checklist.original.md`: 9,411 bytes, SHA-256 `772bd2c2f6cd80abb2e8bc7b8a5aaaad13fe8aad1e69f50e6f1a4559e549946f`

## Read/update flow

1. Start: `plan.md` + `context.md` + `checklist.md`.
2. Error task: `error-resolution-playbook.md` 검색; environment/version/root cause 적용성 확인.
3. Actual source/test/Git diff와 memory 대조.
4. Plan + exact 1~2-file writable allowlist + user approval.
5. Implement·verify.
6. End: active memory update. 새 해결이면 playbook index/body 동시 갱신.

## Current compression snapshot — 2026-08-17

| File | Pre-image bytes | Active bytes | 감소 | Active SHA-256 |
|---|---:|---:|---:|---|
| `plan.md` | 26,170 | 16,296 | 37.7% | `DC01B3ACDE44ED1752DE18BEA693B1DB64C2AE6728C83DF717CD95843107553F` |
| `context.md` | 9,908 | 11,822 | -19.3% | `17F176268C8DDF89C4C22E142CC0028FBB1F4D4525135D1060FA80C2F5EA5209` |
| `checklist.md` | 7,875 | 9,225 | -17.1% | `6F85BF496627756FC47C674721BE96B5465CFABCEF6CDAC522334531932FD970` |
| **active 3 total** | **43,953** | **37,343** | **15.0%** | — |

- active 3문서는 2026-08-17 full-project release-audit와 current-PC Google auth/session smoke 완료 상태로 갱신했다. 2026-08-16 recovery pre-image는 그대로 보존한다.
- `caveman-compress` current source는 `read_text(errors="ignore")`와 인코딩 미지정 `write_text()`를 유지해 `ER-20260720-014` 조건과 일치한다. 직접 실행·외부 Claude 전송 없음.
- 새 backup 3개는 pre-image와 SHA-256 일치, `.gitignore`의 `.ai/memory/*.original.md` 적용 확인.
- active/recovery Markdown은 strict UTF-8. credential/private-key/JWT/Bearer token 형식 scan과 Markdown/Git 검증은 checklist 완료 상태를 따른다.
- `error-resolution-playbook.md`: actual record index 52개; `VERIFIED` 51 + `MITIGATION_ONLY` 1. template heading/placeholder는 record count에서 제외한다. `ER-20260817-001`에 current Android Studio debug signer OAuth 누락과 `[16]` 해결·검증 절차를 값 비출력 계약으로 추가했다.
- Front는 Android-only React Native Community CLI로 전환했다. Expo runtime/CLI/Router와 Web/iOS target을 제거했고 Android Studio sync/build/install/run을 검증했다.
- Audit `20260817-release-audit-full-project`는 confirmed 22·unknown 2·rechecked 2로 열려 있으며 release-ready가 아니다. `F-016` Android Git handoff와 `F-025` external OAuth fix는 독립 fix-recheck 뒤 `RECHECKED`다.
- Android-only 기준선은 feature branch에 push됐고 local/remote HEAD가 `e1f1a123d2822d02d7ccbe33f7cb9bb89f77c5c2`로 일치한다. 별도 clean checkout에서 npm/frontend/Gradle gate와 Android 52개 추적·금지 파일 0개를 재현했다.
- Disposable DB와 local backend/Metro로 Google login·session rotation·logout smoke를 마친 뒤 모두 종료했고 `--rm` 임시 DB만 제거했다. 승인된 F-016 feature-branch Git stage·commit·push 외에 remote DB, Firebase, PR·merge·deploy 변경 없음.
