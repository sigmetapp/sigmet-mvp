begin;

-- Allow service-role callers to accept invites on behalf of a specific user id.
-- This keeps existing behaviour for authenticated users while enabling our server
-- API to claim invites immediately after signup (before the user has a session).
create or replace function public.accept_invite_by_code(
  invite_code text,
  target_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  effective_user_id uuid;
  invite_record record;
  invite_id uuid;
  user_sw numeric;
  normalized_code text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    if auth.role() = 'service_role' then
      if target_user_id is null then
        raise exception 'target_user_id is required when running as service role';
      end if;
      effective_user_id := target_user_id;
    else
      raise exception 'Authentication required';
    end if;
  else
    effective_user_id := current_user_id;

    if target_user_id is not null and target_user_id <> current_user_id then
      if auth.role() = 'service_role' or public.is_admin() then
        effective_user_id := target_user_id;
      else
        raise exception 'Cannot accept invite for another user';
      end if;
    end if;
  end if;

  if effective_user_id is null then
    raise exception 'User context missing';
  end if;

  normalized_code := upper(trim(invite_code));

  if normalized_code is null or normalized_code = '' then
    raise exception 'Invalid invite code';
  end if;

  -- Ensure expired invites are cleaned up before attempting to claim
  perform public.cleanup_expired_invites();

  select * into invite_record
  from public.invites
  where public.invites.invite_code = normalized_code
    and public.invites.status = 'pending'
    and (public.invites.expires_at is null or public.invites.expires_at >= now())
  for update;

  if invite_record is null then
    raise exception 'Invalid or expired invite code';
  end if;

  -- Calculate SW snapshot for the consuming user
  user_sw := public.calculate_user_sw_at_registration(effective_user_id);

  update public.invites
  set
    status = 'accepted',
    accepted_at = now(),
    consumed_by_user_id = effective_user_id,
    consumed_by_user_sw = user_sw
  where id = invite_record.id;

  invite_id := invite_record.id;

  insert into public.invite_events (invite_id, event, meta)
  values (invite_id, 'accepted', jsonb_build_object(
    'user_id', effective_user_id,
    'via_code', true,
    'user_sw', user_sw
  ));

  return invite_id;
end;
$$;

grant execute on function public.accept_invite_by_code(text, uuid) to authenticated;

commit;
