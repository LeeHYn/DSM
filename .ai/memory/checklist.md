# DSM 공정표 — 2026-09-09

표기: [x] 완료, [/] 진행 중, [ ] 미완료·외부 gate.

## 완료

- [x] Canonical audit F-001~F-083 구성과 strict UTF-8·schema·fingerprint·status-history 검증.
- [x] F-005, F-006, F-016, F-025, F-035, F-039, F-040, F-083 독립 종결.
- [x] Android-only 범위 확정과 F-066 REFUTED.
- [x] F-067/F-068 URL 미정 범위의 account deletion·legal gate 구현 및 Backend·Front·Android 회귀.
- [x] F-069 window projection·fenced Redis generation 구현, Backend·PostgreSQL·Redis 검증과 50,000-user benchmark 완료.
- [x] F-069 제품·감사 `c3205dfa2e5e04524513ef8e11beba737af074e0` commit·push.
- [x] F-065 빈 task affinity·reparenting 차단, manifest/build/lint/API 36 task smoke와 제품·감사 `24d65e4788652b611d9942e60c65b8efd0004755` 게시.
- [x] F-011/F-029/F-030 DB fallback rank·population·UTC 계약 통일, 전체·PostgreSQL·Redis 검증과 제품·감사 `0c6031b862e9c777d2403e2e3b46c7e1d37c3a8e` 게시.
- [x] F-001/F-002 refresh-authenticated logout·access `sid` family 검사와 Android server-first retry UX 구현.
- [x] F-001/F-002 Backend 304·Front 229·Android 456 tasks·PostgreSQL 17.10 통합 1/1·ledger 검증 후 제품·감사 `a323dcad531e971ad792e8e9a20a47de29ab8c41` 게시.
- [x] Active memory를 현재 결정·증거·gate 중심으로 재압축.

## 현재

- [x] F-001/F-002 인증 폐기 범위·결합 영향 진단과 무 migration 설계 확정.
- [x] Backend refresh-authenticated family logout·access `sid` 활성 검사 구현과 회귀 검증.
- [x] Android server-first logout·실패 재시도 UX 구현과 회귀 검증.
- [x] F-001/F-002 self-review·전체 gate·canonical audit FIXED 전이.
- [x] F-007 PATCH date `null`이 validation 0건으로 통과하는 현재 실패 재현.
- [x] F-008 status/completedAt 동기화가 `e2bda53a`에 이미 구현됐고 focused 81/81이 통과함을 source·blame으로 확인.
- [x] F-009 server·migration 부재와 Android full-date update 호환성 진단.
- [/] F-007/F-009 최소 구현·실제 PostgreSQL 검증 계획 승인 gate.

## 열린 gate

- [ ] F-065 API 24~29 malicious-app PoC·OEM patch matrix와 독립 fix-recheck.
- [ ] F-001/F-002 구현자와 독립된 fix-recheck와 production guard latency·availability 관찰.
- [ ] F-007/F-008/F-009 구현 뒤 독립 fix-recheck; F-009 기존 invalid active row scan·정정과 CHECK validation.
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
