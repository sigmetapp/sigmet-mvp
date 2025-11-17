-- Specific search for Paul's invite in the exact time window
-- Paul registered: 2025-11-17 19:28:05.170017+00
-- Paul's user_id: c2c8c5e9-d4c6-46bc-a685-5326972b812b

-- Step 1: Check ALL accepted invites in the exact time window (19:00-21:00)
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
  consumer.user_id as consumer_user_id,
  CASE 
    WHEN consumer.user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b' THEN '✅ THIS IS PAUL!'
    WHEN i.accepted_at BETWEEN '2025-11-17 19:00:00'::timestamptz AND '2025-11-17 21:00:00'::timestamptz 
      AND consumer.user_id IS NULL THEN '⚠️ Accepted around Paul registration time but consumed_by_user_id is NULL!'
    WHEN i.accepted_at BETWEEN '2025-11-17 19:00:00'::timestamptz AND '2025-11-17 21:00:00'::timestamptz THEN '⏰ Accepted around Paul registration time'
    ELSE 'Other'
  END as match_status
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.status = 'accepted'
  AND i.accepted_at BETWEEN '2025-11-17 19:00:00'::timestamptz AND '2025-11-17 21:00:00'::timestamptz
ORDER BY i.accepted_at DESC;

-- Step 2: Check ALL accepted invites that don't have consumed_by_user_id set
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

-- Step 3: Check invites with pending status but consumed_by_user_id set (potential bug)
SELECT 
  i.id,
  i.invite_code,
  i.status,
  i.consumed_by_user_id,
  i.accepted_at,
  i.created_at,
  i.invitee_email,
  consumer.username as consumer_username,
  consumer.user_id as consumer_user_id,
  inviter.username as inviter_username,
  '⚠️ BUG: Status is pending but consumed_by_user_id is set!' as issue
FROM public.invites i
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
WHERE i.status = 'pending' 
  AND i.consumed_by_user_id IS NOT NULL
ORDER BY i.created_at DESC;

-- Step 4: Check invite events for Paul's user_id in the time window
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
  i.invitee_email,
  inviter.username as inviter_username,
  consumer.username as consumer_username,
  CASE 
    WHEN (ie.meta->>'user_id')::uuid = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b' THEN '✅ THIS IS PAUL!'
    WHEN ie.event = 'accepted' AND ie.created_at BETWEEN '2025-11-17 19:00:00'::timestamptz AND '2025-11-17 21:00:00'::timestamptz THEN '⏰ Accepted around Paul registration time'
    ELSE 'Other'
  END as match_status
FROM public.invite_events ie
JOIN public.invites i ON ie.invite_id = i.id
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE ie.event = 'accepted'
  AND (
    (ie.meta->>'user_id')::uuid = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b'
    OR ie.created_at BETWEEN '2025-11-17 19:00:00'::timestamptz AND '2025-11-17 21:00:00'::timestamptz
  )
ORDER BY ie.created_at DESC;

-- Step 5: Check if there are any invites accepted right after Paul registered (19:28-20:00)
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
  consumer.username as consumer_username,
  consumer.user_id as consumer_user_id,
  CASE 
    WHEN consumer.user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b' THEN '✅ THIS IS PAUL!'
    WHEN i.accepted_at > '2025-11-17 19:28:05'::timestamptz 
      AND i.accepted_at < '2025-11-17 20:00:00'::timestamptz 
      AND consumer.user_id IS NULL THEN '⚠️ Accepted right after Paul registered but consumed_by_user_id is NULL!'
    WHEN i.accepted_at > '2025-11-17 19:28:05'::timestamptz 
      AND i.accepted_at < '2025-11-17 20:00:00'::timestamptz THEN '⏰ Accepted right after Paul registered'
    ELSE 'Other'
  END as match_status
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.status = 'accepted'
  AND i.accepted_at > '2025-11-17 19:28:05'::timestamptz
  AND i.accepted_at < '2025-11-17 20:00:00'::timestamptz
ORDER BY i.accepted_at ASC;
