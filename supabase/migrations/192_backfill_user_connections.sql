-- Backfill user_connections table from existing posts
begin;

-- Drop old function if it exists (in case return type changed)
drop function if exists public.backfill_user_connections();

-- Function to backfill connections from all existing posts
create or replace function public.backfill_user_connections()
returns jsonb
language plpgsql
security definer
as $$
declare
  post_record record;
  processed_count int := 0;
  author_col text;
  total_posts int := 0;
  all_posts_count int := 0;
  result jsonb;
begin
  -- Determine which column exists (user_id or author_id)
  author_col := public._get_posts_author_column();
  
  if author_col is null then
    return jsonb_build_object(
      'success', false,
      'processed_count', 0,
      'message', 'No author column found in posts table'
    );
  end if;
  
  -- First, check total posts in table
  select count(*) into all_posts_count from public.posts;
  raise notice 'Total posts in table: %', all_posts_count;
  
  -- Count total posts with text/body (check both text and body fields)
  -- Use dynamic SQL to handle body column if it exists
  begin
    execute format('
      select count(*) 
      from public.posts 
      where (
        (text is not null and trim(text) != '''') 
        or (body is not null and trim(body) != '''')
      )
    ') into total_posts;
  exception
    when undefined_column then
      -- body column doesn't exist, use only text
      select count(*) into total_posts
      from public.posts
      where text is not null and trim(text) != '';
  end;
  
  raise notice 'Using column: %, Total posts to process (with text/body): %', author_col, total_posts;
  
  -- Process posts using the correct column (try text first, then body)
  -- Use simpler query without body check in WHERE (handle it in COALESCE)
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
      where p.text is not null and trim(p.text) != ''''
      order by p.created_at desc
    ', author_col)
  loop
    -- Skip if post_text is empty after processing
    if post_record.post_text is null or trim(post_record.post_text) = '' then
      continue;
    end if;
    
    -- Extract mentions and create connections for this post
    begin
      perform public.extract_mentions_from_post(
        post_record.post_text,
        post_record.post_author_id,
        post_record.id
      );
      
      processed_count := processed_count + 1;
      
      -- Log progress every 10 posts (for smaller datasets)
      if processed_count % 10 = 0 then
        raise notice 'Processed % posts', processed_count;
      end if;
    exception
      when others then
        -- Log error but continue processing
        raise notice 'Error processing post %: %', post_record.id, sqlerrm;
        processed_count := processed_count + 1; -- Count even if error
    end;
  end loop;
  
  -- Also process posts with body but no text (if body column exists)
  begin
    for post_record in 
      execute format('
        select 
          p.id,
          trim(p.body) as post_text,
          p.%I as post_author_id
        from public.posts p
        where p.body is not null 
          and trim(p.body) != ''''
          and (p.text is null or trim(p.text) = '''')
        order by p.created_at desc
      ', author_col)
    loop
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
          raise notice 'Error processing post %: %', post_record.id, sqlerrm;
          processed_count := processed_count + 1;
      end;
    end loop;
  exception
    when undefined_column then
      -- body column doesn't exist, skip
      null;
  end;
  
  raise notice 'Backfill completed. Processed % posts total', processed_count;
  
  -- Return result as JSON
  result := jsonb_build_object(
    'success', true,
    'processed_count', processed_count,
    'total_posts_in_table', all_posts_count,
    'total_posts_with_text', total_posts,
    'author_column', author_col,
    'message', format('Successfully processed %s posts out of %s total', processed_count, total_posts)
  );
  
  return result;
end;
$$;

-- Run the backfill and show results
select public.backfill_user_connections() as result;

-- Keep the function for future use (can be called manually if needed)
-- drop function if exists public.backfill_user_connections();

commit;
