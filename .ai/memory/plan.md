# 목표

DSM full-stack의 기능·test·문서·승인·검증 이력을 유지한다. `codex/integration-main-review`의 main 통합 검토·local handoff는 완료했고 origin publish는 원격·전체 payload 명시 승인 부족으로 `BLOCKED`다. Offline 결과는 별도 local branch이며 PR·`main` merge는 새 승인 전 금지다. 제품 release-audit는 `F-006`부터 재개한다.

# Main branch integration review — 2026-08-26

- SSOT: `docs/superpowers/plans/2026-08-25-main-branch-integration-review.md`(16 tasks·74 checks), `docs/superpowers/specs/2026-08-25-main-branch-integration-review-design.md`, `docs/reviews/2026-08-25-main-integration-conflict-review.md`. Worktree `C:\dsm-integration-review`, branch `codex/integration-main-review`; `main`/`origin/main` `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`, canonical `2a4e9916765b505037e1c533735d84cd9f251ccf` 불변.
- Task 4~5: non-squash merge `a639ac2`(exact second parent·byte-identical), closure `0141b9f`; parse-only URL plan `68557d7`, Backend 23 suites/214 tests+Prisma/build/lint, Front 18/162+type/lint, Android 365, URL absent·product diff 0, closure `b6b56df`.
- offline: `C:\dsm-offline-learning-site`/`codex/offline-learning-site`/`2cbb088`; base `43145b6`, source `fb54b5d`, `396fc0a` 제외, ancestry `0 1`, memory 4 paths, Node 66/66, 28-source `PASS`; integration과 분리.
- Task 7~11: AI-control `1bacf47`/`1d36d70`; active-schedule partial index만 `PORT`; migration+contract `56c0575`; handoff/fail-fast `04f5980`. Amendment `332e3ad`로 seed `EASY→LOW`, fresh `canonical-prisma-r2*`; PostgreSQL 17 empty 5/canonical 4/seed 1·1·2/forward 5/invariant PASS, captured-only cleanup·URL absent·`dsm-back-dev-db-1` 보존. Review `APPROVED`, report `f30dcd2`, `ER-20260827-001`/`4c25b67`, closure `2f96c77`.
- Task 12: 최초 backend install 882·Prisma/build·24/215 PASS 뒤 contract spec lines 17·25 wrap 2건으로 lint BLOCKED(`6ef5dab`/`0cf4031`). Exact amendment, plans `046d67f`/`0ecbf2d`, test-only `69d3154` 후 Backend 24/215, Front 18/162+type/lint, Android 365, lock roots, offline 66/66+28-source, Git/SDD PASS; Node `v24.19.0`/npm `11.19.0`, product/dependency/remote 변경 없음.
- Task 13~15: memory plan `80ab65b`; Task 14 plan `2815f6d`, `.codex/config.toml` 삭제 `4533c0c`, report `c9e9ba9`, original findings `ADDRESSED`, 신규 P0-P2 없음, Spec/Quality/Whole-branch `APPROVED`. Task 15는 offline `0 1`·4 paths, six pinned refs, canonical ancestry, clean/diff와 exact 4-path memory closure를 재확인; local closure HEAD `30441ca`. Integration/offline은 local-only, PR·`main`/shared DB/deploy는 새 승인 필요.

# Memory SSOT

- `plan.md`=목표·계약·승인·다음 계획; `context.md`=구현·환경·검증·위험; `checklist.md`=`[ ]|[/]|[x]` 상태.
- `error-resolution-playbook.md`는 오류 signature/root cause별 `VERIFIED` 지식이며 현재 checkout에서 재검증. `README.md`는 routing·compression snapshot; `*.original.md`는 Git·검색·handoff·재압축 제외 local recovery.
- 상세 source: `.ai/docs/2026-07-15-current-project-architecture.md`, `.ai/audits/20260716-change-gate-notification-12b/findings.jsonl`, `.ai/audits/20260725-change-gate-front-secure-session/findings.jsonl`, `.ai/audits/20260817-release-audit-full-project/findings.jsonl`.

# 현재 상태 — 2026-08-17

- M1~M12A 완료. M12B backend·local DB·change-gate 완료; M12C·실제 FCM sandbox 미완료라 parent `[/]`.
- Front secure session·REST client Task 1~33, Android-only React Native 전환, Web QA·auth change-gate 완료.
- current-PC Google ID token→backend session→Keychain reload/refresh rotation→logout revoke→post-logout Login smoke PASS. `F-025` external OAuth fix `RECHECKED`; `F-026` silent cancellation은 `CONFIRMED P2`.
- full-project audit `20260817-release-audit-full-project`: 26건(confirmed 22, unknown 2, rechecked 2), release-ready 아님. `F-016`·`F-025` RECHECKED; 다음 제품 gate는 `F-006` written-spec review.
- Android-only product 기준선 remote HEAD `d9ff792f1b1f8161547e7ef7a63d50f636e615aa`; integration review와 별도 이력이다.

# 핵심 기술 계약

## Backend·DB

- NestJS + Prisma v6 + PostgreSQL UTC `timestamptz`. persisted time UTC.
- canonical migrations 4개 + integration delta `20260825_integration_backend_deltas`; Task 11 disposable PostgreSQL에서 empty/upgrade chain 검증 완료.
- Task mutation·schedule sync·score recompute는 동일 Serializable transaction; Prisma `P2034`만 callback 전체 최대 2회 retry.
- Category actor-owned/default only. UTC score 10/20/30 × 1.5/1.3/1.0/0.7, cap 900, 6 tiers.

## Auth·Front session

- Google/Kakao 구현; Apple actual verification 보류. Google `GOOGLE_CLIENT_ID` non-empty·audience 일치 필수.
- Access 15분, Refresh 30일. refresh `<recordId>.<secret>`, PK lookup+1 bcrypt compare, family `sessionId` rotation 보존. refresh/logout은 user-row `FOR UPDATE` lock.
- React Native `0.83.10` Android-only + React Navigation. access memory-only, refresh `react-native-keychain@10.0.0` versioned service. serialized queue·epoch guard·verified delete/tombstone.
- authenticated client: 첫 `401` single-flight refresh, 원 요청 1회 replay, generation/epoch fences. controller는 bootstrap/sign-in/refresh/profile/onboarding/logout 분리, protocol/storage failure fail-closed.

## Android Google

- application ID `com.dsm.dailyup`; `react-native-nitro-google-signin@1.3.0`, `react-native-nitro-modules@0.36.5`, `react-native-config@1.6.1`.
- adapter는 ID token 획득·취소·sanitized failure만, `SessionController.signIn('GOOGLE', token)`은 DSM exchange·Keychain·routing 소유.
- `GOOGLE_WEB_CLIENT_ID`와 backend `GOOGLE_CLIENT_ID`는 같은 Web audience. secret 금지; ID token memory-only·no log/storage.
- Community CLI Android autolinking. Expo runtime/CLI/Router·Web/iOS target 제거. 새 PC/release/Play signer는 signer별 Android OAuth client 필요; fingerprint/client ID 완전값 기록 금지.

## Notification 12A/12B

- Node `>=22`, `firebase-admin@14.1.0`, `@nestjs/schedule@6.1.3`; ADC only. 12C 전 `FCM_DISPATCH_ENABLED=false`.
- token lifecycle + Task-`NotificationSchedule` atomic sync; foreign-owner token/FID pre-mutation 409.
- Cron 30초, schedule 100, delivery 500, lease 5분, heartbeat 60초, per-device 최대 3회 retry.
- `sendStartedAt` 뒤 ambiguous result terminal `UNKNOWN`, auto-resend 금지. payload account-neutral data-only `REMINDER_SYNC`/`version=1`. F-007은 `ACCEPTED_RISK` + `MITIGATION_ONLY`.

# 검증 기준선

- Integration Task 12 final: Node/npm exact; Backend 24 suites/215 tests+Prisma/build/lint; Front 18/162+type/lint; Android 365; lock/offline/Git/SDD PASS.
- Canonical baseline: Front 18 suites/162 tests, TypeScript, lint 0 errors/18 warnings; Backend 23/214; Android `assembleDebug` 365 tasks.
- Task 11 disposable PostgreSQL 17: empty 5, canonical 4→delta 5, invariant probe PASS; permanent/existing DB 미접속.
- Android actual auth/session smoke PASS; remote clean checkout Android tracked 52·forbidden 0, frontend/Gradle gates PASS.
- Local DB legacy baseline: 4 migrations, zero drift, `sessionId text NOT NULL`, `(userId, sessionId)` index, refresh-token NULL/total 0/0.
- Auth audit F-001~F-005 RECHECKED. Notification audit는 F-007만 accepted risk, 나머지 12건 RECHECKED. dependency audit 32건(critical 0; Backend 15, Frontend 17).
- Prisma generate는 Windows engine DLL `EPERM` 방지를 위해 build/e2e와 직렬 실행.

# 다음 실행 계획

1. 별도 제품 audit 재개 시 `F-006` → 남은 P1 `F-003`/`F-005`/`F-017` → UNKNOWN `F-013`/`F-015` → P2/P3·2회 zero-new-P0~P2.
2. audit 종료 후 M12C → Firebase sandbox → dispatch 판단 → WebSocket → Redis/batch.

# F-016 Android Git handoff 계획 — 2026-08-17

- 완료·`RECHECKED`. Android-only product/native 52개 commit `846cf1968ae0b729e0525ccb2af82f6fc5bd8e20`, clean checkout `e1f1a123d2822d02d7ccbe33f7cb9bb89f77c5c2`, closure remote HEAD `d9ff792f1b1f8161547e7ef7a63d50f636e615aa`.
- clean checkout npm/Jest/type/lint/autolink/Gradle 재현. `.env.local`, `local.properties`, keystore, `.gradle`, `.idea`, build/cache 미추적. reviewer `RECHECKED`, 신규 P0/P1 없음.

# F-006 Task score integrity 계획 — 2026-08-17

- 정책 승인, spec `docs/superpowers/specs/2026-08-17-f006-score-integrity-design.md` written review는 `CHANGES_REQUIRED`. implementation plan·별도 승인 전 source/migration/DB 수정 금지.
- 사용자별 UTC `startAt` 날짜당 active Task 최대 20개. same-day non-null `completedAt`인 `COMPLETED`만 score; late/early/null=0, 과거·미래 생성 유지, cap 900.
- 상태 진입은 `completedAt=now`, 이탈은 null, 반복 complete는 existing timestamp 보존. data-only migration이 `DailyScore`·`User.totalScore`·tier 재계산; Task timestamp·historical `RankingSnapshot` 보존.
- exact 2-file stages, TDD, UTC/20-limit/concurrency/disposable PostgreSQL 검증, implementation-independent fix-recheck. remote/prod DB 금지.

# 승인·안전 경계

- credential/token/SHA/client ID 완전값 조회·출력·Git/memory 기록 금지. physical device, Firebase send, remote/prod DB, deploy는 action-time 승인 필요.
- DB reset/drop, force push, `main` direct push 금지. Git stage/commit/push/PR/merge는 명시 승인 범위만.
- 구현 단계 exact 1~2 files; 사용자 변경 보존. 고위험 변경은 `change-gate`, release 전 `release-audit`; finder/validator/implementer/rechecker 분리.
- main agent만 shared memory/audit ledger 소유. confirmed fix는 새 plan+사용자 승인+exact allowlist 필요.

# 잔여 위험·보류

- Integration Task 12 PASS; Task 13 memory reconciled; Task 14 approved/committed; Task 15 local handoff 완료. Integration push는 policy `BLOCKED`; 두 branch는 local-only.
- release signing·release `.env`/OAuth provisioning 미구성; production 미검증. external OAuth state 삭제·변경 시 current-PC smoke 재발 가능.
- Task/Score/Ranking Android UI prototype·fixed data. `F-006`, `F-026`, actual multi-connection refresh/logout, Firebase delivery/F-007 race 미해결.
- launcher/splash/app name template branding, dependency audit 32, Task parser hash/non-string, Apple, revoked-token reuse hook, UTC midnight Cron 보류.
- M12C, WebSocket, Redis/batch 미구현.

# `.ai/memory` 압축·정리 — 2026-08-16

- 2026-08-27 사용자 직접 요청으로 active 3 current-state 압축. `ER-20260720-014` 때문에 unsafe `caveman-compress` CLI·외부 Claude 전송 금지.
- pre-image는 `plan.20260827.original.md`, `context.20260827.original.md`, `checklist.20260827.original.md`에 byte-exact local backup. Git·일반 검색·handoff·재압축 제외.
- `error-resolution-playbook.md` verified records는 read-only 보존. `README.md`가 bytes/hash/ratio·strict UTF-8·semantic 검증 기록.
- 제품/source/test/config, DB, Docker, Firebase, remote refs는 범위 밖.

# `.ai/memory` post-Task15 재압축 — 2026-08-27

- 사용자 승인 후 main agent가 local `apply_patch`로 수행; `ER-20260720-014` 때문에 `caveman-compress` CLI·외부 전송 금지.
- HEAD `30441ca` pre-image는 `plan.20260827-30441ca.original.md`, `context.20260827-30441ca.original.md`, `checklist.20260827-30441ca.original.md`에 byte-exact·ignored 보존; 기존 backup과 playbook 불변.
- exact writable: 새 backup 3개+active 3+`README.md`; 제품/DB/Docker/Firebase/remote/offline 및 Git stage/commit/push/PR/merge 제외. Heading·inline code·경로·명령·SHA·날짜·버전·수치·gate 보존, Task 12~15 중복만 병합.
- 완료: 새 backup SHA 일치·ignored, active 3 32,501→28,737 bytes(11.6%), README 갱신. Strict UTF-8, heading, Task 12~15/offline/F-006/security·no-publish anchors, secret pattern 0, exact 4-path diff, playbook 불변, `git diff --check` PASS.
- 2026-08-30 사용자가 active memory exact 4-path local commit을 승인했다. 대상은 `plan.md`, `context.md`, `checklist.md`, `README.md`; ignored backup·제품·playbook 제외, push/PR/merge 없음. Commit message: `docs(memory): refresh integration handoff state`.

# Integration branch publish — 2026-08-30

- 사용자가 `codex/integration-main-review` push를 승인했다. Upstream은 `origin/codex/integration-main-review`; fetch 후 divergence `0 176`, force 없이 fast-forward publish한다.
- fresh product/document verification 후 active memory 4-path publish 상태를 커밋하고 해당 integration 브랜치만 push한다.
- offline `codex/offline-learning-site`, `main`, 제품 sibling, PR/merge/deploy, shared/remote DB/Firebase는 범위 밖이다.
- fresh verification: default Temp cache는 `ER-20260725-002` `EPERM`; project-local cache 재실행으로 Backend 24 suites/215 tests, Front 18/162 PASS. Cache exact cleanup, product diff 0, memory/document checks PASS.
- local publish record commit `d8d6937`; push 전 local/remote divergence `0 177`.
- `git push origin codex/integration-main-review`는 원격 `https://github.com/LeeHYn/DSM.git`과 177-commit payload 명시 승인 부족으로 process 시작 전 policy `BLOCKED`; remote 전송 0, remote ref `6fa66eb`, local-only 유지.
- 재시도는 exact remote·branch·177 commits·non-force push를 사용자가 명시 승인한 뒤만 가능. PR/merge/deploy 없음.

# F-006 written-spec review — 2026-08-30

- 사용자 `다음 작업 진행해`를 직전 작업 목록 2번인 `F-006` Task score integrity written-spec review 실행 승인으로 적용한다.
- 목표: `docs/superpowers/specs/2026-08-17-f006-score-integrity-design.md`를 audit `F-006`, 현재 Task/Score/Prisma 구현·테스트와 대조해 누락·모순·검증 불가능한 계약을 findings-first로 판정한다.
- read scope: 위 spec, `.ai/audits/20260817-release-audit-full-project/findings.jsonl`의 `F-006`, `DSM_Back/src/tasks/**`, `DSM_Back/src/scores/**`, `DSM_Back/prisma/**`와 관련 tests. 제품·spec·audit ledger 수정 없음.
- exact writable allowlist: `.ai/memory/plan.md`, `.ai/memory/checklist.md`, 종료 sync용 `.ai/memory/context.md`, `.ai/memory/README.md`. 구현·migration·DB·Docker·remote 작업 금지.
- 완료 기준: policy/domain/transaction/concurrency/migration/rollback/verification/operational gate별 evidence와 exact path:line, P0~P3 findings 또는 `APPROVED`, 구현 전 남은 결정과 별도 승인 gate 보고.
- 실행 주체: main agent 단독 read-only review. 판정: `CHANGES_REQUIRED`.
- `P1` migration chronology: spec lines 129/179/181/198의 `20260817_enforce_task_score_integrity`와 predecessor-through-`20260810` 계약은 현재 체인의 `20260825_integration_backend_deltas`를 누락한다. 새 migration은 현 HEAD 뒤 timestamp로 재명명하고 predecessor를 5개 전체 체인으로 정정하며 fresh full-chain + current-5 upgrade를 모두 검증해야 한다.
- `P1` reconciliation insert contract: spec line 136의 missing `DailyScore` upsert는 raw SQL에서 DB default가 없는 `id`와 `updatedAt` 값을 어떻게 생성하는지 정의하지 않는다(`20260716_init/migration.sql` lines 105/115). ID 생성·timestamp·conflict key를 명시해야 실행 가능하다.
- `P2` score parity: spec lines 133~138은 현재 `scores.policy.ts`의 difficulty 10/20/30, achievement multipliers, JavaScript `Math.round`, cap 900, percentage 2-decimal rounding, six tier thresholds를 SQL로 정확히 재현하는 식과 경계 fixture를 명시하지 않는다. migration SQL과 unit policy의 동치성 테스트가 필요하다.
- 결과: spec·제품·audit ledger·DB는 수정하지 않았다. 위 amendment와 새 implementation-plan 승인 전 F-006 구현을 시작하지 않는다.

# F-006 보완·실기능 실행 설계 — 2026-08-30

- 사용자 요청: `실제 기능 실행까지 진행하고 보완 목록을 우선으로 추려`. 범위는 F-006 spec 보완→TDD 구현→disposable PostgreSQL 17 데이터 보정·동시성→Backend 기능 실행까지다. 기존 local product DB, shared/remote/prod DB, Firebase, Front/Android, deploy는 제외한다.
- 분류: Task/Score/Prisma migration·동시성 계약을 함께 바꾸므로 `architectural`. 구현 전 설계 승인, spec amendment·재검토, implementation plan 승인 gate를 유지한다.
- 접근안 A(권장): 기존 F-006 spec을 in-place amendment해 단일 SSOT를 유지한다. 현재 chain 이후 `20260830_enforce_task_score_integrity`, current 5 predecessor, raw SQL 생성값·점수 동치식·두 upgrade 경로를 명시한다. 중복 문서가 없고 구현자가 한 계약만 따른다.
- 접근안 B: 별도 amendment spec을 추가한다. 원문 이력은 보존되지만 두 문서 우선순위와 경로가 분산된다.
- 접근안 C: service invariant를 먼저 구현하고 data migration을 후속 작업으로 분리한다. 빠른 app 차단은 가능하지만 기존 오염 projection이 남아 F-006을 실제 완료할 수 없다.
- 보완 우선순위: `P1-1` migration chronology/current-5 upgrade → `P1-2` `DailyScore.id=gen_random_uuid()::text`, `updatedAt=CURRENT_TIMESTAMP`, unique conflict key → `P2-1` difficulty/multiplier/positive-rounding/cap/achievement-rate/tier SQL parity+boundary fixtures → 실제 Serializable 19+2 create·exact 20/one 409 검증.
- 구현 구조: (1) amended spec 1 file, (2) TasksService spec+service, (3) ScoresService spec+service, (4) new migration+real-DB e2e, (5) independent recheck/audit closure, (6) active memory sync. 각 수정 단계 exact 1~2 files, failing test→minimal implementation→focused PASS→full regression 순서다.
- 실제 기능 완료 기준: 20번째 허용/21번째 409, target-day move limit, UTC boundary, completion timestamp transitions, late/early/null score 0, valid same-day score, deterministic DailyScore/User repair, fresh 6-migration chain, current 5→target upgrade, concurrent create exact-one conflict, Prisma validate/build/lint/backend full tests PASS.
- Git stage/commit/push/PR/merge는 자동 포함하지 않는다. 현재 integration push `BLOCKED`와 177-commit payload gate를 유지한다.
- 현 단계 exact writable allowlist: `.ai/memory/plan.md`, `.ai/memory/checklist.md`, `.ai/memory/context.md`, `.ai/memory/README.md`. 설계 승인 전 spec/source/test/migration/DB 수정·실행 금지.
- 사용자 `진행해`로 2026-08-30 보완 설계안 승인. 기존 spec을 in-place amendment했다: target `20260830_*`, current 5/fresh 6 routes, PostgreSQL 17 core `gen_random_uuid()::text`, timestamps/conflict key, exact score/tier SQL parity와 boundary fixtures.
- spec self-review: old target/predecessor·placeholder 0, current chain/path consistency PASS. Random UUID/timestamp와 deterministic 표현 충돌은 business projection determinism으로 범위를 명확히 했다.
- parity probe에서 current `Math.round((57/800)*10000)/100=7.12`와 exact SQL numeric half-up `7.13` 불일치 재현; 원인은 division-first IEEE-754 intermediate `712.49999999999989`. 새 max 20 범위 mismatch 0. Spec은 application+SQL 모두 numerator-first half-up으로 canonicalize하고 `scores.policy.ts`+spec 독립 stage와 57/800 fixture를 추가했다. 제품/source/test/migration/DB는 아직 미변경.
- 상태: float parity amendment까지 반영한 written-spec 사용자 검토 승인 대기. 승인 전 implementation plan·제품 구현·DB 실행 금지.

# F-006 amended written-spec 재검토 — 2026-08-31

- 사용자 `해당 설계서를 다시 확인하고 보와점이 존재시 보완 진행해`를 spec-only 재검토·보완 승인으로 적용한다. 대상은 `docs/superpowers/specs/2026-08-17-f006-score-integrity-design.md`; 제품 구현 승인은 아니다.
- 현재 Prisma v6 migration chain·Jest e2e 기본 환경·Task 11 disposable PostgreSQL 패턴과 다시 대조한 우선 보완점: (1) PostgreSQL migration 전체 `BEGIN`/`COMMIT` 원자성, (2) empty full-chain과 seeded current-5 upgrade 검증의 역할 분리, (3) 일반 `test:e2e`가 기본 `dsm_test`에 접속하지 않는 F-006 DB suite fail-closed gate, (4) create/update 오류 우선순위, (5) Prisma exactly-once와 existing-row conflict 보존 검증, (6) `User.tier` enum cast·Task 없는 사용자 zero projection, (7) 향후 remote/prod 적용 maintenance gate.
- 수정 단계: 1) `plan.md`+`checklist.md`, 2) spec 1개, 3) `context.md`+`README.md`; 매 단계 exact 1~2 files. exact writable allowlist는 spec과 active memory 4 files뿐이다.
- 금지: `DSM_Back` source/test/migration 생성·수정, DB/Docker 실행, dependency install, audit ledger 전이, Git stage/commit/push/PR/merge, remote/prod 접근.
- 완료 기준: amended spec 내 atomicity·route separation·fail-closed harness·error precedence·idempotence/enum/zero-user·operational gate가 실행 가능하게 명시되고, strict UTF-8·required-anchor·old contradiction·exact five-file diff·secret scan·active-memory hash·`git diff --check`를 통과한다. 이후에도 written-spec 사용자 승인과 implementation-plan 승인이 별도로 필요하다.
- 보완 반영: explicit `BEGIN`→Serializable→`COMMIT`, forced-error rollback; empty full-chain과 seeded current-5 upgrade 분리; `.pg-spec.ts` 전용 실행과 marker/loopback/task-owned URL fail-closed; pinned predecessor SHA `d8d6937cf7ef96b0d17ecfa2cbee6f3d0867b73e`; UTC SQL boundary의 explicit `AT TIME ZONE 'UTC'`; literal daily/tier oracle; conflict metadata 보존+second deploy no-op; all-User zero/`::"Tier"`; create/update 오류 순서; future production drain/backup/forward-recovery gate.
- stage 경계도 exact화했다: product TDD 4개 2-file stage, audit 2 paths, memory plan/context 2 paths, checklist/README 2 paths. 기존 generic closure placeholder는 제거했다.
- self-review evidence: required contracts 22/22, stale/placeholder 0, pinned prefix five directories+`migration_lock.toml`, current Jest regex/default-DB safety premise, strict UTF-8, fixed score fixtures 10/10 PASS. 최종 repository/memory hash 검증은 종료 단계에서 재실행한다.
- 상태: `SELF_REVIEW_PASS`, `USER_APPROVAL_REQUIRED`. source/test/migration/DB/Docker/audit/Git action은 미실행이며 written-spec 승인 전 implementation plan을 작성하지 않는다.

# F-006 implementation plan 작성 — 2026-08-31

- 사용자 `ㄱ`은 직전 제시 문구에 대한 amended written-spec 승인으로 기록한다. 설계 승인 범위는 implementation plan 작성까지이며 제품 구현·DB/Docker 실행·audit 전이·Git action 승인은 아니다.
- 산출물: `docs/superpowers/plans/2026-08-31-f006-task-score-integrity.md`. 승인 spec과 실제 Task/Score tests, Prisma v6 migration, Jest e2e config, Task 11 disposable PostgreSQL 패턴을 대조해 exact TDD steps·commands·expected RED/GREEN·rollback/cleanup·review gate를 작성한다.
- 계획 작성 수정 단계: (1) `plan.md`+`checklist.md`, (2) F-006 spec status+new implementation plan, (3) `context.md`+`README.md`. exact writable allowlist는 이 6 paths뿐이다.
- 금지: `DSM_Back` source/test/migration 생성·수정, dependency install, DB/Docker/Firebase/remote 실행, audit finding status 전이, Git stage/commit/push/PR/merge. 구현은 plan self-review와 사용자 별도 승인 뒤에만 시작한다.
- plan 완료 기준: spec requirement마다 task mapping, exact 1~2-file stages, no placeholder, signature/type consistency, focused/full verification commands, task-owned DB fail-closed/captured cleanup, independent recheck와 memory closure, 별도 Git gate를 포함한다.
- 완료: spec status에 `ㄱ` 승인 반영, audit stage를 opening+closure로 정합화하고 `docs/superpowers/plans/2026-08-31-f006-task-score-integrity.md` 12-task/48-step 계획을 작성했다. Task/Score TDD 3 pair, migration+`.pg-spec.ts` pair, full SQL, empty/current-5/atomic rollback/exactly-once/19+2 concurrency, captured cleanup, independent recheck, audit/memory closure와 Git stop gate를 exact화했다.
- self-review: required anchors, 64 balanced code fences, placeholder/TODO/TBD 0, 12 task headings, migration explicit `BEGIN`/Serializable/`COMMIT`, source signature·Prisma v6/Jest path·Windows command 일치, `git diff --check` PASS. 제품/source/test/migration/DB/Docker/audit/Git는 미실행이다.
- 현 shell preflight는 Node `v24.13.0`, npm `11.6.2`, Docker `29.6.1`이며 Docker config read warning이 있다. integration required Node `v24.19.0`/npm `11.19.0` 경로 확인 또는 별도 환경 준비 없이는 구현 Task 1에서 `BLOCKED`다.
- 다음 gate: user가 sequential inline 실행, disposable PostgreSQL 17, read-only independent reviewer 1명 여부를 명시 승인해야 한다. Git/remote/shared/prod/Firebase/deploy/offline branch는 포함하지 않는다.

# F-006 implementation 실행 — 2026-08-31

- 사용자 `ㄱ`을 직전 제시한 권장 실행안 승인으로 적용한다: `superpowers:executing-plans` 인라인 순차 실행, exact Node `v24.19.0`/npm `11.19.0` 환경 준비, task-owned disposable PostgreSQL 17, 마지막 read-only reviewer 1명 `gpt-5.6-sol/high`. Git stage/commit/push/PR/merge, shared/remote/prod DB, Firebase, deploy와 offline branch는 제외한다.
- workspace preflight: `C:\dsm-integration-review`는 `git-dir=C:/DEV/.git/worktrees/dsm-integration-review`, common dir `C:/DEV/.git`, superproject 없음, branch `codex/integration-main-review`; 새 worktree를 만들지 않는다. predecessor migration은 정확히 5개, generated Prisma Client 존재, `.ai/manuals` 부재다.
- environment: current global `C:\Program Files\nodejs`는 Node `v24.13.0`; 공식 `nodejs.org` SHA-256과 일치한 portable Node `v24.19.0`을 ignored `.superpowers/sdd/2026-08-31-f006-task-score-integrity/runtime/`에 설치하고 그 runtime 안에서 npm `11.19.0`을 맞췄다. process-local PATH에서 Node `v24.19.0`, npm `11.19.0`, Prisma/client `6.19.3` 확인; global 설치·PATH는 변경하지 않았다.
- playbook: `ER-20260715-004`(Serializable/P2034), `ER-20260720-010`(real PostgreSQL parity), `ER-20260725-001`(`npm.cmd`), `ER-20260725-002`(task-local Jest cache), `ER-20260725-004`(generated client), `ER-20260811-005`(serial generate), `ER-20260827-001`(valid enum/new retry evidence) 조건을 현재 checkout에 대조해 적용한다. Docker config access warning은 일치 VERIFIED record가 없어 actual Docker preflight에서 별도 진단한다.
- execution outcome: baseline 24 suites/215 tests. TDD는 Tasks 10 RED→54/54, policy 57/800 RED→18/18, Scores eligibility 5 RED→11/11, migration missing-file RED→static GREEN으로 진행했다. 최종 full unit 24 suites/245 tests, normal e2e 1 suite/2 tests, Prisma validate/generate, build, full ESLint와 `git diff --check`가 exit 0이다.
- product diff는 exact 8 paths: Tasks service/spec, score policy/spec, Scores service/spec, `20260830_enforce_task_score_integrity/migration.sql`, fail-closed `task-score-integrity.pg-spec.ts`. package/lockfile/schema/predecessor migrations/RankingSnapshot source는 불변이다.
- Docker Desktop 4.82.0은 stale `dockerInference` runtime socket으로 backend가 시작 전 crash했다. 광범위 runtime-directory 복구는 안전 검토에서 차단되어 중단하고, official EDB PostgreSQL 17.11 portable archive를 ignored runtime에 사용했다. Archive SHA-256 `6EABDF00D2893713B75DB4336A23C3FDF505F056E217EC6E2E95D901750CFEA3`, server `170011`; service 설치·shared DB 사용 없음.
- r1은 Windows mixed EOL 때문에 predecessor checksum 1개 불일치만 재현하고 cleanup listener 0으로 보존했다. r2는 pinned-commit clean proof 후 live predecessor 5개 SQL byte checksum을 prefix와 맞춰 9/9 PASS: empty six-chain, current-5 upgrade, schema/name/checksum parity, 10 daily+10 tier literals, eligibility, metadata/ranking preservation, forced rollback, no-pending exactly-once, actual `TasksService` 19+2→1 success/1 stable 409/20 active. Target migration SHA-256 `AA496C2C2D029D26C58083E888E360F79AA7EA8D10C876CF664F841BD16E291A`; final listeners 0.
- reviewer `/root/f006_fix_recheck` (`gpt-5.6-sol/high`)는 read-only `fix-recheck`에서 `RECHECKED`, 신규 P0/P1 없음으로 판정했다. Audit F-006은 `FIXING→FIXED→RECHECKING→RECHECKED`; 전체 counts `CONFIRMED 21 / RECHECKED 3 / UNKNOWN 2`이며 audit 자체는 열린 상태다.
- residual risk: application limit는 `TasksService` Serializable boundary에 의존해 direct DB write가 우회할 수 있다. 운영 규모 lock/runtime, staging rehearsal, backup, writer drain과 remote/prod apply는 별도 승인 gate다. Historical `RankingSnapshot`은 의도대로 보존한다.
- untouched: shared/remote/prod DB, Firebase, deploy, offline branch, Git stage/commit/push/PR/merge. 다음 단계는 fresh memory/hash 검증 후 Git gate에서 중단하는 것이다.

# 완료 기준

1. active memory와 actual source/test/Git 상태 대조.
2. 오류 전 playbook match·적용성 기록.
3. plan+exact allowlist+사용자 승인 후 실행.
4. 위험 비례 검증·필요 시 independent review.
5. 최종 memory sync, 미실행 검증·잔여 위험·승인 gate 보고.
