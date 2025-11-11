-- Update Health & Vitality tasks
begin;

-- Delete all existing tasks for Health & Vitality direction
delete from public.growth_tasks
where direction_id = (select id from public.growth_directions where slug = 'health');

-- Insert new tasks for Health & Vitality
with health_dir as (
  select id from public.growth_directions where slug = 'health'
)
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select 
  (select id from health_dir),
  'habit'::public.task_type,
  'daily'::public.habit_period,
  'Drink 2 liters of water',
  'Keep your body hydrated throughout the day to support focus and energy.',
  20,
  1
union all select
  (select id from health_dir),
  'habit'::public.task_type,
  'daily'::public.habit_period,
  'Stretch for 10 minutes',
  'Do light stretching in the morning or before bed to maintain flexibility and reduce tension.',
  20,
  2
union all select
  (select id from health_dir),
  'habit'::public.task_type,
  'daily'::public.habit_period,
  'Walk at least 6,000 steps',
  'Go outside or take short breaks during work to move your body.',
  20,
  3
union all select
  (select id from health_dir),
  'habit'::public.task_type,
  'daily'::public.habit_period,
  'Sleep 7–8 hours',
  'Prioritize consistent rest to help your mind and body recover.',
  20,
  4
union all select
  (select id from health_dir),
  'habit'::public.task_type,
  'daily'::public.habit_period,
  'Eat a balanced meal',
  'Include proteins, healthy fats, and vegetables in at least one daily meal.',
  20,
  5
union all select
  (select id from health_dir),
  'habit'::public.task_type,
  'daily'::public.habit_period,
  'Take 5 minutes for deep breathing',
  'Lower your stress level with slow, mindful breathing.',
  20,
  6
union all select
  (select id from health_dir),
  'goal'::public.task_type,
  null,
  'Create a weekly meal plan',
  'Plan your breakfast, lunch, and dinner to eat healthier and save time.',
  60,
  7
union all select
  (select id from health_dir),
  'goal'::public.task_type,
  null,
  'Join a fitness challenge or class',
  'Try something new like yoga, swimming, or martial arts to stay motivated.',
  80,
  8
union all select
  (select id from health_dir),
  'goal'::public.task_type,
  null,
  'Set personal health goals for the month',
  'For example, improve sleep quality, reduce sugar, or increase endurance.',
  80,
  9
union all select
  (select id from health_dir),
  'goal'::public.task_type,
  null,
  'Track your body metrics',
  'Record your weight, sleep, and daily activity to monitor progress.',
  60,
  10
union all select
  (select id from health_dir),
  'goal'::public.task_type,
  null,
  'Try a new wellness practice',
  'Meditation, cold showers, or journaling - experiment and see what works for you.',
  60,
  11;

commit;
