CREATE TYPE "NotificationMode" AS ENUM ('SOUND', 'VIBRATE', 'SILENT');
ALTER TABLE "User"
ADD COLUMN "notificationMode" "NotificationMode" NOT NULL DEFAULT 'SOUND';
CREATE UNIQUE INDEX "RankingSnapshot_userId_period_snapshotAt_key" ON "RankingSnapshot"("userId", "period", "snapshotAt");
