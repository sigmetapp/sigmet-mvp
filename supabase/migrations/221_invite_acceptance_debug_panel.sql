begin;

-- Allow invite acceptance to be recorded during signup (before a session exists)
create or replace function public.accept_invite_by_code(
  invite_code text,
  target_user_id uuid default null,
  target_user_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid;
  effective_user_id uuid;
  normalized_code text;
  invite_record record;
  invite_id uuid;
  user_sw numeric;
  pending_email text;
  meta_invite_code text;
  verified_email text;
begin
  normalized_code := upper(trim(invite_code));
  if normalized_code is null or normalized_code = '' then
    raise exception 'Invalid invite code';
  end if;

  current_user_id := auth.uid();

  if current_user_id is not null then
    effective_user_id := current_user_id;
  elsif target_user_id is not null then
    effective_user_id := target_user_id;
  else
    raise exception 'Authentication required';
  end if;

  if current_user_id is null then
    select u.email,
           upper(trim(coalesce(u.raw_user_meta_data ->> 'invite_code', '')))
    into pending_email, meta_invite_code
    from auth.users u
    where u.id = effective_user_id;

    if pending_email is null then
      raise exception 'User not found for invite acceptance';
    end if;

    if meta_invite_code is null or meta_invite_code = '' then
      raise exception 'Invite code missing from user metadata';
    end if;

    if meta_invite_code <> normalized_code then
      raise exception 'Invite code mismatch';
    end if;

    if target_user_email is not null then
      if lower(trim(target_user_email)) <> lower(pending_email) then
        raise exception 'Invite email mismatch';
      end if;
      verified_email := lower(trim(target_user_email));
    else
      verified_email := lower(pending_email);
    end if;
  else
    verified_email := case
      when target_user_email is not null and trim(target_user_email) <> '' then lower(trim(target_user_email))
      else null
    end;
  end if;

  perform public.cleanup_expired_invites();

  select *
  into invite_record
  from public.invites
  where public.invites.invite_code = normalized_code
    and public.invites.status = 'pending'
    and (public.invites.expires_at is null or public.invites.expires_at >= now())
  for update;

  if invite_record is null then
    raise exception 'Invalid or expired invite code';
  end if;

  user_sw := public.calculate_user_sw_at_registration(effective_user_id);

  update public.invites
  set
    status = 'accepted',
    accepted_at = now(),
    consumed_by_user_id = effective_user_id,
    consumed_by_user_sw = user_sw,
    invitee_email = coalesce(invite_record.invitee_email, verified_email)
  where id = invite_record.id;

  invite_id := invite_record.id;

  insert into public.invite_events (invite_id, event, meta)
  values (
    invite_id,
    'accepted',
    jsonb_build_object(
      'user_id', effective_user_id,
      'via_code', true,
      'user_sw', user_sw,
      'user_email', verified_email,
      'recorded_during_signup', current_user_id is null
    )
  );

  return invite_id;
end;
$$;

grant execute on function public.accept_invite_by_code(text, uuid, text) to anon;
grant execute on function public.accept_invite_by_code(text, uuid, text) to authenticated;
alter function public.accept_invite_by_code(text, uuid, text) owner to postgres;

-- Admin debug snapshot helper for the /invite page
create or replace function public.get_invite_debug_snapshot(debug_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  invite_payload jsonb;
  events_payload jsonb;
  result jsonb;
  invite_id uuid;
  invites_only_setting boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin_uid() then
    raise exception 'Admin access required';
  end if;

  select coalesce(invites_only, false)
  into invites_only_setting
  from public.site_settings
  order by updated_at desc
  limit 1;

  result := jsonb_build_object(
    'generated_at', now(),
    'stats', jsonb_build_object(
      'total_invites', (select count(*) from public.invites),
      'pending_invites', (select count(*) from public.invites where status = 'pending'),
      'accepted_invites', (select count(*) from public.invites where status = 'accepted'),
      'invites_only', invites_only_setting
    ),
    'recent_invites', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at desc)
      from (
        select invite_code, status, created_at, accepted_at, consumed_by_user_id
        from public.invites
        order by created_at desc
        limit 10
      ) as t
    ), '[]'::jsonb),
    'recent_events', coalesce((
      select jsonb_agg(to_jsonb(ev) order by ev.created_at desc)
      from (
        select e.created_at, e.event, e.meta, i.invite_code
        from public.invite_events e
        join public.invites i on i.id = e.invite_id
        order by e.created_at desc
        limit 15
      ) as ev
    ), '[]'::jsonb)
  );

  if debug_code is not null and trim(debug_code) <> '' then
    normalized_code := upper(trim(debug_code));

    select i.id, to_jsonb(i)
    into invite_id, invite_payload
    from public.invites i
    where i.invite_code = normalized_code
    limit 1;

    if invite_id is not null then
      select coalesce(jsonb_agg(to_jsonb(ev) order by ev.created_at desc), '[]'::jsonb)
      into events_payload
      from (
        select e.id, e.event, e.meta, e.created_at
        from public.invite_events e
        where e.invite_id = invite_id
        order by e.created_at desc
        limit 20
      ) as ev;
    else
      events_payload := '[]'::jsonb;
    end if;

    result := result || jsonb_build_object(
      'invite', invite_payload,
      'events', events_payload
    );
  end if;

  return result;
end;
$$;

grant execute on function public.get_invite_debug_snapshot(text) to authenticated;
alter function public.get_invite_debug_snapshot(text) owner to postgres;

commit;
