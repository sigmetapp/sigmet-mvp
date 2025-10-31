-- Profile changes tracking for Trust Flow
-- This table stores all changes made to profiles by other users

create table if not exists public.profile_changes (
  id bigserial primary key,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  editor_id uuid references auth.users(id) on delete set null,
  field_name text not null,
  old_value text,
  new_value text,
  comment text,
  created_at timestamptz default now()
);

create index if not exists profile_changes_target_created_idx 
  on public.profile_changes(target_user_id, created_at desc);

alter table public.profile_changes enable row level security;

-- Anyone can read profile changes (for transparency)
drop policy if exists "read profile_changes" on public.profile_changes;
create policy "read profile_changes" 
  on public.profile_changes for select using (true);

-- Only authenticated users can insert (when editing others' profiles)
drop policy if exists "insert profile_changes" on public.profile_changes;
create policy "insert profile_changes" 
  on public.profile_changes for insert 
  with check (auth.uid() is not null);

-- Function to track profile changes
-- This will be called by trigger when profile is updated
create or replace function public.track_profile_change()
returns trigger as $$
declare
  current_user_id uuid;
  field_name text;
  old_val text;
  new_val text;
begin
  -- Get current user ID
  current_user_id := auth.uid();
  
  -- Only track changes if made by someone other than the profile owner
  if current_user_id is not null and current_user_id != new.user_id then
    -- Track username changes
    if coalesce(old.username, '') != coalesce(new.username, '') then
      insert into public.profile_changes (
        target_user_id, editor_id, field_name, old_value, new_value
      ) values (
        new.user_id, current_user_id, 'username', 
        old.username, new.username
      );
    end if;
    
    -- Track full_name changes
    if coalesce(old.full_name, '') != coalesce(new.full_name, '') then
      insert into public.profile_changes (
        target_user_id, editor_id, field_name, old_value, new_value
      ) values (
        new.user_id, current_user_id, 'full_name', 
        old.full_name, new.full_name
      );
    end if;
    
    -- Track bio changes
    if coalesce(old.bio, '') != coalesce(new.bio, '') then
      insert into public.profile_changes (
        target_user_id, editor_id, field_name, old_value, new_value
      ) values (
        new.user_id, current_user_id, 'bio', 
        old.bio, new.bio
      );
    end if;
    
    -- Track country changes
    if coalesce(old.country, '') != coalesce(new.country, '') then
      insert into public.profile_changes (
        target_user_id, editor_id, field_name, old_value, new_value
      ) values (
        new.user_id, current_user_id, 'country', 
        old.country, new.country
      );
    end if;
    
    -- Track website_url changes
    if coalesce(old.website_url, '') != coalesce(new.website_url, '') then
      insert into public.profile_changes (
        target_user_id, editor_id, field_name, old_value, new_value
      ) values (
        new.user_id, current_user_id, 'website_url', 
        old.website_url, new.website_url
      );
    end if;
    
    -- Track avatar_url changes
    if coalesce(old.avatar_url, '') != coalesce(new.avatar_url, '') then
      insert into public.profile_changes (
        target_user_id, editor_id, field_name, old_value, new_value
      ) values (
        new.user_id, current_user_id, 'avatar_url', 
        old.avatar_url, new.avatar_url
      );
    end if;
    
    -- Track directions_selected changes (array comparison)
    if coalesce(array_to_string(old.directions_selected, ','), '') != 
       coalesce(array_to_string(new.directions_selected, ','), '') then
      insert into public.profile_changes (
        target_user_id, editor_id, field_name, old_value, new_value
      ) values (
        new.user_id, current_user_id, 'directions_selected', 
        array_to_string(old.directions_selected, ','), 
        array_to_string(new.directions_selected, ',')
      );
    end if;
  end if;
  
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger to automatically track profile changes
drop trigger if exists profile_changes_trigger on public.profiles;
create trigger profile_changes_trigger
  after update on public.profiles
  for each row
  execute function public.track_profile_change();
