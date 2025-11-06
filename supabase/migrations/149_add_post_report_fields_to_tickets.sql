-- Add post report fields to tickets table
begin;

-- Add post_url and complaint_type columns to tickets table
alter table public.tickets
  add column if not exists post_url text,
  add column if not exists complaint_type text check (complaint_type in ('harassment', 'misinformation', 'inappropriate_content'));

-- Add index for complaint_type for faster filtering
create index if not exists tickets_complaint_type_idx on public.tickets(complaint_type);

-- Add index for post_url for faster lookups
create index if not exists tickets_post_url_idx on public.tickets(post_url);

commit;
