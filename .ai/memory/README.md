# `.ai/memory` routing

## Active memory

| File | 역할 | 읽기 시점 | update owner |
|---|---|---|---|
| `plan.md` | 목표·계약·승인·다음 계획 | 모든 작업 시작/종료 | main |
| `context.md` | 구현·환경·검증·위험 snapshot | 모든 작업 시작/종료 | main |
| `checklist.md` | `[ ]|[/]|[x]` 공정 상태 | 모든 작업 시작/종료 | main |
| `error-resolution-playbook.md` | 검증된 오류 해결 지식 | 오류 발견·진단·수정 전 | main; sub-agent는 match 보고 |

## Recovery files

- `*.original.md`: local recovery snapshot. Git ignored. 일반 검색·handoff·context compiler·재압축 제외.
- `*.failed-*`: 실패한 압축 산출물. active SSOT·복구 원본 아님.
- backup 읽기·복원·삭제·덮어쓰기·rename은 명시적 복구/감사 목적과 사용자 승인 필요.

### 2026-08-27 byte-exact pre-image — present in this worktree

| File | Bytes | SHA-256 |
|---|---:|---|
| `plan.20260827.original.md` | 31,419 | `DC6CD396AC900785A657BF801CCB728585732A70090E8B9BDA9E7AB4D0B0F24B` |
| `context.20260827.original.md` | 13,165 | `012625AEB93E7D115FEF610EDFFA3B7359A6526405D7230A9E98498D4AC7889A` |
| `checklist.20260827.original.md` | 14,798 | `BBE3BB5B1685AD836E21DF20F47F24F91C12A06CF243F2170C94C95D4CC6C5E1` |

### 2026-08-16 historical hash ledger — files absent in this worktree

| File | Bytes | SHA-256 |
|---|---:|---|
| `plan.20260816.original.md` | 26,170 | `75427FF0FB5F8A377414449F3C86EAFCE413CE7675768CABB1A81BB79C091D12` |
| `context.20260816.original.md` | 9,908 | `457C40D585CAAF7CC93152033EF2A97C7D8E3DB19438E4CF674A78E68FA11A7B` |
| `checklist.20260816.original.md` | 7,875 | `DDE17CBA870396816578EE9F0C3AB659B83BDB85578D2B28D6CBD2477C6E268F` |

### 2026-08-11 historical hash ledger — files absent in this worktree

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

## Current compression snapshot — 2026-08-27

| File | Pre-image bytes | Active bytes | 감소 | Active SHA-256 |
|---|---:|---:|---:|---|
| `plan.md` | 31,419 | 12,268 | 61.0% | `A2345FBC6184D8C297681D24AD12CCCC616DFF6E3F4C0847F0489C68DC7026F8` |
| `context.md` | 13,165 | 8,650 | 34.3% | `B11D947C92DC99D6315FC69D5C4C9A57AB0DE0A1A94E2C5118B9F2BC9AEFF69B` |
| `checklist.md` | 14,798 | 7,221 | 51.2% | `CCEF5DA190F619FCC34CECFF394ECC3BDB4632BA4FFAED9461389A11F467607D` |
| **active 3 total** | **59,382** | **28,139** | **52.6%** | — |

- 2026-08-27 pre-image backups: `plan.20260827.original.md` 31,419 bytes / `DC6CD396AC900785A657BF801CCB728585732A70090E8B9BDA9E7AB4D0B0F24B`; `context.20260827.original.md` 13,165 / `012625AEB93E7D115FEF610EDFFA3B7359A6526405D7230A9E98498D4AC7889A`; `checklist.20260827.original.md` 14,798 / `BBE3BB5B1685AD836E21DF20F47F24F91C12A06CF243F2170C94C95D4CC6C5E1`. Backups are ignored recovery-only.
- Active/recovery Markdown strict UTF-8 verification PASS.
- Active integration status: Task 12 full matrix PASS; Task 13 exact 4-path memory closure.
