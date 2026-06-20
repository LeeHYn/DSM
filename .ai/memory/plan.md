# 목표
DSM 앱의 백엔드/프론트엔드를 단계적으로 구축합니다.

# 완료된 마일스톤
1. 백엔드/프론트엔드 세팅 계획 수립 및 승인 대기
2. `DSM_Back` (NestJS) 초기 세팅
3. `DSM_Front` (React Native/Expo) 초기 세팅
4. 생성된 프로젝트 구조를 Git에 커밋 및 원격 저장소에 푸시
5. `DSM_Back` 백엔드 기반 구축 + DB/Prisma 세팅
6. `DSM_Back` 인증(Auth) 모듈 구현
7. 일과(Task) CRUD API 구현
8. 카테고리(Category) CRUD API 구현
9. 리프레시 토큰 조회 구조 개선 — 토큰에 레코드 ID 임베드(`<recordId>.<secret>`)로 O(1) 조회
10. 점수(DailyScore) 집계 로직 구현 — FR-03 점수 공식 + 누적 totalScore/티어, 일과 변경 시 재계산 + 조회 API
11. 랭킹/백분위(FR-04) 구현 — 일간/주간/누적 내 순위·상위%, TOP100 리더보드, RankingSnapshot 영속화
12. `DSM_Back` 프로필/알림 설정 + FCM 토큰/NotificationSchedule + WebSocket 실시간 점수/랭킹/알림 이벤트 구현
    - 설계: `docs/superpowers/specs/2026-06-20-dsm-back-milestone-12-design.md`
    - 구현 계획: `docs/superpowers/plans/2026-06-20-dsm-back-milestone-12.md`
    - 리뷰보고서: `docs/reviews/2026-06-20-dsm-back-review.md`
13. `DSM_Back` 후속 안정화 + 운영성 + 누락 P0
    - 일일 일과 등록 20개 제한
    - NotificationSchedule DB 중복 방지 및 stale PROCESSING 복구
    - Redis 기반 리더보드 캐시 및 Socket.IO adapter
    - npm audit 잔여 취약점 문서화
    - API/WebSocket/환경변수 계약 문서화
    - 설계: `docs/superpowers/specs/2026-06-20-dsm-back-milestone-13-stabilization-design.md`
    - 구현 계획: `docs/superpowers/plans/2026-06-20-dsm-back-milestone-13-stabilization.md`
    - API 계약: `docs/api/DSM_Back_API_v0.md`
    - 리뷰보고서: `docs/reviews/2026-06-20-dsm-back-milestone-13-review.md`

# 다음 마일스톤
14. `DSM_Front` 연동 기반 구축
    - API client/base URL/env 분리
    - access/refresh token 저장 및 refresh flow
    - 인증 상태 기반 라우팅
    - Tasks/Categories/Scores/Rankings/Notifications 화면 연동 시작

## 2026-06-20 Milestone 13 Task 4 Quality Review: Ranking Leaderboard Cache
- 목표: 점수 재계산 후 `score.recomputed`/`score.updated`/`leaderboard.updated` 관측자가 stale leaderboard cache를 읽지 않도록 순서를 보장한다.
- 계획:
  1. `ScoresService.recompute()` 테스트를 먼저 추가해 leaderboard cache invalidation이 `SCORE_RECOMPUTED` emit 전에 await되는지 검증한다.
  2. `ScoresService`에 `RankingsCacheService` 의존성을 주입하고, invalidation 실패는 경고 로그 후 swallow하도록 구현한다.
  3. `RankingsService` 테스트를 먼저 추가해 fresh leaderboard 경로가 stale cache를 무시하고 DB 계산 결과를 반환하며 cache를 최신값으로 저장하는지 검증한다.
  4. `RankingsService`에 `getFreshLeaderboard(period, limit)`를 추가하고 기존 `getLeaderboard()`의 cache-aside 동작은 유지한다.
  5. `RankingRealtimeService` 테스트를 먼저 갱신해 invalidation 이후 `score.updated`/ranking/leaderboard signal 순서와 fresh leaderboard 사용을 검증한다.
  6. `RankingRealtimeService`에서 `score.updated` emit을 invalidation 뒤로 이동하고, leaderboard broadcast는 `getFreshLeaderboard()`를 사용한다.
  7. `ScoresModule` provider/import wiring을 맞춘 뒤 요청된 Jest 범위와 build를 실행한다.

# 후속 후보
- 회원 탈퇴, 프로필 이미지 스토리지, 알림 방식 세부 설정, Apple Sign In 실제 검증
## 2026-06-20 Milestone 14 Planning: DSM_Front Integration Foundation
- Scope: `DSM_Front` integration foundation only. Build API URL config, shared HTTP client, token storage, auth provider, protected route groups, typed API modules, React Query setup, initial authenticated smoke screens, and Socket.IO client wrapper.
- Design: `docs/superpowers/specs/2026-06-20-dsm-front-milestone-14-integration-foundation-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-20-dsm-front-milestone-14-integration-foundation.md`
- Deferred: full visual redesign, native social login UX, push permission/token registration, offline sync, production release setup, and polished product screens.
- Execution recommendation: Subagent-Driven Development with one task per integration slice.

## 2026-06-21 Milestone 14 Completed: DSM_Front Integration Foundation
- Implemented: Expo public env config, React Query provider, auth provider, SecureStore/localStorage token persistence, refresh-aware HTTP client, protected Expo Router groups, typed DSM_Back API modules, dashboard/tasks/rankings smoke screens, and Socket.IO ranking subscription wrapper.
- Verification: `npm run typecheck`, `npm run lint`, and `npm run verify` pass in `DSM_Front`.
- Audit: non-breaking `npm audit fix` applied. `npm audit --omit=dev` still reports 16 moderate transitive advisories requiring breaking `--force` dependency changes, so they are deferred to a dependency-upgrade milestone.
- Review report: `docs/reviews/2026-06-20-dsm-front-milestone-14-review.md`
- Next recommended milestone: `DSM_Front` product UX screens and native device integration (OAuth UX, FCM token registration, task create/update flows, profile settings).

## 2026-06-21 Milestone 15 Planned: DSM_Back Backend Closure
- Scope option selected by user: backend-only closure without external Apple/storage dependencies.
- Included: account deletion API, notification mode settings, refresh token reuse detection with active-session revoke, UTC daily score finalization and daily ranking snapshot cron.
- Excluded: Apple Sign In real verification, profile image object storage, and forced breaking dependency upgrades.
- Design: `docs/superpowers/specs/2026-06-21-dsm-back-milestone-15-closure-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-21-dsm-back-milestone-15-closure.md`

## 2026-06-21 Milestone 15 Completed: DSM_Back Backend Closure
- Implemented: `DELETE /users/me` with owned, active, non-expired refresh-token confirmation and hard delete through existing cascade relations.
- Implemented: `NotificationMode` (`SOUND`, `VIBRATE`, `SILENT`) on `User`, optional mode updates through notification settings, and FCM task reminder `data.notificationMode`.
- Implemented: refresh token reuse detection that revokes all active sessions when a revoked token is presented with a matching secret.
- Implemented: UTC daily finalization cron at `00:05 UTC`, previous UTC day recomputation, and DAILY ranking snapshot recreation.
- Added resilience: `RankingSnapshot(userId, period, snapshotAt)` unique guard, transactional delete/create for non-empty daily snapshots, and `createMany(skipDuplicates)`.
- Verification: `npm test -- --runInBand` 27 suites/191 tests, `npm run test:e2e` 1 suite/2 tests, `prisma:validate`, `build`, and `lint` passed.
- Review report: `docs/reviews/2026-06-21-dsm-back-milestone-15-review.md`
