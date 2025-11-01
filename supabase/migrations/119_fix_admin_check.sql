begin;

-- Update is_admin() function to check both admins table and email
-- This ensures seosasha@gmail.com is always recognized as admin
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
stable
as $$
declare
  user_email text;
  is_admin_user boolean;
begin
  -- Check if user is in admins table
  select exists (
    select 1 
    from public.admins 
    where user_id = auth.uid()
  ) into is_admin_user;

  -- If not in admins table, check email
  if not is_admin_user then
    select email into user_email 
    from auth.users 
    where id = auth.uid();
    
    is_admin_user := (user_email = 'seosasha@gmail.com');
  end if;

  return is_admin_user;
end;
$$;

-- Update send_invite() to bypass limit for admins
-- This provides additional protection if frontend calls send_invite() instead of admin_create_invite()
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
begin
  -- Get current user
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Throttle check: not more than 1 invite per 30 seconds (admins bypass this)
  if not public.is_admin() then
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
  else
    -- Admin bypasses throttle - just update/insert throttle record for tracking
    insert into public.invite_throttle (user_id, last_sent_at)
    values (current_user_id, now())
    on conflict (user_id) do update
    set last_sent_at = now();
  end if;

  -- Check invite limit: count pending + accepted invites (admins bypass this)
  if not public.is_admin() then
    select count(*) into invite_count
    from public.invites
    where inviter_user_id = current_user_id
      and status in ('pending', 'accepted');

    if invite_count >= 3 then
      raise exception 'Invite limit reached (3 per user)';
    end if;
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

commit;
