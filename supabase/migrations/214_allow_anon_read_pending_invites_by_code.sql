begin;

-- Add RLS policy to allow anonymous users to read pending invites by invite_code
-- This is needed for validate_invite_code function to work properly during registration
-- Even though the function uses security definer, having an explicit policy is more reliable

drop policy if exists "anon_read_pending_invites_by_code" on public.invites;
create policy "anon_read_pending_invites_by_code" on public.invites
  for select
  to anon
  using (
    status = 'pending'
    and invite_code is not null
    and (expires_at is null or expires_at >= now())
  );

-- Also update validate_invite_code to ensure it bypasses RLS properly
-- Use SET LOCAL to disable RLS checks within the function
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
