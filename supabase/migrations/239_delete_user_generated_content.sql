begin;

-- Ensure posts, comments, and related user content are removed when a user (profile) is deleted
create or replace function public.delete_user_generated_content(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  posts_author_column text;
  comments_author_column text;
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

  -- Remove comments authored by the user
  if to_regclass('public.comments') is not null then
    select column_name
      into comments_author_column
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and column_name in ('user_id', 'author_id')
    limit 1;

    if comments_author_column is not null then
      execute format('delete from public.comments where %I = $1', comments_author_column)
        using p_user_id;
    end if;
  end if;

  -- Remove posts authored by the user
  if to_regclass('public.posts') is not null then
    select column_name
      into posts_author_column
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name in ('user_id', 'author_id')
    limit 1;

    if posts_author_column is not null then
      execute format('delete from public.posts where %I = $1', posts_author_column)
        using p_user_id;
    end if;
  end if;
end;
$$;

-- Fire the cleanup whenever the user's profile row is removed (covers auth deletions and manual removals)
drop trigger if exists profiles_delete_user_generated_content on public.profiles;

create trigger profiles_delete_user_generated_content
after delete on public.profiles
for each row
execute function public.delete_user_generated_content(OLD.user_id);

commit;
