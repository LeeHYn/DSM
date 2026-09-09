-- Enforce the interval for every new or updated active Task while allowing
-- deployment to databases that may contain legacy invalid rows. Those rows
-- must be corrected or soft-deleted before this constraint is validated.
ALTER TABLE "Task"
ADD CONSTRAINT "Task_active_interval_order_check"
CHECK ("deletedAt" IS NOT NULL OR "endAt" > "startAt") NOT VALID;
