begin;

-- Ensure validate_invite_code always returns a proper boolean
-- This is critical for the frontend to work correctly
create or replace function public.validate_invite_code(invite_code text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  normalized_code text;
  invite_count int;
begin
  -- Normalize the invite code (uppercase, trim)
  normalized_code := upper(trim(validate_invite_code.invite_code));
  
  -- Check if code is empty
  if normalized_code is null or normalized_code = '' then
    return false::boolean;
  end if;
  
  -- Direct count query - security definer should bypass RLS
  -- We use count(*) to be explicit and avoid any potential RLS issues
  select count(*) into invite_count
  from public.invites
  where public.invites.invite_code = normalized_code
    and public.invites.status = 'pending'
    and (public.invites.expires_at is null or public.invites.expires_at >= now());
  
  -- Explicitly cast to boolean and return
  return (coalesce(invite_count, 0) > 0)::boolean;
end;
$$;

-- Grant execute permissions
grant execute on function public.validate_invite_code(text) to anon;
grant execute on function public.validate_invite_code(text) to authenticated;

-- Ensure function is owned by postgres (critical for security definer to work)
alter function public.validate_invite_code(text) owner to postgres;

-- Add comment
comment on function public.validate_invite_code(text) is 
  'Validates an invite code. Returns true if code exists, is pending, and not expired. Always returns boolean. Uses security definer to bypass RLS.';

commit;
