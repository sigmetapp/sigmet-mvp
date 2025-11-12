-- Test script to diagnose invite code validation issue
-- Run this in Supabase SQL editor

-- 1. Check if invite code exists and its details
SELECT 
  id,
  invite_code,
  status,
  expires_at,
  created_at,
  inviter_user_id,
  CASE 
    WHEN expires_at IS NULL THEN 'No expiration'
    WHEN expires_at >= now() THEN 'Not expired'
    ELSE 'EXPIRED'
  END as expiration_status
FROM public.invites
WHERE invite_code = 'GTTUHX46' OR upper(trim(invite_code)) = 'GTTUHX46';

-- 2. Test function as anonymous user (simulate what happens during registration)
-- Note: This might not work in SQL editor, but shows what the function should return
SELECT public.validate_invite_code('GTTUHX46') as validation_result;

-- 3. Check if there are any pending invites at all
SELECT 
  count(*) as total_pending,
  count(*) filter (where invite_code is not null) as pending_with_code,
  count(*) filter (where expires_at is null or expires_at >= now()) as pending_not_expired
FROM public.invites
WHERE status = 'pending';

-- 4. Check function definition and owner
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition,
  pg_get_userbyid(p.proowner) as function_owner,
  p.prosecdef as is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'validate_invite_code';

-- 5. Test direct query (what the function should find)
SELECT 
  id,
  invite_code,
  status,
  expires_at
FROM public.invites
WHERE upper(trim(invite_code)) = 'GTTUHX46'
  AND status = 'pending'
  AND (expires_at IS NULL OR expires_at >= now());
