-- Create user_connections table for optimized SW calculation
begin;

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
create or replace function public.update_connections_on_post()
returns trigger
language plpgsql
security definer
as $$
declare
  post_text text;
  post_author_id uuid;
begin
  -- Get post text (use text field - body might not exist in all schemas)
  post_text := coalesce(new.text, '');
  post_author_id := new.author_id;
  
  -- Delete old connections for this post
  delete from public.user_connections where post_id = new.id;
  
  -- Extract mentions and create connections
  if post_text is not null and trim(post_text) != '' and post_author_id is not null then
    perform public.extract_mentions_from_post(post_text, post_author_id, new.id);
  end if;
  
  return new;
end;
$$;

-- Create trigger on posts table
drop trigger if exists post_connections_trigger on public.posts;
create trigger post_connections_trigger
  after insert or update of text, author_id on public.posts
  for each row
  execute function public.update_connections_on_post();

-- Add indexes for posts table to optimize queries
create index if not exists posts_author_id_created_at_idx 
  on public.posts(author_id, created_at desc);

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

commit;
