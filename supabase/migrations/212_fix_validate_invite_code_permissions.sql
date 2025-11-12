begin;

-- Fix: Re-grant execute permissions for validate_invite_code
-- Migration 208 replaced the function but didn't re-grant permissions
-- This is required for anonymous users to validate invite codes during registration
grant execute on function public.validate_invite_code(text) to anon;
grant execute on function public.validate_invite_code(text) to authenticated;

commit;
