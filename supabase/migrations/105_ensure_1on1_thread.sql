-- Create RPC to ensure a 1:1 thread exists for two users (a,b)
-- Returns the thread row from public.dms_threads

create or replace function public.ensure_1on1_thread(a uuid, b uuid)
returns public.dms_threads
language plpgsql
as $$
declare
  t public.dms_threads;
begin
  -- Disallow nulls
  if a is null or b is null then
    raise exception 'a and b are required';
  end if;

  -- If same user, try to find any existing 1:1 thread for self-DM
  if a = b then
    select t2.* into t
    from public.dms_threads t2
    join public.dms_thread_participants p1 on p1.thread_id = t2.id and p1.user_id = a
    where t2.is_group = false
    order by t2.id desc
    limit 1;

    if found then
      return t;
    end if;
  end if;

  -- Try to find an existing non-group thread where participants exactly include a and b
  select t2.* into t
  from public.dms_threads t2
  join public.dms_thread_participants p1 on p1.thread_id = t2.id and p1.user_id = a
  join public.dms_thread_participants p2 on p2.thread_id = t2.id and p2.user_id = b
  where t2.is_group = false
  order by t2.id desc
  limit 1;

  if found then
    return t;
  end if;

  -- Otherwise create a new thread and add both participants
  insert into public.dms_threads(created_by, is_group)
  values (a, false)
  returning * into t;

  insert into public.dms_thread_participants(thread_id, user_id, role)
  values (t.id, a, 'owner'), (t.id, b, 'member');

  return t;
end;
$$;

-- Optional: allow execution by authenticated users (default in Supabase)
-- grant execute on function public.ensure_1on1_thread(uuid, uuid) to authenticated, anon;