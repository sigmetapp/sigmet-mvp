-- Blog system: blog posts and comments
begin;

-- Blog posts table
create table if not exists public.blog_posts (
  id bigserial primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  slug text not null unique,
  content text not null,
  excerpt text,
  type text not null default 'guideline' check (type in ('guideline', 'changelog')),
  media_urls text[] default '{}'::text[],
  published_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists blog_posts_slug_idx on public.blog_posts(slug);
create index if not exists blog_posts_type_idx on public.blog_posts(type);
create index if not exists blog_posts_published_at_idx on public.blog_posts(published_at desc nulls last);
create index if not exists blog_posts_author_id_idx on public.blog_posts(author_id);

-- Blog comments table
create table if not exists public.blog_comments (
  id bigserial primary key,
  post_id bigint not null references public.blog_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists blog_comments_post_id_idx on public.blog_comments(post_id);
create index if not exists blog_comments_author_id_idx on public.blog_comments(author_id);
create index if not exists blog_comments_created_at_idx on public.blog_comments(created_at desc);

-- RLS policies
alter table public.blog_posts enable row level security;
alter table public.blog_comments enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Anyone can view published blog posts" on public.blog_posts;
drop policy if exists "Admins can view all blog posts" on public.blog_posts;
drop policy if exists "Admins can create blog posts" on public.blog_posts;
drop policy if exists "Admins can update blog posts" on public.blog_posts;
drop policy if exists "Admins can delete blog posts" on public.blog_posts;
drop policy if exists "Anyone can view blog comments" on public.blog_comments;
drop policy if exists "Authenticated users can create blog comments" on public.blog_comments;
drop policy if exists "Users can update own blog comments" on public.blog_comments;
drop policy if exists "Users can delete own blog comments" on public.blog_comments;
drop policy if exists "Admins can delete any blog comment" on public.blog_comments;

-- Everyone can view published blog posts
create policy "Anyone can view published blog posts"
  on public.blog_posts
  for select
  using (published_at is not null);

-- Admins can view all blog posts (including drafts)
-- Note: This policy allows admins to see drafts, but service role bypasses RLS
create policy "Admins can view all blog posts"
  on public.blog_posts
  for select
  to authenticated
  using (
    public.is_admin() or 
    published_at is not null
  );

-- Admins can create blog posts
create policy "Admins can create blog posts"
  on public.blog_posts
  for insert
  to authenticated
  with check (public.is_admin() and auth.uid() = author_id);

-- Admins can update blog posts
create policy "Admins can update blog posts"
  on public.blog_posts
  for update
  to authenticated
  using (public.is_admin());

-- Admins can delete blog posts
create policy "Admins can delete blog posts"
  on public.blog_posts
  for delete
  to authenticated
  using (public.is_admin());

-- Authenticated users can view comments
create policy "Anyone can view blog comments"
  on public.blog_comments
  for select
  using (true);

-- Authenticated users can create comments
create policy "Authenticated users can create blog comments"
  on public.blog_comments
  for insert
  to authenticated
  with check (auth.uid() = author_id);

-- Users can update their own comments
create policy "Users can update own blog comments"
  on public.blog_comments
  for update
  to authenticated
  using (auth.uid() = author_id);

-- Users can delete their own comments
create policy "Users can delete own blog comments"
  on public.blog_comments
  for delete
  to authenticated
  using (auth.uid() = author_id);

-- Admins can delete any comment
create policy "Admins can delete any blog comment"
  on public.blog_comments
  for delete
  to authenticated
  using (public.is_admin());

-- Function to update updated_at timestamp for blog_posts
create or replace function update_blog_posts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists blog_posts_updated_at on public.blog_posts;
create trigger blog_posts_updated_at
  before update on public.blog_posts
  for each row
  execute function update_blog_posts_updated_at();

-- Function to update updated_at timestamp for blog_comments
create or replace function update_blog_comments_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists blog_comments_updated_at on public.blog_comments;
create trigger blog_comments_updated_at
  before update on public.blog_comments
  for each row
  execute function update_blog_comments_updated_at();

commit;
