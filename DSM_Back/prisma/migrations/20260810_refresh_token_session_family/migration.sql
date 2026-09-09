-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "sessionId" TEXT;

-- Backfill legacy rows
UPDATE "RefreshToken" SET "sessionId" = "id" WHERE "sessionId" IS NULL;

-- AlterTable
ALTER TABLE "RefreshToken" ALTER COLUMN "sessionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "RefreshToken_userId_sessionId_idx" ON "RefreshToken"("userId", "sessionId");
