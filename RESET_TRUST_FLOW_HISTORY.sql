-- Reset all Trust Flow history
-- This script deletes all trust pushes from the trust_pushes table

-- Delete all trust pushes
DELETE FROM public.trust_pushes;

-- Verify deletion
SELECT COUNT(*) as remaining_pushes FROM public.trust_pushes;
