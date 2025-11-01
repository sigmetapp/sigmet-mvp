begin;

-- Drop old invites table if it exists (it has different structure)
drop table if exists public.invites cascade;

-- New invites table with strict structure
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_email text not null,
  token uuid unique not null default gen_random_uuid(),
  status text not null check (status in ('pending', 'accepted', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  consumed_by_user_id uuid references auth.users(id) on delete set null
);

create index invites_inviter_status_idx on public.invites(inviter_user_id, status);
create index invites_token_idx on public.invites(token);
create index invites_invitee_email_idx on public.invites(invitee_email);
create index invites_consumed_by_idx on public.invites(consumed_by_user_id);

-- Invite events for audit trail
create table public.invite_events (
  id bigserial primary key,
  invite_id uuid not null references public.invites(id) on delete cascade,
  event text not null check (event in ('created', 'sent', 'opened', 'accepted', 'expired', 'revoked', 'resend')),
  meta jsonb,
  created_at timestamptz not null default now()
);

create index invite_events_invite_id_idx on public.invite_events(invite_id);
create index invite_events_created_at_idx on public.invite_events(created_at);

-- User activity tracking
create table public.user_activity (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('first_post', 'first_sw_event', 'daily_login')),
  created_at timestamptz not null default now()
);

create index user_activity_user_id_idx on public.user_activity(user_id, kind);
create index user_activity_created_at_idx on public.user_activity(created_at);

-- Rate limiting for invites
create table public.invite_throttle (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_sent_at timestamptz not null default now()
);

-- Admins table
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- View for invite statistics
create or replace view public.invite_stats as
select 
  i.inviter_user_id as user_id,
  count(*) as total_sent,
  count(*) filter (where i.status = 'accepted') as accepted_count,
  count(*) filter (where i.status in ('pending', 'accepted')) as active_count
from public.invites i
group by i.inviter_user_id;

-- Function to check if current user is admin
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
stable
as $$
begin
  return exists (
    select 1 
    from public.admins 
    where user_id = auth.uid()
  );
end;
$$;

-- RLS Policies

-- Invites: owner sees their rows, admin sees all
alter table public.invites enable row level security;

drop policy if exists "users_see_own_invites" on public.invites;
create policy "users_see_own_invites" on public.invites
  for select
  using (
    inviter_user_id = auth.uid() 
    or public.is_admin()
  );

drop policy if exists "admins_manage_all_invites" on public.invites;
create policy "admins_manage_all_invites" on public.invites
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Invite events: owner sees via invite relation, admin sees all
alter table public.invite_events enable row level security;

drop policy if exists "users_see_own_invite_events" on public.invite_events;
create policy "users_see_own_invite_events" on public.invite_events
  for select
  using (
    exists (
      select 1 
      from public.invites i 
      where i.id = invite_events.invite_id 
      and i.inviter_user_id = auth.uid()
    )
    or public.is_admin()
  );

-- User activity: owner sees their rows, admin sees all
alter table public.user_activity enable row level security;

drop policy if exists "users_see_own_activity" on public.user_activity;
create policy "users_see_own_activity" on public.user_activity
  for select
  using (
    user_id = auth.uid() 
    or public.is_admin()
  );

-- Invite throttle: users manage their own, admins see all
alter table public.invite_throttle enable row level security;

drop policy if exists "users_manage_own_throttle" on public.invite_throttle;
create policy "users_manage_own_throttle" on public.invite_throttle
  for all
  using (
    user_id = auth.uid() 
    or public.is_admin()
  )
  with check (
    user_id = auth.uid() 
    or public.is_admin()
  );

-- Admins table: only admins can see/manage
alter table public.admins enable row level security;

drop policy if exists "admins_see_admins" on public.admins;
create policy "admins_see_admins" on public.admins
  for select
  using (public.is_admin());

-- Invite stats view: users see their own, admins see all
alter view public.invite_stats owner to postgres;

-- RLS for view (via underlying table policies, but we need a separate policy)
-- Note: Views inherit RLS from base tables, but we can create a policy on the view itself
grant select on public.invite_stats to authenticated;

-- RPC Functions (security definer)

-- send_invite: Regular user sends an invite (with 3 invite limit)
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

  -- Generate token and create invite
  invite_token := gen_random_uuid();
  
  insert into public.invites (
    inviter_user_id,
    invitee_email,
    token,
    status,
    sent_at
  ) values (
    current_user_id,
    invitee_email,
    invite_token,
    'pending',
    now()
  )
  returning id into invite_id;

  -- Record events
  insert into public.invite_events (invite_id, event, meta)
  values 
    (invite_id, 'created', jsonb_build_object('inviter_user_id', current_user_id)),
    (invite_id, 'sent', jsonb_build_object('invitee_email', invitee_email));

  return invite_id;
end;
$$;

-- accept_invite: Accept an invite with token
create or replace function public.accept_invite(token uuid)
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

  -- Find pending invite with lock
  select * into invite_record
  from public.invites
  where token = accept_invite.token
    and status = 'pending'
  for update;

  if invite_record is null then
    raise exception 'Invalid or expired invite token';
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
  values (invite_id, 'accepted', jsonb_build_object('user_id', current_user_id));

  return invite_id;
end;
$$;

-- admin_create_invite: Admin creates invite (bypasses 3 invite limit)
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

  -- Generate token and create invite (NO LIMIT CHECK for admin)
  invite_token := gen_random_uuid();
  
  insert into public.invites (
    inviter_user_id,
    invitee_email,
    token,
    status,
    sent_at
  ) values (
    inviter_user_id,
    invitee_email,
    invite_token,
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
    (invite_id, 'sent', jsonb_build_object('invitee_email', invitee_email));

  return invite_id;
end;
$$;

-- is_admin_uid: Wrapper for frontend to check admin status
create or replace function public.is_admin_uid()
returns boolean
language plpgsql
security definer
stable
as $$
begin
  return public.is_admin();
end;
$$;

-- Grant execute permissions
grant execute on function public.send_invite(text) to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.admin_create_invite(text, uuid) to authenticated;
grant execute on function public.is_admin_uid() to authenticated;

commit;
