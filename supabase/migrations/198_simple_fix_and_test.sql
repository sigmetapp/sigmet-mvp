-- Simple fix and comprehensive test
begin;

-- Step 1: Show all diagnostic info in a table
create temp table if not exists diagnosis_results (
  step text,
  result text
);

delete from diagnosis_results;

-- Basic checks
do $$
declare
  posts_count int;
  posts_with_mentions int;
  users_count int;
  connections_count int;
begin
  select count(*) into posts_count from posts;
  select count(*) into posts_with_mentions from posts where text ~ '@[a-zA-Z0-9_]+' or text ~ '/u/[a-zA-Z0-9_]+';
  select count(*) into users_count from profiles where username is not null and username != '';
  select count(*) into connections_count from user_connections;
  
  insert into diagnosis_results values 
    ('Всего постов', posts_count::text),
    ('Посты с mentions', posts_with_mentions::text),
    ('Пользователи с username', users_count::text),
    ('Текущие connections', connections_count::text);
end $$;

-- Step 2: Temporarily disable RLS
alter table public.user_connections disable row level security;

insert into diagnosis_results values ('RLS', 'Отключен для тестирования');

-- Step 3: Test direct insert
do $$
declare
  user1_id uuid;
  user2_id uuid;
  test_post_id bigint := 222222;
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
    insert into diagnosis_results values 
      ('Тест прямой вставки', '❌ Нет двух пользователей для теста');
    return;
  end if;
  
  select count(*) into connections_before
  from user_connections
  where post_id = test_post_id;
  
  begin
    insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
    values (user1_id, user2_id, test_post_id, 'they_mentioned_me')
    on conflict do nothing;
    
    insert into public.user_connections (user_id, connected_user_id, post_id, connection_type)
    values (user2_id, user1_id, test_post_id, 'i_mentioned_them')
    on conflict do nothing;
    
    select count(*) into connections_after
    from user_connections
    where post_id = test_post_id;
    
    if connections_after > connections_before then
      insert into diagnosis_results values 
        ('Тест прямой вставки', format('✅ УСПЕХ: создано %s connections', (connections_after - connections_before)::text));
    else
      insert into diagnosis_results values 
        ('Тест прямой вставки', '❌ ОШИБКА: connections не созданы');
    end if;
    
    delete from user_connections where post_id = test_post_id;
    
  exception
    when others then
      insert into diagnosis_results values 
        ('Тест прямой вставки', format('❌ ОШИБКА: %s', sqlerrm));
  end;
end $$;

-- Step 4: Test function
do $$
declare
  test_user record;
  test_mentioned_user record;
  test_post_id bigint := 111111;
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
    insert into diagnosis_results values 
      ('Тест функции', '❌ Нет двух пользователей для теста');
    return;
  end if;
  
  select count(*) into connections_before
  from user_connections
  where post_id = test_post_id;
  
  begin
    perform public.extract_mentions_from_post(
      format('Hello @%s, how are you?', test_mentioned_user.username),
      test_user.user_id,
      test_post_id
    );
    
    select count(*) into connections_after
    from user_connections
    where post_id = test_post_id;
    
    if connections_after > connections_before then
      insert into diagnosis_results values 
        ('Тест функции', format('✅ УСПЕХ: создано %s connections', (connections_after - connections_before)::text));
    else
      insert into diagnosis_results values 
        ('Тест функции', format('❌ ОШИБКА: connections не созданы (было: %s, стало: %s)', connections_before, connections_after));
      
      -- Debug username lookup
      declare
        found_count int;
        found_user_id uuid;
      begin
        select count(*), max(user_id) into found_count, found_user_id
        from profiles
        where lower(trim(username)) = lower(trim(test_mentioned_user.username));
        
        insert into diagnosis_results values 
          ('Отладка username', format('Искали: %s, Найдено: %s, User ID: %s', 
            test_mentioned_user.username, found_count, coalesce(found_user_id::text, 'NULL')));
      end;
    end if;
    
    delete from user_connections where post_id = test_post_id;
    
  exception
    when others then
      insert into diagnosis_results values 
        ('Тест функции', format('❌ ОШИБКА: %s', sqlerrm));
  end;
end $$;

-- Step 5: Process all existing posts
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
    insert into diagnosis_results values ('Обработка постов', '❌ Колонка автора не найдена');
    return;
  end if;
  
  select count(*) into total_connections_before from user_connections;
  
  execute format('
    select count(*) 
    from posts 
    where text ~ ''@[a-zA-Z0-9_]+'' or text ~ ''/u/[a-zA-Z0-9_]+''
  ') into posts_with_mentions_count;
  
  insert into diagnosis_results values 
    ('Обработка постов', format('Найдено постов с mentions: %s', posts_with_mentions_count));
  
  if posts_with_mentions_count = 0 then
    insert into diagnosis_results values 
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
          insert into diagnosis_results values 
            ('Ошибка обработки', format('Пост %s: %s', post_record.id, sqlerrm));
        end if;
        if error_count > 10 then
          exit;
        end if;
    end;
  end loop;
  
  select count(*) into total_connections_after from user_connections;
  
  insert into diagnosis_results values 
    ('Обработка постов', format('Обработано: %s, Ошибок: %s', processed_count, error_count)),
    ('Обработка постов', format('Connections создано: %s', (total_connections_after - total_connections_before)));
end $$;

-- Step 6: Re-enable RLS with proper policy
alter table public.user_connections enable row level security;

drop policy if exists "users can view own connections" on public.user_connections;
drop policy if exists "system can insert connections" on public.user_connections;
drop policy if exists "service role can insert connections" on public.user_connections;
drop policy if exists "allow all inserts" on public.user_connections;

create policy "users can view own connections" 
  on public.user_connections for select 
  using (user_id = auth.uid() or connected_user_id = auth.uid());

create policy "allow all inserts" 
  on public.user_connections for insert 
  with check (true);

insert into diagnosis_results values ('RLS', 'Включен с политикой allow all inserts');

-- Step 7: Final statistics
insert into diagnosis_results values 
  ('ФИНАЛЬНАЯ СТАТИСТИКА', ''),
  ('Total connections', (select count(*)::text from user_connections)),
  ('Unique users', (select count(distinct user_id)::text from user_connections)),
  ('Posts with connections', (select count(distinct post_id)::text from user_connections));

-- Show all results
select step, result from diagnosis_results order by 
  case step
    when 'ФИНАЛЬНАЯ СТАТИСТИКА' then 1
    when 'Total connections' then 2
    when 'Unique users' then 3
    when 'Posts with connections' then 4
    when 'Всего постов' then 5
    when 'Посты с mentions' then 6
    when 'Пользователи с username' then 7
    when 'Текущие connections' then 8
    when 'Тест прямой вставки' then 9
    when 'Тест функции' then 10
    when 'Обработка постов' then 11
    else 12
  end;

commit;
