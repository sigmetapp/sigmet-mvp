-- Fix trigger function and re-run backfill if needed
begin;

-- Drop and recreate trigger function with fixed SQL
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
  
  -- Build function body with correct column name
  -- Use simple approach: directly embed column name in function
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
      
      -- Get post text and author_id directly (column name is known at function creation time)
      post_text := coalesce(new.text, ''''::text);
      post_author_id := new.%I;
      
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

-- Recreate trigger
drop trigger if exists post_connections_trigger on public.posts;
create trigger post_connections_trigger
  after insert or update on public.posts
  for each row
  execute function public.update_connections_on_post();

-- Re-run backfill to ensure all existing posts have connections
-- This will add any missing connections without duplicating existing ones
do $$
declare
  post_record record;
  processed_count int := 0;
  author_col text;
begin
  author_col := public._get_posts_author_column();
  
  if author_col is null then
    raise notice 'No author column found, skipping backfill';
    return;
  end if;
  
  raise notice 'Re-running backfill with column: %', author_col;
  
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
      -- Extract mentions (will skip duplicates due to unique constraint)
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
        raise notice 'Error processing post %: %', post_record.id, sqlerrm;
    end;
  end loop;
  
  raise notice 'Backfill completed. Processed % posts', processed_count;
end $$;

commit;
