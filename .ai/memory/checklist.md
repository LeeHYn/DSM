# DSM 공정표 — 2026-09-09

표기: [x] 완료, [/] 진행 중, [ ] 미완료·외부 gate.

## 완료

- [x] Canonical audit F-001~F-083 구성과 strict UTF-8·schema·fingerprint·status-history 검증.
- [x] F-005, F-006, F-016, F-025, F-035, F-039, F-040, F-083 독립 종결.
- [x] Android-only 범위 확정과 F-066 REFUTED.
- [x] F-067/F-068 URL 미정 범위의 account deletion·legal gate 구현 및 Backend·Front·Android 회귀.
- [x] F-069 PostgreSQL window projection·Redis immutable generation·cache-first API·분산 lock/fencing 구현.
- [x] F-069 자체 검토 위험 4건을 freshness, stale-writer fencing, atomic TTL, 30초 generation retirement로 수정.
- [x] F-069 Backend 293 unit·e2e 2·build/type/lint와 실제 PostgreSQL·Redis 2/2 검증.
- [x] F-069 50,000-user/350,000-score benchmark, full plan과 generation memory lifecycle artifact 보존.
- [x] Active memory를 현재 결정·증거·gate 중심으로 재압축.
- [x] F-069 제품·감사 18개 exact path를 `c3205dfa2e5e04524513ef8e11beba737af074e0`으로 commit·push.
- [x] F-065 MainActivity 빈 task affinity·reparenting 비활성화와 merged/packaged manifest 확인.
- [x] F-065 Android assembleDebug 281 tasks, lintDebug 412 tasks, API 36 cold launch·동일 task 재진입 검증.
- [x] F-065 제품·감사 `24d65e4788652b611d9942e60c65b8efd0004755`, memory `c6b66755220fdf64be39e1bf55841bedfde077a3` commit·push.
- [x] F-011/F-029 DB fallback을 bounded window projection으로 통일하고 F-030 UTC rollover regression 추가.
- [x] Ranking focused 22, Backend full 297·e2e 2·build/type/lint, PostgreSQL 17·Redis 8 통합 2/2 검증.
- [x] F-011/F-029/F-030 audit를 `FIXED`로 전이하고 ledger 구조·hash 검증.
- [x] F-011/F-029/F-030 제품·감사 7개 exact path를 `0c6031b862e9c777d2403e2e3b46c7e1d37c3a8e`로 commit·push.

## 현재

- [/] 다음 로컬 P2 F-001/F-002 인증 폐기 범위·결합 영향 진단.

## 열린 gate

- [ ] F-065 API 24~29 malicious-app PoC·OEM patch matrix와 독립 fix-recheck.
- [ ] F-011/F-029/F-030 구현자와 독립된 fix-recheck.
- [ ] F-069 구현자와 독립된 fix-recheck.
- [ ] F-069 실제 운영 cardinality·capacity·managed Redis failover·latency 증거.
- [ ] F-067/F-068 공개 privacy/deletion URL·외부 처리·signed-device·Play Console/Data safety 증거.
- [ ] F-003/F-017 signer·production OAuth·signed artifact/device와 F-013 readiness mapping.
- [ ] 남은 CONFIRMED finding 수정·recheck와 zero-new-confirmed-P0~P2 연속 두 자유 탐색 round.

## 유지 규칙

- [x] 실제 .env, key·keystore·private Gradle property와 recovery 파일 미접근·미변경.
- [x] Prisma schema·migration, Front·Android·WebSocket을 F-069 변경에서 제외.
- [x] F-069 제품·감사는 integration branch에 게시했고 root checkout은 미변경.
- [x] stage 시 git add -A 없이 exact path만 사용.
