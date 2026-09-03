BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

WITH task_facts AS (
    SELECT
        task."userId" AS user_id,
        (task."startAt" AT TIME ZONE 'UTC')::date AS score_date,
        (
            task."status" = 'COMPLETED'
            AND task."completedAt" IS NOT NULL
            AND task."completedAt" >= (
                ((task."startAt" AT TIME ZONE 'UTC')::date)::timestamp
                AT TIME ZONE 'UTC'
            )
            AND task."completedAt" < (
                (((task."startAt" AT TIME ZONE 'UTC')::date + 1)::timestamp)
                AT TIME ZONE 'UTC'
            )
        ) AS eligible,
        CASE task."difficulty"
            WHEN 'LOW' THEN 10
            WHEN 'MEDIUM' THEN 20
            WHEN 'HIGH' THEN 30
        END AS difficulty_score
    FROM "Task" AS task
    WHERE task."deletedAt" IS NULL
),
daily_aggregate AS (
    SELECT
        user_id,
        score_date,
        COUNT(*)::integer AS registered_count,
        (COUNT(*) FILTER (WHERE eligible))::integer AS completed_count,
        COALESCE(
            SUM(CASE WHEN eligible THEN difficulty_score ELSE 0 END),
            0
        )::integer AS raw_score
    FROM task_facts
    GROUP BY user_id, score_date
),
weighted AS (
    SELECT
        daily_aggregate.*,
        CASE
            WHEN completed_count = registered_count THEN 1.5::numeric
            WHEN completed_count * 5 >= registered_count * 4 THEN 1.3::numeric
            WHEN completed_count * 5 >= registered_count * 3 THEN 1.0::numeric
            ELSE 0.7::numeric
        END AS multiplier
    FROM daily_aggregate
),
projected AS (
    SELECT
        user_id,
        score_date,
        registered_count,
        completed_count,
        raw_score,
        ROUND(raw_score::numeric * multiplier)::integer AS adjusted_score,
        LEAST(
            ROUND(raw_score::numeric * multiplier)::integer,
            900
        ) AS capped_score,
        (
            ROUND(completed_count::numeric * 10000 / registered_count) / 100
        )::numeric(5, 2) AS achievement_rate
    FROM weighted
)
INSERT INTO "DailyScore" (
    "id",
    "userId",
    "scoreDate",
    "rawScore",
    "achievementRate",
    "adjustedScore",
    "cappedScore",
    "completedTaskCount",
    "registeredTaskCount",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    user_id,
    score_date,
    raw_score,
    achievement_rate,
    adjusted_score,
    capped_score,
    completed_count,
    registered_count,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM projected
ON CONFLICT ("userId", "scoreDate") DO UPDATE SET
    "rawScore" = EXCLUDED."rawScore",
    "achievementRate" = EXCLUDED."achievementRate",
    "adjustedScore" = EXCLUDED."adjustedScore",
    "cappedScore" = EXCLUDED."cappedScore",
    "completedTaskCount" = EXCLUDED."completedTaskCount",
    "registeredTaskCount" = EXCLUDED."registeredTaskCount",
    "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "DailyScore" AS daily_score
SET
    "rawScore" = 0,
    "achievementRate" = 0.00,
    "adjustedScore" = 0,
    "cappedScore" = 0,
    "completedTaskCount" = 0,
    "registeredTaskCount" = 0,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1
    FROM "Task" AS task
    WHERE task."userId" = daily_score."userId"
        AND task."deletedAt" IS NULL
        AND (task."startAt" AT TIME ZONE 'UTC')::date = daily_score."scoreDate"
);

WITH user_totals AS (
    SELECT
        app_user."id" AS user_id,
        COALESCE(SUM(daily_score."cappedScore"), 0)::integer AS total_score
    FROM "User" AS app_user
    LEFT JOIN "DailyScore" AS daily_score
        ON daily_score."userId" = app_user."id"
    GROUP BY app_user."id"
)
UPDATE "User" AS app_user
SET
    "totalScore" = user_totals.total_score,
    "tier" = (
        CASE
            WHEN user_totals.total_score >= 30000 THEN 'MASTER'
            WHEN user_totals.total_score >= 15000 THEN 'DIAMOND'
            WHEN user_totals.total_score >= 7000 THEN 'PLATINUM'
            WHEN user_totals.total_score >= 3000 THEN 'GOLD'
            WHEN user_totals.total_score >= 1000 THEN 'SILVER'
            ELSE 'BRONZE'
        END
    )::"Tier",
    "updatedAt" = CURRENT_TIMESTAMP
FROM user_totals
WHERE app_user."id" = user_totals.user_id;

COMMIT;
