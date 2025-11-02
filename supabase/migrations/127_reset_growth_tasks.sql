-- Reset growth tasks, user progress, and seed new catalog
begin;

-- Ensure directions are present with updated titles, emojis, and ordering
insert into public.growth_directions (slug, title, emoji, sort_index) values
  ('learning', 'Learning & Knowledge', U&'\1F4DA', 1),
  ('career', 'Career & Projects', U&'\1F4BC', 2),
  ('finance', 'Finance & Stability', U&'\1F4B0', 3),
  ('health', 'Health & Vitality', U&'\1F4AA', 4),
  ('relationships', 'Relationships & Family', U&'\1F496', 5),
  ('community', 'Community & Society', U&'\1F30D', 6),
  ('creativity', 'Creativity & Expression', U&'\1F3A8', 7),
  ('mindfulness_purpose', 'Mindfulness & Purpose', U&'\2728', 8)
on conflict (slug) do update
  set title = excluded.title,
      emoji = excluded.emoji,
      sort_index = excluded.sort_index;

-- Remove existing user progress and points
delete from public.habit_checkins;
delete from public.user_achievements;
delete from public.sw_ledger;
delete from public.user_tasks;

-- Clear old tasks
delete from public.growth_tasks;

-- Reseed tasks based on the refreshed catalog
with dirs as (
  select id, slug from public.growth_directions
)
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)

-- Learning & Knowledge
select (select id from dirs where slug = 'learning'), 'habit'::public.task_type, 'daily'::public.habit_period,
       'Read something new', 'Read or study something new every day.', 5, 1
union all select (select id from dirs where slug = 'learning'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Capture structured notes', 'Take structured notes or summaries after learning sessions.', 6, 2
union all select (select id from dirs where slug = 'learning'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Learning media session', 'Watch or listen to educational content each week.', 6, 3
union all select (select id from dirs where slug = 'learning'), 'goal'::public.task_type, null,
       'Complete an online course', 'Finish a full online course or certification.', 60, 4
union all select (select id from dirs where slug = 'learning'), 'goal'::public.task_type, null,
       'Publish a learning recap', 'Write a blog or post summarizing what you learned.', 40, 5
union all select (select id from dirs where slug = 'learning'), 'goal'::public.task_type, null,
       'Teach or mentor', 'Teach or mentor someone on a skill you have mastered.', 70, 6

-- Career & Projects
union all select (select id from dirs where slug = 'career'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Plan weekly goals', 'Plan your weekly goals and track progress.', 6, 1
union all select (select id from dirs where slug = 'career'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Share project updates', 'Communicate project updates consistently.', 6, 2
union all select (select id from dirs where slug = 'career'), 'habit'::public.task_type, 'monthly'::public.habit_period,
       'Learn a new tool', 'Learn one new professional tool or method each month.', 7, 3
union all select (select id from dirs where slug = 'career'), 'goal'::public.task_type, null,
       'Launch a project', 'Launch a personal or team project.', 80, 4
union all select (select id from dirs where slug = 'career'), 'goal'::public.task_type, null,
       'Present your solution', 'Present your idea or solution to others.', 60, 5
union all select (select id from dirs where slug = 'career'), 'goal'::public.task_type, null,
       'Reach a milestone', 'Reach a professional milestone such as a promotion or first sale.', 100, 6

-- Finance & Stability
union all select (select id from dirs where slug = 'finance'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Track cash flow', 'Track income and expenses every week.', 6, 1
union all select (select id from dirs where slug = 'finance'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Automate savings', 'Save a small percentage of your income regularly.', 6, 2
union all select (select id from dirs where slug = 'finance'), 'habit'::public.task_type, 'monthly'::public.habit_period,
       'Review financial goals', 'Review your financial goals each month.', 7, 3
union all select (select id from dirs where slug = 'finance'), 'goal'::public.task_type, null,
       'Build an emergency fund', 'Build your first emergency fund.', 70, 4
union all select (select id from dirs where slug = 'finance'), 'goal'::public.task_type, null,
       'Eliminate a debt', 'Eliminate a debt or financial burden.', 90, 5
union all select (select id from dirs where slug = 'finance'), 'goal'::public.task_type, null,
       'Make an investment', 'Make your first investment or create a passive income stream.', 80, 6

-- Health & Vitality
union all select (select id from dirs where slug = 'health'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Exercise three times', 'Exercise at least three times each week.', 6, 1
union all select (select id from dirs where slug = 'health'), 'habit'::public.task_type, 'daily'::public.habit_period,
       'Prioritize quality sleep', 'Get 7-8 hours of quality sleep every day.', 5, 2
union all select (select id from dirs where slug = 'health'), 'habit'::public.task_type, 'daily'::public.habit_period,
       'Hydrate and eat well', 'Drink enough water and eat balanced meals.', 5, 3
union all select (select id from dirs where slug = 'health'), 'goal'::public.task_type, null,
       'Complete a health check', 'Complete a health check-up or analysis.', 60, 4
union all select (select id from dirs where slug = 'health'), 'goal'::public.task_type, null,
       'Join a challenge', 'Join a sports challenge or event.', 80, 5
union all select (select id from dirs where slug = 'health'), 'goal'::public.task_type, null,
       'Quit an unhealthy habit', 'Quit an unhealthy habit for 30 days.', 90, 6

-- Relationships & Family
union all select (select id from dirs where slug = 'relationships'), 'habit'::public.task_type, 'daily'::public.habit_period,
       'Check in with loved ones', 'Stay in touch with family or friends every day.', 5, 1
union all select (select id from dirs where slug = 'relationships'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Express gratitude', 'Express gratitude or appreciation often.', 6, 2
union all select (select id from dirs where slug = 'relationships'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Quality time together', 'Spend quality time without distractions.', 6, 3
union all select (select id from dirs where slug = 'relationships'), 'goal'::public.task_type, null,
       'Host a gathering', 'Organize a meaningful family or friends gathering.', 60, 4
union all select (select id from dirs where slug = 'relationships'), 'goal'::public.task_type, null,
       'Reconnect meaningfully', 'Reconnect with someone after a long time.', 50, 5
union all select (select id from dirs where slug = 'relationships'), 'goal'::public.task_type, null,
       'Resolve a misunderstanding', 'Resolve a misunderstanding through honest conversation.', 70, 6

-- Community & Society
union all select (select id from dirs where slug = 'community'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Stay informed locally', 'Stay informed about your community or causes.', 6, 1
union all select (select id from dirs where slug = 'community'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Support initiatives', 'Support local or online initiatives you care about.', 6, 2
union all select (select id from dirs where slug = 'community'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Engage in dialogue', 'Engage in respectful discussions and share ideas.', 6, 3
union all select (select id from dirs where slug = 'community'), 'goal'::public.task_type, null,
       'Volunteer at an event', 'Volunteer or help in a community event.', 60, 4
union all select (select id from dirs where slug = 'community'), 'goal'::public.task_type, null,
       'Start an initiative', 'Start a public or social initiative.', 100, 5
union all select (select id from dirs where slug = 'community'), 'goal'::public.task_type, null,
       'Host a community meetup', 'Host or speak at a community meetup.', 80, 6

-- Creativity & Expression
union all select (select id from dirs where slug = 'creativity'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Create every week', 'Create or design something every week.', 6, 1
union all select (select id from dirs where slug = 'creativity'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Experiment creatively', 'Experiment with new creative tools or mediums.', 6, 2
union all select (select id from dirs where slug = 'creativity'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Share your work', 'Share your work publicly or with friends.', 6, 3
union all select (select id from dirs where slug = 'creativity'), 'goal'::public.task_type, null,
       'Finish a creative project', 'Finish a full creative project such as a song or article.', 80, 4
union all select (select id from dirs where slug = 'creativity'), 'goal'::public.task_type, null,
       'Join a creative event', 'Participate in a creative contest or exhibition.', 70, 5
union all select (select id from dirs where slug = 'creativity'), 'goal'::public.task_type, null,
       'Collaborate with a creator', 'Collaborate with another creator on a joint idea.', 60, 6

-- Mindfulness & Purpose
union all select (select id from dirs where slug = 'mindfulness_purpose'), 'habit'::public.task_type, 'daily'::public.habit_period,
       'Daily reflection', 'Practice daily reflection, meditation, or journaling.', 5, 1
union all select (select id from dirs where slug = 'mindfulness_purpose'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Offline or nature time', 'Spend time offline or in nature every week.', 6, 2
union all select (select id from dirs where slug = 'mindfulness_purpose'), 'habit'::public.task_type, 'weekly'::public.habit_period,
       'Balance productivity and rest', 'Maintain balance between productivity and rest.', 6, 3
union all select (select id from dirs where slug = 'mindfulness_purpose'), 'goal'::public.task_type, null,
       'Define core values', 'Define your core values and life goals.', 70, 4
union all select (select id from dirs where slug = 'mindfulness_purpose'), 'goal'::public.task_type, null,
       'Complete a digital detox', 'Experience a full digital detox day.', 60, 5
union all select (select id from dirs where slug = 'mindfulness_purpose'), 'goal'::public.task_type, null,
       'Act with deeper purpose', 'Make a conscious decision that aligns with your deeper purpose.', 80, 6;

commit;
