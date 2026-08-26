# 프로젝트 공정표 — 2026-08-17

## Main branch integration review — 2026-08-26

- [x] 사용자 spec·plan·Subagent-Driven 실행 승인; exact runtime/refs/SDD ledger preflight
- [x] Task 3 inventory·review; Task 4 canonical merge `a639ac2`·byte-identical product·review clean
- [x] Task 5 canonical baseline
  - [x] approved parse-only URL amendment `68557d7`
  - [x] Backend install 882·Prisma/build·23 suites/214 tests·lint PASS
  - [x] Front 18/162·type·lint 0 errors/18 warnings·Android 365 tasks PASS
  - [x] URL absent·tracked clean·canonical product diff 0·review `APPROVED`
- [x] offline sibling `C:\dsm-offline-learning-site` / `codex/offline-learning-site` / `2cbb088`
  - [x] base `43145b6`, memory source `fb54b5d`, ancestry `0 1`, exact memory 4 paths
  - [x] Node 66/66, verifier 28-source `PASS`, review clean
- [x] Task 7 AI-control history port; Task 8 foundation classification/recheck
- [x] Task 9 active-schedule invariant `56c0575`: migration+contract test, validate/generate/build, review `APPROVED`
- [x] Task 10 setup/architecture handoff; fail-fast fix `04f5980`, fix-recheck `RECHECKED`
- [x] Task 11 disposable PostgreSQL 17
  - [x] amendment `332e3ad`: seed `LOW`, fresh `canonical-prisma-r2*`, original evidence preserved
  - [x] empty 5·canonical 4·seed 1/1/2·forward 5·invariant probe PASS
  - [x] captured containers only cleanup·names/URL absent·existing DB preserved
  - [x] reviewer `APPROVED`; report `f30dcd2`; playbook `ER-20260827-001`/`4c25b67`; memory `2f96c77`
- [x] Task 12 complete validation matrix
  - [x] Node `v24.19.0`/npm `11.19.0`; backend install·Prisma/URL cleanup·build PASS
  - [x] Backend Jest 24 suites/215 tests PASS
  - [x] non-fixing ESLint/Prettier 재현: contract test lines 17·25 wraps 2건
  - [x] required-check stop·tracked clean·URL absent; blocker report `6ef5dab`, memory `0cf4031`
  - [x] 사용자 exact `Task 12 amendment 승인`
  - [x] plan `046d67f`/`0ecbf2d`; 1-file style `69d3154`; Prettier/focused Jest/full lint PASS
  - [x] full retry: Backend 24/215, Front 18/162+type/lint, Android 365, lock/offline/Git/SDD PASS
- [x] Task 13 active integration memory reconciliation
  - [x] 사용자 exact `Task 13 amendment 승인`; 4-path plan `80ab65b`
  - [x] plan/context actual-state 대조; checklist observed PASS only
  - [x] README byte/hash·strict UTF-8·ignored recovery backup 검증
  - [x] exact 4-path `docs(memory): record integration review results` closure
- [ ] Task 14 final conflict report·independent review
- [ ] 별도 승인 전 push·PR·`main` 변경·shared/remote DB·배포 금지
- [x] `.ai/memory` 2026-08-27 압축·정리
  - [x] 사용자 직접 요청; `ER-20260720-014` 적용; unsafe CLI/외부 전송 금지
  - [x] active 3 pre-image byte-exact date backup
  - [x] `plan.md`·`context.md`·`checklist.md` current-state local compression
  - [x] README bytes/hash/ratio·strict UTF-8·semantic/gate 검증

## 완료

- [x] M1~M11: setup, Auth, Task, Category, refresh O(1), DailyScore, Ranking
- [x] M12A FCM token lifecycle + Task-`NotificationSchedule` atomic sync
- [x] M12B backend·local DB·change-gate; F-007 `ACCEPTED_RISK`/`MITIGATION_ONLY`, other findings `RECHECKED`
- [x] Front secure session·REST client Task 1~33, Web QA·auth change-gate
- [x] Android-only RN migration, Google provider/session actual smoke, F-016/F-025 `RECHECKED`
- [x] support: roles, context compiler, verification workflow, playbook, Docker local DB, Obsidian routing

## 현재 진행 상태

- [/] Main integration: Task 13 PASS → Task 14
- [/] M12 notification: 12A/12B done; 12C·actual ADC/FCM sandbox pending
- [x] Front secure session product·Web QA·auth gate
- [/] Android Google
  - [x] Android Studio SDK/JDK/AVD, pure-RN APK/Metro/login render
  - [x] same-project current debug signer OAuth client·actual login/reload/refresh/logout
  - [ ] permanent release `GOOGLE_CLIENT_ID`/signer provisioning
  - [ ] final product authentication change-gate sync
- [/] full-project release audit: confirmed 22, unknown 2, rechecked 2; release-ready 아님
- [ ] PR·merge·배포

## Android Google 완료 증거

- [x] application ID `com.dsm.dailyup`; native dependencies/config boundary/adapter/login TDD
- [x] Community CLI autolinking; Expo runtime/CLI/Router/SecureStore/dev-client·Web/iOS 제거
- [x] Android native 52 files tracked; build/cache/local/keystore excluded
- [x] Front Jest 18/162·type·lint 0 errors/18 warnings; Gradle 365 tasks
- [x] current debug signer OAuth client under approval; complete values not recorded
- [x] Google token→backend→Keychain reload/rotation→logout→post-logout Login smoke
- [x] remote clean checkout reproduction; F-016/F-025 independent recheck

## 2026-08-17 full-project release audit

- [x] Backend unit 214/e2e 2/build/lint/Prisma; Front 162/type/lint/npm tree; DB/Android gates
- [x] 3 exploration lenses, validators/tie-break, 26-row ledger integrity
- [x] `F-016` Android Git handoff `RECHECKED`
- [x] `F-025` external OAuth fix `RECHECKED`
- [/] P1 remediation: `F-016` done; `F-006`, `F-003`, `F-005`, `F-017` remain
- [ ] UNKNOWN `F-013`/`F-015`, P2/P3, two consecutive zero-new-confirmed-P0~P2 rounds

## 다음 실행 순서

1. [x] exact `Task 12 amendment 승인`
2. [x] contract test 2 wraps only·format/Jest/full lint·separate commit
3. [x] Task 12 full matrix restart
4. [x] Task 13 memory 4-path 범위·reconciliation
5. [ ] Task 14 final report/review
6. [/] separate product `F-006` written-spec review
   - [x] UTC `startAt` day max 20 active; same-day `completedAt` score policy/spec
   - [ ] implementation plan·approval·exact 2-file TDD stages
   - [ ] disposable PostgreSQL repair/concurrency·independent fix-recheck
7. [ ] remaining P1/UNKNOWN/P2-P3·audit close
8. [ ] M12C → Firebase sandbox → dispatch → WebSocket → Redis/batch

## 계속 유지할 gate

- [ ] credential/token/SHA/client ID complete values output/Git/memory 금지
- [ ] Firebase credential/send, remote/prod DB/reset/drop, deploy는 별도 승인
- [ ] Git stage/commit/push/PR/merge는 현재 명시 승인 범위만; force/main direct push 금지
- [ ] F-007 `ACCEPTED_RISK`/`MITIGATION_ONLY`를 해결 표시 금지
- [ ] 고위험 변경=`change-gate`; release=`release-audit`; exact 1~2 files

## 보류·별도 triage

- [ ] dependency audit 32(critical 0; Backend 15, Frontend 17)
- [ ] actual multi-connection refresh/logout interleaving; Firebase delivery/F-007 race
- [ ] Task parser edge tests, Apple, revoked-token hook, UTC midnight Cron
- [ ] release signing/.env/OAuth provisioning; template branding
- [ ] Redis/batch·WebSocket·automatic ranking snapshot

## `.ai/memory` 압축·정리 — 2026-08-16

- [x] 2026-08-27 active memory·Git·current blocker 대조
- [x] unsafe `caveman-compress` audit: `ER-20260720-014` 일치, direct run/외부 upload 금지
- [x] `plan.20260827.original.md` byte-exact backup
- [x] `context.20260827.original.md` byte-exact backup
- [x] `checklist.20260827.original.md` byte-exact backup
- [x] active 3 local `apply_patch` compression; playbook read-only
- [x] README snapshot update
- [x] strict UTF-8, backup hash, heading/gate/secret/Git validation
