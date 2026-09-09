-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('GOOGLE', 'KAKAO', 'APPLE');

-- CreateEnum
CREATE TYPE "TaskDifficulty" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RankingPeriod" AS ENUM ('DAILY', 'WEEKLY', 'TOTAL');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'MASTER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "nickname" TEXT NOT NULL,
    "profileImageUrl" TEXT,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "tier" "Tier" NOT NULL DEFAULT 'BRONZE',
    "notificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FcmToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT,
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "FcmToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "completedAt" TIMESTAMPTZ(6),
    "difficulty" "TaskDifficulty" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "notificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scoreDate" DATE NOT NULL,
    "registeredTaskCount" INTEGER NOT NULL DEFAULT 0,
    "completedTaskCount" INTEGER NOT NULL DEFAULT 0,
    "rawScore" INTEGER NOT NULL DEFAULT 0,
    "adjustedScore" INTEGER NOT NULL DEFAULT 0,
    "cappedScore" INTEGER NOT NULL DEFAULT 0,
    "achievementRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DailyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" "RankingPeriod" NOT NULL,
    "rank" INTEGER NOT NULL,
    "percentile" DECIMAL(5,2) NOT NULL,
    "score" INTEGER NOT NULL,
    "snapshotAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSchedule" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMPTZ(6) NOT NULL,
    "sentAt" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "fcmTokenId" TEXT NOT NULL,
    "tokenUpdatedAt" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(6),
    "processingStartedAt" TIMESTAMPTZ(6),
    "claimId" TEXT,
    "sentAt" TIMESTAMPTZ(6),
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_tier_idx" ON "User"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_nickname_key" ON "User"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_provider_providerUserId_key" ON "SocialAccount"("provider", "providerUserId");

-- CreateIndex
CREATE INDEX "SocialAccount_userId_idx" ON "SocialAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "FcmToken_token_key" ON "FcmToken"("token");

-- CreateIndex
CREATE INDEX "FcmToken_userId_revokedAt_idx" ON "FcmToken"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_name_key" ON "Category"("userId", "name");

-- CreateIndex
CREATE INDEX "Category_userId_idx" ON "Category"("userId");

-- CreateIndex
CREATE INDEX "Task_userId_startAt_idx" ON "Task"("userId", "startAt");

-- CreateIndex
CREATE INDEX "Task_userId_updatedAt_idx" ON "Task"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Task_categoryId_idx" ON "Task"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyScore_userId_scoreDate_key" ON "DailyScore"("userId", "scoreDate");

-- CreateIndex
CREATE INDEX "DailyScore_scoreDate_cappedScore_idx" ON "DailyScore"("scoreDate", "cappedScore");

-- CreateIndex
CREATE INDEX "RankingSnapshot_period_snapshotAt_rank_idx" ON "RankingSnapshot"("period", "snapshotAt", "rank");

-- CreateIndex
CREATE INDEX "RankingSnapshot_userId_period_snapshotAt_idx" ON "RankingSnapshot"("userId", "period", "snapshotAt");

-- CreateIndex
CREATE INDEX "NotificationSchedule_scheduledAt_status_idx" ON "NotificationSchedule"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "NotificationSchedule_userId_scheduledAt_idx" ON "NotificationSchedule"("userId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_scheduleId_fcmTokenId_key" ON "NotificationDelivery"("scheduleId", "fcmTokenId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_retry_due_idx" ON "NotificationDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_stale_lease_idx" ON "NotificationDelivery"("status", "processingStartedAt");

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FcmToken" ADD CONSTRAINT "FcmToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyScore" ADD CONSTRAINT "DailyScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingSnapshot" ADD CONSTRAINT "RankingSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSchedule" ADD CONSTRAINT "NotificationSchedule_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSchedule" ADD CONSTRAINT "NotificationSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "NotificationSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_fcmTokenId_fkey" FOREIGN KEY ("fcmTokenId") REFERENCES "FcmToken"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
