# 현재 프로젝트 맥락

- **상태**: 마일스톤 12A 완료. 12B backend·지속형 local DB·change-gate 완료; 실제 FCM dispatch는 12C 전 비활성. Auth + Task/Category CRUD + refresh O(1) + DailyScore + ranking + FCM token/schedule + per-device dispatcher 구현.
- **검증 기준선(2026-07-20)**: backend Jest 22 suites·198 tests, e2e 1 suite·2 tests, direct AppModule compile, backend TypeScript, scoped lint·Prettier, Prisma validate·2 migrations up-to-date·zero drift 통과.
- **대상/stack**: `DSM_Back` NestJS + Prisma v6 + PostgreSQL UTC `timestamptz`; `DSM_Front` React Native + Expo Router SDK 55. Jest는 `tsconfig.spec.json` CommonJS. test에서 Prisma 실제 연결 차단.
- **Auth**: `@nestjs/jwt`, bcrypt refresh hash, Google/Kakao. `GOOGLE_CLIENT_ID` 필수·audience 검증. refresh `<recordId>.<secret>`, conditional revoke 단일 승자 + replacement create 동일 transaction. Apple 검증은 계정 확보 후.
- **Task/Category/Score**: Task mutation·schedule sync·score recompute 동일 Serializable transaction, Prisma `P2034` 최대 2회 재시도. actor 소유/default Category만 할당. UTC day score 10/20/30 × 1.5/1.3/1.0/0.7, cap 900, 6 tiers.
- **Ranking**: DAILY/WEEKLY/TOTAL 실시간 계산, leaderboard·snapshot API. Redis/batch/WebSocket 미구현.
- **알림 12A**: FCM token 등록·same-user 갱신·revoke. foreign-owner token/FID in-place 이전은 mutation 전 409. Task 상태와 `NotificationSchedule` 원자 동기화.
- **알림 12B**: ADC-only provider, 30초 Cron, schedule 100·delivery 500, 5분 lease·60초 heartbeat, per-device 결과·최대 3회 명시적 failure retry. `sendStartedAt` 이후 모호 결과는 terminal `UNKNOWN`; 자동 재발송 금지. payload는 account-neutral data-only `REMINDER_SYNC`/version.
- **finding**: F-004·F-010·F-014 포함 12건 `RECHECKED`; F-007 send recall 불가·client 표시 직후 취소 race만 사용자 `ACCEPTED_RISK`. 12C 전 `FCM_DISPATCH_ENABLED=false`.
- **local DB**: Docker Desktop 4.82.0, Engine/CLI 29.6.1, Compose 5.3.0, WSL 2.7.10. PostgreSQL 17 Alpine, `127.0.0.1:5432`, UTC, healthcheck, `unless-stopped`, named volume. migrations `20260716_init`, `20260720_notification_delivery_outcome_policy` 적용·zero drift.
- **front Phase 1**: `design/` 5 PNG + prototype 기준 dark-first login/tutorial/home/ranking/my, Task CRUD prototype, loading/empty/error/offline, theme/logout. 909×540·390×844 Browser QA. 실제 OAuth/backend/FCM/WebSocket/DB 연결 미구현.
- **다음 작업**: front secure session·API client → 12C permission + logout/account-switch Installation rotation + authenticated current-state sync/display → test project/device ADC·FCM sandbox → dispatch 활성 판단 → WebSocket → Redis/batch.
- **운영**: `.ai/agents/README.md` 역할 계약; 제품 조사·구현·review는 적합한 역할 sub-agent, main은 계획·승인·memory·diff 통합. 고위험은 `change-gate`, release 전 `release-audit`; audit JSONL은 증거·상태 이력.
- **오류 재사용**: 오류 작업 전 `error-resolution-playbook.md` 검색. 환경·root cause 일치 `VERIFIED`만 현재 범위에서 적용·재검증. `MITIGATION_ONLY`는 gate·잔여 위험 유지.
- **memory backup**: `*.original.md`는 local 복구 snapshot, Git 제외·비활성. 2026-07-20 Anthropic compression script의 Windows CP949 bug로 기존 context pre-image가 손실돼 Git HEAD·plan·architecture·checklist에서 상세 snapshot을 재구성했다.
- **Obsidian Vault 연결(2026-07-20)**: `C:\AiWiki`를 Obsidian 1.12.7의 단일 local Vault로 등록했다. `C:\AiWiki\AiProject`는 여러 프로젝트를 담는 일반 directory다.
- **Obsidian DSM 문서 큐레이션·일반 컨테이너 전환(2026-07-22)**: `C:\AiWiki\AiProject\DSM`은 일반 directory이고, `Current` junction은 `C:\DEV\.ai\docs`, `Planning` junction은 `C:\DEV\Planing Document`를 가리킨다. `Overview.md`는 Current 4개와 Planning v1.3 4개를 연결하며 기획 문서 4개의 architecture 링크도 새 Current 경로를 사용한다. 원본 `C:\DEV`와 두 junction target은 보존됐다. 전환 전 IndexedDB cache는 삭제하지 않고 `.pre-dsm-20260721` exact backup으로 이동했으며 Obsidian workspace와 새 cache가 정상 생성됐다. 사용자 action-time 승인 후 stale 제외 필터 11개를 UI에서 제거하고 보관함 cache를 재구축했으며 `app.json` readback은 `userIgnoreFilters: null`이다. Quick Switcher에서 Overview·현재 architecture는 검색되고 `node_modules`·`AGENTS.md`·`superpowers`는 파일 결과가 없음을 확인했다. 복구 절차는 `ER-20260722-001`로 기록했다.

# Front secure session·REST client 현재 맥락 — 2026-07-25

- 실행 브랜치/worktree: `codex/front-secure-session-rest-client`,
  `C:\DEV\.worktrees\front-secure-session-rest-client`.
- 상세 계획 33개 중 Task 1~17 완료. Task 18 authenticated client 진행 중.
- Backend contract:
  - `User.onboardingCompletedAt`과 `/auth/me`, `/auth/me/onboarding` 구현 완료.
  - browser CORS는 명시 allowlist, credentials false, 정확한 methods/headers.
  - migration 파일은 생성·검증만 했고 persistent 개발 DB에는 미적용.
- Front security boundary:
  - refresh-token storage는 rejection-safe queue와 epoch guard로 직렬화 완료.
  - Native SecureStore adapter는 versioned key, verified delete, tombstone fallback,
    fixed storage error 정규화까지 완료.
  - Web token store는 module memory만 사용한다. 같은 module 인스턴스는 상태를
    공유하고 browser reload/module reload 뒤에는 빈 상태여서 다시 로그인한다.
  - production API URL은 HTTPS, development HTTP는 local/private host만 허용.
  - token/current-user 응답은 runtime validator 통과 후에만 사용.
  - transport는 요청당 fetch 1회, 자동 retry 없음, timeout/network/HTTP/protocol
    오류를 안전한 고정 메시지로 분류.
  - public login/refresh는 access token을 보내지 않고 logout만 캡처한 token pair 사용.
  - authenticated client는 현재 access token을 주입하고 최초 `401`만 refresh
    single-flight에 참여시킨 뒤 원 JSON 요청을 최대 한 번 replay한다. replay `401`은
    session 종료 callback으로 전달하고 network/timeout은 refresh하지 않는다.
- 최신 Front 검증: Jest 8 suites/62 tests, ESLint, TypeScript 모두 통과.
- 환경 제약: managed sandbox의 Windows Jest Temp cache `EPERM`은
  `ER-20260725-002` 절차로 동일 명령을 승인 환경에서 재실행한다.
- 잔여 위험:
  - dependency audit 55건(critical 1 포함) 별도 triage 필요.
  - Task 4 parser의 hash/non-string 명시 테스트는 Minor deferred.
  - SecureStore native config는 향후 native binary build에서 반영.
- 외부 변경 없음: DB migration apply, push/PR/merge/deploy 미실행.
- Task 15 로컬 commit `3a2b9cd` 독립 검토 clean. 비동기 queue race test의
  microtask 선행 조건 해결은 `ER-20260726-001`에 기록.
- Task 16 로컬 commits `f25125e`, `ce5b28c`; fix round 1 re-review clean.
  native `ApiError` passthrough 해결은 `ER-20260726-002`에 기록.
- Task 17 로컬 commit `6be9eaa`; 독립 검토 clean. Jest CommonJS에서 runtime
  dynamic import가 올바른 RED를 가린 문제와 해결은 `ER-20260726-003`에 기록.
