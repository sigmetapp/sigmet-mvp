begin;

-- Fix send_invite function to check invite limit BEFORE throttle
-- This allows users to create multiple invites quickly as long as they're within their limit
-- Throttle only applies when user is at their limit to prevent spam attempts
create or replace function public.send_invite()
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
  user_invite_limit int;
begin
  -- Get current user
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Get user's invite limit based on SW level FIRST
  user_invite_limit := public.get_user_invite_limit(current_user_id);

  -- Check invite limit: count pending + accepted invites (excluding expired)
  select count(*) into invite_count
  from public.invites
  where inviter_user_id = current_user_id
    and status in ('pending', 'accepted')
    and (expires_at is null or expires_at >= now());

  -- If user is at their limit, check throttle to prevent spam attempts
  if invite_count >= user_invite_limit then
    -- Throttle check: not more than 1 invite attempt per 30 seconds when at limit
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

    -- User is at limit, raise exception
    raise exception using 
      message = 'Invite limit reached (' || user_invite_limit || ' per user for your SW level)';
  end if;

  -- User is within their limit, update throttle record but don't block
  -- This allows tracking but doesn't prevent legitimate use
  select * into throttle_record
  from public.invite_throttle
  where user_id = current_user_id
  for update;

  if throttle_record is not null then
    update public.invite_throttle
    set last_sent_at = now()
    where user_id = current_user_id;
  else
    insert into public.invite_throttle (user_id, last_sent_at)
    values (current_user_id, now());
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
    sent_at,
    expires_at
  ) values (
    current_user_id,
    null, -- No email needed, using codes only
    invite_token,
    invite_code_val,
    'pending',
    now(),
    now() + interval '24 hours'
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

-- Grant execute permission
grant execute on function public.send_invite() to authenticated;

commit;
