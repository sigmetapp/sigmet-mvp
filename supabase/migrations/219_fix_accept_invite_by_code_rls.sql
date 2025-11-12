begin;

-- Fix accept_invite_by_code to ensure it bypasses RLS properly
-- This function is called after user signup, so user should be authenticated
create or replace function public.accept_invite_by_code(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  invite_record record;
  invite_id uuid;
  user_sw numeric;
  normalized_code text;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Normalize the invite code
  normalized_code := upper(trim(accept_invite_by_code.invite_code));
  
  if normalized_code is null or normalized_code = '' then
    raise exception 'Invalid invite code';
  end if;

  -- Cleanup expired invites first
  perform public.cleanup_expired_invites();

  -- Find pending invite by code with lock, check expiration
  -- Security definer should bypass RLS
  select * into invite_record
  from public.invites
  where public.invites.invite_code = normalized_code
    and public.invites.status = 'pending'
    and (public.invites.expires_at is null or public.invites.expires_at >= now())
  for update;

  if invite_record is null then
    raise exception 'Invalid or expired invite code';
  end if;

  -- Calculate user SW at registration time
  user_sw := public.calculate_user_sw_at_registration(current_user_id);

  -- Update invite status and store SW
  update public.invites
  set 
    status = 'accepted',
    accepted_at = now(),
    consumed_by_user_id = current_user_id,
    consumed_by_user_sw = user_sw
  where id = invite_record.id;

  invite_id := invite_record.id;

  -- Record event
  insert into public.invite_events (invite_id, event, meta)
  values (invite_id, 'accepted', jsonb_build_object(
    'user_id', current_user_id,
    'via_code', true,
    'user_sw', user_sw
  ));

  return invite_id;
end;
$$;

-- Grant execute permissions
grant execute on function public.accept_invite_by_code(text) to authenticated;

-- Ensure function is owned by postgres
alter function public.accept_invite_by_code(text) owner to postgres;

commit;
