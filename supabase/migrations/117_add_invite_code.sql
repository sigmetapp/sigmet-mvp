begin;

-- Add invite_code column to invites table for user-friendly registration codes
alter table public.invites
  add column if not exists invite_code text unique;

-- Create index on invite_code for fast lookups
create index if not exists invites_invite_code_idx on public.invites(invite_code);

-- Function to generate a random invite code (8 characters, alphanumeric uppercase)
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Exclude confusing chars (0,O,I,1)
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  
  -- Ensure uniqueness: if code exists, generate new one (max 10 attempts)
  for i in 1..10 loop
    if not exists (select 1 from public.invites where invite_code = result) then
      return result;
    end if;
    -- Regenerate
    result := '';
    for j in 1..8 loop
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
  end loop;
  
  -- Fallback: if still not unique, append timestamp
  return result || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
end;
$$;

-- Update send_invite to generate invite_code
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
    invitee_email,
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
    (invite_id, 'sent', jsonb_build_object('invitee_email', invitee_email, 'invite_code', invite_code_val));

  return invite_id;
end;
$$;

-- Update admin_create_invite to generate invite_code
create or replace function public.admin_create_invite(
  invitee_email text,
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

  -- Same strict email validation
  if invitee_email ~* '[,\s\t\n\r;]' then
    raise exception 'Only single email allowed';
  end if;

  if invitee_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'Invalid email format';
  end if;

  invitee_email := lower(trim(invitee_email));

  -- Throttle check for the inviter (not the admin)
  select * into throttle_record
  from public.invite_throttle
  where user_id = inviter_user_id
  for update;

  if throttle_record is not null then
    if throttle_record.last_sent_at > now() - interval '30 seconds' then
      raise exception 'Rate limited. Try later';
    end if;
    update public.invite_throttle
    set last_sent_at = now()
    where user_id = inviter_user_id;
  else
    insert into public.invite_throttle (user_id, last_sent_at)
    values (inviter_user_id, now());
  end if;

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
    invitee_email,
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
    (invite_id, 'sent', jsonb_build_object('invitee_email', invitee_email, 'invite_code', invite_code_val));

  return invite_id;
end;
$$;

-- Function to accept invite by code (for registration)
create or replace function public.accept_invite_by_code(invite_code text)
returns uuid
language plpgsql
security definer
as $$
declare
  current_user_id uuid;
  invite_record record;
  invite_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Find pending invite by code with lock
  select * into invite_record
  from public.invites
  where invite_code = upper(trim(accept_invite_by_code.invite_code))
    and status = 'pending'
  for update;

  if invite_record is null then
    raise exception 'Invalid or expired invite code';
  end if;

  -- Update invite status
  update public.invites
  set 
    status = 'accepted',
    accepted_at = now(),
    consumed_by_user_id = current_user_id
  where id = invite_record.id;

  invite_id := invite_record.id;

  -- Record event
  insert into public.invite_events (invite_id, event, meta)
  values (invite_id, 'accepted', jsonb_build_object('user_id', current_user_id, 'via_code', true));

  return invite_id;
end;
$$;

-- Grant execute permission
grant execute on function public.accept_invite_by_code(text) to authenticated;

-- Backfill invite_code for existing invites (generate codes for invites without codes)
do $$
declare
  invite_row record;
  new_code text;
begin
  for invite_row in 
    select id from public.invites where invite_code is null
  loop
    new_code := public.generate_invite_code();
    -- Ensure uniqueness
    while exists (select 1 from public.invites where invite_code = new_code) loop
      new_code := public.generate_invite_code();
    end loop;
    update public.invites set invite_code = new_code where id = invite_row.id;
  end loop;
end $$;

commit;
