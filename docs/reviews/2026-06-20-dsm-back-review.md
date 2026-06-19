# DSM_Back Milestone 12 Review Report

## 요약

마일스톤 12는 `DSM_Back` 기준으로 구현 완료로 판정한다. Planing Document v1.3의 백엔드 우선 범위인 프로필/알림 설정, FCM 토큰 관리, NotificationSchedule 기반 정각 알림, WebSocket 점수/랭킹/알림 이벤트를 추가했고, 기존 Auth/Task/Scores 흐름과 통합했다.

## 구현 범위

- `UsersModule`
  - `GET /users/me`
  - `PATCH /users/me/profile`
  - `PATCH /users/me/notification-settings`
  - `GET /users/me/social-accounts`
  - 알림 OFF 시 기존 `PENDING` NotificationSchedule 취소
- `NotificationsModule`
  - `POST /notifications/fcm-tokens`
  - `DELETE /notifications/fcm-tokens`
  - FCM token `upsert`, revoke, active token 조회
  - Task schedule 생성/갱신/취소
  - cron due schedule 처리: `PENDING -> PROCESSING -> SENT/FAILED`
  - 사용자/Task 알림 설정, Task status/deletedAt 재검증
  - FCM all-failed/partial-failed 처리 및 invalid token revoke
- `RealtimeModule`
  - Socket.IO JWT handshake
  - user room 및 ranking period room
  - `score.updated`, `ranking.updated`, `leaderboard.updated`, `notification.due`
  - `WS_CORS_ORIGINS` 기반 WebSocket CORS allowlist
- 기존 모듈 연동
  - `TasksService`: create/update/remove/complete 시 schedule 갱신/취소
  - `ScoresService`: recompute 성공 후 `score.recomputed` 이벤트 발행
  - `AuthService.logout`: refresh token 소유 검증 후 선택 FCM token/device revoke

## 검증 증거

- `npm test -- --runInBand`: 22 suites / 122 tests 통과
- `npm run build`: 통과
- `npm run lint`: 통과
- `npm run test:e2e`: 1 suite / 2 tests 통과
- `npm audit --omit=dev`: 잔여 13 vulnerabilities(6 moderate, 7 high)

## 리뷰 결과

### Critical

없음.

### Important

없음. 코드 리뷰에서 발견된 전역 알림 OFF 후 stale push, 완료/삭제 task 알림, FCM BatchResponse 무시, `notification.due` 미구현, scheduler query-to-lock race는 테스트를 먼저 추가한 뒤 수정했다.

### Minor / Residual Risk

1. `multer@2.1.1` high, `uuid@9.0.1` moderate audit 항목이 남아 있다. `npm audit fix --force`는 Nest/Firebase 관련 breaking 변경을 제안하므로 별도 dependency 업데이트 작업으로 분리한다.
2. NotificationSchedule 중복 생성은 Serializable transaction으로 완화했지만, PostgreSQL partial unique index 같은 DB 레벨 보강은 아직 없다.
3. Redis 기반 랭킹 캐시와 Socket.IO adapter는 아직 후속 최적화 범위다. 현재 구현은 단일 NestJS 인스턴스 기준이다.
4. FCM invalid token 판정은 대표 error code 중심이다. 운영 로그를 보고 revoke 대상 code를 확장할 필요가 있다.
5. 회원 탈퇴, 프로필 이미지 업로드/스토리지, 알림 방식(소리/진동/무음) 세부 설정은 아직 별도 마일스톤이다.

## 결론

현재 소스는 마일스톤 12의 백엔드 우선 요구사항을 충족하며, 검증 명령이 통과했다. 잔여 항목은 기능 미완료라기보다 운영/확장성/의존성 안정화 성격으로 후속 마일스톤에서 다루는 것이 적절하다.
