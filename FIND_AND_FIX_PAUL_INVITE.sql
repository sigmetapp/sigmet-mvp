-- Find and fix Paul's invite
-- Paul's user_id: c2c8c5e9-d4c6-46bc-a685-5326972b812b
-- Paul registered: 2025-11-17 19:28:05.170017+00

-- Step 1: Check ALL accepted invites that don't have consumed_by_user_id set
-- This is likely the issue - invite was accepted but consumed_by_user_id wasn't set
SELECT 
  i.id,
  i.invite_code,
  i.status,
  i.consumed_by_user_id,
  i.accepted_at,
  i.created_at,
  i.invitee_email,
  inviter.username as inviter_username,
  inviter.user_id as inviter_user_id,
  '⚠️ BUG: Status is accepted but consumed_by_user_id is NULL!' as issue
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
WHERE i.status = 'accepted'
  AND i.consumed_by_user_id IS NULL
ORDER BY i.accepted_at DESC;

-- Step 2: Check invites accepted around Paul's registration time (19:00-21:00)
-- Even if consumed_by_user_id is NULL, we can match by time
SELECT 
  i.id as invite_id,
  i.invite_code,
  i.status,
  i.inviter_user_id,
  i.consumed_by_user_id,
  i.accepted_at,
  i.created_at as invite_created_at,
  i.invitee_email,
  inviter.username as inviter_username,
  CASE 
    WHEN i.accepted_at BETWEEN '2025-11-17 19:00:00'::timestamptz AND '2025-11-17 21:00:00'::timestamptz 
      AND i.consumed_by_user_id IS NULL THEN '⚠️ Likely Paul - Accepted around registration time but consumed_by_user_id is NULL!'
    WHEN i.accepted_at BETWEEN '2025-11-17 19:00:00'::timestamptz AND '2025-11-17 21:00:00'::timestamptz THEN '⏰ Accepted around Paul registration time'
    ELSE 'Other'
  END as match_status
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
WHERE i.status = 'accepted'
  AND i.accepted_at BETWEEN '2025-11-17 19:00:00'::timestamptz AND '2025-11-17 21:00:00'::timestamptz
ORDER BY i.accepted_at DESC;

-- Step 3: Check invites accepted right after Paul registered (19:28-20:00)
SELECT 
  i.id as invite_id,
  i.invite_code,
  i.status,
  i.inviter_user_id,
  i.consumed_by_user_id,
  i.accepted_at,
  i.created_at as invite_created_at,
  i.invitee_email,
  inviter.username as inviter_username,
  CASE 
    WHEN i.accepted_at > '2025-11-17 19:28:05'::timestamptz 
      AND i.accepted_at < '2025-11-17 20:00:00'::timestamptz 
      AND i.consumed_by_user_id IS NULL THEN '⚠️ VERY LIKELY PAUL - Accepted right after registration but consumed_by_user_id is NULL!'
    WHEN i.accepted_at > '2025-11-17 19:28:05'::timestamptz 
      AND i.accepted_at < '2025-11-17 20:00:00'::timestamptz THEN '⏰ Accepted right after Paul registered'
    ELSE 'Other'
  END as match_status
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
WHERE i.status = 'accepted'
  AND i.accepted_at > '2025-11-17 19:28:05'::timestamptz
  AND i.accepted_at < '2025-11-17 20:00:00'::timestamptz
ORDER BY i.accepted_at ASC;

-- Step 4: If we find an invite in Step 2 or Step 3 with consumed_by_user_id = NULL,
-- we can fix it by running this UPDATE (replace INVITE_ID with the actual invite_id)
-- UPDATE public.invites
-- SET 
--   consumed_by_user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b',
--   accepted_at = COALESCE(accepted_at, '2025-11-17 19:28:05'::timestamptz)
-- WHERE id = 'INVITE_ID_HERE'
--   AND consumed_by_user_id IS NULL
-- RETURNING 
--   id,
--   invite_code,
--   status,
--   consumed_by_user_id,
--   accepted_at;
