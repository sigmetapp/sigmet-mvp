-- Create table for storing permanent admin TF (Trust Flow) adjustments
-- These adjustments persist through TF recalculations
create table if not exists public.admin_tf_adjustments (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  points numeric(10, 2) not null, -- Can be positive (bonus) or negative (penalty)
  reason text,
  admin_email text not null, -- Email of admin who made the adjustment
  adjustment_type text not null check (adjustment_type in ('bonus', 'penalty')),
  permanent boolean not null default true, -- Always true for admin adjustments
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null -- Admin user_id if available
);

-- Create index for fast lookups by user_id
create index if not exists admin_tf_adjustments_user_id_idx 
  on public.admin_tf_adjustments(user_id);

-- Create index for created_at for sorting
create index if not exists admin_tf_adjustments_created_at_idx 
  on public.admin_tf_adjustments(created_at desc);

-- Enable RLS
alter table public.admin_tf_adjustments enable row level security;

-- Policy: Only admins can read all adjustments
-- Users can only see their own adjustments (read-only)
create policy "admins can read all tf adjustments" 
  on public.admin_tf_adjustments for select 
  using (public.is_admin());

create policy "users can read own tf adjustments" 
  on public.admin_tf_adjustments for select 
  using (auth.uid() = user_id);

-- Policy: Only admins can insert adjustments
create policy "admins can insert tf adjustments" 
  on public.admin_tf_adjustments for insert 
  with check (public.is_admin());

-- Policy: Only admins can update adjustments (for corrections)
create policy "admins can update tf adjustments" 
  on public.admin_tf_adjustments for update 
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: Only admins can delete adjustments
create policy "admins can delete tf adjustments" 
  on public.admin_tf_adjustments for delete 
  using (public.is_admin());

-- Function to get total admin TF adjustments for a user
create or replace function public.get_admin_tf_adjustments_total(target_user_id uuid)
returns numeric(10, 2)
language plpgsql
security definer
stable
as $$
declare
  total_adjustments numeric(10, 2);
begin
  select coalesce(sum(points), 0) into total_adjustments
  from public.admin_tf_adjustments
  where user_id = target_user_id;
  
  return coalesce(total_adjustments, 0);
end;
$$;
