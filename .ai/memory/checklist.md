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

- [x] Main integration review/handoff complete; integration/offline branches unpublished
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
- [/] P1 remediation: `F-006`·`F-016` done; `F-003`, `F-005`, `F-017` remain
- [ ] UNKNOWN `F-013`/`F-015`, P2/P3, two consecutive zero-new-confirmed-P0~P2 rounds

## 다음 실행 순서

1. [x] exact `Task 12 amendment 승인`
2. [x] contract test 2 wraps only·format/Jest/full lint·separate commit
3. [x] Task 12 full matrix restart
4. [x] Task 13 memory 4-path 범위·reconciliation
5. [x] Task 14 final report/review
6. [x] Task 15 final local handoff·memory sync
7. [x] separate product `F-006` written-spec review — `CHANGES_REQUIRED`
   - [x] UTC `startAt` day max 20 active; same-day `completedAt` score policy/spec
   - [x] P1 migration chronology/predecessor mismatch, P1 missing `DailyScore.id`/`updatedAt` insert contract, P2 score/rounding/tier SQL parity 누락 확인
   - [x] spec amendment → 재검토 → implementation plan·approval·exact 2-file TDD stages
   - [x] disposable PostgreSQL repair/concurrency·independent fix-recheck
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

## Integration branch publish — 2026-08-30

- [x] 사용자 `codex/integration-main-review` push 승인
- [x] upstream 확인·fetch: `origin/codex/integration-main-review`, divergence `0 176`
- [x] fresh tests: Backend 24/215, Front 18/162 PASS; `ER-20260725-002` local-cache 재검증
- [x] task-specific cache cleanup·product diff 0·document checks PASS
- [x] local publish 상태 commit `d8d6937`
- [ ] push `BLOCKED`: exact remote·branch·177-commit payload 명시 승인 필요; remote 전송 0
- [x] offline/`main`/PR/merge/deploy/DB/Firebase 불변 확인

## F-006 written-spec review — 2026-08-30

- [x] 사용자 `다음 작업 진행해`; 직전 목록 2번 review 실행 승인
- [x] read scope·무수정 경계·findings-first 완료 기준 문서화
- [x] spec·audit `F-006`·현재 Task/Score/Prisma source/tests 대조
- [x] findings 3건(P1 2, P2 1), exact path:line·수정 방향; `CHANGES_REQUIRED`
- [x] 구현 전 spec amendment·재검토·implementation-plan 별도 승인 gate 기록

## F-006 보완·실기능 실행 — 2026-08-30

- [x] 요청 범위 분류: architectural, disposable PostgreSQL 17까지; local product/shared/remote/prod DB 제외
- [x] 우선순위: P1 migration chain → P1 required insert values → P2 SQL parity → real concurrency
- [x] 접근안 A/B/C 비교; 기존 spec in-place amendment 권장
- [x] 사용자 `진행해` → `F-006 보완 설계안 승인`
- [x] spec amendment: current 5/fresh 6, required insert metadata, exact SQL parity/boundary fixtures
- [x] spec self-review: placeholder/old refs/contradiction/scope/path 검사; 57/800 floating mismatch 재현·numerator-first canonical contract 보완
- [x] 사용자 amended written-spec 승인 (`ㄱ`, 2026-08-31)
- [x] implementation plan 작성·승인
- [x] TasksService TDD: day limit·move·completion transitions — 54/54
- [x] ScoresService/policy TDD: same-day eligibility·57/800 parity — 11/11·18/18
- [x] migration+PostgreSQL e2e: fresh 6/current 5 upgrade·repair·rollback·19+2 — r2 9/9
- [x] Prisma validate/generate/build/full lint, unit 245/e2e 2, independent `RECHECKED`
- [x] audit `RECHECKED`; memory/hash closure 진행. Git action은 별도 승인

## F-006 amended written-spec 재검토 — 2026-08-31

- [x] 사용자 spec-only 재검토·보완 승인 해석; 제품 구현·DB·Git 작업 제외
- [x] Prisma migration/Jest e2e/Task 11 disposable DB 안전 패턴 대조
- [x] spec 보완: atomic transaction, empty-vs-seeded routes, fail-closed DB harness
- [x] spec 보완: UTC SQL bounds·literal oracle·pinned prefix·exact 1~2-file closure stages
- [x] spec 보완: 오류 우선순위, exactly-once/conflict 보존, enum/zero-user, remote/prod gate
- [x] spec self-review: contracts 22/22, stale/placeholder 0, prefix/Jest premise, score fixtures 10/10
- [x] active memory 결과 반영·README final hash 갱신 후 amended written-spec 사용자 승인 대기 유지

## F-006 implementation plan 작성 — 2026-08-31

- [x] `ㄱ`을 amended written-spec 승인으로 기록; 구현 승인은 분리
- [x] actual source/tests/config·Task 11 패턴 mapping
- [x] spec status 승인 반영+new plan exact 2-file stage
- [x] audit `CONFIRMED→FIXING` opening과 recheck closure stage 정합화
- [x] 12 tasks/48 checkbox; exact 1~2-file TDD·full SQL·fail-closed DB·cleanup·review·Git stop
- [x] spec coverage·placeholder/TODO/TBD 0·64 fence·type/path/command·`git diff --check` self-review
- [x] current shell Node `v24.13.0`/npm `11.6.2`, Docker `29.6.1`+config read warning 기록; required runtime 전 구현 BLOCKED
- [x] active memory/hash 계획 sync·implementation approval
- [x] audit opening → Tasks/Score TDD → disposable PostgreSQL → full regression → independent recheck

## F-006 implementation 실행 — 2026-08-31

- [x] 사용자 `ㄱ`: inline sequential+exact runtime prep+disposable PostgreSQL 17+reviewer 1명 승인; Git/remote/prod/Firebase/deploy 제외
- [x] linked worktree/branch/superproject/migration prefix/generated client/manuals preflight
- [x] official SHA-verified portable Node `v24.19.0`; task-local npm `11.19.0`; process PATH Prisma `6.19.3`
- [x] playbook match: `ER-20260715-004`, `ER-20260720-010`, `ER-20260725-001/002/004`, `ER-20260811-005`, `ER-20260827-001`
- [x] baseline unit 24/215·audit `CONFIRMED→FIXING`
- [x] TasksService TDD pair — 10 RED→54/54
- [x] scores.policy TDD pair — 57/800 RED→18/18
- [x] ScoresService TDD pair — 5 RED→11/11
- [x] migration+`.pg-spec.ts` pair — missing-file RED, fail-closed/static GREEN
- [x] PostgreSQL 17.11 r2: empty/current-5/atomic/exactly-once/19+2 — 9/9, cleanup listener 0
- [x] Prisma validate/generate/build, unit 24/245, e2e 1/2, full lint, exact diff PASS
- [x] read-only reviewer `/root/f006_fix_recheck` `gpt-5.6-sol/high` — `RECHECKED`, 신규 P0/P1 없음
- [x] audit `RECHECKED`; active memory/hash closure 진행
- [ ] Git stage/commit/push/PR/merge — 미승인, 실행 안 함
