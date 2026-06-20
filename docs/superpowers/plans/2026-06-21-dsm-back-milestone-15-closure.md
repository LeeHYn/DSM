# DSM_Back Milestone 15 Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close backend-only deferred work so DSM_Front product implementation can proceed on a stable API.

**Architecture:** Keep the work inside existing NestJS modules. UsersModule owns account deletion and notification settings, AuthService owns refresh token reuse detection, ScoresModule owns UTC daily finalization, and RankingsService provides snapshot persistence helpers. Prisma remains the source of truth for notification mode.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL, Jest, @nestjs/schedule, Firebase Admin FCM.

---

## File Structure

- Modify: `DSM_Back/prisma/schema.prisma` - add `NotificationMode` enum and `User.notificationMode`.
- Create: `DSM_Back/prisma/migrations/20260621000000_milestone_15_backend_closure/migration.sql` - schema migration.
- Create: `DSM_Back/src/auth/refresh-token.util.ts` - shared refresh token parsing.
- Modify: `DSM_Back/src/auth/auth.service.ts` - reuse detection and shared parser.
- Modify: `DSM_Back/src/auth/auth.service.spec.ts` - reuse tests.
- Create: `DSM_Back/src/users/dto/delete-account.dto.ts` - refresh-token confirmation body.
- Modify: `DSM_Back/src/users/dto/update-notification-settings.dto.ts` - optional notification mode.
- Modify: `DSM_Back/src/users/users.controller.ts` - add `DELETE /users/me`.
- Modify: `DSM_Back/src/users/users.controller.spec.ts` - controller coverage.
- Modify: `DSM_Back/src/users/users.service.ts` - account delete and notification mode persistence.
- Modify: `DSM_Back/src/users/users.service.spec.ts` - service coverage.
- Modify: `DSM_Back/src/notifications/fcm-admin.service.ts` - include notification mode in reminder payload.
- Modify: `DSM_Back/src/notifications/notification-scheduler.service.ts` - load user notification mode and pass it to FCM.
- Modify: `DSM_Back/src/notifications/notifications.service.spec.ts` - scheduler/FCM coverage.
- Create: `DSM_Back/src/scores/daily-score-finalization.service.ts` - UTC finalization cron.
- Modify: `DSM_Back/src/scores/scores.module.ts` - register finalization service.
- Modify: `DSM_Back/src/scores/scores.service.ts` - expose UTC day helper if needed.
- Create or modify: `DSM_Back/src/scores/daily-score-finalization.service.spec.ts` - finalization tests.
- Modify: `DSM_Back/src/rankings/rankings.service.ts` - add daily snapshot creation helper.
- Modify: `DSM_Back/src/rankings/rankings.service.spec.ts` - snapshot helper tests.
- Modify: `docs/api/DSM_Back_API_v0.md` - document new endpoint and fields.
- Create: `docs/reviews/2026-06-21-dsm-back-milestone-15-review.md` - implementation report.
- Modify: `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md` - milestone status.

---

### Task 1: Prisma Schema and Migration

**Files:**
- Modify: `DSM_Back/prisma/schema.prisma`
- Create: `DSM_Back/prisma/migrations/20260621000000_milestone_15_backend_closure/migration.sql`

- [ ] Add Prisma enum and user field:

```prisma
enum NotificationMode {
  SOUND
  VIBRATE
  SILENT
}

model User {
  notificationMode NotificationMode @default(SOUND)
}
```

- [ ] Add migration SQL:

```sql
CREATE TYPE "NotificationMode" AS ENUM ('SOUND', 'VIBRATE', 'SILENT');
ALTER TABLE "User"
ADD COLUMN "notificationMode" "NotificationMode" NOT NULL DEFAULT 'SOUND';
```

- [ ] Run:

```powershell
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run prisma:generate
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run prisma:validate
```

Expected: Prisma client generation and validation pass.

---

### Task 2: Refresh Token Reuse Detection

**Files:**
- Create: `DSM_Back/src/auth/refresh-token.util.ts`
- Modify: `DSM_Back/src/auth/auth.service.ts`
- Modify: `DSM_Back/src/auth/auth.service.spec.ts`

- [ ] Extract refresh token parser:

```ts
import { UnauthorizedException } from '@nestjs/common';

export type ParsedRefreshToken = {
  id: string;
  secret: string;
};

export function parseRefreshToken(token: string): ParsedRefreshToken {
  const idx = token.indexOf('.');
  if (idx <= 0 || idx === token.length - 1) {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }
  return { id: token.slice(0, idx), secret: token.slice(idx + 1) };
}
```

- [ ] Update `AuthService.refreshTokens()` to:

```ts
const { id, secret } = parseRefreshToken(rawRefreshToken);
const record = await this.prisma.refreshToken.findUnique({ where: { id } });

if (!record) throw new UnauthorizedException('Invalid or expired refresh token');

const secretMatches = await bcrypt.compare(secret, record.tokenHash);
if (record.revokedAt !== null) {
  if (secretMatches) {
    await this.revokeActiveRefreshTokens(record.userId);
  }
  throw new UnauthorizedException('Invalid or expired refresh token');
}

if (record.expiresAt <= new Date() || !secretMatches) {
  throw new UnauthorizedException('Invalid or expired refresh token');
}
```

- [ ] Add helper:

```ts
private async revokeActiveRefreshTokens(userId: string): Promise<void> {
  await this.prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
```

- [ ] Add tests:

```ts
it('revokes all active sessions when a rotated refresh token is reused', async () => {
  const hash = await bcrypt.hash('secret', 1);
  prismaMock.refreshToken.findUnique.mockResolvedValue({
    id: 'rt-1',
    userId: MOCK_USER.id,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: new Date(),
  });
  prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 2 });

  await expect(service.refreshTokens('rt-1.secret')).rejects.toThrow(
    UnauthorizedException,
  );
  expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
    where: { userId: MOCK_USER.id, revokedAt: null },
    data: { revokedAt: expect.any(Date) },
  });
});
```

---

### Task 3: Account Deletion API

**Files:**
- Create: `DSM_Back/src/users/dto/delete-account.dto.ts`
- Modify: `DSM_Back/src/users/users.service.ts`
- Modify: `DSM_Back/src/users/users.controller.ts`
- Modify: `DSM_Back/src/users/users.service.spec.ts`
- Modify: `DSM_Back/src/users/users.controller.spec.ts`

- [ ] Create DTO:

```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
```

- [ ] Add controller method:

```ts
@Delete('me')
@HttpCode(HttpStatus.NO_CONTENT)
deleteMe(
  @Req() req: AuthRequest,
  @Body() dto: DeleteAccountDto,
): Promise<void> {
  return this.usersService.deleteMe(req.user.sub, dto);
}
```

- [ ] Add service behavior:

```ts
async deleteMe(userId: string, dto: DeleteAccountDto): Promise<void> {
  const parsed = parseRefreshToken(dto.refreshToken);
  const record = await this.prisma.refreshToken.findUnique({
    where: { id: parsed.id },
  });
  if (
    !record ||
    record.userId !== userId ||
    record.revokedAt !== null ||
    !(await bcrypt.compare(parsed.secret, record.tokenHash))
  ) {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }
  await this.prisma.user.delete({ where: { id: userId } });
}
```

- [ ] Test invalid, foreign, revoked, and valid token cases.

---

### Task 4: Notification Mode Settings

**Files:**
- Modify: `DSM_Back/src/users/dto/update-notification-settings.dto.ts`
- Modify: `DSM_Back/src/users/users.service.ts`
- Modify: `DSM_Back/src/users/users.service.spec.ts`
- Modify: `DSM_Back/src/notifications/fcm-admin.service.ts`
- Modify: `DSM_Back/src/notifications/notification-scheduler.service.ts`
- Modify: `DSM_Back/src/notifications/notifications.service.spec.ts`

- [ ] Update DTO:

```ts
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { NotificationMode } from '@prisma/client';

export class UpdateNotificationSettingsDto {
  @IsBoolean()
  notificationEnabled!: boolean;

  @IsEnum(NotificationMode)
  @IsOptional()
  notificationMode?: NotificationMode;
}
```

- [ ] Update user settings persistence:

```ts
data: {
  notificationEnabled: dto.notificationEnabled,
  ...(dto.notificationMode !== undefined && {
    notificationMode: dto.notificationMode,
  }),
}
```

- [ ] Update FCM reminder signature:

```ts
async sendTaskReminder(
  tokens: string[],
  task: Task,
  notificationMode: NotificationMode,
): Promise<FcmSendResult>
```

- [ ] Include mode in FCM data:

```ts
data: {
  type: 'TASK_REMINDER',
  taskId: task.id,
  notificationMode,
}
```

- [ ] Load user mode in scheduler:

```ts
include: {
  task: true,
  user: { select: { notificationMode: true } },
}
```

- [ ] Pass `schedule.user.notificationMode` to FCM.

---

### Task 5: UTC Daily Finalization and Snapshots

**Files:**
- Create: `DSM_Back/src/scores/daily-score-finalization.service.ts`
- Modify: `DSM_Back/src/scores/scores.module.ts`
- Modify: `DSM_Back/src/rankings/rankings.service.ts`
- Modify: `DSM_Back/src/rankings/rankings.service.spec.ts`
- Create: `DSM_Back/src/scores/daily-score-finalization.service.spec.ts`

- [ ] Create service:

```ts
@Injectable()
export class DailyScoreFinalizationService {
  @Cron('5 0 * * *', { timeZone: 'UTC' })
  async finalizePreviousUtcDayCron(): Promise<void> {
    await this.finalizePreviousUtcDay(new Date());
  }
}
```

- [ ] Add deterministic method:

```ts
async finalizePreviousUtcDay(now: Date): Promise<DailyScoreFinalizationResult> {
  const targetDate = previousUtcDay(now);
  return this.finalizeUtcDay(targetDate);
}
```

- [ ] Finalization flow:

```ts
const users = await this.prisma.task.findMany({
  where: { startAt: { gte: dayStart, lt: nextDay }, deletedAt: null },
  distinct: ['userId'],
  select: { userId: true },
});
for (const { userId } of users) {
  await this.scoresService.recompute(userId, dayStart);
}
await this.rankingsService.createDailySnapshotsForDate(dayStart);
```

- [ ] Add ranking helper:

```ts
async createDailySnapshotsForDate(scoreDate: Date): Promise<number> {
  const rows = await this.prisma.dailyScore.findMany({
    where: { scoreDate },
    orderBy: { cappedScore: 'desc' },
    select: { userId: true, cappedScore: true },
  });
  const totalUsers = await this.prisma.user.count();
  await this.prisma.rankingSnapshot.deleteMany({
    where: { period: RankingPeriod.DAILY, snapshotAt: scoreDate },
  });
  await this.prisma.rankingSnapshot.createMany({
    data: rows.map((row, index) => ({
      userId: row.userId,
      period: RankingPeriod.DAILY,
      score: row.cappedScore,
      rank: index + 1,
      percentile: totalUsers === 0 ? 0 : Math.round(((index + 1) / totalUsers) * 10000) / 100,
      snapshotAt: scoreDate,
    })),
  });
  return rows.length;
}
```

- [ ] Test previous UTC day selection, recompute calls, and idempotent delete/create snapshot behavior.

---

### Task 6: API Docs, Memory, Verification, Commit

**Files:**
- Modify: `docs/api/DSM_Back_API_v0.md`
- Create: `docs/reviews/2026-06-21-dsm-back-milestone-15-review.md`
- Modify: `.ai/memory/plan.md`
- Modify: `.ai/memory/context.md`
- Modify: `.ai/memory/checklist.md`

- [ ] Document:
  - `DELETE /users/me`
  - `notificationMode` in user/settings response
  - refresh token reuse behavior
  - UTC daily finalization cron

- [ ] Run verification:

```powershell
cd C:\DSM\DSM_Back
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' test -- --runInBand
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run test:e2e
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run prisma:validate
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run build
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run lint
```

- [ ] Review final status:

```powershell
cd C:\DSM
& 'C:\Program Files\Git\cmd\git.exe' status --short --branch
```

Expected: tests/build/lint pass and only milestone 15 files are changed.

## Self-Review

- Spec coverage: account deletion, notification mode, refresh reuse detection, UTC finalization, docs, memory, and verification are covered.
- Scope check: Apple Sign In real verification, profile image storage, and forced dependency upgrades are excluded.
- Placeholder scan: no TBD/TODO placeholders remain.
