-- Fix tickets RLS policies: remove direct auth.users access
begin;

-- Drop all existing policies
drop policy if exists "Users can create tickets" on public.tickets;
drop policy if exists "Users can view own tickets" on public.tickets;
drop policy if exists "Admins can view all tickets" on public.tickets;
drop policy if exists "Admins can update all tickets" on public.tickets;

-- Create security definer function to check if user is admin
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

commit;
