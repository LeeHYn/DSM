# 프로젝트 공정표 — 2026-08-17

## Main branch integration review — 2026-08-26

- [x] spec·plan·SDD 승인/preflight; Task 3 review; Task 4 merge `a639ac2` byte-identical/review clean
- [x] Task 5 plan `68557d7`: Backend install 882·Prisma/build·23/214·lint, Front 18/162·type/lint 0 errors/18 warnings, Android 365; URL absent·clean·product diff 0·`APPROVED`
- [x] offline `C:\dsm-offline-learning-site`/`codex/offline-learning-site`/`2cbb088`: base `43145b6`, source `fb54b5d`, ancestry `0 1`, memory 4 paths, Node 66/66, 28-source `PASS`, review clean
- [x] Task 7~10: AI-control/foundation; invariant `56c0575` migration+contract; handoff/fail-fast `04f5980` `RECHECKED`
- [x] Task 11 PostgreSQL 17 amendment `332e3ad`: `LOW`, fresh `canonical-prisma-r2*`; empty 5·canonical 4·seed 1/1/2·forward 5·invariant PASS, captured-only cleanup·URL absent·existing DB preserved; review `APPROVED`, report `f30dcd2`, `ER-20260827-001`/`4c25b67`, memory `2f96c77`
- [x] Task 12: Node `v24.19.0`/npm `11.19.0`; Backend 24/215. Contract lines 17·25 wraps 2건 blocker `6ef5dab`/`0cf4031`; exact amendment, plans `046d67f`/`0ecbf2d`, 1-file `69d3154`; retry Backend 24/215, Front 18/162+type/lint, Android 365, lock/offline/Git/SDD PASS
- [x] Task 13 exact approval, plan `80ab65b`, active 3+README exact 4-path closure·UTF-8/hash/backup PASS
- [x] Task 14 plan `2815f6d`, `.codex/config.toml` 삭제 `4533c0c`, report `c9e9ba9`; security re-review clean
- [x] Task 15 integration/offline summary, offline `0 1`·4 paths, six pinned refs·canonical ancestry·no-publish gate, HEAD `30441ca`
- [ ] 별도 승인 전 push·PR·`main` 변경·shared/remote DB·배포 금지
- [x] `.ai/memory` 2026-08-27 압축: `ER-20260720-014`, byte-exact backups, active 3+README local 정리, UTF-8/hash/semantic/gate PASS

## 완료

- [x] M1~M11: setup, Auth, Task, Category, refresh O(1), DailyScore, Ranking
- [x] M12A FCM token lifecycle + Task-`NotificationSchedule` atomic sync
- [x] M12B backend·local DB·change-gate; F-007 `ACCEPTED_RISK`/`MITIGATION_ONLY`, other findings `RECHECKED`
- [x] Front secure session·REST client Task 1~33, Web QA·auth change-gate
- [x] Android-only RN migration, Google provider/session actual smoke, F-016/F-025 `RECHECKED`
- [x] support: roles, context compiler, verification workflow, playbook, Docker local DB, Obsidian routing

## 현재 진행 상태

- [x] Main integration local review/handoff complete; branches unpublished
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
5. [x] Task 14 final report/review
6. [x] Task 15 final local handoff·memory sync
7. [/] separate product `F-006` written-spec review
   - [x] UTC `startAt` day max 20 active; same-day `completedAt` score policy/spec
   - [ ] implementation plan·approval·exact 2-file TDD stages
   - [ ] disposable PostgreSQL repair/concurrency·independent fix-recheck
8. [ ] remaining P1/UNKNOWN/P2-P3·audit close
9. [ ] M12C → Firebase sandbox → dispatch → WebSocket → Redis/batch

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

- [x] 2026-08-27 active/Git 대조; `ER-20260720-014`, direct CLI/upload 금지
- [x] active 3 date backup·local `apply_patch`; playbook read-only
- [x] README·UTF-8/hash/heading/gate/secret/Git 검증

## `.ai/memory` post-Task15 재압축 — 2026-08-27

- [x] HEAD `30441ca`, active 3/README 기준선, `ER-20260720-014`, exact 7 paths·1~2-file stages 승인
- [x] 기존 backup 불변; 새 `30441ca` active 3 byte-exact backup·ignore/hash PASS
- [x] `plan.md`·`context.md`·`checklist.md` local 재압축; `README.md` snapshot 갱신
- [x] strict UTF-8·semantic anchors·secret·`git diff --check`·exact 4-path diff 검증
- [x] 2026-08-30 사용자 승인: active memory exact 4-path local commit; backup·product·playbook·push 제외
