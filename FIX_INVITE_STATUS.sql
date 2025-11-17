-- Fix invite status if it's pending but consumed_by_user_id is set
-- This can happen if accept_invite_by_code was called but status wasn't updated properly

-- Step 1: Check for invites that need fixing
SELECT 
  i.id,
  i.invite_code,
  i.status,
  i.consumed_by_user_id,
  i.accepted_at,
  i.created_at,
  consumer.username as consumer_username,
  '⚠️ Needs fixing: Status is pending but consumed_by_user_id is set!' as issue
FROM public.invites i
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.status = 'pending' 
  AND i.consumed_by_user_id IS NOT NULL
ORDER BY i.created_at DESC;

-- Step 2: Fix the status for invites that have consumed_by_user_id but status is still pending
-- This will update the status to 'accepted' and set accepted_at if it's null
UPDATE public.invites
SET 
  status = 'accepted',
  accepted_at = COALESCE(accepted_at, created_at + interval '1 minute')
WHERE status = 'pending' 
  AND consumed_by_user_id IS NOT NULL
RETURNING 
  id,
  invite_code,
  status,
  consumed_by_user_id,
  accepted_at;

-- Step 3: Verify the fix
SELECT 
  i.id,
  i.invite_code,
  i.status,
  i.consumed_by_user_id,
  i.accepted_at,
  consumer.username as consumer_username,
  '✅ Fixed!' as status
FROM public.invites i
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.consumed_by_user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b'  -- Paul's user_id
ORDER BY i.accepted_at DESC;

-- Step 4: Check if there are any invites with accepted status but missing accepted_at
SELECT 
  i.id,
  i.invite_code,
  i.status,
  i.consumed_by_user_id,
  i.accepted_at,
  i.created_at,
  consumer.username as consumer_username,
  '⚠️ Needs fixing: Status is accepted but accepted_at is NULL!' as issue
FROM public.invites i
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.status = 'accepted' 
  AND i.accepted_at IS NULL
ORDER BY i.created_at DESC;

-- Step 5: Fix accepted_at for invites that are accepted but missing accepted_at
UPDATE public.invites
SET 
  accepted_at = COALESCE(accepted_at, created_at + interval '1 minute')
WHERE status = 'accepted' 
  AND accepted_at IS NULL
RETURNING 
  id,
  invite_code,
  status,
  consumed_by_user_id,
  accepted_at;
