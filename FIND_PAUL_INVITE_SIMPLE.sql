-- Simple query to find Paul's invite and all invites from the same inviter
-- Paul's user_id: c2c8c5e9-d4c6-46bc-a685-5326972b812b

-- Step 1: Find the invite that Paul consumed (with inviter info)
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

-- Step 2: Find all invites created by the same inviter (automatically finds inviter_user_id)
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
WHERE i.inviter_user_id = (
  SELECT inviter_user_id 
  FROM public.invites 
  WHERE consumed_by_user_id = 'c2c8c5e9-d4c6-46bc-a685-5326972b812b'
  LIMIT 1
)
ORDER BY i.created_at DESC;
