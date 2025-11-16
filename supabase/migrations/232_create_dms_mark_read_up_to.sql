begin;

create or replace function public.dms_mark_read_up_to(
  p_user_id uuid,
  p_thread_id text,
  p_message_id text default null,
  p_sequence_number bigint default null
)
returns table (
  last_read_message_id text,
  last_read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_id dms_threads.id%type;
  v_use_direct_thread boolean := false;
  v_target dms_messages%rowtype;
  v_cutoff timestamptz;
begin
  begin
    v_thread_id := p_thread_id::dms_threads.id%type;
    v_use_direct_thread := true;
  exception when others then
    v_use_direct_thread := false;
  end;

  if p_message_id is not null then
    begin
      select *
        into v_target
        from dms_messages
        where (
          (v_use_direct_thread and thread_id = v_thread_id)
          or (not v_use_direct_thread and thread_id::text = p_thread_id)
        )
          and id::text = p_message_id
        order by created_at desc, id desc
        limit 1;
    exception when others then
      null;
    end;
  end if;

  if v_target.id is null and p_sequence_number is not null then
    select *
      into v_target
      from dms_messages
      where (
        (v_use_direct_thread and thread_id = v_thread_id)
        or (not v_use_direct_thread and thread_id::text = p_thread_id)
      )
        and sequence_number = p_sequence_number
      order by created_at desc, id desc
      limit 1;
  end if;

  if v_target.id is null then
    raise exception 'Target message not found in thread %', p_thread_id;
  end if;

  v_cutoff := coalesce(v_target.created_at, now());

  update dms_thread_participants
    set last_read_message_id = v_target.id::text,
        last_read_at = v_cutoff
    where (
      (v_use_direct_thread and thread_id = v_thread_id)
      or (not v_use_direct_thread and thread_id::text = p_thread_id)
    )
      and user_id = p_user_id;

  insert into dms_message_receipts (message_id, user_id, status, created_at, updated_at)
  select
    m.id,
    p_user_id,
    'read',
    now(),
    now()
  from dms_messages m
  where (
    (v_use_direct_thread and m.thread_id = v_thread_id)
    or (not v_use_direct_thread and m.thread_id::text = p_thread_id)
  )
    and m.sender_id <> p_user_id
    and m.deleted_at is null
    and (
      (v_target.sequence_number is not null and m.sequence_number is not null and m.sequence_number <= v_target.sequence_number)
      or (v_target.sequence_number is null and m.created_at <= v_cutoff)
      or (v_target.sequence_number is not null and m.sequence_number is null and m.created_at <= v_cutoff)
    )
  on conflict (message_id, user_id)
  do update set status = 'read', updated_at = excluded.updated_at;

  return query
    select v_target.id::text, v_cutoff;
end;
$$;

grant execute on function public.dms_mark_read_up_to(uuid, text, text, bigint) to authenticated;

commit;
