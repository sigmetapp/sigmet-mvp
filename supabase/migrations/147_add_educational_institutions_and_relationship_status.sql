-- Add educational institutions table and relationship status to profiles
begin;

-- Create educational_institutions table
create table if not exists public.educational_institutions (
  id bigserial primary key,
  name text not null,
  type text not null check (type in ('school', 'college', 'university')),
  country text,
  city text,
  created_at timestamptz default now()
);

-- Create index for searching institutions
create index if not exists educational_institutions_name_idx on public.educational_institutions(name);
create index if not exists educational_institutions_type_idx on public.educational_institutions(type);
create index if not exists educational_institutions_country_city_idx on public.educational_institutions(country, city);

-- Add columns to profiles table
alter table if exists public.profiles
  add column if not exists educational_institution_id bigint references public.educational_institutions(id) on delete set null,
  add column if not exists relationship_status text check (relationship_status in ('single', 'looking', 'dating', 'married'));

-- Create index for searching users by institution
create index if not exists profiles_educational_institution_idx on public.profiles(educational_institution_id);

-- Enable RLS on educational_institutions
alter table public.educational_institutions enable row level security;
drop policy if exists "read educational_institutions" on public.educational_institutions;
create policy "read educational_institutions" on public.educational_institutions for select using (true);
drop policy if exists "insert educational_institutions" on public.educational_institutions;
create policy "insert educational_institutions" on public.educational_institutions for insert with check (true);

-- Update track_profile_change function to track new fields
create or replace function public.track_profile_change()
returns trigger as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is not null and current_user_id != new.user_id then
    if coalesce(old.username, '') != coalesce(new.username, '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'username', old.username, new.username);
    end if;
    if coalesce(old.full_name, '') != coalesce(new.full_name, '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'full_name', old.full_name, new.full_name);
    end if;
    if coalesce(old.bio, '') != coalesce(new.bio, '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'bio', old.bio, new.bio);
    end if;
    if coalesce(old.country, '') != coalesce(new.country, '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'country', old.country, new.country);
    end if;
    if coalesce(old.website_url, '') != coalesce(new.website_url, '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'website_url', old.website_url, new.website_url);
    end if;
    if coalesce(old.avatar_url, '') != coalesce(new.avatar_url, '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'avatar_url', old.avatar_url, new.avatar_url);
    end if;
    if coalesce(old.facebook_url, '') != coalesce(new.facebook_url, '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'facebook_url', old.facebook_url, new.facebook_url);
    end if;
    if coalesce(old.instagram_url, '') != coalesce(new.instagram_url, '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'instagram_url', old.instagram_url, new.instagram_url);
    end if;
    if coalesce(old.twitter_url, '') != coalesce(new.twitter_url, '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'twitter_url', old.twitter_url, new.twitter_url);
    end if;
    if coalesce(old.educational_institution_id::text, '') != coalesce(new.educational_institution_id::text, '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'educational_institution_id', old.educational_institution_id::text, new.educational_institution_id::text);
    end if;
    if coalesce(old.relationship_status, '') != coalesce(new.relationship_status, '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'relationship_status', old.relationship_status, new.relationship_status);
    end if;
    if coalesce(array_to_string(old.directions_selected, ','), '') != coalesce(array_to_string(new.directions_selected, ','), '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'directions_selected', array_to_string(old.directions_selected, ','), array_to_string(new.directions_selected, ','));
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

commit;
