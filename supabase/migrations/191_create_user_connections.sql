-- Create user_connections table for optimized SW calculation
begin;

-- First, determine which column exists in posts table (user_id or author_id)
do $$
declare
  author_col text;
begin
  -- Determine which column exists
  select column_name into author_col
  from information_schema.columns
  where table_schema = 'public'
  and table_name = 'posts'
  and column_name in ('user_id', 'author_id')
  limit 1;
  
  -- Store in a temporary table for use in subsequent functions
  drop table if exists _sw_migration_config;
  create temporary table _sw_migration_config (
    posts_author_column text
  );
  
  if author_col is not null then
    insert into _sw_migration_config (posts_author_column) values (author_col);
  else
    raise exception 'Neither user_id nor author_id column found in posts table';
  end if;
end $$;

-- Create table for storing user connections (mentions)
create table if not exists public.user_connections (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  connected_user_id uuid not null references auth.users(id) on delete cascade,
  post_id bigint references public.posts(id) on delete cascade,
  connection_type text not null check (connection_type in ('they_mentioned_me', 'i_mentioned_them')),
  created_at timestamptz default now(),
  unique(user_id, connected_user_id, post_id, connection_type)
);

-- Create indexes for fast lookups
create index if not exists user_connections_user_id_idx 
  on public.user_connections(user_id);

create index if not exists user_connections_connected_user_id_idx 
  on public.user_connections(connected_user_id);

create index if not exists user_connections_post_id_idx 
  on public.user_connections(post_id);

create index if not exists user_connections_created_at_idx 
  on public.user_connections(created_at desc);

-- Enable RLS
alter table public.user_connections enable row level security;

-- RLS policies: users can see their own connections
create policy "users can view own connections" 
  on public.user_connections for select 
  using (user_id = auth.uid() or connected_user_id = auth.uid());

-- Function to extract mentions from text and create connections
create or replace function public.extract_mentions_from_post(
  post_text text,
  post_author_id uuid,
  post_id bigint
)
returns void
language plpgsql
security definer
as $$
declare
  mention_pattern text;
  username_match text;
  user_id_found uuid;
  current_user_id uuid;
  text_lower text;
begin
  -- Get current user (post author)
  current_user_id := post_author_id;
  
  if post_text is null or trim(post_text) = '' then
    return;
  end if;
  
  text_lower := lower(post_text);
  
  -- Extract @username mentions
  -- Pattern: @username followed by space, end of string, or newline
  for mention_pattern in 
    select regexp_split_to_table(text_lower, '\s+')
    where regexp_split_to_table ~ '^@[a-z0-9_]+'
  loop
    -- Extract username (remove @)
    username_match := substring(mention_pattern from '^@([a-z0-9_]+)');
    
    if username_match is not null then
      -- Find user by username
      select user_id into user_id_found
      from public.profiles
      where lower(username) = username_match
      limit 1;
      
      if user_id_found is not null and user_id_found != current_user_id then
        -- Insert connection: they mentioned me (from their perspective)
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
        
        -- Insert connection: I mentioned them (from my perspective)
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
      end if;
    end if;
  end loop;
  
  -- Extract /u/username mentions
  -- Pattern: /u/username followed by space, end of string, or newline
  for mention_pattern in 
    select (regexp_matches(text_lower, '/u/([a-z0-9_]+)(\s|$|\n)', 'g'))[1]
  loop
    username_match := mention_pattern;
    
    if username_match is not null then
      -- Find user by username
      select user_id into user_id_found
      from public.profiles
      where lower(username) = username_match
      limit 1;
      
      if user_id_found is not null and user_id_found != current_user_id then
        -- Insert connection: they mentioned me (from their perspective)
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
        
        -- Insert connection: I mentioned them (from my perspective)
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
      end if;
    end if;
  end loop;
  
  -- Also check for /u/{user_id} pattern
  for mention_pattern in 
    select (regexp_matches(text_lower, '/u/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\s|$|\n)', 'gi'))[1]
  loop
    if mention_pattern is not null then
      begin
        user_id_found := mention_pattern::uuid;
        
        if user_id_found is not null and user_id_found != current_user_id then
          -- Verify user exists
          if exists (select 1 from auth.users where id = user_id_found) then
            -- Insert connection: they mentioned me (from their perspective)
            insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
            values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
            on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
            
            -- Insert connection: I mentioned them (from my perspective)
            insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
            values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
            on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
          end if;
        end if;
      exception
        when others then
          -- Invalid UUID, skip
          null;
      end;
    end if;
  end loop;
end;
$$;

-- Trigger function to update connections when post is created or updated
-- Uses dynamic SQL based on which column exists
create or replace function public.update_connections_on_post()
returns trigger
language plpgsql
security definer
as $$
declare
  post_text text;
  post_author_id uuid;
  author_col text;
  post_id_val bigint;
begin
  -- Get post ID (this column always exists)
  post_id_val := new.id;
  
  -- Get the author column name from config
  select posts_author_column into author_col
  from _sw_migration_config
  limit 1;
  
  if author_col is null then
    -- Fallback: determine which column exists
    select column_name into author_col
    from information_schema.columns
    where table_schema = 'public'
    and table_name = 'posts'
    and column_name in ('user_id', 'author_id')
    limit 1;
  end if;
  
  if author_col is null then
    -- No author column found, skip
    return new;
  end if;
  
  -- Get post text and author_id using dynamic SQL
  execute format('
    select 
      coalesce(text, '''')::text,
      %I::uuid
    from public.posts
    where id = $1
  ', author_col) using post_id_val into post_text, post_author_id;
  
  -- Delete old connections for this post
  delete from public.user_connections where post_id = post_id_val;
  
  -- Extract mentions and create connections
  if post_text is not null and trim(post_text) != '' and post_author_id is not null then
    perform public.extract_mentions_from_post(post_text, post_author_id, post_id_val);
  end if;
  
  return new;
end;
$$;

-- Create trigger on posts table
-- Trigger will fire on any insert or update, function will handle column detection
drop trigger if exists post_connections_trigger on public.posts;
create trigger post_connections_trigger
  after insert or update on public.posts
  for each row
  execute function public.update_connections_on_post();

-- Add indexes for posts table to optimize queries
-- Create index on the author column that exists
do $$
declare
  author_col text;
begin
  -- Get the author column name from config
  select posts_author_column into author_col
  from _sw_migration_config
  limit 1;
  
  if author_col is not null then
    -- Create index using dynamic SQL
    execute format('
      create index if not exists posts_%s_created_at_idx 
      on public.posts(%I, created_at desc)
    ', 
      case when author_col = 'user_id' then 'user_id' else 'author_id' end,
      author_col
    );
  end if;
end $$;

-- Additional indexes for SW calculation optimization
create index if not exists sw_ledger_user_id_idx 
  on public.sw_ledger(user_id);

create index if not exists follows_followee_id_idx 
  on public.follows(followee_id);

create index if not exists post_reactions_post_id_idx 
  on public.post_reactions(post_id);

create index if not exists invites_inviter_user_id_status_idx 
  on public.invites(inviter_user_id, status);

create index if not exists comments_user_id_idx 
  on public.comments(author_id);

-- Clean up temporary config table
drop table if exists _sw_migration_config;

commit;
