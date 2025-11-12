begin;

-- Fix validate_invite_code to explicitly bypass RLS
-- Security definer functions should bypass RLS, but we'll ensure it works correctly
create or replace function public.validate_invite_code(invite_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  invite_count int;
begin
  -- Normalize the invite code (uppercase, trim)
  normalized_code := upper(trim(validate_invite_code.invite_code));
  
  -- Check if code is empty
  if normalized_code is null or normalized_code = '' then
    return false;
  end if;
  
  -- Direct count query - security definer should bypass RLS
  -- We use count(*) to be explicit and avoid any potential RLS issues
  select count(*) into invite_count
  from public.invites
  where public.invites.invite_code = normalized_code
    and public.invites.status = 'pending'
    and (public.invites.expires_at is null or public.invites.expires_at >= now());
  
  -- Return true if count > 0, false otherwise
  return (coalesce(invite_count, 0) > 0);
end;
$$;

-- Grant execute permissions
grant execute on function public.validate_invite_code(text) to anon;
grant execute on function public.validate_invite_code(text) to authenticated;

-- Ensure function is owned by postgres (critical for security definer to work)
alter function public.validate_invite_code(text) owner to postgres;

-- Ensure schema usage is granted
grant usage on schema public to anon;
grant usage on schema public to authenticated;

commit;
