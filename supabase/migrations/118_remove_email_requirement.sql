begin;

-- Make invitee_email optional (nullable) since we're using codes only
alter table public.invites
  alter column invitee_email drop not null;

-- Drop old version of send_invite if it exists (with or without parameters)
drop function if exists public.send_invite(text);
drop function if exists public.send_invite();

-- Create new send_invite without parameters
create function public.send_invite()
returns uuid
language plpgsql
security definer
as $$
declare
  current_user_id uuid;
  invite_count int;
  throttle_record record;
  invite_id uuid;
  invite_token uuid;
  invite_code_val text;
begin
  -- Get current user
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Throttle check: not more than 1 invite per 30 seconds
  select * into throttle_record
  from public.invite_throttle
  where user_id = current_user_id
  for update;

  if throttle_record is not null then
    if throttle_record.last_sent_at > now() - interval '30 seconds' then
      raise exception 'Rate limited. Try later';
    end if;
    update public.invite_throttle
    set last_sent_at = now()
    where user_id = current_user_id;
  else
    insert into public.invite_throttle (user_id, last_sent_at)
    values (current_user_id, now());
  end if;

  -- Check invite limit: count pending + accepted invites
  select count(*) into invite_count
  from public.invites
  where inviter_user_id = current_user_id
    and status in ('pending', 'accepted');

  if invite_count >= 3 then
    raise exception 'Invite limit reached (3 per user)';
  end if;

  -- Generate token and invite code
  invite_token := gen_random_uuid();
  invite_code_val := public.generate_invite_code();
  
  insert into public.invites (
    inviter_user_id,
    invitee_email,
    token,
    invite_code,
    status,
    sent_at
  ) values (
    current_user_id,
    null, -- No email needed, using codes only
    invite_token,
    invite_code_val,
    'pending',
    now()
  )
  returning id into invite_id;

  -- Record events
  insert into public.invite_events (invite_id, event, meta)
  values 
    (invite_id, 'created', jsonb_build_object('inviter_user_id', current_user_id)),
    (invite_id, 'sent', jsonb_build_object('invite_code', invite_code_val));

  return invite_id;
end;
$$;

-- Drop old version of admin_create_invite if it exists
drop function if exists public.admin_create_invite(text, uuid);
drop function if exists public.admin_create_invite(text);
drop function if exists public.admin_create_invite(uuid);
drop function if exists public.admin_create_invite();

-- Create new admin_create_invite without email parameter
create function public.admin_create_invite(
  target_inviter uuid default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  current_user_id uuid;
  inviter_user_id uuid;
  throttle_record record;
  invite_id uuid;
  invite_token uuid;
  invite_code_val text;
begin
  -- Check admin status
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  current_user_id := auth.uid();

  -- Use target_inviter if provided, otherwise use admin's own ID
  inviter_user_id := coalesce(target_inviter, current_user_id);

  -- Admin bypasses throttle - no rate limiting for admins
  -- Just update/insert throttle record for tracking purposes, but don't enforce limits
  insert into public.invite_throttle (user_id, last_sent_at)
  values (inviter_user_id, now())
  on conflict (user_id) do update
  set last_sent_at = now();

  -- Generate token and invite code (NO LIMIT CHECK for admin)
  invite_token := gen_random_uuid();
  invite_code_val := public.generate_invite_code();
  
  insert into public.invites (
    inviter_user_id,
    invitee_email,
    token,
    invite_code,
    status,
    sent_at
  ) values (
    inviter_user_id,
    null, -- No email needed, using codes only
    invite_token,
    invite_code_val,
    'pending',
    now()
  )
  returning id into invite_id;

  -- Record events
  insert into public.invite_events (invite_id, event, meta)
  values 
    (invite_id, 'created', jsonb_build_object(
      'inviter_user_id', inviter_user_id,
      'created_by_admin', current_user_id
    )),
    (invite_id, 'sent', jsonb_build_object('invite_code', invite_code_val));

  return invite_id;
end;
$$;

-- Grant execute permissions
grant execute on function public.send_invite() to authenticated;
grant execute on function public.admin_create_invite(uuid) to authenticated;

commit;
