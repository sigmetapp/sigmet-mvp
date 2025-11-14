begin;

-- Add column to control whether site name is shown in header
alter table if exists public.site_settings
  add column if not exists show_site_name_in_header boolean not null default true;

commit;
