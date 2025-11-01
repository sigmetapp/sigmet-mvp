begin;

-- Enable RLS and define policies for DMS tables

-- dms_threads: select only for participants; update/delete only owner (admin) or creator
alter table public.dms_threads enable row level security;

create policy if not exists "dms_threads: select by participants"
  on public.dms_threads for select
  using (
    exists (
      select 1 from public.dms_thread_participants p
      where p.thread_id = dms_threads.id and p.user_id = auth.uid()
    )
  );

create policy if not exists "dms_threads: update by owner"
  on public.dms_threads for update
  using (
    dms_threads.created_by = auth.uid()
    or exists (
      select 1 from public.dms_thread_participants p
      where p.thread_id = dms_threads.id and p.user_id = auth.uid() and p.role = 'owner'
    )
  )
  with check (
    dms_threads.created_by = auth.uid()
    or exists (
      select 1 from public.dms_thread_participants p
      where p.thread_id = dms_threads.id and p.user_id = auth.uid() and p.role = 'owner'
    )
  );

create policy if not exists "dms_threads: delete by owner"
  on public.dms_threads for delete
  using (
    dms_threads.created_by = auth.uid()
    or exists (
      select 1 from public.dms_thread_participants p
      where p.thread_id = dms_threads.id and p.user_id = auth.uid() and p.role = 'owner'
    )
  );

-- dms_thread_participants: select participants; update only own row or thread owner (admin)
alter table public.dms_thread_participants enable row level security;

create policy if not exists "dms_thread_participants: select by participants"
  on public.dms_thread_participants for select
  using (
    exists (
      select 1 from public.dms_thread_participants p2
      where p2.thread_id = dms_thread_participants.thread_id
        and p2.user_id = auth.uid()
    )
  );

create policy if not exists "dms_thread_participants: update self or thread owner"
  on public.dms_thread_participants for update
  using (
    dms_thread_participants.user_id = auth.uid()
    or exists (
      select 1 from public.dms_thread_participants p
      where p.thread_id = dms_thread_participants.thread_id
        and p.user_id = auth.uid()
        and p.role = 'owner'
    )
  )
  with check (
    dms_thread_participants.user_id = auth.uid()
    or exists (
      select 1 from public.dms_thread_participants p
      where p.thread_id = dms_thread_participants.thread_id
        and p.user_id = auth.uid()
        and p.role = 'owner'
    )
  );

-- dms_messages: select participants; insert participants and if not is_blocked; update/delete only sender (soft delete) or admin
alter table public.dms_messages enable row level security;

create policy if not exists "dms_messages: select by participants"
  on public.dms_messages for select
  using (
    exists (
      select 1 from public.dms_thread_participants p
      where p.thread_id = dms_messages.thread_id and p.user_id = auth.uid()
    )
  );

create policy if not exists "dms_messages: insert by participants not blocked"
  on public.dms_messages for insert
  with check (
    dms_messages.sender_id = auth.uid()
    and exists (
      select 1 from public.dms_thread_participants p_self
      where p_self.thread_id = dms_messages.thread_id and p_self.user_id = auth.uid()
    )
    and not exists (
      select 1
      from public.dms_thread_participants p_other
      where p_other.thread_id = dms_messages.thread_id
        and p_other.user_id <> auth.uid()
        and exists (
          select 1 from public.dms_blocks b
          where (b.blocker = auth.uid() and b.blocked = p_other.user_id)
             or (b.blocker = p_other.user_id and b.blocked = auth.uid())
        )
    )
  );

create policy if not exists "dms_messages: update by sender or owner"
  on public.dms_messages for update
  using (
    dms_messages.sender_id = auth.uid()
    or exists (
      select 1 from public.dms_thread_participants p
      where p.thread_id = dms_messages.thread_id and p.user_id = auth.uid() and p.role = 'owner'
    )
  )
  with check (
    dms_messages.sender_id = auth.uid()
    or exists (
      select 1 from public.dms_thread_participants p
      where p.thread_id = dms_messages.thread_id and p.user_id = auth.uid() and p.role = 'owner'
    )
  );

create policy if not exists "dms_messages: delete by sender or owner"
  on public.dms_messages for delete
  using (
    dms_messages.sender_id = auth.uid()
    or exists (
      select 1 from public.dms_thread_participants p
      where p.thread_id = dms_messages.thread_id and p.user_id = auth.uid() and p.role = 'owner'
    )
  );

-- dms_message_receipts: select participants of thread; update only own row
alter table public.dms_message_receipts enable row level security;

create policy if not exists "dms_message_receipts: select by thread participants"
  on public.dms_message_receipts for select
  using (
    exists (
      select 1
      from public.dms_messages m
      join public.dms_thread_participants p on p.thread_id = m.thread_id
      where m.id = dms_message_receipts.message_id
        and p.user_id = auth.uid()
    )
  );

create policy if not exists "dms_message_receipts: update self only"
  on public.dms_message_receipts for update
  using (
    dms_message_receipts.user_id = auth.uid()
    and exists (
      select 1
      from public.dms_messages m
      join public.dms_thread_participants p on p.thread_id = m.thread_id
      where m.id = dms_message_receipts.message_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    dms_message_receipts.user_id = auth.uid()
  );

-- dms_blocks: select/insert/delete only blocker
alter table public.dms_blocks enable row level security;

create policy if not exists "dms_blocks: select by blocker"
  on public.dms_blocks for select
  using (dms_blocks.blocker = auth.uid());

create policy if not exists "dms_blocks: insert by blocker"
  on public.dms_blocks for insert
  with check (dms_blocks.blocker = auth.uid());

create policy if not exists "dms_blocks: delete by blocker"
  on public.dms_blocks for delete
  using (dms_blocks.blocker = auth.uid());

-- user_settings: select/update only self
alter table public.user_settings enable row level security;

create policy if not exists "user_settings: select self"
  on public.user_settings for select
  using (user_settings.user_id = auth.uid());

create policy if not exists "user_settings: update self"
  on public.user_settings for update
  using (user_settings.user_id = auth.uid())
  with check (user_settings.user_id = auth.uid());

commit;
