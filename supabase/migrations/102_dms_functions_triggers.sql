-- DMS functions and triggers
-- - public.is_blocked(u1 uuid, u2 uuid) -> boolean
-- - Trigger on insert into public.dms_messages to create delivery receipts
-- - public.ensure_1on1_thread(a uuid, b uuid) -> bigint (thread id)

begin;

-- 1) Check if two users are mutually blocked (either direction)
create or replace function public.is_blocked(u1 uuid, u2 uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.dms_blocks b
    where (b.blocker = u1 and b.blocked = u2)
       or (b.blocker = u2 and b.blocked = u1)
  );
$$;

-- 2) Trigger: on insert into dms_messages, create receipts for all participants except sender
--    - status = 'delivered'
--    - skip recipients if blocked with sender
create or replace function public.dms_create_receipts_on_message()
returns trigger
language plpgsql
as $$
begin
  -- Create delivery receipts for all recipients in the thread except the sender,
  -- skipping anyone blocked in either direction relative to the sender
  insert into public.dms_message_receipts (message_id, user_id, status)
  select NEW.id, p.user_id, 'delivered'
  from public.dms_thread_participants p
  where p.thread_id = NEW.thread_id
    and p.user_id <> NEW.sender_id
    and not public.is_blocked(NEW.sender_id, p.user_id);

  return NEW;
end;
$$;

drop trigger if exists dms_messages_after_insert_receipts on public.dms_messages;
create trigger dms_messages_after_insert_receipts
after insert on public.dms_messages
for each row
execute function public.dms_create_receipts_on_message();

-- 3) Ensure or create a 1-on-1 thread between users a and b
-- Returns the thread id (bigint)
create or replace function public.ensure_1on1_thread(a uuid, b uuid)
returns bigint
language plpgsql
as $$
declare
  existing_thread_id bigint;
  created_thread_id bigint;
  lock_key bigint;
  ua text;
  ub text;
  first uuid;
  second uuid;
begin
  if a = b then
    raise exception 'ensure_1on1_thread: users must be distinct';
  end if;

  -- Normalize order for advisory lock to avoid deadlocks
  ua := a::text;
  ub := b::text;
  if ua < ub then
    first := a; second := b;
  else
    first := b; second := a;
  end if;

  -- Derive a stable xact-level advisory lock key from the pair
  lock_key := hashtextextended(ua || '|' || ub, 0);
  perform pg_advisory_xact_lock(lock_key);

  -- Look for an existing non-group thread with exactly these two participants
  select t.id into existing_thread_id
  from public.dms_threads t
  join public.dms_thread_participants p1 on p1.thread_id = t.id and p1.user_id = a
  join public.dms_thread_participants p2 on p2.thread_id = t.id and p2.user_id = b
  where t.is_group = false
    and not exists (
      select 1 from public.dms_thread_participants p3
      where p3.thread_id = t.id and p3.user_id not in (a, b)
    )
  limit 1;

  if existing_thread_id is not null then
    return existing_thread_id;
  end if;

  -- Create the thread and add both participants
  insert into public.dms_threads (created_by, is_group, title)
  values (first, false, null)
  returning id into created_thread_id;

  insert into public.dms_thread_participants (thread_id, user_id, role)
  values
    (created_thread_id, first, 'owner'),
    (created_thread_id, second, 'member');

  return created_thread_id;
end;
$$;

commit;
