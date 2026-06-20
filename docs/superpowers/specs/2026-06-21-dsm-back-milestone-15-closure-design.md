# DSM_Back Milestone 15 Closure Design

## Goal

Close the remaining backend-only work before DSM_Front product screens become the primary focus. This milestone excludes items that require external Apple Developer or object storage configuration.

## Scope

Included:

- Account deletion API with refresh-token confirmation.
- Notification mode settings for sound, vibration, and silent preferences.
- Refresh token reuse detection with full active-session revocation.
- UTC daily score finalization and daily ranking snapshot cron.
- Backend API contract, memory, and review updates.

Excluded:

- Real Apple Sign In verification, because Apple Developer configuration is required.
- Profile image upload/storage, because the storage provider and credentials are not finalized.
- Breaking dependency upgrades for audit advisories. Non-breaking fixes can be rechecked, but forced upgrades remain a separate dependency milestone.

## Design

### Account Deletion

Add `DELETE /users/me`.

The route remains protected by `JwtAuthGuard`, and the request body requires a refresh token. The service verifies that the refresh token belongs to the authenticated user before deleting the user. Deleting the `User` row uses existing Prisma cascade relations to remove social accounts, refresh tokens, FCM tokens, categories, tasks, daily scores, ranking snapshots, and notification schedules.

This is intentionally a hard delete because the app has no legal retention or soft-deletion policy yet. If retention becomes required later, this endpoint should move to a deactivation/anonymization model.

### Notification Mode

Add Prisma enum:

```prisma
enum NotificationMode {
  SOUND
  VIBRATE
  SILENT
}
```

Add `User.notificationMode NotificationMode @default(SOUND)`.

`PATCH /users/me/notification-settings` accepts:

```json
{
  "notificationEnabled": true,
  "notificationMode": "SOUND | VIBRATE | SILENT"
}
```

`notificationEnabled=false` still cancels pending schedules. `notificationMode` is persisted and returned with the user. FCM reminder payloads include `notificationMode` in `data` so the client can render the chosen behavior. The backend keeps the existing notification title/body payload for compatibility.

### Refresh Token Reuse Detection

`AuthService.refreshTokens()` currently rejects revoked refresh tokens. In this milestone, when a refresh request presents a revoked token whose secret still matches the stored hash, the backend treats it as rotated-token reuse and revokes all active refresh tokens for that user.

Rules:

- Missing token record: reject with 401.
- Expired token: reject with 401.
- Active token with wrong secret: reject with 401.
- Revoked token with wrong secret: reject with 401 and do not revoke other sessions.
- Revoked token with matching secret: revoke all active refresh tokens for the owning user, then reject with 401.

### UTC Daily Finalization

Add a scheduled backend job at `00:05 UTC`.

The job finalizes the previous UTC day:

1. Find users with active or historical tasks whose `startAt` falls within that UTC day.
2. Recompute each user's daily score for that date using `ScoresService.recompute()`.
3. Create DAILY ranking snapshots for users with a daily score row for that finalized date.
4. Make snapshot generation idempotent by deleting existing DAILY snapshots for that `snapshotAt` date before recreating them.

The cron will call a public method that accepts a `Date`, so tests can run deterministically without waiting for a real clock.

## API Contract Updates

- `DELETE /users/me`
- `PATCH /users/me/notification-settings` gains `notificationMode`
- User responses gain `notificationMode`

## Testing Strategy

- Unit tests for refresh token reuse detection.
- Unit tests for account deletion requiring owned refresh token confirmation.
- Controller tests for `DELETE /users/me`.
- Unit tests for notification mode update and schedule cancellation behavior.
- Unit tests for FCM payload mode propagation.
- Unit tests for daily finalization selecting the previous UTC day, recomputing scores, and recreating daily snapshots.
- Existing backend test/build/lint/e2e verification after implementation.

## Risks

- Hard-deleting users is irreversible. It is acceptable for the current pre-production state but should be revisited before public launch if retention requirements appear.
- Silent/vibration behavior ultimately depends on native push handling. This milestone stores and transports the preference; exact device behavior can be refined when DSM_Front push handling is implemented.
- Daily snapshot creation can be expensive with many users. The current implementation is acceptable for pre-production and can be batch-paginated later.
