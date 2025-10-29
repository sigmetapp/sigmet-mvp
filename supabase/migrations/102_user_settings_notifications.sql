-- Extend user_settings with notification-related fields
begin;

alter table if exists public.user_settings
  add column if not exists global_mute boolean not null default false,
  add column if not exists dnd_start time,
  add column if not exists dnd_end time,
  add column if not exists timezone text,
  add column if not exists sound_enabled boolean not null default true;

commit;
