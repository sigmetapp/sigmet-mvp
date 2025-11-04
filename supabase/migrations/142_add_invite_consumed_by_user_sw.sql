begin;

-- Add consumed_by_user_sw column to invites table
-- This stores the Social Weight (SW) of the user who used the invite at registration time
alter table public.invites
  add column if not exists consumed_by_user_sw numeric default null;

-- Create index for better query performance
create index if not exists invites_consumed_by_user_sw_idx on public.invites(consumed_by_user_sw);

-- Function to calculate basic SW for a new user (at registration time)
-- This is a simplified calculation for registration time
create or replace function public.calculate_user_sw_at_registration(user_id uuid)
returns numeric
language plpgsql
security definer
as $$
declare
  registration_points int;
  profile_complete_points int;
  total_sw numeric;
  profile_record record;
  has_username boolean;
  has_full_name boolean;
  has_bio boolean;
  has_country boolean;
  has_avatar boolean;
begin
  -- Get SW weights
  select 
    registration_points,
    profile_complete_points
  into registration_points, profile_complete_points
  from public.sw_weights
  where id = 1;

  -- If weights not found, use defaults
  if registration_points is null then
    registration_points := 50;
  end if;
  if profile_complete_points is null then
    profile_complete_points := 20;
  end if;

  -- Get user profile
  select * into profile_record
  from public.profiles
  where profiles.user_id = calculate_user_sw_at_registration.user_id
  limit 1;

  -- Calculate registration points (always given for registration)
  total_sw := registration_points;

  -- Check if profile is complete
  if profile_record is not null then
    has_username := profile_record.username is not null and trim(profile_record.username) != '';
    has_full_name := profile_record.full_name is not null and trim(profile_record.full_name) != '';
    has_bio := profile_record.bio is not null and trim(profile_record.bio) != '';
    has_country := profile_record.country is not null and trim(profile_record.country) != '';
    has_avatar := profile_record.avatar_url is not null and trim(profile_record.avatar_url) != '';

    if has_username and has_full_name and has_bio and has_country and has_avatar then
      total_sw := total_sw + profile_complete_points;
    end if;
  end if;

  return total_sw;
end;
$$;

-- Update accept_invite_by_code function to calculate and store SW
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

  -- Find pending invite by code with lock
  select * into invite_record
  from public.invites
  where invite_code = upper(trim(accept_invite_by_code.invite_code))
    and status = 'pending'
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

-- Update accept_invite function (accepts token) to also calculate and store SW
create or replace function public.accept_invite(token uuid)
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

  -- Find pending invite with lock
  select * into invite_record
  from public.invites
  where token = accept_invite.token
    and status = 'pending'
  for update;

  if invite_record is null then
    raise exception 'Invalid or expired invite token';
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
    'user_sw', user_sw
  ));

  return invite_id;
end;
$$;

-- Grant execute permission
grant execute on function public.calculate_user_sw_at_registration(uuid) to authenticated;

commit;
