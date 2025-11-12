begin;

-- Fix validate_invite_code to ensure it always returns a proper boolean
-- This addresses issues where the function might return null or unexpected values
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
begin
  -- Normalize the invite code (uppercase, trim)
  normalized_code := upper(trim(validate_invite_code.invite_code));
  
  -- Check if code is empty
  if normalized_code is null or normalized_code = '' then
    return false;
  end if;
  
  -- Find pending invite by code that is not expired
  -- Security definer should bypass RLS, but we also have the policy above as backup
  select * into invite_record
  from public.invites
  where public.invites.invite_code = normalized_code
    and status = 'pending'
    and (expires_at is null or expires_at >= now())
  limit 1;

  -- Return true if valid pending invite exists, false otherwise
  -- Explicitly convert to boolean to ensure proper return type
  result := (invite_record is not null);
  return coalesce(result, false);
end;
$$;

-- Grant execute permissions (in case they were dropped)
grant execute on function public.validate_invite_code(text) to anon;
grant execute on function public.validate_invite_code(text) to authenticated;

commit;
