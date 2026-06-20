# DSM_Back API v0

This document is the current backend contract for DSM_Front integration after
Milestone 13. Unless noted otherwise, protected REST endpoints require:

```http
Authorization: Bearer <accessToken>
```

## Auth

### `POST /auth/login`

Social login. The Apple provider is structurally wired, but real verification
still requires Apple Developer configuration before production use.

Request body:

```json
{
  "provider": "GOOGLE | KAKAO | APPLE",
  "token": "provider-id-token-or-access-token"
}
```

Response:

```json
{
  "accessToken": "jwt",
  "refreshToken": "<refreshTokenId>.<secret>"
}
```

### `POST /auth/refresh`

Request body:

```json
{
  "refreshToken": "<refreshTokenId>.<secret>"
}
```

Response is the same token pair shape as login.

### `POST /auth/logout`

Protected. Revokes the refresh token. Optional `fcmToken` or `deviceId` also
revokes the matching FCM token for the current user.

Request body:

```json
{
  "refreshToken": "<refreshTokenId>.<secret>",
  "fcmToken": "optional-token",
  "deviceId": "optional-device-id"
}
```

Response: `204 No Content`.

### `GET /auth/me`

Protected. Returns the authenticated user id.

## Users

### `GET /users/me`

Protected. Returns the current user record.

### `PATCH /users/me/profile`

Protected.

Request body:

```json
{
  "nickname": "optional nickname",
  "profileImageUrl": "optional image url or null"
}
```

### `PATCH /users/me/notification-settings`

Protected.

Request body:

```json
{
  "notificationEnabled": true
}
```

### `GET /users/me/social-accounts`

Protected. Returns connected social account providers.

## Categories

### `POST /categories`

Protected.

Request body:

```json
{
  "name": "Study",
  "color": "#4F46E5"
}
```

### `GET /categories`

Protected. Returns user categories plus default categories.

### `GET /categories/:id`

Protected. Returns a user-owned or default category.

### `PATCH /categories/:id`

Protected. Default categories are read-only.

Request body:

```json
{
  "name": "Updated name",
  "color": "#10B981"
}
```

### `DELETE /categories/:id`

Protected. Soft behavior for related tasks is handled by database relation
rules; default categories cannot be deleted.

Response: `204 No Content`.

## Tasks

### Constraint

Each user can have at most 20 active, non-deleted tasks per UTC day based on
`startAt`. Creating a 21st task, or moving another task into a full UTC day,
returns `409 Conflict`.

### `POST /tasks`

Protected.

Request body:

```json
{
  "title": "Read database chapter",
  "description": "optional",
  "startAt": "2026-06-20T09:00:00.000Z",
  "endAt": "2026-06-20T10:00:00.000Z",
  "difficulty": "EASY | MEDIUM | HARD",
  "categoryId": "optional-category-id",
  "notificationEnabled": true
}
```

### `GET /tasks?date=YYYY-MM-DD`

Protected. Returns tasks whose `startAt` falls in the requested UTC day.

### `GET /tasks/:id`

Protected. Returns one owned task.

### `PATCH /tasks/:id`

Protected.

Request body accepts any subset of:

```json
{
  "title": "Updated title",
  "description": "optional",
  "startAt": "2026-06-20T09:00:00.000Z",
  "endAt": "2026-06-20T10:00:00.000Z",
  "difficulty": "EASY | MEDIUM | HARD",
  "status": "PENDING | COMPLETED",
  "categoryId": "optional-category-id",
  "notificationEnabled": true
}
```

### `DELETE /tasks/:id`

Protected. Soft deletes the task and cancels active notification schedules.

Response: `204 No Content`.

### `PATCH /tasks/:id/complete`

Protected. Marks the task complete and triggers score recomputation.

## Scores

### `GET /scores?date=YYYY-MM-DD`

Protected. Returns the daily score row for the requested date, or `null`.
Omitting `date` uses the current server date.

### `GET /scores/summary`

Protected. Returns:

```json
{
  "totalScore": 1200,
  "tier": "BRONZE | SILVER | GOLD | PLATINUM | DIAMOND | MASTER"
}
```

## Rankings

Accepted periods: `DAILY`, `WEEKLY`, `TOTAL`.

### `GET /rankings?period=DAILY|WEEKLY|TOTAL`

Protected. Returns the current user's ranking for the period.

### `GET /rankings/leaderboard?period=DAILY|WEEKLY|TOTAL&limit=100`

Protected. Returns top leaderboard entries. `limit` is optional and capped at
100. Leaderboard reads use optional Redis cache when `REDIS_URL` is configured.

### `POST /rankings/snapshot`

Protected.

Request body:

```json
{
  "period": "DAILY | WEEKLY | TOTAL"
}
```

Creates a `RankingSnapshot` row for the current user and period.

## Notifications

Task notifications are scheduled from task create/update flows when the user
and the task both have notifications enabled. Milestone 13 enforces at most one
active schedule per task for `PENDING` or `PROCESSING` states and recovers stale
`PROCESSING` rows back to `PENDING`.

### `POST /notifications/fcm-tokens`

Protected.

Request body:

```json
{
  "token": "fcm-token",
  "platform": "ios | android | web",
  "deviceId": "optional-device-id"
}
```

### `DELETE /notifications/fcm-tokens`

Protected. Provide either `token` or `deviceId`.

Request body:

```json
{
  "token": "optional-fcm-token",
  "deviceId": "optional-device-id"
}
```

## WebSocket

Socket.IO gateway uses the same access token as REST.

Handshake token locations:

- `handshake.auth.token`
- `Authorization: Bearer <accessToken>`

Optional multi-instance fan-out is enabled when `REDIS_URL` is configured.
Without Redis, WebSocket delivery remains single-instance.

### Client Events

#### `user.join`

Joins the authenticated user's room.

Response:

```json
{
  "event": "user.joined",
  "room": "user:<userId>"
}
```

#### `ranking.subscribe`

Payload:

```json
{
  "period": "DAILY | WEEKLY | TOTAL"
}
```

Response:

```json
{
  "event": "ranking.subscribed",
  "period": "DAILY",
  "room": "ranking:DAILY"
}
```

#### `ranking.unsubscribe`

Payload shape matches `ranking.subscribe`.

### Server Events

- `score.updated`: emitted to `user:<userId>` after score recomputation.
- `ranking.updated`: emitted to `user:<userId>` with all period rankings.
- `leaderboard.updated`: emitted to `ranking:<period>` with a fresh top-100
  leaderboard.
- `notification.due`: emitted to `user:<userId>` when a notification schedule
  is due.

## Environment Variables

Required:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

Optional:

- `GOOGLE_CLIENT_ID`
- `FCM_PROJECT_ID`
- `FCM_CLIENT_EMAIL`
- `FCM_PRIVATE_KEY`
- `REDIS_URL`
- `RANKING_CACHE_TTL_SECONDS` default `30`
- `NOTIFICATION_DUE_BATCH_SIZE` default `50`
- `NOTIFICATION_PROCESSING_TIMEOUT_SECONDS` default `300`
- `WS_CORS_ORIGINS` comma-separated allowlist
