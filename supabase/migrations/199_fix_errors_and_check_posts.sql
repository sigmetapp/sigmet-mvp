-- Fix errors and check for mentions in different formats
begin;

-- Step 1: Check posts for mentions in different formats
create temp table if not exists mention_check_results (
  check_type text,
  result text
);

delete from mention_check_results;

-- Check various mention patterns
do $$
declare
  posts_with_at int;
  posts_with_u_slash int;
  posts_with_u_brace int;
  posts_with_any_mention int;
  sample_post_text text;
begin
  -- Check @username pattern
  select count(*) into posts_with_at
  from posts
  where text ~ '@[a-zA-Z0-9_]+';
  
  -- Check /u/username pattern
  select count(*) into posts_with_u_slash
  from posts
  where text ~ '/u/[a-zA-Z0-9_]+';
  
  -- Check /u/{uuid} pattern
  select count(*) into posts_with_u_brace
  from posts
  where text ~ '/u/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  
  -- Check any mention-like pattern
  select count(*) into posts_with_any_mention
  from posts
  where text ~ '@|/u/';
  
  -- Get sample post text
  select text into sample_post_text
  from posts
  where text is not null and trim(text) != ''
  order by created_at desc
  limit 1;
  
  insert into mention_check_results values 
    ('Посты с @username', posts_with_at::text),
    ('Посты с /u/username', posts_with_u_slash::text),
    ('Посты с /u/{uuid}', posts_with_u_brace::text),
    ('Посты с любым упоминанием (@ или /u/)', posts_with_any_mention::text),
    ('Пример текста поста', coalesce(substring(sample_post_text, 1, 100), 'Нет постов'));
end $$;

-- Step 2: Fix and test direct insert (use NULL for post_id to avoid FK constraint)
do $$
declare
  user1_id uuid;
  user2_id uuid;
  connections_before int;
  connections_after int;
begin
  select user_id into user1_id
  from profiles
  where username is not null and username != ''
  order by created_at desc
  limit 1;
  
  select user_id into user2_id
  from profiles
  where username is not null 
    and username != ''
    and user_id != coalesce(user1_id, '00000000-0000-0000-0000-000000000000'::uuid)
  order by created_at desc
  limit 1;
  
  if user1_id is null or user2_id is null then
    insert into mention_check_results values 
      ('Тест прямой вставки', '❌ Нет двух пользователей для теста');
    return;
  end if;
  
  -- Use NULL for post_id to avoid FK constraint
  select count(*) into connections_before
  from user_connections
  where user_id = user1_id and connected_user_id = user2_id;
  
  begin
    insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
    values (user1_id, user2_id, null, 'they_mentioned_me')
    on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
    
    insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
    values (user2_id, user1_id, null, 'i_mentioned_them')
    on conflict (user_id, connected_user_id, post_id, connection_type) do nothing;
    
    select count(*) into connections_after
    from user_connections
    where user_id = user1_id and connected_user_id = user2_id;
    
    if connections_after > connections_before then
      insert into mention_check_results values 
        ('Тест прямой вставки', format('✅ УСПЕХ: создано %s connections', (connections_after - connections_before)::text));
      
      -- Clean up
      delete from user_connections 
      where (user_id = user1_id and connected_user_id = user2_id) 
         or (user_id = user2_id and connected_user_id = user1_id);
    else
      insert into mention_check_results values 
        ('Тест прямой вставки', '❌ ОШИБКА: connections не созданы');
    end if;
    
  exception
    when others then
      insert into mention_check_results values 
        ('Тест прямой вставки', format('❌ ОШИБКА: %s', sqlerrm));
  end;
end $$;

-- Step 3: Fix and test function (use NULL for post_id)
do $$
declare
  test_user record;
  test_mentioned_user record;
  connections_before int;
  connections_after int;
begin
  select user_id, username into test_user
  from profiles
  where username is not null and username != ''
  order by created_at desc
  limit 1;
  
  select user_id, username into test_mentioned_user
  from profiles
  where username is not null 
    and username != ''
    and user_id != coalesce(test_user.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  order by created_at desc
  limit 1;
  
  if test_user.user_id is null or test_mentioned_user.user_id is null then
    insert into mention_check_results values 
      ('Тест функции', '❌ Нет двух пользователей для теста');
    return;
  end if;
  
  -- Count connections before (for these users, any post_id)
  select count(*) into connections_before
  from user_connections
  where (user_id = test_user.user_id and connected_user_id = test_mentioned_user.user_id)
     or (user_id = test_mentioned_user.user_id and connected_user_id = test_user.user_id);
  
  begin
    -- Use NULL for post_id
    perform public.extract_mentions_from_post(
      format('Hello @%s, how are you?', test_mentioned_user.username),
      test_user.user_id,
      null  -- NULL post_id to avoid FK constraint
    );
    
    select count(*) into connections_after
    from user_connections
    where (user_id = test_user.user_id and connected_user_id = test_mentioned_user.user_id)
       or (user_id = test_mentioned_user.user_id and connected_user_id = test_user.user_id);
    
    if connections_after > connections_before then
      insert into mention_check_results values 
        ('Тест функции', format('✅ УСПЕХ: создано %s connections', (connections_after - connections_before)::text));
    else
      insert into mention_check_results values 
        ('Тест функции', format('❌ ОШИБКА: connections не созданы (было: %s, стало: %s)', connections_before, connections_after));
      
      -- Debug username lookup (FIXED: use array_agg instead of max)
      declare
        found_count int;
        found_user_ids uuid[];
      begin
        select count(*), array_agg(user_id) into found_count, found_user_ids
        from profiles
        where lower(trim(username)) = lower(trim(test_mentioned_user.username));
        
        insert into mention_check_results values 
          ('Отладка username', format('Искали: %s, Найдено: %s, User IDs: %s', 
            test_mentioned_user.username, found_count, coalesce(array_to_string(found_user_ids, ', '), 'NULL')));
      end;
    end if;
    
    -- Clean up test connections
    delete from user_connections 
    where ((user_id = test_user.user_id and connected_user_id = test_mentioned_user.user_id)
        or (user_id = test_mentioned_user.user_id and connected_user_id = test_user.user_id))
      and post_id is null;
    
  exception
    when others then
      insert into mention_check_results values 
        ('Тест функции', format('❌ ОШИБКА: %s', sqlerrm));
  end;
end $$;

-- Step 4: Check if we need to allow NULL post_id in table
-- First check current constraint
do $$
declare
  allows_null bool;
begin
  select is_nullable = 'YES' into allows_null
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_connections'
    and column_name = 'post_id';
  
  if not allows_null then
    -- Allow NULL for post_id (for manual connections or test connections)
    alter table public.user_connections 
      alter column post_id drop not null;
    
    insert into mention_check_results values 
      ('Изменение схемы', 'post_id теперь может быть NULL');
  else
    insert into mention_check_results values 
      ('Изменение схемы', 'post_id уже может быть NULL');
  end if;
end $$;

-- Step 5: Process all existing posts (only if there are posts with mentions)
do $$
declare
  post_record record;
  processed_count int := 0;
  author_col text;
  error_count int := 0;
  total_connections_before int;
  total_connections_after int;
  posts_with_mentions_count int;
begin
  author_col := public._get_posts_author_column();
  
  if author_col is null then
    insert into mention_check_results values 
      ('Обработка постов', '❌ Колонка автора не найдена');
    return;
  end if;
  
  select count(*) into total_connections_before from user_connections;
  
  execute format('
    select count(*) 
    from posts 
    where text ~ ''@[a-zA-Z0-9_]+'' or text ~ ''/u/[a-zA-Z0-9_]+''
  ') into posts_with_mentions_count;
  
  insert into mention_check_results values 
    ('Обработка постов', format('Найдено постов с mentions: %s', posts_with_mentions_count));
  
  if posts_with_mentions_count = 0 then
    insert into mention_check_results values 
      ('Обработка постов', '⚠️ Нет постов с mentions для обработки');
    return;
  end if;
  
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
      and (p.text ~ ''@[a-zA-Z0-9_]+'' or p.text ~ ''/u/[a-zA-Z0-9_]+'')
      order by p.created_at desc
    ', author_col)
  loop
    if post_record.post_text is null or trim(post_record.post_text) = '' then
      continue;
    end if;
    
    if post_record.post_author_id is null then
      continue;
    end if;
    
    begin
      perform public.extract_mentions_from_post(
        post_record.post_text,
        post_record.post_author_id,
        post_record.id
      );
      
      processed_count := processed_count + 1;
    exception
      when others then
        error_count := error_count + 1;
        if error_count <= 3 then
          insert into mention_check_results values 
            ('Ошибка обработки', format('Пост %s: %s', post_record.id, sqlerrm));
        end if;
        if error_count > 10 then
          exit;
        end if;
    end;
  end loop;
  
  select count(*) into total_connections_after from user_connections;
  
  insert into mention_check_results values 
    ('Обработка постов', format('Обработано: %s, Ошибок: %s', processed_count, error_count)),
    ('Обработка постов', format('Connections создано: %s', (total_connections_after - total_connections_before)));
end $$;

-- Step 6: Final statistics
insert into mention_check_results values 
  ('ФИНАЛЬНАЯ СТАТИСТИКА', ''),
  ('Total connections', (select count(*)::text from user_connections)),
  ('Unique users', (select count(distinct user_id)::text from user_connections)),
  ('Posts with connections', (select count(distinct post_id)::text from user_connections where post_id is not null));

-- Show all results
select check_type, result from mention_check_results order by 
  case check_type
    when 'ФИНАЛЬНАЯ СТАТИСТИКА' then 1
    when 'Total connections' then 2
    when 'Unique users' then 3
    when 'Posts with connections' then 4
    when 'Посты с @username' then 5
    when 'Посты с /u/username' then 6
    when 'Посты с /u/{uuid}' then 7
    when 'Посты с любым упоминанием (@ или /u/)' then 8
    when 'Пример текста поста' then 9
    when 'Тест прямой вставки' then 10
    when 'Тест функции' then 11
    when 'Отладка username' then 12
    when 'Обработка постов' then 13
    else 14
  end;

commit;
