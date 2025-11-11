-- Update Community & Society tasks
begin;

-- Delete all existing tasks for Community & Society direction
delete from public.growth_tasks
where direction_id = (select id from public.growth_directions where slug = 'community');

-- Insert new tasks for Community & Society
with community_dir as (
  select id from public.growth_directions where slug = 'community'
)
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select 
  (select id from community_dir),
  'habit'::public.task_type,
  'weekly'::public.habit_period,
  'Support someone in your circle',
  'Offer help, advice, or encouragement to a friend, colleague, or neighbor. Small acts build strong communities.',
  20,
  1
union all select
  (select id from community_dir),
  'habit'::public.task_type,
  'weekly'::public.habit_period,
  'Share something valuable online',
  'Post an article, insight, or idea that helps others learn or think differently.',
  20,
  2
union all select
  (select id from community_dir),
  'habit'::public.task_type,
  'weekly'::public.habit_period,
  'Express gratitude publicly',
  'Thank someone for their work, kindness, or contribution — in person or on social media.',
  20,
  3
union all select
  (select id from community_dir),
  'habit'::public.task_type,
  'weekly'::public.habit_period,
  'Join a community discussion',
  'Participate in a local or online talk where people exchange ideas respectfully.',
  20,
  4
union all select
  (select id from community_dir),
  'habit'::public.task_type,
  'weekly'::public.habit_period,
  'Be mindful of your environment',
  'Recycle, pick up litter, or make a small choice that benefits your surroundings.',
  20,
  5
union all select
  (select id from community_dir),
  'goal'::public.task_type,
  null,
  'Volunteer for a local initiative',
  'Join a cleanup day, charity event, or mentorship program that helps your community.',
  80,
  6
union all select
  (select id from community_dir),
  'goal'::public.task_type,
  null,
  'Organize a small community event',
  'Gather people for a purpose - a talk, workshop, or meetup with shared interests.',
  80,
  7
union all select
  (select id from community_dir),
  'goal'::public.task_type,
  null,
  'Donate to a cause you believe in',
  'Whether it''s money, time, or skills, support something that aligns with your values.',
  60,
  8
union all select
  (select id from community_dir),
  'goal'::public.task_type,
  null,
  'Collaborate on a community project',
  'Work with others to create something useful - like a guide, open resource, or shared space.',
  80,
  9
union all select
  (select id from community_dir),
  'goal'::public.task_type,
  null,
  'Start a meaningful conversation online',
  'Write a post that raises awareness about a social or environmental issue.',
  60,
  10
union all select
  (select id from community_dir),
  'goal'::public.task_type,
  null,
  'Map your impact network',
  'List communities, groups, or people you influence — and set a goal to contribute more meaningfully.',
  70,
  11;

commit;
