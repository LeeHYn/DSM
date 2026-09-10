# 브랜치 통합 비교 — 2026-09-10

기준: `main@af0f415a470f27ee8f703617913a17f062cb69d9`. 사용자가 전체 브랜치 비교·통합·나머지 삭제를 승인했다. 최종 유지 브랜치는 `main`이다.

## 비교와 병합 방향

| 브랜치 | 비교 tip | main 대비 고유 commit | 처리 |
|---|---|---:|---|
| `codex/dsm-back-foundation-prisma` | `2a6ba73adfca52398cc2299d91c3f6dff7788af3` | 4 | 최신 구현 유지, 구형·보류 기능은 이력과 아래 근거 보존 |
| `codex/dsm-milestone-12a-notifications` | `362aabeb713c2f5c0b73f599216b8cf92ea1b97a` | 1 | 현재 알림 구현으로 대체됨; 이력 연결 |
| `codex/front-secure-session-rest-client` | `2a4e9916765b505037e1c533735d84cd9f251ccf` | 0 | main에 이미 포함 |
| `codex/integration-main-review` 원격 | `32dec29447b8383e262f8f24fbb258a5c6c3cba9` | 0 | main에 이미 포함 |
| `codex/m12b-front-prototype-checkpoint` | `396fc0a89327795646e89e128d7204b55b7fc00b` | 4 | 오프라인 자료 83파일·관련 오류 기록 보존, 최신 제품·운영 문서 유지 |
| `codex/integration-main-review` 로컬 | `61f6fd863574073cce78d65c8134f1659241b3be` | 2 | 186d68a 세팅 내용과 61f6fd8 병합 결과는 현재 main에 반영됨; 원래 commit 이력도 연결 |

현재 remote default는 main, 열린 PR은 0개이며 worktree는 `D:/DSM` 하나다. 전체 tip을 main의 조상으로 보존한 후 branch ref만 삭제한다. 강제 push·데이터·작업 파일 삭제는 하지 않는다.

Foundation의 Expo frontend·구형 refresh-token/notification 구현을 현행 제품에 덮어쓰면 Android-only·session family·token ownership 계약이 후퇴한다. 보류 중인 WebSocket realtime, profile/settings/social-account API, NotificationMode, UTC 00:05 자동 finalization은 [기존 통합 검토](./2026-08-25-main-integration-conflict-review.md)의 DEFER를 유지한다. Redis ranking projection, 계정 삭제, 20-Task cap, 일일 snapshot uniqueness는 이후 main에서 구현됐으므로 현행 구현을 유지한다.

독립 backend 검토는 두 branch에서 즉시 이식해야 할 호환 가능한 누락 제품 변경을 찾지 못했다. Foundation의 미포함 신규 파일 64개(Backend 30/Front 20/docs 14)와 M12A 계획 문서 1개는 각각 대체·보류·역사 자료로 분류했다. 원본은 삭제 대상 tip을 main의 부모로 연결해 계속 조회할 수 있다. 보류에는 refresh-token 재사용 시 추가 활성 토큰 폐기 정책, logout의 선택적 FCM 해제, 구 frontend의 FCM/users/snapshot/socket helper도 포함된다. 이들을 현재 session-family·제품 API에 적용하는 것은 별도 설계 대상이다. 현재의 매분 ranking projection 갱신은 UTC 00:05 자동 점수 확정 기능을 대신하지 않는다.

`c79a042`의 공통 문서·AI 지침은 main에서 이미 현행화됐다. `fb54b5d`는 오프라인 오류 기록 ER-20260809-001/002/003만 보존하고, `396fc0a`의 과거 publish 공정표를 현재 상태로 되돌리지 않는다.

## 오프라인 자료 복원 경계

다음 83파일만 `43145b6e0407c3c539ca66deb1813ddbc2e97ec8`에서 복원했다. 기존 파일을 덮어쓰지 않았다. 82파일은 원본 blob 그대로이며 `learning-site/index.html`에는 과거 snapshot 안내만 추가했다. 이 자료는 과거 교육용 snapshot이고 현재 제품 명세가 아니다. `learning-site/README.md`와 root README에도 이 경계를 명시한다.

- `.ai/docs/2026-08-08-offline-learning-site-project-analysis.md`
- `docs/superpowers/plans/2026-08-08-offline-learning-site-pilot-a.md`
- `docs/superpowers/plans/2026-08-09-offline-learning-site-batch-b.md`
- `docs/superpowers/specs/2026-08-08-offline-learning-site-design.md`
- `docs/superpowers/specs/2026-08-09-offline-learning-site-batch-b-design.md`
- `docs/superpowers/specs/assets/offline-learning-site/01-project-map.png`
- `docs/superpowers/specs/assets/offline-learning-site/02-task-architecture.png`
- `docs/superpowers/specs/assets/offline-learning-site/03-file-study-desktop.png`
- `docs/superpowers/specs/assets/offline-learning-site/04-file-study-mobile.png`
- `learning-site/architecture.html`
- `learning-site/assets/site-data.js`
- `learning-site/assets/site.css`
- `learning-site/assets/site.js`
- `learning-site/concepts/jwt-session.html`
- `learning-site/concepts/serializable-transaction.html`
- `learning-site/diagrams/auth-session-flow.html`
- `learning-site/diagrams/task-update-flow.html`
- `learning-site/exercises/auth-session.html`
- `learning-site/exercises/task-flow.html`
- `learning-site/features/refresh-rotation.html`
- `learning-site/features/social-login.html`
- `learning-site/features/task-score-schedule.html`
- `learning-site/files/DSM_Back/prisma/schema.prisma.html`
- `learning-site/files/DSM_Back/src/app.bootstrap.ts.html`
- `learning-site/files/DSM_Back/src/app.module.ts.html`
- `learning-site/files/DSM_Back/src/auth/auth.controller.spec.ts.html`
- `learning-site/files/DSM_Back/src/auth/auth.controller.ts.html`
- `learning-site/files/DSM_Back/src/auth/auth.module.ts.html`
- `learning-site/files/DSM_Back/src/auth/auth.service.spec.ts.html`
- `learning-site/files/DSM_Back/src/auth/auth.service.ts.html`
- `learning-site/files/DSM_Back/src/auth/dto/refresh-token.dto.ts.html`
- `learning-site/files/DSM_Back/src/auth/dto/social-login.dto.ts.html`
- `learning-site/files/DSM_Back/src/auth/dto/token-response.dto.ts.html`
- `learning-site/files/DSM_Back/src/auth/guards/jwt-auth.guard.ts.html`
- `learning-site/files/DSM_Back/src/auth/types/jwt-payload.type.ts.html`
- `learning-site/files/DSM_Back/src/auth/types/social-profile.type.ts.html`
- `learning-site/files/DSM_Back/src/main.ts.html`
- `learning-site/files/DSM_Back/src/notifications/notification-schedule.constants.ts.html`
- `learning-site/files/DSM_Back/src/notifications/notifications.service.spec.ts.html`
- `learning-site/files/DSM_Back/src/notifications/notifications.service.ts.html`
- `learning-site/files/DSM_Back/src/prisma/prisma.service.ts.html`
- `learning-site/files/DSM_Back/src/scores/scores.policy.ts.html`
- `learning-site/files/DSM_Back/src/scores/scores.service.spec.ts.html`
- `learning-site/files/DSM_Back/src/scores/scores.service.ts.html`
- `learning-site/files/DSM_Back/src/tasks/dto/create-task.dto.ts.html`
- `learning-site/files/DSM_Back/src/tasks/dto/update-task.dto.ts.html`
- `learning-site/files/DSM_Back/src/tasks/tasks.controller.ts.html`
- `learning-site/files/DSM_Back/src/tasks/tasks.service.spec.ts.html`
- `learning-site/files/DSM_Back/src/tasks/tasks.service.ts.html`
- `learning-site/files/DSM_Back/test/app.e2e-spec.ts.html`
- `learning-site/index.html`
- `learning-site/qa-report.md`
- `learning-site/verification-report.json`
- `tools/learning-site/assets/site.css`
- `tools/learning-site/assets/site.js`
- `tools/learning-site/content/batch-b.mjs`
- `tools/learning-site/content/pilot-a.mjs`
- `tools/learning-site/generate.mjs`
- `tools/learning-site/lib/pages.mjs`
- `tools/learning-site/lib/paths.mjs`
- `tools/learning-site/lib/render.mjs`
- `tools/learning-site/lib/source.mjs`
- `tools/learning-site/lib/symbols.mjs`
- `tools/learning-site/lib/syntax.mjs`
- `tools/learning-site/manifest.mjs`
- `tools/learning-site/tests/batch-b-content.test.mjs`
- `tools/learning-site/tests/batch-b-generate.test.mjs`
- `tools/learning-site/tests/batch-b-pages.test.mjs`
- `tools/learning-site/tests/batch-b-verify.test.mjs`
- `tools/learning-site/tests/batches.test.mjs`
- `tools/learning-site/tests/content.test.mjs`
- `tools/learning-site/tests/generate.test.mjs`
- `tools/learning-site/tests/manifest.test.mjs`
- `tools/learning-site/tests/pages.test.mjs`
- `tools/learning-site/tests/paths.test.mjs`
- `tools/learning-site/tests/render.test.mjs`
- `tools/learning-site/tests/runtime.test.mjs`
- `tools/learning-site/tests/source.test.mjs`
- `tools/learning-site/tests/style.test.mjs`
- `tools/learning-site/tests/symbols.test.mjs`
- `tools/learning-site/tests/syntax.test.mjs`
- `tools/learning-site/tests/verify.test.mjs`
- `tools/learning-site/verify.mjs`

## 검증·게시 상태

- Backend 26 suites/317 tests, Front 24 suites/229 tests 통과. Front는 기존 Keychain cache 문제를 피하도록 새 task-local cache를 사용했다.
- E2E 최초 실행은 로컬 `.env`의 Redis와 fixture DB credential이 섞여 bootstrap 인증 실패·timeout이 발생했다. 제품 변경 없이 test process의 `NODE_ENV=test`, `REDIS_URL=''`로 선택적 Redis를 분리하자 2/2 통과했다. 실제 DB/Redis/API 검증과 이 격리된 HTTP smoke를 구분한다.
- 원본 commit의 123개 tracked source만 ignored export로 추출했고 실제 env·키는 포함하지 않았다. 사이트 metadata의 SHA-256와 일치하는 110-byte/3-line Expo 선언(끝 개행 없음)을 추가해 124파일/13,168줄을 재현했다. 전용 Node tests 66/66, 복원한 main 사이트에 대한 28개 source page full verifier PASS.
- Backend/Front/audit tree는 통합 전 `af0f415`와 동일하다. Node/Jest 로그·verifier report는 ignored `.local/logs/branch-consolidation-*`에 있다. Android build는 이번에 재실행하지 않았으며 제품 tree가 동일한 2026-09-09 검증 결과를 유지한다.
- 자료 보존 commit `e0cf6447d8d43595aaa424d1dcc375a40fdc6bab`, 통합 merge `35b39446a6735858e39e983f6f7865273f32711f`를 원격 main에 정상 push했다. merge는 보존한 현재 tree를 유지하는 `ours` 전략이며 나머지 부모는 `61f6fd8`, `2a6ba73`, `362aabe`, `396fc0a`다. 위 6개 비교 tip 모두 main에서 도달 가능함을 `git merge-base --is-ancestor`로 확인했다.
- 원격 5개 tip과 게시된 main을 다시 대조한 뒤 expected-tip lease를 지정한 atomic deletion으로 codex branch 5개를 삭제했다. main의 비 fast-forward 갱신은 하지 않았다. prune 후 로컬 integration도 `git branch -d`로 삭제했다. 원격 `refs/heads/main` 하나, 로컬 `main` 하나, `origin/HEAD -> origin/main`과 clean tracked tree를 확인했다.

## CCTV 기록·셀프 체크

- 수정·추가: 자료 보존 commit은 91파일이다. 위 원본 83파일과 `learning-site/README.md`, root `README.md`, 이 보고서, `.ai/memory/plan.md`, `context.md`, `checklist.md`, `README.md`, `error-resolution-playbook.md`를 포함한다. index는 원본 83파일 중 한 파일이며 역사 안내와 EOF 개행만 달라졌다.
- 삭제: 비교표의 원격 codex 5개와 로컬 integration branch ref. 작업 파일·DB 데이터·기존 commit은 삭제하지 않았다. 원래 내용은 main의 merge ancestry로 보존한다.
- 로컬 산출물: ignored `.local/branch-consolidation.ps1`, historical corpus export·zip, 테스트 cache·로그·verifier report. 실제 환경 파일과 key는 export·stage하지 않았다.
- Memory 동기화: Yes. Active 3과 byte/SHA-256 ledger 갱신, strict UTF-8/LF·diff·tree·ancestry 검증.
- 요청 외 변경: No. 기존 제품·dependency·schema·migration·audit 내용을 보존했다.
- [x] 고유 작업 보존·중복/구형 구현 회귀 방지·원래 이력 유지.
- [x] 새 기능·추상화·리팩터링 없이 비교 결과에 따른 통합.
- [x] 실제 검증과 historical 검증, 미실행 Android/OAuth·실기기 검증 구분.
- [x] 사용자 요청 범위의 branch만 제거, main 정상 push·원격/로컬 일치 확인.
- 잔여 gate: 본문의 보류 기능과 기존 release audit·OAuth·signed-device·production/Play 검증. 다음 작업 후보는 기존 FIXED finding의 독립 fix-recheck 또는 OAuth·실기기 검증이며 이번 통합에서 시작하지 않았다.
