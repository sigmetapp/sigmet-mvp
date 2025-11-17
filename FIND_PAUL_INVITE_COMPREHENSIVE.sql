-- Comprehensive search for Paul's invite
-- Paul's user_id: c2c8c5e9-d4c6-46bc-a685-5326972b812b

-- Step 1: Check if there are ANY invites with consumed_by_user_id matching Paul
SELECT 
  i.id as invite_id,
  i.invite_code,
  i.status,
  i.inviter_user_id,
  i.consumed_by_user_id,
  i.consumed_by_user_sw,
  i.created_at as invite_created_at,
  i.accepted_at,
  i.invitee_email,
  inviter.username as inviter_username,
  consumer.username as consumer_username
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.consumed_by_user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b';

-- Step 2: Check invite_events for Paul's user_id (this might show acceptance even if consumed_by_user_id is not set)
SELECT 
  ie.id as event_id,
  ie.invite_id,
  ie.event,
  ie.meta,
  ie.created_at as event_created_at,
  i.invite_code,
  i.status as current_status,
  i.inviter_user_id,
  i.consumed_by_user_id,
  inviter.username as inviter_username,
  consumer.username as consumer_username
FROM public.invite_events ie
JOIN public.invites i ON ie.invite_id = i.id
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE (ie.meta->>'user_id')::uuid = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b'
  OR i.consumed_by_user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b'
ORDER BY ie.created_at DESC;

-- Step 3: Check all invites where invitee_email might match Paul's email
-- First, let's get Paul's email from auth.users
SELECT 
  au.id as user_id,
  au.email,
  p.username,
  p.full_name
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.user_id
WHERE au.id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b';

-- Step 4: Check invites by invitee_email (if we know Paul's email from Step 3)
-- Replace 'PAUL_EMAIL_HERE' with the email from Step 3
SELECT 
  i.id as invite_id,
  i.invite_code,
  i.status,
  i.inviter_user_id,
  i.consumed_by_user_id,
  i.invitee_email,
  i.created_at,
  i.accepted_at,
  inviter.username as inviter_username,
  consumer.username as consumer_username
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE LOWER(i.invitee_email) = LOWER('PAUL_EMAIL_HERE')  -- Replace with email from Step 3
ORDER BY i.created_at DESC;

-- Step 5: Check ALL invites that were accepted around the time Paul registered
-- Paul registered: 2025-11-17 19:28:05.170017+00
-- Check invites accepted within 1 hour of Paul's registration
SELECT 
  i.id as invite_id,
  i.invite_code,
  i.status,
  i.inviter_user_id,
  i.consumed_by_user_id,
  i.consumed_by_user_sw,
  i.created_at as invite_created_at,
  i.accepted_at,
  i.invitee_email,
  inviter.username as inviter_username,
  consumer.username as consumer_username,
  consumer.user_id as consumer_user_id
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.status = 'accepted'
  AND i.accepted_at BETWEEN '2025-11-17 19:00:00'::timestamptz AND '2025-11-17 20:00:00'::timestamptz
ORDER BY i.accepted_at DESC;

-- Step 6: Check if there are any invites with pending status but consumed_by_user_id is set
-- This might be the issue - invite was consumed but status wasn't updated
SELECT 
  i.id,
  i.invite_code,
  i.status,
  i.consumed_by_user_id,
  i.accepted_at,
  i.created_at,
  consumer.username as consumer_username,
  consumer.user_id as consumer_user_id,
  '⚠️ BUG: Status is pending but consumed_by_user_id is set!' as issue
FROM public.invites i
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.status = 'pending' 
  AND i.consumed_by_user_id IS NOT NULL
ORDER BY i.created_at DESC;

-- Step 7: Check all accepted invites to see if any match Paul's registration time
SELECT 
  i.id as invite_id,
  i.invite_code,
  i.status,
  i.inviter_user_id,
  i.consumed_by_user_id,
  i.consumed_by_user_sw,
  i.created_at as invite_created_at,
  i.accepted_at,
  i.invitee_email,
  inviter.username as inviter_username,
  consumer.username as consumer_username,
  consumer.user_id as consumer_user_id,
  p.username as paul_username,
  p.user_id as paul_user_id,
  CASE 
    WHEN consumer.user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b' THEN '✅ This is Paul!'
    WHEN i.accepted_at BETWEEN '2025-11-17 19:00:00'::timestamptz AND '2025-11-17 20:00:00'::timestamptz 
      AND consumer.user_id IS NULL THEN '⚠️ Accepted around Paul registration time but consumed_by_user_id is NULL!'
    ELSE 'Other user'
  END as match_status
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
CROSS JOIN (SELECT user_id, username FROM public.profiles WHERE user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b') p
WHERE i.status = 'accepted'
  AND (
    i.accepted_at BETWEEN '2025-11-17 19:00:00'::timestamptz AND '2025-11-17 20:00:00'::timestamptz
    OR consumer.user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b'
  )
ORDER BY i.accepted_at DESC;
