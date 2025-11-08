-- Rollback migration 166_optimize_dm_queries.sql
-- Use this to revert the changes if needed

BEGIN;

-- 1. Drop the optimized function
DROP FUNCTION IF EXISTS public.dms_list_partners_optimized(UUID, INTEGER, INTEGER);

-- 2. Optionally drop indexes (they are useful, so you might want to keep them)
-- Uncomment if you want to remove indexes:
-- DROP INDEX IF EXISTS idx_dms_messages_thread_sequence;
-- DROP INDEX IF EXISTS idx_dms_thread_participants_user_thread;
-- DROP INDEX IF EXISTS idx_dms_message_receipts_message_user;
-- DROP INDEX IF EXISTS idx_dms_threads_last_message_at;

COMMIT;
