import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('20260825 integration backend migration', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260825_integration_backend_deltas',
      'migration.sql',
    ),
    'utf8',
  );

  it('deduplicates active schedules before creating the exact partial unique index', () => {
    const updateOffset = migration.indexOf('UPDATE "NotificationSchedule" AS schedule');
    const indexOffset = migration.indexOf(
      'CREATE UNIQUE INDEX "NotificationSchedule_one_active_per_task"',
    );

    expect(updateOffset).toBeGreaterThanOrEqual(0);
    expect(indexOffset).toBeGreaterThan(updateOffset);
    expect(migration).toContain('ORDER BY "createdAt" DESC, "id" DESC');
    expect(migration).toContain('"failureReason" = \'DEDUPED_ACTIVE_SCHEDULE\'');
    expect(migration).toContain('ON "NotificationSchedule" ("taskId")');
    expect(
      migration.match(/WHERE "status" IN \('PENDING', 'PROCESSING'\)/g),
    ).toHaveLength(2);
    expect(migration).not.toContain('IF NOT EXISTS');
  });
});
