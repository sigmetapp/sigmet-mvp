-- Backfill user_connections table from existing posts
begin;

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
  
  -- Count total posts first
  select count(*) into total_posts
  from public.posts
  where text is not null and trim(text) != '';
  
  raise notice 'Using column: %, Total posts to process: %', author_col, total_posts;
  
  -- Process posts using the correct column
  for post_record in 
    execute format('
      select 
        id,
        coalesce(text, '''') as post_text,
        %I as post_author_id
      from public.posts
      where text is not null and trim(text) != ''''
      order by created_at desc
    ', author_col)
  loop
    -- Extract mentions and create connections for this post
    begin
      perform public.extract_mentions_from_post(
        post_record.post_text,
        post_record.post_author_id,
        post_record.id
      );
      
      processed_count := processed_count + 1;
      
      -- Log progress every 100 posts
      if processed_count % 100 = 0 then
        raise notice 'Processed % posts', processed_count;
      end if;
    exception
      when others then
        -- Log error but continue processing
        raise notice 'Error processing post %: %', post_record.id, sqlerrm;
    end;
  end loop;
  
  raise notice 'Backfill completed. Processed % posts total', processed_count;
  
  -- Return result as JSON
  result := jsonb_build_object(
    'success', true,
    'processed_count', processed_count,
    'total_posts', total_posts,
    'author_column', author_col,
    'message', format('Successfully processed %s posts', processed_count)
  );
  
  return result;
end;
$$;

-- Run the backfill and show results
select public.backfill_user_connections() as result;

-- Keep the function for future use (can be called manually if needed)
-- drop function if exists public.backfill_user_connections();

commit;
