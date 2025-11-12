begin;

-- Create a test function that directly queries without any RLS concerns
-- This will help us debug if the issue is with RLS or something else
create or replace function public.test_validate_invite_code_direct(invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  invite_record record;
  result jsonb;
begin
  normalized_code := upper(trim(invite_code));
  
  -- Direct query without any RLS concerns (security definer)
  select * into invite_record
  from public.invites
  where public.invites.invite_code = normalized_code
  limit 1;
  
  result := jsonb_build_object(
    'code', normalized_code,
    'found', invite_record is not null,
    'status', invite_record.status,
    'expires_at', invite_record.expires_at,
    'is_expired', case when invite_record.expires_at is null then false else invite_record.expires_at < now() end,
    'is_valid', (
      invite_record is not null 
      and invite_record.status = 'pending'
      and (invite_record.expires_at is null or invite_record.expires_at >= now())
    )
  );
  
  return result;
end;
$$;

grant execute on function public.test_validate_invite_code_direct(text) to anon;
grant execute on function public.test_validate_invite_code_direct(text) to authenticated;
alter function public.test_validate_invite_code_direct(text) owner to postgres;

commit;
