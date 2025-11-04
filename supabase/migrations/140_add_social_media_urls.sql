-- Add social media URL fields to profiles table
alter table public.profiles 
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists twitter_url text;

-- Update track_profile_change function to track social media URLs
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
    if coalesce(array_to_string(old.directions_selected, ','), '') != coalesce(array_to_string(new.directions_selected, ','), '') then
      insert into public.profile_changes (target_user_id, editor_id, field_name, old_value, new_value)
      values (new.user_id, current_user_id, 'directions_selected', array_to_string(old.directions_selected, ','), array_to_string(new.directions_selected, ','));
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;
