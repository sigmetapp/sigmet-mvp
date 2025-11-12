-- Diagnostic script to check invite code GTTUHX46
-- Run this in Supabase SQL editor to diagnose the issue

-- 1. Check if invite code exists
SELECT 
  id,
  invite_code,
  status,
  expires_at,
  created_at,
  inviter_user_id,
  invitee_email
FROM public.invites
WHERE invite_code = 'GTTUHX46';

-- 2. Check with normalized code (uppercase, trim)
SELECT 
  id,
  invite_code,
  status,
  expires_at,
  created_at,
  inviter_user_id,
  invitee_email
FROM public.invites
WHERE upper(trim(invite_code)) = 'GTTUHX46';

-- 3. Test the validate_invite_code function
SELECT public.validate_invite_code('GTTUHX46') as is_valid;

-- 3a. Test with different variations
SELECT 
  'GTTUHX46' as code,
  public.validate_invite_code('GTTUHX46') as is_valid_1,
  public.validate_invite_code('gttuhx46') as is_valid_2,
  public.validate_invite_code(' GTTUHX46 ') as is_valid_3;

-- 4. Check all pending invites (to see if there are any)
SELECT 
  id,
  invite_code,
  status,
  expires_at,
  created_at
FROM public.invites
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 10;

-- 5. Check RLS policies on invites table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'invites';
