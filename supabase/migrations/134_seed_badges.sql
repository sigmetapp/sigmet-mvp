-- Seed badges from catalog
-- This migration upserts badges from the catalog

begin;

-- Upsert badges from catalog
insert into public.badges (
  key, title, description, how_to_get, metric, operator, threshold,
  icon, color_start, color_end, shape, category, is_active
) values
  ('new_voice', 'New Voice', 'You have started sharing your thoughts with the community.', 'Publish at least 3 posts and write at least 5 comments.', 'composite_posts_comments_3_5', 'gte', 1, 'MessageSquarePlus', 'indigo-500', 'purple-500', 'circle', 'activity', true),
  ('active_member', 'Active Member', 'Consistent early participation.', 'Publish at least 5 posts and write at least 10 comments.', 'composite_posts_comments_5_10', 'gte', 1, 'UserCheck', 'sky-500', 'emerald-500', 'shield', 'activity', true),
  ('contributor', 'Contributor', 'A regular contributor to discussions.', 'Publish at least 20 posts and write at least 50 comments.', 'composite_posts_comments_20_50', 'gte', 1, 'Send', 'violet-500', 'fuchsia-500', 'hex', 'activity', true),
  ('talkative', 'Talkative', 'You keep the conversations flowing.', 'Write at least 100 comments.', 'total_comments', 'gte', 100, 'MessageCircle', 'cyan-500', 'blue-500', 'circle', 'activity', true),
  ('supporter', 'Supporter', 'You encourage others with reactions.', 'Give at least 50 likes to other users.', 'likes_given', 'gte', 50, 'ThumbsUp', 'emerald-500', 'teal-500', 'ribbon', 'community', true),
  ('daily_spark', 'Daily Spark', 'A week of steady activity.', 'Be active 7 days in a row.', 'consecutive_active_days', 'gte', 7, 'Sparkles', 'amber-500', 'orange-500', 'circle', 'consistency', true),
  ('momentum_builder', 'Momentum Builder', 'Week after week of engagement.', 'Have activity at least 1 day per week for 8 consecutive weeks.', 'weekly_active_streak', 'gte', 8, 'Timer', 'slate-500', 'zinc-500', 'hex', 'consistency', true),
  ('feedback_hero', 'Feedback Hero', 'The community values your posts.', 'Receive at least 50 likes on your posts.', 'likes_received', 'gte', 50, 'Heart', 'red-500', 'rose-500', 'circle', 'growth', true),
  ('comment_magnet', 'Comment Magnet', 'Diverse voices join your threads.', 'Get comments from at least 10 distinct users on your posts.', 'distinct_commenters', 'gte', 10, 'Users', 'yellow-500', 'lime-500', 'badge', 'growth', true),
  ('connector', 'Connector', 'You bring new people in.', 'Invite at least 3 users who register.', 'invited_users_total', 'gte', 3, 'Link2', 'blue-500', 'indigo-500', 'ribbon', 'community', true),
  ('growth_networker', 'Growth Networker', 'Your invites become active members.', 'Invite at least 10 users who make at least 1 post or comment.', 'invited_users_with_activity', 'gte', 10, 'Network', 'emerald-500', 'green-500', 'shield', 'community', true),
  ('community_helper', 'Community Helper', 'You nurture others'' posts.', 'Leave at least 20 comments on other users'' posts.', 'comments_on_others_posts', 'gte', 20, 'HelpingHand', 'teal-500', 'cyan-500', 'hex', 'community', true),
  ('collaboration_spirit', 'Collaboration Spirit', 'Deep participation in discussions.', 'Participate in at least 5 threads where you wrote 10 or more comments.', 'threads_with_10_comments', 'gte', 5, 'MessagesSquare', 'purple-500', 'violet-500', 'circle', 'community', true),
  ('badge_collector', 'Badge Collector', 'Collect achievements along the way.', 'Earn at least 10 other badges.', 'earned_badges_count', 'gte', 10, 'Award', 'amber-500', 'yellow-500', 'medal', 'growth', true),
  ('mentor', 'Mentor', 'Your comments are marked helpful.', 'Receive likes on comments from at least 5 distinct users.', 'comment_likes_from_distinct_users', 'gte', 5, 'BookOpenCheck', 'stone-500', 'neutral-500', 'shield', 'growth', true),
  ('recognized_voice', 'Recognized Voice', 'Your work resonates widely.', 'Receive at least 200 total likes.', 'total_likes_received', 'gte', 200, 'Megaphone', 'fuchsia-500', 'rose-500', 'hex', 'growth', true),
  ('community_veteran', 'Community Veteran', 'Long term participation.', 'Be active on more than 100 days since registration.', 'active_days', 'gte', 100, 'Hourglass', 'orange-500', 'amber-500', 'shield', 'consistency', true),
  ('sw_master', 'SW Master', 'High Social Weight achieved.', 'Reach Social Weight of at least 500.', 'social_weight', 'gte', 500, 'Scale', 'emerald-500', 'lime-500', 'circle', 'growth', true)
on conflict (key) do update set
  title = excluded.title,
  description = excluded.description,
  how_to_get = excluded.how_to_get,
  metric = excluded.metric,
  operator = excluded.operator,
  threshold = excluded.threshold,
  icon = excluded.icon,
  color_start = excluded.color_start,
  color_end = excluded.color_end,
  shape = excluded.shape,
  category = excluded.category,
  is_active = excluded.is_active,
  updated_at = now();

commit;
