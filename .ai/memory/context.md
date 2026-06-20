- **현재 상태**: 마일스톤 13 구현 완료 단계. Auth + Task CRUD + Category CRUD + 리프레시 토큰 O(1) + DailyScore 집계 + 랭킹/백분위 + 프로필/알림/FCM/WebSocket에 더해, `DSM_Back` 안정화/운영성/P0 누락 보강까지 구현했다. 다음 구현 대상은 `DSM_Front` 연동 기반 구축이다.
- **작업 대상**:
  - `DSM_Back`: NestJS 기반 백엔드 API 서버
  - `DSM_Front`: React Native + Expo Router 기반 모바일 클라이언트
- **기술 결정 사항**:
  - DB 접근 계층: Prisma v6 (v7 breaking change로 다운그레이드)
  - DB: PostgreSQL, 모든 시간 필드 UTC (timestamptz)
  - 테스트 환경: PrismaService가 실제 DB 연결을 열지 않음 (NODE_ENV=test 체크)
  - Jest: tsconfig.spec.json 사용 (module: commonjs)
  - 인증: @nestjs/jwt, bcrypt (refresh token hash), google-auth-library, axios (Kakao)
  - Apple Sign In: 구조만 구현, 실제 검증은 Apple Developer 계정 확보 후 구현
  - Access token TTL: 15분 / Refresh token TTL: 30일
- **Task CRUD**: POST/GET/PATCH/DELETE /tasks, PATCH /tasks/:id/complete. 소프트 삭제(deletedAt). 날짜 필터(startAt 기준 UTC day range).
- **Category CRUD**: POST/GET/PATCH/DELETE /categories. 사용자 소유 + 기본(isDefault, userId=null) 카테고리 조회. 기본 카테고리는 읽기 전용(수정/삭제 시 Forbidden), 타 사용자 카테고리는 NotFound로 숨김. 이름 중복 시 Conflict(409, P2002 매핑). 하드 삭제(Task.categoryId는 onDelete SetNull).
- **리프레시 토큰(마일스톤 9)**: 토큰 포맷 `<recordId>.<secret>`. refreshTokens/logout은 parseRefreshToken으로 id 추출 → findUnique(PK) → 단일 bcrypt.compare(O(1)). revoked/expired/malformed/secret불일치 모두 401(logout은 멱등). 스키마 변경 없음. 기존 발급 토큰은 `.` 없어 무효 → 재로그인 필요(pre-production이라 허용). (선택) 재사용 감지 훅은 보류.
- **점수(마일스톤 10)**: scores.policy(순수함수) — 난이도 10/20/30, 보정 100%→1.5·80%→1.3·60%→1.0·그외 0.7, 상한 DAILY_SCORE_CAP=900, 티어 6단계. ScoresService.recompute(userId, dateRef): 해당 UTC일 일과 집계 → DailyScore upsert(@@unique userId_scoreDate) → ΣcappedScore로 User.totalScore/티어 재계산(멱등). 조회: GET /scores?date=(기본 오늘), GET /scores/summary. TasksService가 create/update/remove/complete 후 recompute 호출(update는 변경 전·후 양일, 중복 제거). 스키마 변경 없음.
- **랭킹(마일스톤 11)**: rankings.policy(순수) — computeRanking(higherCount,totalUsers)→rank=higher+1, percentile=round(rank/total*100,2), 전체 유저 기준. RankingsService: getMyRanking(period)=score/rank/percentile/totalUsers, getLeaderboard(period,limit≤100), createSnapshot→RankingSnapshot. 기간: DAILY=오늘 cappedScore, WEEKLY=최근7일 합(groupBy-having), TOTAL=User.totalScore. 조회 시 실시간 계산. GET /rankings, /rankings/leaderboard, POST /rankings/snapshot. 스키마 변경 없음.
- **마일스톤 12 완료**: UsersModule(`/users/me`, 프로필 수정, 알림 설정, 소셜 계정 조회), NotificationsModule(`/notifications/fcm-tokens`, FCM token upsert/revoke, NotificationSchedule cron 처리), RealtimeModule(Socket.IO JWT handshake, ranking subscribe/unsubscribe, score/ranking/leaderboard/notification.due 이벤트)을 구현했다. Task 생성/수정/삭제/완료는 NotificationSchedule을 갱신/취소하고, ScoresService는 `score.recomputed` 이벤트를 발행한다. Auth logout은 선택 `fcmToken`/`deviceId`를 받아 refresh token 검증 후 FCM token을 revoke한다. `User.notificationEnabled=false`, 완료/삭제/알림 OFF task, FCM all/partial failure, invalid token revoke, WebSocket CORS allowlist(`WS_CORS_ORIGINS`)를 테스트로 보강했다. 검증: `npm test -- --runInBand` 22 suites/122 tests 통과, `npm run build` 통과, `npm run lint` 통과, `npm run test:e2e` 1 suite/2 tests 통과. 잔여 리스크: `npm audit --omit=dev` 기준 `multer@2.1.1` high, `uuid@9.0.1` moderate 취약점이 남아 있으며 force fix는 breaking 변경을 제안한다. Redis 랭킹 캐싱/Socket adapter와 더 강한 DB unique 기반 스케줄 중복 방지는 후속 작업.
- **마일스톤 13 완료**: FR-03 일일 일과 등록 20개 제한을 `TasksService`와 task policy로 적용했다. NotificationSchedule은 active `PENDING`/`PROCESSING` task당 1개를 DB partial unique index로 보호하고, stale `PROCESSING` rows를 주기 처리 전에 `PENDING`으로 복구한다. Redis는 `REDIS_URL`이 없으면 no-op fallback으로 동작하며, 설정 시 leaderboard cache와 Socket.IO adapter를 활성화한다. score recompute와 realtime score event는 leaderboard cache를 먼저 invalidate하고 fresh leaderboard를 방송한다. `npm audit --omit=dev` 잔여 취약점은 `docs/reviews/2026-06-20-dsm-back-milestone-13-audit.md`에 기록했고, force fix는 NestJS/Firebase Admin breaking downgrade 때문에 적용하지 않았다. API/WebSocket 계약 문서: `docs/api/DSM_Back_API_v0.md`. 검증은 `npm test -- --runInBand` 25 suites/174 tests, `npm run test:e2e` 1 suite/2 tests, `DATABASE_URL=... npm run prisma:validate`, `npm run build`, `npm run lint` 통과. `npm audit --omit=dev`는 13건(6 moderate, 7 high) 잔여를 확인했고 문서화했다. 최종 독립 리뷰는 Critical/Important 이슈 없이 승인됐다. 회원 탈퇴, 프로필 이미지 스토리지, 알림 방식 세부 설정, Apple Sign In 실제 검증, refresh token 재사용 감지는 P1 이후로 분리했다.
## 2026-06-20 Milestone 14 Planning
- `DSM_Front` integration foundation is documented. The scope is API base URL/env config, shared HTTP client with token injection and refresh retry, SecureStore/localStorage token persistence, AuthProvider, protected Expo Router route groups, typed DSM_Back API modules, React Query setup, first authenticated smoke screens, and Socket.IO client wrapper.
- Design: `docs/superpowers/specs/2026-06-20-dsm-front-milestone-14-integration-foundation-design.md`
- Plan: `docs/superpowers/plans/2026-06-20-dsm-front-milestone-14-integration-foundation.md`
- Deferred: native OAuth UX, push permission/token registration, full product screens, offline sync, and production release setup.

## 2026-06-21 Milestone 14 Implementation
- `DSM_Front` uses Expo SDK 55 public env variables with `EXPO_PUBLIC_` prefixes for API/WS URLs. These values are public client config only and must not contain secrets.
- `src/lib/api/http-client.ts` is the single REST gateway. It injects the current access token, retries once after a successful refresh on 401, and clears local tokens if refresh fails.
- `src/lib/auth/auth-context.tsx` owns app auth state. Native token persistence uses `expo-secure-store`; web uses `localStorage`.
- Expo Router now has a root provider shell, an `(auth)` login route, and a protected `(app)` tab group for dashboard, tasks, and rankings.
- Backend calls are isolated in typed modules under `src/features/*/*.api.ts`; screens consume React Query hooks/functions rather than raw fetch.
- Realtime integration starts with `src/lib/realtime/socket-client.ts`, which authenticates Socket.IO through the `auth.token` handshake and exposes ranking subscribe/unsubscribe helpers.
- ESLint is pinned through `eslint.config.js` using `eslint-config-expo/flat` to avoid `expo lint` auto-configuration during verification.
- Remaining `npm audit --omit=dev` advisories after non-breaking fix are 16 moderate transitive Expo/React Native items that require breaking `--force` dependency changes.

## 2026-06-21 Milestone 15 Planning
- User selected backend-only closure before frontend product work.
- Backend closure will implement only work that does not require external Apple Developer or object storage credentials.
- Account deletion will be hard delete with refresh-token confirmation because the current schema already cascades user-owned records and no retention policy exists yet.
- Notification mode will be stored on `User` as SOUND/VIBRATE/SILENT and surfaced through existing notification settings.
- Refresh token reuse detection will revoke all active sessions only when a revoked token is presented with a matching secret.
- Daily finalization will run at 00:05 UTC for the previous UTC day and create DAILY ranking snapshots.

## 2026-06-21 Milestone 15 Implementation
- `DELETE /users/me` requires an authenticated access token plus a refresh token that belongs to the same user, is not revoked, is not expired, and matches the stored bcrypt hash. The endpoint hard-deletes the user and relies on existing Prisma cascades.
- `NotificationMode` is persisted on `User` with default `SOUND`. `PATCH /users/me/notification-settings` keeps `notificationEnabled` required and accepts optional `notificationMode`.
- FCM reminder payloads keep the existing notification title/body and add `data.notificationMode` for DSM_Front device handling.
- Refresh token reuse detection is limited to revoked tokens whose secret matches the stored hash; wrong-secret revoked tokens are rejected without revoking other sessions.
- UTC daily finalization is owned by `ScoresModule`. The cron runs at `00:05 UTC`, selects active task owners for the previous UTC day, calls `ScoresService.recompute`, and asks `RankingsService` to recreate DAILY snapshots.
- DAILY snapshot recreation uses competition ranking for ties, deletes/recreates inside a transaction for non-empty rows, and uses a unique `(userId, period, snapshotAt)` constraint plus `skipDuplicates` to reduce concurrent duplicate risk.
- Still deferred: real Apple Sign In verification, profile image object storage, and breaking dependency upgrades.
