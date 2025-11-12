begin;

-- Add expires_at column to invites table
alter table public.invites
  add column if not exists expires_at timestamptz;

-- Create index for expiration queries
create index if not exists invites_expires_at_idx on public.invites(expires_at) where status = 'pending';

-- Function to automatically delete expired invites
create or replace function public.cleanup_expired_invites()
returns void
language plpgsql
security definer
as $$
begin
  -- Delete invites that are expired and still pending
  delete from public.invites
  where status = 'pending'
    and expires_at is not null
    and expires_at < now();
end;
$$;

-- Update send_invite to set expiration (24 hours)
create or replace function public.send_invite(invitee_email text)
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

  -- Strict email validation: reject any commas, semicolons, spaces, tabs, newlines
  if invitee_email ~* '[,\s\t\n\r;]' then
    raise exception 'Only single email allowed';
  end if;

  -- Basic email format validation (simple check)
  if invitee_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'Invalid email format';
  end if;

  -- Normalize email (lowercase, trim)
  invitee_email := lower(trim(invitee_email));

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

  -- Check invite limit: count pending + accepted invites (excluding expired)
  select count(*) into invite_count
  from public.invites
  where inviter_user_id = current_user_id
    and status in ('pending', 'accepted')
    and (expires_at is null or expires_at >= now());

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
    sent_at,
    expires_at
  ) values (
    current_user_id,
    invitee_email,
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
    (invite_id, 'sent', jsonb_build_object('invitee_email', invitee_email, 'invite_code', invite_code_val));

  return invite_id;
end;
$$;

-- Update admin_create_invite to set expiration (24 hours) - no email parameter
drop function if exists public.admin_create_invite(uuid);
drop function if exists public.admin_create_invite(text, uuid);
drop function if exists public.admin_create_invite(text);
drop function if exists public.admin_create_invite();

create or replace function public.admin_create_invite(
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
    sent_at,
    expires_at
  ) values (
    inviter_user_id,
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
    (invite_id, 'created', jsonb_build_object(
      'inviter_user_id', inviter_user_id,
      'created_by_admin', current_user_id
    )),
    (invite_id, 'sent', jsonb_build_object('invite_code', invite_code_val));

  return invite_id;
end;
$$;

-- Grant execute permission
grant execute on function public.admin_create_invite(uuid) to authenticated;

-- Update validate_invite_code to check expiration
create or replace function public.validate_invite_code(invite_code text)
returns boolean
language plpgsql
security definer
as $$
declare
  invite_record record;
begin
  -- Find pending invite by code that is not expired
  select * into invite_record
  from public.invites
  where invite_code = upper(trim(validate_invite_code.invite_code))
    and status = 'pending'
    and (expires_at is null or expires_at >= now());

  -- Return true if valid pending invite exists, false otherwise
  return invite_record is not null;
end;
$$;

-- Update accept_invite_by_code to check expiration and cleanup expired
create or replace function public.accept_invite_by_code(invite_code text)
returns uuid
language plpgsql
security definer
as $$
declare
  current_user_id uuid;
  invite_record record;
  invite_id uuid;
  user_sw numeric;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Cleanup expired invites first
  perform public.cleanup_expired_invites();

  -- Find pending invite by code with lock, check expiration
  select * into invite_record
  from public.invites
  where invite_code = upper(trim(accept_invite_by_code.invite_code))
    and status = 'pending'
    and (expires_at is null or expires_at >= now())
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

-- Backfill expires_at for existing pending invites (set to 24 hours from creation)
update public.invites
set expires_at = created_at + interval '24 hours'
where status = 'pending' and expires_at is null;

-- Grant execute permission for cleanup function
grant execute on function public.cleanup_expired_invites() to authenticated;
grant execute on function public.cleanup_expired_invites() to anon;

commit;
