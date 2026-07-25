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
