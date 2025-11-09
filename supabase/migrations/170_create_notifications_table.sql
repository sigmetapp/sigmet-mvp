-- Create notifications table for user alerts
begin;

create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'mention_in_post',
    'comment_on_post',
    'reaction_on_post',
    'comment_on_comment',
    'subscription',
    'trust_flow_entry'
  )),
  actor_id uuid references auth.users(id) on delete set null,
  post_id bigint references public.posts(id) on delete cascade,
  comment_id bigint references public.comments(id) on delete cascade,
  trust_feedback_id bigint references public.trust_feedback(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_read_idx on public.notifications(user_id, read_at);
create index if not exists notifications_post_idx on public.notifications(post_id) where post_id is not null;
create index if not exists notifications_comment_idx on public.notifications(comment_id) where comment_id is not null;

alter table public.notifications enable row level security;

-- Users can only read their own notifications
create policy "read own notifications" on public.notifications
  for select using (auth.uid() = user_id);

-- Only service role can insert notifications (via triggers/functions)
create policy "insert notifications via service" on public.notifications
  for insert with check (auth.role() = 'service_role');

-- Users can update their own notifications (mark as read)
create policy "update own notifications" on public.notifications
  for update using (auth.uid() = user_id);

commit;
