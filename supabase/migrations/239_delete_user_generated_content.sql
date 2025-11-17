begin;

-- Ensure posts, comments, and related user content are removed when a user (profile) is deleted
create or replace function public.delete_user_generated_content(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  column_name text;
begin
  if p_user_id is null then
    return;
  end if;

  -- Remove likes made by the user
  if to_regclass('public.post_likes') is not null then
    delete from public.post_likes where user_id = p_user_id;
  end if;

  -- Remove reactions made by the user
  if to_regclass('public.post_reactions') is not null then
    delete from public.post_reactions where user_id = p_user_id;
  end if;

  -- Remove comment votes (if table exists)
  if to_regclass('public.comment_votes') is not null then
    delete from public.comment_votes where user_id = p_user_id;
  end if;

  -- Remove user connections for this user
  if to_regclass('public.user_connections') is not null then
    delete from public.user_connections
    where user_id = p_user_id
       or connected_user_id = p_user_id;
  end if;

  -- Remove notifications where this user is the actor or recipient
  if to_regclass('public.notifications') is not null then
    delete from public.notifications
    where user_id = p_user_id
       or actor_id = p_user_id;
  end if;

  -- Remove comments authored by the user (supports both author_id/user_id)
  if to_regclass('public.comments') is not null then
    for column_name in
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'comments'
        and column_name in ('user_id', 'author_id')
    loop
      execute format('delete from public.comments where %I = $1', column_name)
        using p_user_id;
    end loop;
  end if;

  -- Remove posts authored by the user (supports both author_id/user_id)
  if to_regclass('public.posts') is not null then
    for column_name in
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'posts'
        and column_name in ('user_id', 'author_id')
    loop
      execute format('delete from public.posts where %I = $1', column_name)
        using p_user_id;
    end loop;
  end if;
end;
$$;

drop trigger if exists profiles_delete_user_generated_content on public.profiles;

create or replace function public.on_profile_delete_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.delete_user_generated_content(OLD.user_id);
  return OLD;
end;
$$;

create trigger profiles_delete_user_generated_content
after delete on public.profiles
for each row
execute function public.on_profile_delete_cleanup();

commit;
