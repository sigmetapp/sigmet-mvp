-- Create user_connections table for optimized SW calculation
begin;

-- Helper function to get the author column name
create or replace function public._get_posts_author_column()
returns text
language sql
stable
as $$
  select column_name
  from information_schema.columns
  where table_schema = 'public'
  and table_name = 'posts'
  and column_name in ('user_id', 'author_id')
  limit 1;
$$;

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
  current_user_id := post_author_id;
  
  if post_text is null or trim(post_text) = '' then
    return;
  end if;
  
  text_lower := lower(post_text);
  
  -- Extract @username mentions
  for mention_pattern in 
    select regexp_split_to_table(text_lower, '\s+')
    where regexp_split_to_table ~ '^@[a-z0-9_]+'
  loop
    username_match := substring(mention_pattern from '^@([a-z0-9_]+)');
    
    if username_match is not null then
      select user_id into user_id_found
      from public.profiles
      where lower(username) = username_match
      limit 1;
      
      if user_id_found is not null and user_id_found != current_user_id then
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
        
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
      end if;
    end if;
  end loop;
  
  -- Extract /u/username mentions
  for mention_pattern in 
    select (regexp_matches(text_lower, '/u/([a-z0-9_]+)(\s|$|\n)', 'g'))[1]
  loop
    username_match := mention_pattern;
    
    if username_match is not null then
      select user_id into user_id_found
      from public.profiles
      where lower(username) = username_match
      limit 1;
      
      if user_id_found is not null and user_id_found != current_user_id then
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
        
        insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
        values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
        on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
      end if;
    end if;
  end loop;
  
  -- Check for /u/{user_id} pattern
  for mention_pattern in 
    select (regexp_matches(text_lower, '/u/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\s|$|\n)', 'gi'))[1]
  loop
    if mention_pattern is not null then
      begin
        user_id_found := mention_pattern::uuid;
        
        if user_id_found is not null and user_id_found != current_user_id then
          if exists (select 1 from auth.users where id = user_id_found) then
            insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
            values (user_id_found, current_user_id, post_id, 'they_mentioned_me')
            on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
            
            insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
            values (current_user_id, user_id_found, post_id, 'i_mentioned_them')
            on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
          end if;
        end if;
      exception
        when others then
          null;
      end;
    end if;
  end loop;
end;
$$;

-- Create trigger function dynamically based on which column exists
do $$
declare
  author_col text;
  func_body text;
begin
  author_col := public._get_posts_author_column();
  
  if author_col is null then
    raise exception 'Neither user_id nor author_id column found in posts table';
  end if;
  
  -- Build function body with correct column name
  -- Use double dollar quoting to avoid escaping issues
  func_body := format('
    create or replace function public.update_connections_on_post()
    returns trigger
    language plpgsql
    security definer
    as $trigger_func$
    declare
      post_text text;
      post_author_id uuid;
      post_id_val bigint;
      author_col_name text := %L;
    begin
      post_id_val := new.id;
      
      execute format($sql$select coalesce(text, '')::text, %I::uuid from public.posts where id = $1$sql$, author_col_name) 
        using post_id_val into post_text, post_author_id;
      
      delete from public.user_connections where post_id = post_id_val;
      
      if post_text is not null and trim(post_text) != '''' and post_author_id is not null then
        perform public.extract_mentions_from_post(post_text, post_author_id, post_id_val);
      end if;
      
      return new;
    end;
    $trigger_func$;
  ', author_col);
  
  execute func_body;
end $$;

-- Create trigger on posts table
drop trigger if exists post_connections_trigger on public.posts;
create trigger post_connections_trigger
  after insert or update on public.posts
  for each row
  execute function public.update_connections_on_post();

-- Add indexes for posts table
do $$
declare
  author_col text;
begin
  author_col := public._get_posts_author_column();
  
  if author_col is not null then
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

-- Index on comments
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'comments' 
    and column_name = 'author_id'
  ) then
    execute 'create index if not exists comments_author_id_idx on public.comments(author_id)';
  end if;
end $$;

commit;
