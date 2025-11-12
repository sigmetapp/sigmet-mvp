begin;

-- Simplified version of validate_invite_code that definitely bypasses RLS
-- This version uses a simpler approach to ensure it works correctly
create or replace function public.validate_invite_code(invite_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  invite_exists boolean;
begin
  -- Normalize the invite code (uppercase, trim)
  normalized_code := upper(trim(validate_invite_code.invite_code));
  
  -- Check if code is empty
  if normalized_code is null or normalized_code = '' then
    return false;
  end if;
  
  -- Check if pending invite exists (security definer bypasses RLS)
  -- Using EXISTS is more efficient and clearer
  select exists(
    select 1
    from public.invites
    where public.invites.invite_code = normalized_code
      and status = 'pending'
      and (expires_at is null or expires_at >= now())
  ) into invite_exists;
  
  -- Return the result (coalesce to ensure we never return null)
  return coalesce(invite_exists, false);
end;
$$;

-- Grant execute permissions
grant execute on function public.validate_invite_code(text) to anon;
grant execute on function public.validate_invite_code(text) to authenticated;

-- Ensure function is owned by postgres (critical for security definer to work)
alter function public.validate_invite_code(text) owner to postgres;

-- Verify the function
comment on function public.validate_invite_code(text) is 
  'Validates an invite code. Returns true if code exists, is pending, and not expired. Uses security definer to bypass RLS.';

commit;
