begin;

-- Function to validate invite code without requiring authentication
-- This is used during registration to check if an invite code is valid BEFORE creating the user
create or replace function public.validate_invite_code(invite_code text)
returns boolean
language plpgsql
security definer
as $$
declare
  invite_record record;
begin
  -- Find pending invite by code (no lock needed for validation)
  select * into invite_record
  from public.invites
  where invite_code = upper(trim(validate_invite_code.invite_code))
    and status = 'pending';

  -- Return true if valid pending invite exists, false otherwise
  return invite_record is not null;
end;
$$;

-- Grant execute permission to anonymous users (for registration)
grant execute on function public.validate_invite_code(text) to anon;
grant execute on function public.validate_invite_code(text) to authenticated;

commit;
