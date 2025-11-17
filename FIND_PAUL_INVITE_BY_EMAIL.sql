-- Find Paul's invite by email
-- Paul's email: paulcizan@gmail.com
-- Paul's user_id: c2c8c5e9-d4c6-46bc-a685-5326972b812b

-- Step 1: Find invite by invitee_email
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
  inviter.user_id as inviter_user_id,
  consumer.username as consumer_username,
  consumer.full_name as consumer_full_name,
  CASE 
    WHEN i.status = 'accepted' AND i.consumed_by_user_id IS NOT NULL THEN '✅ Accepted by ' || COALESCE(consumer.username, 'user')
    WHEN i.status = 'pending' AND i.consumed_by_user_id IS NOT NULL THEN '⚠️ BUG: Status is pending but consumed_by_user_id is set!'
    WHEN i.status = 'pending' THEN '⏳ Pending'
    WHEN i.status = 'expired' THEN '❌ Expired'
    WHEN i.status = 'revoked' THEN '🚫 Revoked'
    ELSE '❓ Unknown status: ' || i.status
  END as status_description
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE LOWER(i.invitee_email) = LOWER('paulcizan@gmail.com')
ORDER BY i.created_at DESC;

-- Step 2: Find all invites created by the inviter who created Paul's invite
-- This will show all invites from the same person who invited Paul
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
  consumer.username as used_by_username,
  consumer.full_name as used_by_full_name,
  CASE 
    WHEN i.status = 'accepted' AND i.consumed_by_user_id IS NOT NULL THEN '✅ Accepted by ' || COALESCE(consumer.username, 'user')
    WHEN i.status = 'pending' AND i.consumed_by_user_id IS NOT NULL THEN '⚠️ BUG: Status is pending but consumed_by_user_id is set!'
    WHEN i.status = 'pending' THEN '⏳ Pending'
    WHEN i.status = 'expired' THEN '❌ Expired'
    WHEN i.status = 'revoked' THEN '🚫 Revoked'
    ELSE '❓ Unknown status'
  END as status_description
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.inviter_user_id = (
  SELECT inviter_user_id 
  FROM public.invites 
  WHERE LOWER(invitee_email) = LOWER('paulcizan@gmail.com')
  LIMIT 1
)
ORDER BY i.created_at DESC;

-- Step 3: Check if Paul's invite has consumed_by_user_id set correctly
-- If status is accepted but consumed_by_user_id is NULL or doesn't match Paul's user_id, we need to fix it
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
    WHEN i.status = 'accepted' AND i.consumed_by_user_id IS NULL THEN '⚠️ BUG: Status is accepted but consumed_by_user_id is NULL!'
    WHEN i.status = 'accepted' AND i.consumed_by_user_id != 'c2c8c5e9-d4c6-46bc-a685-5326972b812b' THEN '⚠️ BUG: Status is accepted but consumed_by_user_id is wrong!'
    WHEN i.status = 'pending' AND i.consumed_by_user_id IS NOT NULL THEN '⚠️ BUG: Status is pending but consumed_by_user_id is set!'
    WHEN i.status = 'accepted' AND i.consumed_by_user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b' THEN '✅ Correct!'
    ELSE '❓ Check needed'
  END as issue_status
FROM public.invites i
WHERE LOWER(i.invitee_email) = LOWER('paulcizan@gmail.com');

-- Step 4: Check invite events for Paul's invite
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
  inviter.username as inviter_username
FROM public.invite_events ie
JOIN public.invites i ON ie.invite_id = i.id
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
WHERE LOWER(i.invitee_email) = LOWER('paulcizan@gmail.com')
  OR (ie.meta->>'user_id')::uuid = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b'
ORDER BY ie.created_at DESC;
