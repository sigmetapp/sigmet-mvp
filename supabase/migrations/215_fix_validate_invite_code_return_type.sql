begin;

-- Fix validate_invite_code to ensure it always returns a proper boolean
-- This addresses issues where the function might return null or unexpected values
-- The function uses security definer to bypass RLS, and we also have RLS policy as backup
create or replace function public.validate_invite_code(invite_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record record;
  normalized_code text;
  result boolean;
  invite_count int;
begin
  -- Normalize the invite code (uppercase, trim)
  normalized_code := upper(trim(validate_invite_code.invite_code));
  
  -- Check if code is empty
  if normalized_code is null or normalized_code = '' then
    return false;
  end if;
  
  -- Find pending invite by code that is not expired
  -- Security definer should bypass RLS, but we use count(*) to be more explicit
  -- This ensures we get a result even if RLS is somehow still applied
  select count(*) into invite_count
  from public.invites
  where public.invites.invite_code = normalized_code
    and status = 'pending'
    and (expires_at is null or expires_at >= now());
  
  -- Also try to get the record for additional validation
  select * into invite_record
  from public.invites
  where public.invites.invite_code = normalized_code
    and status = 'pending'
    and (expires_at is null or expires_at >= now())
  limit 1;

  -- Return true if valid pending invite exists, false otherwise
  -- Use both count and record check for reliability
  result := (invite_count > 0) and (invite_record is not null);
  return coalesce(result, false);
end;
$$;

-- Grant execute permissions (in case they were dropped)
grant execute on function public.validate_invite_code(text) to anon;
grant execute on function public.validate_invite_code(text) to authenticated;

-- Ensure function is owned by postgres (important for security definer)
alter function public.validate_invite_code(text) owner to postgres;

commit;
