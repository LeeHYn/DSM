# 오프라인 학습 사이트 프로젝트 조사

> 조사일: 2026-08-08
> 기본 조사 checkout: C:\DEV, branch codex/m12b-front-prototype-checkpoint, HEAD 960f02b
> 상태: HTML 생성 전 조사 결과. 학습 원본 checkout과 첫 파일 묶음은 사용자 승인 대기.

## 1. 조사 결론

- 물리적으로 존재하지만 기본 제외 대상인 파일은 154,848개다. .git 299개, .worktrees 84,857개, 현재 checkout의 두 node_modules 69,536개, DSM_Back/dist 151개, DSM_Front/.expo 5개다.
- 위 디렉터리를 제외한 파일은 211개다.
- 211개 중 학습 사이트의 원본 코드·설정·테스트 후보는 124개, 13,168줄이다.
- 애플리케이션 후보는 DSM_Back 88개·8,787줄, DSM_Front 36개·4,381줄이다.
- 별도 분류는 저장소 운영·기획 문서 55개·14,652줄, 생성 lockfile 2개·21,306줄, 이미지·바이너리 29개, 민감 파일 1개다.
- DSM_Back/.env는 내용과 값을 읽거나 기록하지 않고 민감 파일로 제외한다.
- 알려진 provider token 형식과 private-key block은 발견되지 않았다. credential 이름 기반 후보는 5개 파일 6건이며, 실제 .env 1개 외에는 문서·테스트·.env.example 문맥이므로 포함 전에 재검토한다.
- 현재 root checkout에는 기존 사용자 변경인 .ai/docs/2026-07-15-current-project-architecture.md 수정 1건이 있다. 이번 조사에서는 해당 파일을 수정하지 않았다.
- C:\DEV\.worktrees\front-secure-session-rest-client는 clean 상태의 별도 branch codex/front-secure-session-rest-client, HEAD bb712ba다. root checkout보다 최신 기능을 포함할 수 있으므로 학습 원본으로 삼을지 사용자 확인이 필요하다.

## 2. 디렉터리 구조

    C:\DEV
    ├─ DSM_Back/                 NestJS + Prisma + PostgreSQL 백엔드
    │  ├─ prisma/                schema와 migration
    │  ├─ src/
    │  │  ├─ auth/
    │  │  ├─ categories/
    │  │  ├─ tasks/
    │  │  ├─ scores/
    │  │  ├─ rankings/
    │  │  ├─ notifications/
    │  │  ├─ health/
    │  │  ├─ prisma/
    │  │  └─ common/, config/
    │  └─ test/
    ├─ DSM_Front/                Expo + React Native 제품 프로토타입
    │  ├─ src/app/               Expo Router routes
    │  ├─ src/components/
    │  ├─ src/features/prototype/
    │  ├─ src/constants/, hooks/, types/
    │  └─ assets/                이미지·아이콘: 코드 페이지 제외
    ├─ .ai/                      작업 SSOT, 현재 문서, audit
    ├─ docs/                     과거·현재 agent 설계와 계획
    ├─ Planing Document/         목표 v1.3 기획 문서
    ├─ design/                   기존 시각 참고 자료
    └─ .worktrees/               별도 checkout: 기본 원본에서 제외

## 3. 언어와 프레임워크

### 백엔드

- TypeScript 5.7, NestJS 11, Node.js 22 이상
- Prisma 6.19.3, PostgreSQL schema와 SQL migration
- JWT, bcrypt, Google/Kakao social auth
- Firebase Admin 14.1.0, Nest Schedule 6.1.3
- Jest 30, ts-jest, Supertest
- YAML Compose, JSON/TOML/ESLint/Prettier 설정

### 프런트엔드

- TypeScript 5.9, TSX, CSS
- React 19.2, React Native 0.83.6
- Expo SDK 55, Expo Router 55
- React Navigation 7, Reanimated 4
- 현재 데이터 계층은 PrototypeProvider의 local mock state다.

## 4. 실행 시작점 후보

- Backend: DSM_Back/src/main.ts → NestFactory.create(AppModule) → configureApp → listen.
- Backend module root: DSM_Back/src/app.module.ts.
- Front runtime: DSM_Front/package.json의 main=expo-router/entry.
- Front route root: DSM_Front/src/app/_layout.tsx.
- Front state root: DSM_Front/src/features/prototype/prototype-context.tsx.
- 처음 예상한 DSM_Front/app/_layout.tsx는 존재하지 않았다. 원인은 sourceRoot가 src인 현재 구조이며 실제 파일은 DSM_Front/src/app/_layout.tsx다. 과거 해결 playbook 일치 record는 없었다.

## 5. 실제 코드에서 확인된 주요 기능

- 공통 bootstrap, validation, CORS, exception envelope, health
- Google/Kakao social login, access/refresh JWT, logout, JWT guard
- Category CRUD와 소유권/default 경계
- Task 생성·조회·수정·완료·soft delete
- DailyScore 재계산, tier 정책
- DAILY/WEEKLY/TOTAL ranking, leaderboard, snapshot
- FCM token 등록·revoke, Task와 notification schedule 동기화
- per-device notification delivery, Cron dispatcher, retry/lease/UNKNOWN 정책
- 프런트 login/tutorial/home/ranking/my 화면 프로토타입
- 프런트 local Task 생성·완료·삭제, offline/error/loading/empty 상태, theme

코드에 없는 기능은 문서화하지 않는다. WebSocket, Redis/batch, 실제 front REST/OAuth/FCM 연결, 운영 배포는 root checkout 기준 확인되지 않거나 계획 상태다.

## 6. 핵심 파일 후보

### 공통 아키텍처

- DSM_Back/src/main.ts
- DSM_Back/src/app.bootstrap.ts
- DSM_Back/src/app.module.ts
- DSM_Back/prisma/schema.prisma
- DSM_Front/src/app/_layout.tsx
- DSM_Front/src/app/(tabs)/_layout.tsx

### 핵심 비즈니스·외부 경계

- DSM_Back/src/auth/auth.service.ts
- DSM_Back/src/auth/jwt-auth.guard.ts가 아니라 실제 경로 DSM_Back/src/auth/guards/jwt-auth.guard.ts
- DSM_Back/src/tasks/tasks.service.ts
- DSM_Back/src/scores/scores.policy.ts
- DSM_Back/src/scores/scores.service.ts
- DSM_Back/src/rankings/rankings.service.ts
- DSM_Back/src/notifications/notifications.service.ts
- DSM_Back/src/notifications/firebase-messaging.provider.ts
- DSM_Back/src/notifications/notification-dispatcher.service.ts
- DSM_Back/src/prisma/prisma.service.ts
- DSM_Front/src/features/prototype/prototype-context.tsx
- DSM_Front/src/components/dailyup/task-sheets.tsx
- DSM_Front/src/components/dailyup/primitives.tsx

### 핵심 테스트

- DSM_Back/src/auth/auth.service.spec.ts
- DSM_Back/src/tasks/tasks.service.spec.ts
- DSM_Back/src/notifications/notification-dispatcher.service.spec.ts
- DSM_Back/test/app.e2e-spec.ts

## 7. 반복적이거나 학습 가치가 상대적으로 낮은 후보

- 단순 DTO와 type declaration
- module wiring만 있는 짧은 *.module.ts
- controller forwarding만 확인되는 일부 controller와 반복 controller spec
- 단순 theme/view wrapper와 platform hook
- DSM_Front/src/app/explore.tsx 1줄 re-export
- package-lock.json 2개: 생성 dependency lockfile
- IDE, agent, memory backup, audit ledger, 과거 실행 계획

낮은 설명 깊이 후보도 승인된 원본 corpus에 들어오면 전체 코드는 포함한다. 다만 package-lock, recovery backup, local tooling은 외부·생성·운영 파일로 제외하는 방안을 권장한다.

## 8. 코드만으로 확정할 수 없는 내용

- root checkout과 최신 secure-session worktree 중 어느 것을 학습 원본으로 삼을지
- 실제 .env 값, 운영 credential, Firebase ADC와 실제 FCM 전달 결과
- 실제 OAuth provider 계정과 Apple verification 상태
- 운영 PostgreSQL, 배포 provider, CI/CD, observability 계약
- 실제 모바일 device 동작과 accessibility 자동 검증
- 목표 v1.3 문서의 계획 항목 중 현재 제품 요구로 계속 유효한 범위
- architecture 문서의 기존 미커밋 변경 의도

## 9. 권장 구현 접근법

### 접근 A: 검증 가능한 정적 생성기 — 권장

Node.js built-in만 사용하는 generator가 승인된 manifest를 읽고 multi-page HTML, local CSS/JS, inline SVG diagram, search index와 verification manifest를 만든다. 원본 파일은 UTF-8 bytes와 줄 구조를 보존하고 SHA-256, byte count, line count를 기록한다. 생성 뒤 verifier가 HTML 코드 영역을 역추출해 원본과 비교한다.

장점: 124개 파일을 반복 가능하게 생성하고 원본 변경·누락을 자동 검출할 수 있다. 단점: generator와 verifier를 먼저 설계해야 한다.

### 접근 B: 페이지를 수동 작성

각 HTML을 직접 작성한다. 소규모 파일에는 빠르지만 124개 전체에서 누락·escape·링크·원본 불일치 위험이 높아 권장하지 않는다.

### 접근 C: 하나의 offline SPA bundle

client-side router와 data bundle로 모든 페이지를 표시한다. 검색과 상태 관리는 쉽지만 file:// 경계, deep link, 큰 초기 bundle, multi-page 요구와의 긴장이 있어 2순위다.

## 10. 권장 사이트 설계

- 결과: learning-site/ 아래 index.html, architecture.html, concepts/, features/, files/, exercises/, diagrams/, assets/.
- 도구: tools/learning-site/ 아래 generator와 verifier.
- 외부 CDN·remote fetch 없음. file://로 index.html을 직접 열어 동작하도록 search data는 local script로 로드한다.
- 코드 영역과 AI 설명은 색·라벨·DOM 영역을 분리한다.
- 다이어그램은 inline pure SVG를 기본으로 한다. 확인된 관계는 실선, 추정 관계는 점선, 확인 필요는 별도 경고색과 라벨을 쓴다.
- syntax highlight는 원본 text node를 바꾸지 않는 local tokenizer를 사용하고, verifier는 token text를 이어 붙여 원본 줄과 비교한다.
- 원본 SHA-256, line-ending 형식, byte count와 logical line count를 별도 manifest에 기록한다.
- 검색, read status, dark mode는 local JS와 localStorage만 사용한다.

## 11. 권장 첫 묶음

### A. Task → Score → Notification 원자 흐름, 15개 — 권장

1. DSM_Back/src/app.module.ts
2. DSM_Back/prisma/schema.prisma
3. DSM_Back/src/tasks/tasks.controller.ts
4. DSM_Back/src/tasks/tasks.service.ts
5. DSM_Back/src/tasks/dto/create-task.dto.ts
6. DSM_Back/src/tasks/dto/update-task.dto.ts
7. DSM_Back/src/scores/scores.policy.ts
8. DSM_Back/src/scores/scores.service.ts
9. DSM_Back/src/notifications/notifications.service.ts
10. DSM_Back/src/notifications/notification-schedule.constants.ts
11. DSM_Back/src/prisma/prisma.service.ts
12. DSM_Back/src/tasks/tasks.service.spec.ts
13. DSM_Back/src/scores/scores.service.spec.ts
14. DSM_Back/src/notifications/notifications.service.spec.ts
15. DSM_Back/test/app.e2e-spec.ts

장점: 요청 진입, transaction, DB, 점수, 알림 side effect와 테스트를 한 흐름에서 학습할 수 있다.

### B. Social Auth와 refresh rotation, 13개

Auth controller/service/module/guard, DTO·type, Prisma schema, 핵심 unit spec과 bootstrap을 묶는다. 인증·보안·동시성 학습에 좋지만 난도가 높다.

### C. Expo 제품 프로토타입, 13개

root/tabs layout, login/tutorial/home/ranking/my, PrototypeProvider/data, DailyUp primitives/screen-state/task-sheets를 묶는다. 시각적 결과가 빠르지만 실제 backend 연결이 아닌 local prototype임을 계속 표시해야 한다.

## 12. 단계별 계획

1. 사용자에게 원본 checkout과 첫 묶음 승인을 받는다.
2. 승인된 범위를 바탕으로 전체 정보 구조와 시각 디자인을 제안하고 승인받는다.
3. generator·verifier와 공통 template의 최소 기반을 만든다.
4. index·architecture·concept skeleton과 pure SVG diagram 규칙을 만든다.
5. 승인된 10~20개 원본 파일로 pilot를 생성한다.
6. 원본 줄·SHA·HTML code region·링크·검색·mobile·dark mode를 검증한다.
7. pilot 승인 후 남은 파일을 10~20개 묶음으로 처리하며 progress manifest를 갱신한다.
8. 전체 링크/search/read-state/diagram zoom을 통합한다.
9. 누락·제외·불일치·확인 필요를 포함한 최종 검증 보고서를 생성한다.

## 13. 전체 애플리케이션 원본 후보 124개

| 경로 | 줄 수 |
|---|---:|
| DSM_Back/.env.example | 9 |
| DSM_Back/.prettierrc | 4 |
| DSM_Back/compose.yaml | 31 |
| DSM_Back/eslint.config.mjs | 35 |
| DSM_Back/nest-cli.json | 8 |
| DSM_Back/package.json | 98 |
| DSM_Back/prisma/migrations/20260716_init/migration.sql | 271 |
| DSM_Back/prisma/migrations/20260720_notification_delivery_outcome_policy/migration.sql | 3 |
| DSM_Back/prisma/migrations/migration_lock.toml | 3 |
| DSM_Back/prisma/schema.prisma | 217 |
| DSM_Back/src/app.bootstrap.ts | 58 |
| DSM_Back/src/app.controller.spec.ts | 22 |
| DSM_Back/src/app.controller.ts | 12 |
| DSM_Back/src/app.module.spec.ts | 107 |
| DSM_Back/src/app.module.ts | 35 |
| DSM_Back/src/app.service.ts | 8 |
| DSM_Back/src/auth/auth.controller.spec.ts | 67 |
| DSM_Back/src/auth/auth.controller.ts | 50 |
| DSM_Back/src/auth/auth.module.ts | 13 |
| DSM_Back/src/auth/auth.service.spec.ts | 347 |
| DSM_Back/src/auth/auth.service.ts | 254 |
| DSM_Back/src/auth/dto/refresh-token.dto.ts | 7 |
| DSM_Back/src/auth/dto/social-login.dto.ts | 13 |
| DSM_Back/src/auth/dto/token-response.dto.ts | 4 |
| DSM_Back/src/auth/guards/jwt-auth.guard.ts | 49 |
| DSM_Back/src/auth/types/jwt-payload.type.ts | 4 |
| DSM_Back/src/auth/types/social-profile.type.ts | 6 |
| DSM_Back/src/categories/categories.controller.spec.ts | 100 |
| DSM_Back/src/categories/categories.controller.ts | 64 |
| DSM_Back/src/categories/categories.module.ts | 12 |
| DSM_Back/src/categories/categories.service.spec.ts | 176 |
| DSM_Back/src/categories/categories.service.ts | 95 |
| DSM_Back/src/categories/dto/create-category.dto.ts | 10 |
| DSM_Back/src/categories/dto/update-category.dto.ts | 11 |
| DSM_Back/src/common/filters/http-exception.filter.ts | 78 |
| DSM_Back/src/config/env.validation.spec.ts | 124 |
| DSM_Back/src/config/env.validation.ts | 106 |
| DSM_Back/src/health/health.controller.spec.ts | 22 |
| DSM_Back/src/health/health.controller.ts | 28 |
| DSM_Back/src/health/health.module.ts | 7 |
| DSM_Back/src/main.ts | 11 |
| DSM_Back/src/notifications/dto/register-fcm-token.dto.ts | 24 |
| DSM_Back/src/notifications/dto/revoke-fcm-token.dto.ts | 9 |
| DSM_Back/src/notifications/firebase-messaging.provider.spec.ts | 233 |
| DSM_Back/src/notifications/firebase-messaging.provider.ts | 68 |
| DSM_Back/src/notifications/notification-dispatcher.service.spec.ts | 1247 |
| DSM_Back/src/notifications/notification-dispatcher.service.ts | 1016 |
| DSM_Back/src/notifications/notifications.controller.spec.ts | 195 |
| DSM_Back/src/notifications/notifications.controller.ts | 44 |
| DSM_Back/src/notifications/notifications.module.spec.ts | 82 |
| DSM_Back/src/notifications/notifications.module.ts | 18 |
| DSM_Back/src/notifications/notifications.service.spec.ts | 323 |
| DSM_Back/src/notifications/notifications.service.ts | 104 |
| DSM_Back/src/notifications/notification-schedule.constants.ts | 30 |
| DSM_Back/src/prisma/prisma.module.ts | 9 |
| DSM_Back/src/prisma/prisma.service.spec.ts | 15 |
| DSM_Back/src/prisma/prisma.service.ts | 20 |
| DSM_Back/src/rankings/dto/leaderboard-query.dto.ts | 15 |
| DSM_Back/src/rankings/dto/ranking-query.dto.ts | 7 |
| DSM_Back/src/rankings/rankings.controller.spec.ts | 103 |
| DSM_Back/src/rankings/rankings.controller.ts | 51 |
| DSM_Back/src/rankings/rankings.module.ts | 13 |
| DSM_Back/src/rankings/rankings.policy.spec.ts | 35 |
| DSM_Back/src/rankings/rankings.policy.ts | 36 |
| DSM_Back/src/rankings/rankings.service.spec.ts | 187 |
| DSM_Back/src/rankings/rankings.service.ts | 202 |
| DSM_Back/src/scores/dto/score-query.dto.ts | 7 |
| DSM_Back/src/scores/scores.controller.spec.ts | 66 |
| DSM_Back/src/scores/scores.controller.ts | 30 |
| DSM_Back/src/scores/scores.module.ts | 13 |
| DSM_Back/src/scores/scores.policy.spec.ts | 101 |
| DSM_Back/src/scores/scores.policy.ts | 77 |
| DSM_Back/src/scores/scores.service.spec.ts | 170 |
| DSM_Back/src/scores/scores.service.ts | 93 |
| DSM_Back/src/tasks/dto/create-task.dto.ts | 36 |
| DSM_Back/src/tasks/dto/task-query.dto.ts | 7 |
| DSM_Back/src/tasks/dto/update-task.dto.ts | 42 |
| DSM_Back/src/tasks/tasks.controller.spec.ts | 125 |
| DSM_Back/src/tasks/tasks.controller.ts | 71 |
| DSM_Back/src/tasks/tasks.module.ts | 13 |
| DSM_Back/src/tasks/tasks.service.spec.ts | 879 |
| DSM_Back/src/tasks/tasks.service.ts | 277 |
| DSM_Back/test/app.e2e-spec.ts | 59 |
| DSM_Back/test/jest-e2e.json | 10 |
| DSM_Back/test/set-env.ts | 9 |
| DSM_Back/tsconfig.build.json | 4 |
| DSM_Back/tsconfig.json | 25 |
| DSM_Back/tsconfig.spec.json | 8 |
| DSM_Front/app.json | 44 |
| DSM_Front/expo-env.d.ts | 3 |
| DSM_Front/package.json | 46 |
| DSM_Front/scripts/reset-project.js | 114 |
| DSM_Front/src/app/(tabs)/_layout.tsx | 117 |
| DSM_Front/src/app/(tabs)/index.tsx | 353 |
| DSM_Front/src/app/(tabs)/mypage.tsx | 217 |
| DSM_Front/src/app/(tabs)/ranking.tsx | 245 |
| DSM_Front/src/app/_layout.tsx | 99 |
| DSM_Front/src/app/explore.tsx | 1 |
| DSM_Front/src/app/index.tsx | 238 |
| DSM_Front/src/app/tutorial.tsx | 174 |
| DSM_Front/src/components/animated-icon.module.css | 6 |
| DSM_Front/src/components/animated-icon.tsx | 132 |
| DSM_Front/src/components/animated-icon.web.tsx | 108 |
| DSM_Front/src/components/app-tabs.tsx | 33 |
| DSM_Front/src/components/app-tabs.web.tsx | 116 |
| DSM_Front/src/components/dailyup/primitives.tsx | 566 |
| DSM_Front/src/components/dailyup/screen-state.tsx | 332 |
| DSM_Front/src/components/dailyup/task-sheets.tsx | 611 |
| DSM_Front/src/components/external-link.tsx | 25 |
| DSM_Front/src/components/hint-row.tsx | 35 |
| DSM_Front/src/components/themed-text.tsx | 73 |
| DSM_Front/src/components/themed-view.tsx | 16 |
| DSM_Front/src/components/ui/collapsible.tsx | 65 |
| DSM_Front/src/components/web-badge.tsx | 44 |
| DSM_Front/src/constants/dailyup-theme.ts | 92 |
| DSM_Front/src/constants/theme.ts | 65 |
| DSM_Front/src/features/prototype/prototype-context.tsx | 205 |
| DSM_Front/src/features/prototype/prototype-data.ts | 118 |
| DSM_Front/src/global.css | 28 |
| DSM_Front/src/hooks/use-color-scheme.ts | 1 |
| DSM_Front/src/hooks/use-color-scheme.web.ts | 21 |
| DSM_Front/src/hooks/use-theme.ts | 14 |
| DSM_Front/src/types/css-modules.d.ts | 4 |
| DSM_Front/tsconfig.json | 20 |

## 14. 저장소 지원 파일 55개

이 파일들은 전체 목록에는 포함하지만 기본 파일별 코드 페이지 corpus에서는 제외한다. 현재 architecture와 계획 문서는 설명 근거로만 사용하고, backup·agent 지침·audit·과거 plan은 학습 원본으로 취급하지 않는다.

| 경로 | 줄 수 |
|---|---:|
| .ai/agents/backend-developer.md | 145 |
| .ai/agents/context-compiler.md | 284 |
| .ai/agents/frontend-developer.md | 149 |
| .ai/agents/investigator.md | 139 |
| .ai/agents/planner.md | 116 |
| .ai/agents/README.md | 143 |
| .ai/agents/reviewer.md | 203 |
| .ai/agents/verification-workflow.md | 151 |
| .ai/audits/20260716-change-gate-notification-12b/findings.jsonl | 13 |
| .ai/audits/20260716-change-gate-notification-12b/README.md | 81 |
| .ai/audits/finding.schema.json | 569 |
| .ai/audits/README.md | 69 |
| .ai/docs/2026-07-10-milestone-12a-notification-foundation.md | 174 |
| .ai/docs/2026-07-15-current-project-architecture.md | 561 |
| .ai/docs/2026-07-19-dailyup-design-fidelity-spec.md | 209 |
| .ai/docs/2026-07-19-frontend-page-requirements.md | 1517 |
| .ai/memory/checklist.md | 112 |
| .ai/memory/checklist.original.md | 186 |
| .ai/memory/context.md | 19 |
| .ai/memory/context.original.md | 30 |
| .ai/memory/error-resolution-playbook.md | 489 |
| .ai/memory/error-resolution-playbook.original.md | 404 |
| .ai/memory/plan.md | 615 |
| .ai/memory/plan.original.md | 1567 |
| .ai/memory/README.md | 38 |
| .ai/system_prompt.md | 120 |
| .claude/settings.json | 7 |
| .claude/settings.local.json | 20 |
| .codex/config.toml | 6 |
| .gitignore | 38 |
| AGENTS.md | 3 |
| CLAUDE.md | 1 |
| design/DSM Prototype 문서.dc.html | 133 |
| docs/superpowers/plans/2026-06-01-dsm-back-foundation-prisma.md | 1204 |
| docs/superpowers/plans/2026-06-06-dsm-refresh-token-lookup.md | 257 |
| docs/superpowers/plans/2026-06-07-dsm-daily-score.md | 62 |
| docs/superpowers/plans/2026-06-07-dsm-rankings.md | 58 |
| docs/superpowers/plans/2026-07-25-front-secure-session-rest-client.md | 3397 |
| docs/superpowers/specs/2026-07-25-front-secure-session-rest-client-design.md | 656 |
| DSM_Back/.gitignore | 3 |
| DSM_Back/README.md | 98 |
| DSM_Front/.claude/settings.json | 5 |
| DSM_Front/.gitignore | 43 |
| DSM_Front/.vscode/extensions.json | 1 |
| DSM_Front/.vscode/settings.json | 7 |
| DSM_Front/AGENTS.md | 3 |
| DSM_Front/CLAUDE.md | 1 |
| DSM_Front/README.md | 56 |
| GEMINI.md | 1 |
| Planing Document/DSM_Docu_v1.3.md | 84 |
| Planing Document/Information_Architecture_v1.3.md | 131 |
| Planing Document/Requirements_Analysis_v1.3.md | 61 |
| Planing Document/System_Architecture_v1.3.md | 112 |
| README.md | 2 |
| setup-ai.ps1 | 99 |

## 15. 생성·민감·미디어 제외 목록 32개

| 분류 | 경로 | 줄/크기 | 이유 |
|---|---|---:|---|
| 민감 | DSM_Back/.env | 내용 비공개 | 실제 환경 설정 후보 |
| 생성 lock | DSM_Back/package-lock.json | 12,309줄 | dependency lock, 자동 생성 |
| 생성 lock | DSM_Front/package-lock.json | 8,997줄 | dependency lock, 자동 생성 |
| recovery binary | .ai/memory/context.original.failed-cp949.bin | 10,693 bytes | 실패 산출물, SSOT 아님 |
| design image | design/01-login.png | 10,411 bytes | 이미지 제외 |
| design image | design/02-tutorial.png | 8,296 bytes | 이미지 제외 |
| design image | design/03-home.png | 15,239 bytes | 이미지 제외 |
| design image | design/04-ranking.png | 15,070 bytes | 이미지 제외 |
| design image | design/05-mypage.png | 11,466 bytes | 이미지 제외 |
| asset | DSM_Front/assets/expo.icon/Assets/expo-symbol 2.svg | 611 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/expo.icon/Assets/grid.png | 53,681 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/expo.icon/icon.json | 819 bytes | 이미지 asset metadata 제외 |
| asset | DSM_Front/assets/images/android-icon-background.png | 17,549 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/android-icon-foreground.png | 78,796 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/android-icon-monochrome.png | 4,140 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/expo-badge.png | 4,137 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/expo-badge-white.png | 4,129 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/expo-logo.png | 3,317 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/favicon.png | 1,129 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/icon.png | 799,005 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/logo-glow.png | 331,624 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/react-logo.png | 6,341 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/react-logo@2x.png | 14,225 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/react-logo@3x.png | 21,252 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/splash-icon.png | 3,317 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/tabIcons/explore.png | 215 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/tabIcons/explore@2x.png | 347 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/tabIcons/explore@3x.png | 468 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/tabIcons/home.png | 253 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/tabIcons/home@2x.png | 343 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/tabIcons/home@3x.png | 479 bytes | 이미지 asset 제외 |
| asset | DSM_Front/assets/images/tutorial-web.png | 58,959 bytes | 이미지 asset 제외 |

## 16. 승인 gate

아직 learning-site HTML, generator, verifier, CSS, JavaScript, diagram을 생성하지 않았다. 다음 단계는 사용자에게 다음 두 결정을 받은 뒤 시작한다.

1. C:\DEV root checkout을 원본으로 사용할지, codex/front-secure-session-rest-client worktree를 원본으로 사용할지.
2. 첫 pilot 묶음 A, B, C 중 어느 것을 처리할지.
