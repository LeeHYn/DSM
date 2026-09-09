-- Preserve legacy snapshots without rewriting or deleting them. New and
-- updated rows must identify their UTC-day bucket.
ALTER TABLE "RankingSnapshot"
ADD COLUMN "snapshotDate" DATE;

ALTER TABLE "RankingSnapshot"
ADD CONSTRAINT "RankingSnapshot_snapshotDate_required"
CHECK ("snapshotDate" IS NOT NULL) NOT VALID;

CREATE UNIQUE INDEX "RankingSnapshot_userId_period_snapshotDate_key"
ON "RankingSnapshot"("userId", "period", "snapshotDate")
WHERE "snapshotDate" IS NOT NULL;
