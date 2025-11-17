-- Find which invite was used by user Paul
-- Run this in Supabase SQL Editor to check which invite Paul used

-- Step 1: Find user Paul
SELECT 
  user_id,
  username,
  full_name,
  created_at as user_created_at
FROM public.profiles
WHERE username = 'Paul' OR username ILIKE 'paul%'
LIMIT 1;

-- Step 2: Find the invite that Paul consumed (replace USER_ID with result from Step 1)
-- This shows the invite code, status, and who created it
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
  inviter.full_name as inviter_full_name,
  consumer.username as consumer_username,
  consumer.full_name as consumer_full_name,
  CASE 
    WHEN i.status = 'accepted' AND i.consumed_by_user_id IS NOT NULL THEN '✅ Accepted by ' || COALESCE(consumer.username, 'user')
    WHEN i.status = 'pending' THEN '⏳ Pending'
    WHEN i.status = 'expired' THEN '❌ Expired'
    WHEN i.status = 'revoked' THEN '🚫 Revoked'
    ELSE '❓ Unknown status'
  END as status_description
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE consumer.username = 'Paul' OR consumer.username ILIKE 'paul%'
ORDER BY i.accepted_at DESC NULLS LAST, i.created_at DESC
LIMIT 5;

-- Step 3: Check all invites created by you (replace YOUR_USER_ID with your actual user_id)
-- This shows all your invites and which ones are accepted
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
  consumer.username as used_by_username,
  consumer.full_name as used_by_full_name,
  CASE 
    WHEN i.status = 'accepted' AND i.consumed_by_user_id IS NOT NULL THEN '✅ Accepted by ' || COALESCE(consumer.username, 'user')
    WHEN i.status = 'pending' THEN '⏳ Pending'
    WHEN i.status = 'expired' THEN '❌ Expired'
    WHEN i.status = 'revoked' THEN '🚫 Revoked'
    ELSE '❓ Unknown status'
  END as status_description
FROM public.invites i
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.inviter_user_id = 'YOUR_USER_ID_HERE'  -- Replace with your user_id
ORDER BY i.created_at DESC;

-- Step 4: Check invite events for Paul (to see acceptance history)
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
WHERE (consumer.username = 'Paul' OR consumer.username ILIKE 'paul%')
  OR (ie.meta->>'user_id')::uuid IN (
    SELECT user_id FROM public.profiles WHERE username = 'Paul' OR username ILIKE 'paul%'
  )
ORDER BY ie.created_at DESC
LIMIT 10;

-- Step 5: Check if there are any invites with status 'pending' but consumed_by_user_id is set
-- This would indicate a bug where status wasn't updated properly
SELECT 
  i.id,
  i.invite_code,
  i.status,
  i.consumed_by_user_id,
  i.accepted_at,
  consumer.username as consumer_username,
  '⚠️ BUG: Status is pending but consumed_by_user_id is set!' as issue
FROM public.invites i
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.status = 'pending' 
  AND i.consumed_by_user_id IS NOT NULL
ORDER BY i.created_at DESC;
