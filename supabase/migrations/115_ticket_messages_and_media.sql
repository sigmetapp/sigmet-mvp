-- Ticket messages and media support
begin;

-- Add media columns to tickets table
alter table public.tickets
  add column if not exists image_urls text[] default '{}',
  add column if not exists video_urls text[] default '{}';

-- Ticket messages table for conversation
create table if not exists public.ticket_messages (
  id bigserial primary key,
  ticket_id bigint not null references public.tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  image_urls text[] default '{}',
  video_urls text[] default '{}',
  is_admin boolean not null default false,
  created_at timestamptz default now() not null
);

create index if not exists ticket_messages_ticket_id_idx on public.ticket_messages(ticket_id);
create index if not exists ticket_messages_user_id_idx on public.ticket_messages(user_id);
create index if not exists ticket_messages_created_at_idx on public.ticket_messages(created_at desc);

-- RLS policies for ticket_messages
alter table public.ticket_messages enable row level security;

-- Users can view messages in their own tickets
create policy "Users can view own ticket messages"
  on public.ticket_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tickets
      where tickets.id = ticket_messages.ticket_id
      and tickets.user_id = auth.uid()
    )
  );

-- Users can create messages in their own tickets (only if ticket is not closed or resolved)
create policy "Users can create messages in own tickets"
  on public.ticket_messages
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tickets
      where tickets.id = ticket_messages.ticket_id
      and tickets.user_id = auth.uid()
      and tickets.status not in ('closed', 'resolved')
    )
    and auth.uid() = user_id
  );

-- Admins can view all ticket messages
create policy "Admins can view all ticket messages"
  on public.ticket_messages
  for select
  to authenticated
  using (public.is_admin());

-- Admins can create messages in any ticket
create policy "Admins can create messages in any ticket"
  on public.ticket_messages
  for insert
  to authenticated
  with check (
    public.is_admin()
    and is_admin = true
  );

commit;
