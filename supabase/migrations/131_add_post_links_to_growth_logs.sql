begin;

alter table if exists public.habit_checkins
  add column if not exists post_id bigint references public.posts(id) on delete set null;

alter table if exists public.user_achievements
  add column if not exists post_id bigint references public.posts(id) on delete set null;

create index if not exists habit_checkins_post_id_idx on public.habit_checkins(post_id);
create index if not exists user_achievements_post_id_idx on public.user_achievements(post_id);

commit;
