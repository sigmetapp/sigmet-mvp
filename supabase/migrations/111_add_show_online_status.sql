-- Add show_online_status column to profiles table
begin;

alter table if exists public.profiles
  add column if not exists show_online_status boolean not null default true;

comment on column public.profiles.show_online_status is 'Controls whether user wants to show their online status to others. If false, shows as "Private online" instead of online/offline.';

commit;
