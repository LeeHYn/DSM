WITH ranked_active_schedules AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "taskId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS dedupe_rank
  FROM "NotificationSchedule"
  WHERE "status" IN ('PENDING', 'PROCESSING')
)
UPDATE "NotificationSchedule" AS schedule
SET
  "status" = 'CANCELLED',
  "sentAt" = NULL,
  "failureReason" = 'DEDUPED_ACTIVE_SCHEDULE'
FROM ranked_active_schedules AS ranked
WHERE schedule."id" = ranked."id"
  AND ranked.dedupe_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationSchedule_one_active_per_task"
ON "NotificationSchedule" ("taskId")
WHERE "status" IN ('PENDING', 'PROCESSING');
