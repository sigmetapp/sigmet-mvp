-- Diagnose and fix connections issues
begin;

-- 1. Check if trigger exists and is enabled
SELECT 
  tgname as trigger_name,
  tgenabled as enabled,
  pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgname = 'post_connections_trigger';

-- 2. Check if function exists
SELECT 
  proname as function_name,
  prosrc as function_source
FROM pg_proc
WHERE proname = 'update_connections_on_post';

-- 3. Check if extract_mentions_from_post function exists
SELECT 
  proname as function_name
FROM pg_proc
WHERE proname = 'extract_mentions_from_post';

-- 4. Test the extract_mentions_from_post function manually
-- (This will be done after fixing the trigger)

-- Drop and recreate trigger function with fixed code
drop function if exists public.update_connections_on_post() cascade;

-- Recreate function using helper to get column name
do $$
declare
  author_col text;
  func_body text;
begin
  author_col := public._get_posts_author_column();
  
  if author_col is null then
    raise exception 'Neither user_id nor author_id column found in posts table';
  end if;
  
  raise notice 'Creating trigger function with column: %', author_col;
  
  -- Build function body - use direct column access (no dynamic SQL)
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
    begin
      post_id_val := new.id;
      
      -- Get post text and author_id directly
      post_text := coalesce(new.text, ''''::text);
      post_author_id := new.%I;
      
      -- Delete old connections for this post
      delete from public.user_connections where post_id = post_id_val;
      
      -- Extract mentions and create connections
      if post_text is not null and trim(post_text) != '''' and post_author_id is not null then
        perform public.extract_mentions_from_post(post_text, post_author_id, post_id_val);
      end if;
      
      return new;
    end;
    $trigger_func$;
  ', author_col);
  
  execute func_body;
  
  raise notice 'Trigger function created successfully';
end $$;

-- Recreate trigger (handle both user_id and author_id columns)
do $$
declare
  author_col text;
begin
  author_col := public._get_posts_author_column();
  
  drop trigger if exists post_connections_trigger on public.posts;
  
  if author_col = 'user_id' then
    create trigger post_connections_trigger
      after insert or update of text, user_id on public.posts
      for each row
      execute function public.update_connections_on_post();
  else
    create trigger post_connections_trigger
      after insert or update of text, author_id on public.posts
      for each row
      execute function public.update_connections_on_post();
  end if;
  
  raise notice 'Trigger recreated successfully with column: %', author_col;
end $$;

-- Test: Try to process one existing post manually
do $$
declare
  test_post record;
  author_col text;
  processed int := 0;
begin
  author_col := public._get_posts_author_column();
  
  if author_col is null then
    raise notice 'No author column found';
    return;
  end if;
  
  -- Get one post with text
  execute format('
    select id, coalesce(text, '''') as post_text, %I as post_author_id
    from public.posts
    where text is not null and trim(text) != ''''
    limit 1
  ', author_col) into test_post;
  
  if test_post.id is not null then
    raise notice 'Testing with post ID: %, author: %', test_post.id, test_post.post_author_id;
    
    -- Try to extract mentions
    begin
      perform public.extract_mentions_from_post(
        test_post.post_text,
        test_post.post_author_id,
        test_post.id
      );
      processed := 1;
      raise notice 'Successfully processed test post';
    exception
      when others then
        raise notice 'Error processing test post: %', sqlerrm;
    end;
  else
    raise notice 'No posts found for testing';
  end if;
end $$;

-- Check RLS policies on user_connections
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'user_connections';

-- Add INSERT policy for trigger function (security definer should bypass, but explicit policy helps)
drop policy if exists "system can insert connections" on public.user_connections;
create policy "system can insert connections" 
  on public.user_connections for insert 
  with check (true);  -- Allow all inserts (trigger function uses security definer)

-- Show current connections count
select 
  'Current connections count' as info,
  count(*) as total
from user_connections;

-- Re-run backfill to create connections for all existing posts
do $$
declare
  post_record record;
  processed_count int := 0;
  author_col text;
  error_count int := 0;
begin
  author_col := public._get_posts_author_column();
  
  if author_col is null then
    raise notice 'No author column found, skipping backfill';
    return;
  end if;
  
  raise notice 'Starting backfill with column: %', author_col;
  
  -- Process all posts
  for post_record in 
    execute format('
      select 
        p.id,
        coalesce(
          nullif(trim(p.text), ''''),
          nullif(trim(p.body), ''''),
          ''''
        ) as post_text,
        p.%I as post_author_id
      from public.posts p
      where (
        (p.text is not null and trim(p.text) != '''') 
        or (p.body is not null and trim(p.body) != '''')
      )
      order by p.created_at desc
    ', author_col)
  loop
    if post_record.post_text is null or trim(post_record.post_text) = '' then
      continue;
    end if;
    
    begin
      perform public.extract_mentions_from_post(
        post_record.post_text,
        post_record.post_author_id,
        post_record.id
      );
      
      processed_count := processed_count + 1;
      
      if processed_count % 10 = 0 then
        raise notice 'Processed % posts', processed_count;
      end if;
    exception
      when others then
        error_count := error_count + 1;
        raise notice 'Error processing post %: %', post_record.id, sqlerrm;
        if error_count > 10 then
          raise notice 'Too many errors, stopping backfill';
          exit;
        end if;
    end;
  end loop;
  
  raise notice 'Backfill completed. Processed: %, Errors: %', processed_count, error_count;
end $$;

-- Final connections count
select 
  'Final connections count' as info,
  count(*) as total,
  count(distinct user_id) as unique_users
from user_connections;

commit;
