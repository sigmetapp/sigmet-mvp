-- Check which invite was used by user Paul
-- Find user Paul by username
SELECT 
  user_id,
  username,
  full_name,
  created_at
FROM public.profiles
WHERE username = 'Paul' OR username ILIKE 'paul%';

-- Once we have the user_id, check which invite they consumed
-- This query finds all invites consumed by Paul
SELECT 
  i.id,
  i.invite_code,
  i.status,
  i.inviter_user_id,
  i.consumed_by_user_id,
  i.consumed_by_user_sw,
  i.created_at,
  i.accepted_at,
  i.invitee_email,
  inviter.username as inviter_username,
  inviter.full_name as inviter_full_name,
  consumer.username as consumer_username,
  consumer.full_name as consumer_full_name
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE consumer.username = 'Paul' OR consumer.username ILIKE 'paul%'
ORDER BY i.accepted_at DESC;

-- Check all invites that have consumed_by_user_id matching Paul's user_id
-- (Alternative query if username doesn't match exactly)
SELECT 
  i.id,
  i.invite_code,
  i.status,
  i.inviter_user_id,
  i.consumed_by_user_id,
  i.consumed_by_user_sw,
  i.created_at,
  i.accepted_at,
  i.invitee_email,
  inviter.username as inviter_username,
  consumer.username as consumer_username
FROM public.invites i
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE i.consumed_by_user_id IN (
  SELECT user_id FROM public.profiles WHERE username = 'Paul' OR username ILIKE 'paul%'
)
ORDER BY i.accepted_at DESC;

-- Alternative: Find by user_id if we know it
-- Check all invites consumed by a specific user
-- SELECT 
--   i.id,
--   i.invite_code,
--   i.status,
--   i.inviter_user_id,
--   i.consumed_by_user_id,
--   i.consumed_by_user_sw,
--   i.created_at,
--   i.accepted_at,
--   i.invitee_email,
--   inviter.username as inviter_username
-- FROM public.invites i
-- LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
-- WHERE i.consumed_by_user_id = 'USER_ID_HERE'
-- ORDER BY i.accepted_at DESC;

-- Check all invites for a specific inviter (to see which ones are accepted)
-- Replace 'INVITER_USER_ID' with your user_id
-- SELECT 
--   i.id,
--   i.invite_code,
--   i.status,
--   i.inviter_user_id,
--   i.consumed_by_user_id,
--   i.consumed_by_user_sw,
--   i.created_at,
--   i.accepted_at,
--   i.invitee_email,
--   consumer.username as consumer_username,
--   consumer.full_name as consumer_full_name
-- FROM public.invites i
-- LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
-- WHERE i.inviter_user_id = 'INVITER_USER_ID'
-- ORDER BY i.created_at DESC;

-- Check invite events for Paul to see when invite was accepted
SELECT 
  ie.id,
  ie.invite_id,
  ie.event,
  ie.meta,
  ie.created_at,
  i.invite_code,
  i.inviter_user_id,
  i.consumed_by_user_id,
  inviter.username as inviter_username,
  consumer.username as consumer_username
FROM public.invite_events ie
JOIN public.invites i ON ie.invite_id = i.id
LEFT JOIN public.profiles inviter ON i.inviter_user_id = inviter.user_id
LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
WHERE consumer.username = 'Paul' OR consumer.username ILIKE 'paul%'
  OR (ie.meta->>'user_id')::uuid IN (
    SELECT user_id FROM public.profiles WHERE username = 'Paul' OR username ILIKE 'paul%'
  )
ORDER BY ie.created_at DESC;

-- Check all invites for a specific inviter (to see which ones are accepted)
-- Replace 'INVITER_USER_ID' with your user_id
-- SELECT 
--   i.id,
--   i.invite_code,
--   i.status,
--   i.inviter_user_id,
--   i.consumed_by_user_id,
--   i.consumed_by_user_sw,
--   i.created_at,
--   i.accepted_at,
--   i.invitee_email,
--   consumer.username as consumer_username,
--   consumer.full_name as consumer_full_name
-- FROM public.invites i
-- LEFT JOIN public.profiles consumer ON i.consumed_by_user_id = consumer.user_id
-- WHERE i.inviter_user_id = 'INVITER_USER_ID'
-- ORDER BY i.created_at DESC;
