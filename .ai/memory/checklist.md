# DSM 공정표 — 2026-09-08

표기: `[x]` 완료, `[/]` 진행 중, `[ ]` 미완료·외부 gate. 세부 계약과 검증 수치는 `context.md`를 따른다.

## 완료

- [x] 중단 세션의 child final 60개를 회수·중복 판정하고 canonical audit F-001~F-083을 구성.
- [x] Audit 구조·fingerprint·status history·strict UTF-8 검증.
- [x] F-005 authenticated Product REST·ProductStore 구현과 독립 recheck.
- [x] F-006·F-016·F-025·F-035·F-039·F-040 종결 및 독립 검증.
- [x] F-083 Task create idempotency·retry fence 구현, PostgreSQL concurrency 10/10, 독립 recheck 2건.
- [x] Android-only 범위 확정과 F-066 독립 검토 2건 `REFUTED`.
- [x] F-067/F-068 URL 미정 승인 구현: Backend 204 transaction delete, PostgreSQL cascade, Android session/Keychain/ProductStore fence, 두 단계 UI, legal links, release URL gate.
- [x] F-067/F-068 전체 Backend·Front·Android 회귀와 최종 경합 검토.
- [x] 제품·감사·계획 48개 exact path commit `02681c7` 및 integration push.
- [x] Integration active memory 압축, commit `74406a0`, push.
- [x] Root active memory 3개와 README 압축·hash 갱신, exact commit·push.
- [x] 두 branch remote equality와 tracked working state 확인.

## 열린 gate

- [ ] F-067/F-068 공개 `PRIVACY_POLICY_URL`·`ACCOUNT_DELETION_URL`과 외부 요청 처리 절차.
- [ ] F-067/F-068 signed-device·Play Console/Data safety 증거와 독립 P1 recheck 2건.
- [ ] F-003/F-017 actual signer·production OAuth·signed artifact/device 증거.
- [ ] F-013 production readiness mapping.
- [ ] F-065 API 24~29 task-affinity 처리와 F-069 Redis/batch architecture.
- [ ] 남은 `CONFIRMED` finding을 별도 계획·승인 후 P1→P2→P3 순으로 수정·recheck.
- [ ] 서로 다른 자유 탐색에서 zero-new-confirmed-P0~P2 연속 두 round.
- [ ] code/config/artifact/audit 일치 후 release-ready 재판정.

## 유지 규칙

- [x] `DSM_Back/.env`, key·keystore·private Gradle property를 읽거나 stage하지 않음.
- [x] `git add -A` 없이 exact path만 stage.
- [x] 기존 recovery `*.original.md`·`*.failed-*`를 읽기·수정·삭제·stage하지 않음.
- [x] Source/test 변경은 검증된 integration commit에, 조정 상태는 root active memory에 분리.
