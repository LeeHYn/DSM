# 목표

DSM full-stack의 기능·test·문서·승인·검증 이력을 유지한다. 현재 우선순위는 `codex/integration-main-review`의 승인된 main 통합 검토다. Task 12 전체 matrix는 PASS했으며 Task 13~14와 최종 독립 review 전 통합 완료를 주장하지 않는다. 별도 제품 release-audit는 `F-006`부터 독립 계획·승인으로 재개한다.

# Main branch integration review — 2026-08-26

- SSOT: `docs/superpowers/plans/2026-08-25-main-branch-integration-review.md`(16 tasks·74 checks), `docs/superpowers/specs/2026-08-25-main-branch-integration-review-design.md`, `docs/reviews/2026-08-25-main-integration-conflict-review.md`.
- worktree/branch: `C:\dsm-integration-review` / `codex/integration-main-review`. `main`·`origin/main`은 `2e25d9811db39a69a5ee6fa2f16d386d6bd18d81`, canonical은 `2a4e9916765b505037e1c533735d84cd9f251ccf`; 변경 금지.
- Task 4: canonical non-squash merge `a639ac2`, exact second parent·byte-identical product, independent review clean, closure `0141b9f`.
- Task 5: approved parse-only loopback-port-1 URL로 canonical baseline 재검증. Backend 23 suites/214 tests·Prisma/build/lint, Front 18/162·type/lint, Android 365 tasks PASS; URL absent·product diff 0. plan `68557d7`, final review closure `b6b56df`.
- offline deliverable: `C:\dsm-offline-learning-site` / `codex/offline-learning-site` / `2cbb088`; base `43145b6`, source `fb54b5d`, `396fc0a` 제외. ancestry `0 1`, memory 4-path allowlist, Node 66/66, verifier 28-source `PASS`, review clean. integration branch와 분리 유지.
- Task 7~10: AI-control history port `1bacf47`/`1d36d70`; foundation classification(only active-schedule partial index `PORT`); migration+contract test `56c0575`; current setup/architecture reconciliation과 fail-fast fix `04f5980`. 각 review closure 완료.
- Task 11: amendment `332e3ad`로 seed `EASY→LOW`, original extraction 보존·fresh `canonical-prisma-r2*` 사용. PostgreSQL 17 empty 5, canonical 4, seed 1/1/2, forward 5, invariant probe 모두 PASS; captured containers only cleanup·URL absent·기존 `dsm-back-dev-db-1` 보존. reviewer `APPROVED`, report `f30dcd2`, playbook `ER-20260827-001`/`4c25b67`, memory closure `2f96c77`.
- Task 12 BLOCKED: clean `2f96c77`에서 Node `v24.19.0`/npm `11.19.0`, backend install 882, Prisma validate/generate+URL cleanup, build, Jest 24 suites/215 tests PASS. non-fixing ESLint는 `DSM_Back/src/notifications/notification-migration.contract.spec.ts` lines 17·25의 `prettier/prettier` wrap 2건으로 exit 1; non-writing Prettier check 재현. 이후 frontend/Android/lock/offline/Git rows 미실행, tracked clean·URL absent.
- Task 12 amendment·PASS: exact 승인 후 plan `046d67f`/`0ecbf2d`, test-only style `69d3154`. Prettier/focused Jest/full lint PASS 뒤 runtime부터 전체 재실행: Backend 24/215, Front 18/162+type/lint, Android 365, lock roots, offline 66/66+28-source, Git/SDD 모두 PASS. Task 11 DB empty/upgrade evidence 포함; product/dependency/remote 변경 없음. blocker history `6ef5dab`/`0cf4031`; 당시 Task 12 실행 중 memory compression 4파일은 unstaged로 보존했음.
- Task 13: 사용자 exact `Task 13 amendment 승인`; plan `80ab65b`로 compression README를 4번째 exact path로 허용. active plan/context/checklist를 실제 Task 12 PASS와 대조하고 README byte/hash·UTF-8·ignored recovery backup을 검증해 `docs(memory): record integration review results`로 closure한다.
- Task 14 security amendment: 사용자 exact `Task 14 security amendment 승인 — .codex/config.toml 제거`. unpinned `npx -y caveman-shrink`가 audited lock 밖 registry code를 실행하는 finding을 해결하기 위해 `.codex/config.toml`만 삭제하고 별도 security commit으로 유지한다. manifest/lock/product 대체 수정 금지; path/reference/lock diff 검증 후 independent re-review가 clean일 때만 report를 별도 commit한다.
- 이후: Task 14 conflict report/final independent review. push·PR·`main` 변경·shared/remote DB·배포는 별도 승인 전 금지.

# Memory SSOT

- `plan.md`: 목표·계약·승인·다음 계획.
- `context.md`: 구현·환경·검증·위험 snapshot.
- `checklist.md`: `[ ]|[/]|[x]` 진행 상태.
- `error-resolution-playbook.md`: 오류 signature/root cause별 검증 지식. 오류 작업 전 검색하고 조건 일치 `VERIFIED`만 현재 checkout에서 재검증.
- `README.md`: active/recovery routing·압축 snapshot. `*.original.md`는 local recovery이며 Git·일반 검색·handoff·재압축 제외.
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

1. Task 14 final report·independent review.
2. 별도 제품 audit 재개 시 `F-006` → 남은 P1 `F-003`/`F-005`/`F-017` → UNKNOWN `F-013`/`F-015` → P2/P3·2회 zero-new-P0~P2.
3. audit 종료 후 M12C → Firebase sandbox → dispatch 판단 → WebSocket → Redis/batch.

# F-016 Android Git handoff 계획 — 2026-08-17

- 완료·`RECHECKED`. Android-only product/native 52개 commit `846cf1968ae0b729e0525ccb2af82f6fc5bd8e20`, clean checkout `e1f1a123d2822d02d7ccbe33f7cb9bb89f77c5c2`, closure remote HEAD `d9ff792f1b1f8161547e7ef7a63d50f636e615aa`.
- clean checkout npm/Jest/type/lint/autolink/Gradle 재현. `.env.local`, `local.properties`, keystore, `.gradle`, `.idea`, build/cache 미추적. reviewer `RECHECKED`, 신규 P0/P1 없음.

# F-006 Task score integrity 계획 — 2026-08-17

- 정책·설계 승인; spec `docs/superpowers/specs/2026-08-17-f006-score-integrity-design.md` written review 대기. implementation plan·별도 승인 전 source/migration/DB 수정 금지.
- 사용자별 UTC `startAt` 날짜당 active Task 최대 20개. same-day non-null `completedAt`인 `COMPLETED`만 score; late/early/null=0, 과거·미래 생성 유지, cap 900.
- 상태 진입은 `completedAt=now`, 이탈은 null, 반복 complete는 existing timestamp 보존. data-only migration이 `DailyScore`·`User.totalScore`·tier 재계산; Task timestamp·historical `RankingSnapshot` 보존.
- exact 2-file stages, TDD, UTC/20-limit/concurrency/disposable PostgreSQL 검증, implementation-independent fix-recheck. remote/prod DB 금지.

# 승인·안전 경계

- credential/token/SHA/client ID 완전값 조회·출력·Git/memory 기록 금지. physical device, Firebase send, remote/prod DB, deploy는 action-time 승인 필요.
- DB reset/drop, force push, `main` direct push 금지. Git stage/commit/push/PR/merge는 명시 승인 범위만.
- 구현 단계 exact 1~2 files; 사용자 변경 보존. 고위험 변경은 `change-gate`, release 전 `release-audit`; finder/validator/implementer/rechecker 분리.
- main agent만 shared memory/audit ledger 소유. confirmed fix는 새 plan+사용자 승인+exact allowlist 필요.

# 잔여 위험·보류

- Integration Task 12 PASS; Task 13 memory reconciled; Task 14 미실행.
- release signing·release `.env`/OAuth provisioning 미구성; production 미검증. external OAuth state 삭제·변경 시 current-PC smoke 재발 가능.
- Task/Score/Ranking Android UI prototype·fixed data. `F-006`, `F-026`, actual multi-connection refresh/logout, Firebase delivery/F-007 race 미해결.
- launcher/splash/app name template branding, dependency audit 32, Task parser hash/non-string, Apple, revoked-token reuse hook, UTC midnight Cron 보류.
- M12C, WebSocket, Redis/batch 미구현.

# `.ai/memory` 압축·정리 — 2026-08-16

- 2026-08-27 사용자 직접 요청으로 active 3 current-state 압축. `ER-20260720-014` 때문에 unsafe `caveman-compress` CLI·외부 Claude 전송 금지.
- pre-image는 `plan.20260827.original.md`, `context.20260827.original.md`, `checklist.20260827.original.md`에 byte-exact local backup. Git·일반 검색·handoff·재압축 제외.
- `error-resolution-playbook.md` verified records는 read-only 보존. `README.md`가 bytes/hash/ratio·strict UTF-8·semantic 검증 기록.
- 제품/source/test/config, DB, Docker, Firebase, remote refs는 범위 밖.

# 완료 기준

1. active memory와 actual source/test/Git 상태 대조.
2. 오류 전 playbook match·적용성 기록.
3. plan+exact allowlist+사용자 승인 후 실행.
4. 위험 비례 검증·필요 시 independent review.
5. 최종 memory sync, 미실행 검증·잔여 위험·승인 gate 보고.
