# `.ai/memory` routing

## Active memory

| File | 역할 | 읽기 시점 | update owner |
|---|---|---|---|
| `plan.md` | 현재 목표·기술 계약·승인·다음 계획 | 모든 작업 시작/종료 | main |
| `context.md` | 현재 구현·환경·위험 snapshot | 모든 작업 시작/종료 | main |
| `checklist.md` | `[ ]|[/]|[x]` 공정 상태 | 모든 작업 시작/종료 | main |
| `error-resolution-playbook.md` | 검증된 오류 해결 지식 | 오류 발견·진단·수정 전 | main; sub-agent는 match 보고 |

## Recovery files

- `*.original.md`: local recovery snapshot. Git ignored. 일반 검색·handoff·context compiler·재압축 금지.
- `plan.original.md`, `checklist.original.md`, `error-resolution-playbook.original.md`: 2026-07-20 byte-exact pre-compression backup.
- `context.original.md`: CP949 compression failure 뒤 Git HEAD·plan·architecture·checklist로 재구성한 semantic snapshot; byte-exact 아님.
- `context.original.failed-cp949.bin`: 실패 script가 만든 손상 artifact. Git/active memory 제외; 원문 복구에 사용 금지.
- backup 읽기·복원·삭제·rename은 명시적 복구/감사 목적과 사용자 승인 필요.

## Read/update flow

1. Start: `plan.md` + `context.md` + `checklist.md`.
2. Error task: `error-resolution-playbook.md` search; applicability 확인.
3. Compare memory with actual source/test/Git diff.
4. Plan + exact writable allowlist + user approval.
5. Implement/verify.
6. End: active memory update. 검증된 새 오류 해결이면 playbook index/body 동시 갱신.

## Compression result — 2026-07-20

| File | Before bytes | Active bytes | 판정 |
|---|---:|---:|---|
| `plan.md` | 121,943 | 14,419 | current-plan 중심 압축; exact backup |
| `context.md` | 12,141 | 3,506 | current snapshot 재구성·압축 |
| `checklist.md` | 14,513 | 3,564 | 상태 중심 압축; exact backup |
| `error-resolution-playbook.md` | 34,495 | 37,124 | structured conditional knowledge 유지 + 복구 record |

Default 3-file read는 148,597→21,489 bytes(85.5% 감소). Playbook은 오류 작업에서만 읽는다.
