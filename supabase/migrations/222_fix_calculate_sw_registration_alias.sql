begin;

-- Fix ambiguous column references by aliasing sw_weights fields when reading into variables
create or replace function public.calculate_user_sw_at_registration(user_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
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
    w.registration_points,
    w.profile_complete_points
  into registration_points, profile_complete_points
  from public.sw_weights w
  where w.id = 1;

  -- If weights not found, use defaults
  if registration_points is null then
    registration_points := 50;
  end if;
  if profile_complete_points is null then
    profile_complete_points := 20;
  end if;

  -- Get user profile
  select * into profile_record
  from public.profiles p
  where p.user_id = calculate_user_sw_at_registration.user_id
  limit 1;

  -- Calculate registration points (always given for registration)
  total_sw := registration_points;

  -- Check if profile is complete
  if profile_record is not null then
    has_username := profile_record.username is not null and trim(profile_record.username) <> '';
    has_full_name := profile_record.full_name is not null and trim(profile_record.full_name) <> '';
    has_bio := profile_record.bio is not null and trim(profile_record.bio) <> '';
    has_country := profile_record.country is not null and trim(profile_record.country) <> '';
    has_avatar := profile_record.avatar_url is not null and trim(profile_record.avatar_url) <> '';

    if has_username and has_full_name and has_bio and has_country and has_avatar then
      total_sw := total_sw + profile_complete_points;
    end if;
  end if;

  return total_sw;
end;
$$;

grant execute on function public.calculate_user_sw_at_registration(uuid) to authenticated;

commit;
