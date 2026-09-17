-- One logical sync version per task; legacy task data and API shape are retained.
CREATE TABLE "TaskSyncState" (
    "taskId" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "mutationId" TEXT NOT NULL,
    "mutationHash" TEXT NOT NULL,
    "createHash" TEXT,
    CONSTRAINT "TaskSyncState_pkey" PRIMARY KEY ("taskId"),
    CONSTRAINT "TaskSyncState_taskId_fkey" FOREIGN KEY ("taskId")
        REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
