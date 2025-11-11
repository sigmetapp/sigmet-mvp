-- Backfill user_connections table from existing posts
begin;

-- Function to backfill connections from all existing posts
create or replace function public.backfill_user_connections()
returns void
language plpgsql
security definer
as $$
declare
  post_record record;
  processed_count int := 0;
begin
  -- Process all posts to extract mentions and create connections
  for post_record in 
    select 
      id,
      coalesce(body, text, '') as post_text,
      coalesce(user_id, author_id) as post_author_id
    from public.posts
    where (body is not null and trim(body) != '') or (text is not null and trim(text) != '')
    order by created_at desc
  loop
    -- Extract mentions and create connections for this post
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
  end loop;
  
  raise notice 'Backfill completed. Processed % posts total', processed_count;
end;
$$;

-- Run the backfill
select public.backfill_user_connections();

-- Drop the temporary function (optional - can keep for future use)
-- drop function if exists public.backfill_user_connections();

commit;
