-- Find the invite that Paul used
-- Paul's user_id: c2c8c5e9-d4c6-46bc-a685-5326972b812b

-- Step 1: Find the invite that Paul consumed
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
  i.expires_at,
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
WHERE i.consumed_by_user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b'
ORDER BY i.accepted_at DESC NULLS LAST, i.created_at DESC;

-- Step 2: Check invite events for this invite (to see acceptance history)
SELECT 
  ie.id as event_id,
  ie.invite_id,
  ie.event,
  ie.meta,
  ie.created_at as event_created_at,
  i.invite_code,
  i.status as current_status,
  i.inviter_user_id,
  i.consumed_by_user_id
FROM public.invite_events ie
JOIN public.invites i ON ie.invite_id = i.id
WHERE i.consumed_by_user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b'
  OR (ie.meta->>'user_id')::uuid = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b'
ORDER BY ie.created_at DESC;

-- Step 3: Check all invites created by the inviter (to see if this invite appears in their list)
-- This will show if the inviter can see this invite
-- Replace 'INVITER_USER_ID_HERE' with the inviter_user_id from Step 1
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
    WHEN i.status = 'pending' AND i.consumed_by_user_id IS NOT NULL THEN '⚠️ BUG: Status is pending but consumed_by_user_id is set!'
    WHEN i.status = 'pending' THEN '⏳ Pending'
    WHEN i.status = 'expired' THEN '❌ Expired'
    WHEN i.status = 'revoked' THEN '🚫 Revoked'
    ELSE '❓ Unknown status'
  END as status_description
FROM public.invites i
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.inviter_user_id = 'INVITER_USER_ID_HERE'  -- Replace with inviter_user_id from Step 1
ORDER BY i.created_at DESC;

-- Step 4: Check for potential bugs - invites with pending status but consumed_by_user_id set
SELECT 
  i.id,
  i.invite_code,
  i.status,
  i.consumed_by_user_id,
  i.accepted_at,
  i.created_at,
  consumer.username as consumer_username,
  '⚠️ BUG: Status is pending but consumed_by_user_id is set!' as issue
FROM public.invites i
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.status = 'pending' 
  AND i.consumed_by_user_id IS NOT NULL
ORDER BY i.created_at DESC;

-- Step 5: Check if there are any invites with accepted status but missing accepted_at
SELECT 
  i.id,
  i.invite_code,
  i.status,
  i.consumed_by_user_id,
  i.accepted_at,
  i.created_at,
  consumer.username as consumer_username,
  '⚠️ BUG: Status is accepted but accepted_at is NULL!' as issue
FROM public.invites i
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.status = 'accepted' 
  AND i.accepted_at IS NULL
ORDER BY i.created_at DESC;
