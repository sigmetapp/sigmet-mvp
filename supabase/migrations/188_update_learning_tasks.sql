-- Update Learning & Knowledge tasks
begin;

-- Delete all existing tasks for Learning & Knowledge direction
delete from public.growth_tasks
where direction_id = (select id from public.growth_directions where slug = 'learning');

-- Insert new tasks for Learning & Knowledge
with learning_dir as (
  select id from public.growth_directions where slug = 'learning'
)
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select 
  (select id from learning_dir),
  'habit'::public.task_type,
  'daily'::public.habit_period,
  'Read 30 pages of a book',
  'Fiction or nonfiction, the goal is to stay consistent and expand your perspective.',
  20,
  1
union all select
  (select id from learning_dir),
  'habit'::public.task_type,
  'weekly'::public.habit_period,
  'Listen to an educational podcast',
  'Pick a 35-minute episode that teaches you something new or challenges your thinking.',
  20,
  2
union all select
  (select id from learning_dir),
  'habit'::public.task_type,
  'weekly'::public.habit_period,
  'Discuss an idea with someone',
  'Share what you''ve learned and get feedback. Knowledge grows through dialogue.',
  20,
  3
union all select
  (select id from learning_dir),
  'habit'::public.task_type,
  'weekly'::public.habit_period,
  'Understand a complex topic',
  'Choose something that seems difficult, like "How GPT works," and break it down until it makes sense.',
  20,
  4
union all select
  (select id from learning_dir),
  'goal'::public.task_type,
  null,
  'Finish a full book',
  'Read it from start to finish and write a short summary or key takeaways.',
  60,
  5
union all select
  (select id from learning_dir),
  'goal'::public.task_type,
  null,
  'Complete an online course',
  'Earn a certificate on platforms like Coursera or Udemy and apply what you''ve learned.',
  80,
  6
union all select
  (select id from learning_dir),
  'goal'::public.task_type,
  null,
  'Create a personal learning plan for the month',
  'Outline what topics you want to explore and how you''ll measure your progress.',
  70,
  7
union all select
  (select id from learning_dir),
  'goal'::public.task_type,
  null,
  'Build a visual map of what you''ve learned',
  'Use a mind map or infographic to connect ideas and visualize your understanding.',
  80,
  8;

commit;
