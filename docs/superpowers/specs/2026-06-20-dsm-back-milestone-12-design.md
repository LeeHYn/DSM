# DSM Back Milestone 12 Design

**목표:** DSM_Back에 프로필/알림 설정, FCM 토큰 관리, 정각 알림 스케줄러, WebSocket 기반 점수/랭킹 실시간 이벤트를 추가한다.

**범위:** Planing Document v1.3의 FR-01 일부(프로필), FR-05, FR-09, NFR-01, NFR-02를 백엔드 우선으로 구현한다. Redis 기반 랭킹 캐싱과 다중 인스턴스 Socket adapter는 인터페이스를 열어두되 이번 구현의 필수 조건은 단일 NestJS 인스턴스에서 검증 가능한 기능 완성이다.

## 1. 모듈 구조

### UsersModule

- 책임: 로그인 사용자 프로필, 소셜 연동 상태, 전체 알림 ON/OFF 설정.
- API:
  - `GET /users/me`
  - `PATCH /users/me/profile`
  - `PATCH /users/me/notification-settings`
  - `GET /users/me/social-accounts`
- 정책:
  - 닉네임 중복은 `409 Conflict`로 반환한다.
  - 프로필 이미지는 URL 문자열만 저장한다. 파일 업로드/스토리지는 별도 마일스톤으로 둔다.

### NotificationsModule

- 책임: FCM 디바이스 토큰 등록/폐기, Task 기반 알림 예약 생성/취소, due schedule 처리, FCM 발송 래핑.
- API:
  - `POST /notifications/fcm-tokens`
  - `DELETE /notifications/fcm-tokens`
- 스케줄 정책:
  - Task 생성 시 `notificationEnabled=true`이고 사용자 전체 알림이 켜져 있으면 `NotificationSchedule(PENDING)`을 만든다.
  - Task 시간 또는 알림 옵션 변경 시 기존 미발송 예약을 갱신하거나 취소한다.
  - Task 삭제 시 미발송 예약을 `CANCELLED`로 바꾼다.
  - cron tick은 `PENDING`이고 `scheduledAt <= now`인 예약만 처리한다.
  - 처리 중복을 줄이기 위해 발송 전 `PROCESSING` 상태로 선점하고, 성공 시 `SENT`, 실패 시 `FAILED`로 전이한다.

### RealtimeModule

- 책임: WebSocket 연결, 인증된 사용자 room, 리더보드 period room, 점수/랭킹 이벤트 송신.
- 이벤트:
  - 클라이언트 수신: `score.updated`, `ranking.updated`, `leaderboard.updated`, `notification.due`
  - 클라이언트 송신: `ranking.subscribe`, `ranking.unsubscribe`
  - 서버 내부: `score.recomputed`, `notification.due`
- 정책:
  - WebSocket handshake는 JWT access token을 사용한다.
  - `ScoresService`는 Gateway를 직접 알지 않고 내부 event publisher만 호출한다.
  - 리더보드 갱신은 변경 사용자 기준 DAILY/WEEKLY/TOTAL 최신 값을 재조회해 구독 room으로 보낸다.

## 2. 데이터 및 환경

- 기존 Prisma 모델 `FcmToken`, `NotificationSchedule`, `User.notificationEnabled`를 사용한다.
- 새 DB 필드는 추가하지 않는다.
- FCM 환경변수는 테스트/개발에서는 선택값으로 유지한다.
- 실제 FCM 발송은 `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`가 모두 있을 때만 활성화하고, 없으면 발송 실패로 명확히 기록한다.

## 3. 오류 처리

- FCM 토큰 등록에서 token 중복은 upsert로 처리하고 `revokedAt`을 `null`로 되돌린다.
- 다른 사용자에게 이미 연결된 token은 모바일 기기 토큰의 단일성을 우선하여 최신 사용자에게 재할당한다.
- 알림 발송 실패는 API 요청 실패로 전파하지 않고 schedule의 `failureReason`에 저장한다.
- WebSocket 브로드캐스트 실패는 HTTP Task/Scores 흐름을 깨지 않도록 로그 후 무시한다.

## 4. 검증 전략

- 각 모듈은 서비스 테스트와 컨트롤러 테스트를 추가한다.
- Task 생성/수정/삭제와 NotificationSchedule 연동을 기존 `TasksService` 테스트에 추가한다.
- `ScoresService.recompute`가 `score.recomputed`를 성공 후에만 발행하는지 테스트한다.
- 전체 백엔드 검증은 `npm test -- --runInBand`, `npm run build`, `npm run lint` 순서로 수행한다.

