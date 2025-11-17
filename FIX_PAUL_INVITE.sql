-- Fix Paul's invite if consumed_by_user_id is not set correctly
-- Paul's email: paulcizan@gmail.com
-- Paul's user_id: c2c8c5e9-d4c6-46bc-a685-5326972b812b

-- Step 1: Check current state of Paul's invite
SELECT 
  i.id as invite_id,
  i.invite_code,
  i.status,
  i.inviter_user_id,
  i.consumed_by_user_id,
  i.consumed_by_user_sw,
  i.accepted_at,
  i.invitee_email,
  CASE 
    WHEN i.status = 'accepted' AND i.consumed_by_user_id IS NULL THEN '⚠️ Needs fix: Status is accepted but consumed_by_user_id is NULL!'
    WHEN i.status = 'accepted' AND i.consumed_by_user_id != 'c2c8c5e9-d4c6-46bc-a685-5326972b812b' THEN '⚠️ Needs fix: Status is accepted but consumed_by_user_id is wrong!'
    WHEN i.status = 'pending' AND i.consumed_by_user_id IS NOT NULL THEN '⚠️ Needs fix: Status is pending but consumed_by_user_id is set!'
    WHEN i.status = 'accepted' AND i.consumed_by_user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b' THEN '✅ Already correct!'
    ELSE '❓ Check needed'
  END as issue_status
FROM public.invites i
WHERE LOWER(i.invitee_email) = LOWER('paulcizan@gmail.com');

-- Step 2: Fix if status is 'accepted' but consumed_by_user_id is NULL or wrong
UPDATE public.invites
SET 
  consumed_by_user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b',
  accepted_at = COALESCE(accepted_at, created_at + interval '1 minute')
WHERE LOWER(invitee_email) = LOWER('paulcizan@gmail.com')
  AND status = 'accepted'
  AND (consumed_by_user_id IS NULL OR consumed_by_user_id != 'c2c8c5e9-d4c6-46bc-a685-5326972b812b')
RETURNING 
  id,
  invite_code,
  status,
  consumed_by_user_id,
  accepted_at;

-- Step 3: Fix if status is 'pending' but consumed_by_user_id is set (should be 'accepted')
UPDATE public.invites
SET 
  status = 'accepted',
  accepted_at = COALESCE(accepted_at, created_at + interval '1 minute')
WHERE LOWER(invitee_email) = LOWER('paulcizan@gmail.com')
  AND status = 'pending'
  AND consumed_by_user_id IS NOT NULL
RETURNING 
  id,
  invite_code,
  status,
  consumed_by_user_id,
  accepted_at;

-- Step 4: Verify the fix
SELECT 
  i.id as invite_id,
  i.invite_code,
  i.status,
  i.inviter_user_id,
  i.consumed_by_user_id,
  i.consumed_by_user_sw,
  i.accepted_at,
  i.invitee_email,
  inviter.username as inviter_username,
  consumer.username as consumer_username,
  '✅ Fixed!' as status
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE LOWER(i.invitee_email) = LOWER('paulcizan@gmail.com');
