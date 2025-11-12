-- Quick test to check if validate_invite_code works
-- Run this in Supabase SQL editor

-- Test 1: Direct query (what the function should find)
SELECT 
  count(*) as direct_count
FROM public.invites
WHERE invite_code = 'GTTUHX46'
  AND status = 'pending'
  AND (expires_at IS NULL OR expires_at >= now());

-- Test 2: Call the function
SELECT public.validate_invite_code('GTTUHX46') as function_result;

-- Test 3: Check if function exists and its definition
SELECT 
  p.proname,
  pg_get_functiondef(p.oid) as definition,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'validate_invite_code';
