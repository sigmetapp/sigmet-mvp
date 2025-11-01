-- Tickets system: user tickets for reporting issues
begin;

-- Tickets table
create table if not exists public.tickets (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  resolved_at timestamptz,
  admin_notes text
);

create index if not exists tickets_user_id_idx on public.tickets(user_id);
create index if not exists tickets_status_idx on public.tickets(status);
create index if not exists tickets_created_at_idx on public.tickets(created_at desc);

-- RLS policies
alter table public.tickets enable row level security;

-- Users can create tickets
create policy "Users can create tickets"
  on public.tickets
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can view their own tickets
create policy "Users can view own tickets"
  on public.tickets
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Security definer function to check if user is admin
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
stable
as $$
declare
  user_email text;
begin
  select email into user_email from auth.users where id = auth.uid();
  return (user_email = 'seosasha@gmail.com');
end;
$$;

-- Admins can view all tickets
create policy "Admins can view all tickets"
  on public.tickets
  for select
  to authenticated
  using (public.is_admin());

-- Admins can update all tickets
create policy "Admins can update all tickets"
  on public.tickets
  for update
  to authenticated
  using (public.is_admin());

-- Function to update updated_at timestamp
create or replace function update_tickets_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tickets_updated_at
  before update on public.tickets
  for each row
  execute function update_tickets_updated_at();

commit;
