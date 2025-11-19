-- Educational posts system for feed
-- These are reference materials that appear periodically in the feed

create table if not exists public.educational_posts (
  id bigserial primary key,
  topic text not null unique, -- 'sw', 'trust_flow', 'connections', 'grows_8'
  title text not null,
  content text not null,
  icon_emoji text, -- Optional emoji icon
  link_url text, -- Optional link to related page
  link_text text, -- Text for the link
  display_order int not null default 0, -- Order for display
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Insert educational posts content
insert into public.educational_posts (topic, title, content, icon_emoji, link_url, link_text, display_order) values
(
  'sw',
  'Understanding Social Weight (SW)',
  'Social Weight measures your overall contribution and engagement in the community. It reflects how active you are, how much value you bring through posts, comments, and interactions. Higher SW scores indicate more established and valuable community members. SW influences how your content is prioritized in feeds and helps others understand your level of participation.',
  '⚖️',
  '/sw',
  'View your SW score',
  1
),
(
  'trust_flow',
  'What is Trust Flow?',
  'Trust Flow is a metric that reflects how much the community trusts you based on feedback from other members. It starts at a base value and changes based on positive or negative feedback you receive. Higher Trust Flow means more community trust. This metric helps create a safer and more reliable community environment where quality interactions are rewarded.',
  '🤝',
  null,
  null,
  2
),
(
  'connections',
  'Building Connections',
  'Connections help you build meaningful relationships in the community. When you mention someone in a post using @username, you create a connection. These connections help you discover relevant content, find people with similar interests, and grow your network. Use connections to engage with others and expand your community presence.',
  '🔗',
  '/connections',
  'View your connections',
  3
),
(
  'grows_8',
  'Working with Growth Directions',
  'Growth Directions help you track and focus on different areas of personal development. There are 8 main directions covering health, career, learning, finance, family, community, mindfulness, and creativity. By selecting directions that matter to you, you can better organize your goals, track progress, and connect with others who share similar growth paths.',
  '🌱',
  '/growth-directions',
  'Explore Growth Directions',
  4
)
on conflict (topic) do nothing;

-- Enable RLS
alter table public.educational_posts enable row level security;

-- Anyone can read active educational posts
create policy "read_educational_posts" on public.educational_posts
  for select using (is_active = true);

-- Only service role can manage educational posts
create policy "manage_educational_posts" on public.educational_posts
  for all using (auth.role() = 'service_role');

-- Create index for faster queries
create index if not exists educational_posts_active_order_idx 
  on public.educational_posts(is_active, display_order) 
  where is_active = true;
