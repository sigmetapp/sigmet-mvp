begin;

-- Create table for invite limits by SW level
create table if not exists public.invite_limits (
  id int primary key default 1,
  beginner_limit int not null default 3,
  growing_limit int not null default 5,
  advance_limit int not null default 10,
  expert_limit int not null default 15,
  leader_limit int not null default 20,
  angel_limit int not null default 30,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id),
  constraint invite_limits_singleton check (id = 1)
);

-- Enable RLS
alter table public.invite_limits enable row level security;

-- Policy: anyone can read, only admins can update
create policy "read_invite_limits" on public.invite_limits
  for select
  using (true);

create policy "update_invite_limits_admin" on public.invite_limits
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Insert default values
insert into public.invite_limits (id, beginner_limit, growing_limit, advance_limit, expert_limit, leader_limit, angel_limit)
values (1, 3, 5, 10, 15, 20, 30)
on conflict (id) do nothing;

-- Function to get invite limit for a user based on their SW level
create or replace function public.get_user_invite_limit(user_id uuid)
returns int
language plpgsql
security definer
stable
as $$
declare
  user_sw numeric;
  user_level text;
  invite_limit int;
begin
  -- Get user's SW
  select total into user_sw
  from public.sw_scores
  where sw_scores.user_id = get_user_invite_limit.user_id;

  -- Default to 0 if no SW found
  if user_sw is null then
    user_sw := 0;
  end if;

  -- Determine level based on SW
  if user_sw >= 50000 then
    user_level := 'angel';
  elsif user_sw >= 10000 then
    user_level := 'leader';
  elsif user_sw >= 6251 then
    user_level := 'expert';
  elsif user_sw >= 1251 then
    user_level := 'advance';
  elsif user_sw >= 100 then
    user_level := 'growing';
  else
    user_level := 'beginner';
  end if;

  -- Get limit from settings
  select 
    case user_level
      when 'beginner' then beginner_limit
      when 'growing' then growing_limit
      when 'advance' then advance_limit
      when 'expert' then expert_limit
      when 'leader' then leader_limit
      when 'angel' then angel_limit
      else beginner_limit
    end
  into invite_limit
  from public.invite_limits
  where id = 1;

  -- Return limit (default to 3 if not found)
  return coalesce(invite_limit, 3);
end;
$$;

-- Grant execute permission
grant execute on function public.get_user_invite_limit(uuid) to authenticated;

-- Update send_invite to use dynamic limits (no email parameter)
drop function if exists public.send_invite();
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

  -- Get user's invite limit based on SW level
  user_invite_limit := public.get_user_invite_limit(current_user_id);

  -- Check invite limit: count pending + accepted invites (excluding expired)
  select count(*) into invite_count
  from public.invites
  where inviter_user_id = current_user_id
    and status in ('pending', 'accepted')
    and (expires_at is null or expires_at >= now());

  if invite_count >= user_invite_limit then
    raise exception using 
      message = 'Invite limit reached (' || user_invite_limit || ' per user for your SW level)';
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
