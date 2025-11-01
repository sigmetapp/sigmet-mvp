-- Seed data: 12 directions with 3 habits and 3 goals each
begin;

-- Directions
insert into public.growth_directions (slug, title, emoji, sort_index) values
('learning','Learning & Knowledge','??',1),
('career','Career & Projects','??',2),
('finance','Finance & Stability','??',3),
('health','Health & Fitness','??',4),
('relationships','Relationships & Family','??',5),
('community','Community & Society','??',6),
('creativity','Creativity & Expression','??',7),
('mindfulness','Mindfulness & Balance','?????',8),
('personal','Personal Growth & Self-Awareness','??',9),
('digital','Digital Skills & Tech','??',10),
('education','Education & Mentorship','??',11),
('purpose','Meaning & Purpose','???',12)
on conflict (slug) do nothing;

-- Helper: get id by slug
with d as (select id, slug from public.growth_directions)
-- Learning
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select (select id from d where slug='learning'), 'habit','daily','Read 10 pages','Read at least 10 pages daily',3,1
union all select (select id from d where slug='learning'), 'habit','weekly','1 learning video','Watch one educational video weekly',5,2
union all select (select id from d where slug='learning'), 'habit','weekly','Make a summary','Write a short summary after learning',5,3
union all select (select id from d where slug='learning'), 'goal',null,'Complete an online course','Finish any structured online course',40,4
union all select (select id from d where slug='learning'), 'goal',null,'Earn a certificate','Get a certificate or diploma',60,5
union all select (select id from d where slug='learning'), 'goal',null,'Publish a learning guide','Create and share your guide',50,6;

-- Career
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select (select id from d where slug='career'), 'habit','weekly','Skill practice','Deliberate practice of a core skill',6,1
union all select (select id from d where slug='career'), 'habit','monthly','Portfolio update','Update portfolio or CV',8,2
union all select (select id from d where slug='career'), 'habit','weekly','Peer feedback','Give constructive feedback',5,3
union all select (select id from d where slug='career'), 'goal',null,'Ship a major project','Release a notable project',80,4
union all select (select id from d where slug='career'), 'goal',null,'New contract or promotion','Sign a contract or get promoted',100,5
union all select (select id from d where slug='career'), 'goal',null,'Launch a startup','Public launch of your product',120,6;

-- Finance
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select (select id from d where slug='finance'), 'habit','weekly','Track expenses','Weekly expense tracking',5,1
union all select (select id from d where slug='finance'), 'habit','monthly','Budget review','Monthly budgeting session',8,2
union all select (select id from d where slug='finance'), 'habit','monthly','Save 10 percent','Allocate 10 percent to savings',10,3
union all select (select id from d where slug='finance'), 'goal',null,'Hit savings goal','Reach target amount X',70,4
union all select (select id from d where slug='finance'), 'goal',null,'First investment','Make your first investment',60,5
union all select (select id from d where slug='finance'), 'goal',null,'Close a debt','Pay off a debt completely',90,6;

-- Health
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select (select id from d where slug='health'), 'habit','daily','Sleep 7-8h','Get quality sleep',3,1
union all select (select id from d where slug='health'), 'habit','daily','Move 30 min','Walk or exercise 30 minutes',4,2
union all select (select id from d where slug='health'), 'habit','daily','Eat balanced','Track healthy meals',4,3
union all select (select id from d where slug='health'), 'goal',null,'Medical check-up','Complete a health check',50,4
union all select (select id from d where slug='health'), 'goal',null,'30-day challenge','Finish a 30 day fitness challenge',80,5
union all select (select id from d where slug='health'), 'goal',null,'Reach target weight','Achieve target body weight',90,6;

-- Relationships
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select (select id from d where slug='relationships'), 'habit','weekly','Family time','Dedicated time with family',6,1
union all select (select id from d where slug='relationships'), 'habit','weekly','Acts of kindness','Do something nice for close ones',5,2
union all select (select id from d where slug='relationships'), 'habit','weekly','Meaningful conversation','Have a deep talk each week',6,3
union all select (select id from d where slug='relationships'), 'goal',null,'Trip together','Plan and go on a trip',60,4
union all select (select id from d where slug='relationships'), 'goal',null,'Resolve conflict','Resolve a long-standing conflict',70,5
union all select (select id from d where slug='relationships'), 'goal',null,'Host a family event','Organize a family gathering',60,6;

-- Community
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select (select id from d where slug='community'), 'habit','monthly','Community post','Post to community monthly',8,1
union all select (select id from d where slug='community'), 'habit','monthly','Support others','Help or mentor in community',8,2
union all select (select id from d where slug='community'), 'habit','monthly','Attend local event','Join a local initiative',8,3
union all select (select id from d where slug='community'), 'goal',null,'Volunteer or donate','Complete a volunteering activity',60,4
union all select (select id from d where slug='community'), 'goal',null,'Host an event','Organize a meetup or event',80,5
union all select (select id from d where slug='community'), 'goal',null,'Start an initiative','Launch a social project',100,6;

-- Creativity
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select (select id from d where slug='creativity'), 'habit','weekly','Creative session','Create something weekly',6,1
union all select (select id from d where slug='creativity'), 'habit','weekly','Share your work','Publish a snippet or WIP',6,2
union all select (select id from d where slug='creativity'), 'habit','weekly','Inspiration time','Study other creators',5,3
union all select (select id from d where slug='creativity'), 'goal',null,'Finish project','Complete a creative project',80,4
union all select (select id from d where slug='creativity'), 'goal',null,'Join a contest','Participate in a contest',60,5
union all select (select id from d where slug='creativity'), 'goal',null,'Get recognition','Win an award or feature',100,6;

-- Mindfulness
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select (select id from d where slug='mindfulness'), 'habit','daily','Meditate 5-10m','Short daily meditation',3,1
union all select (select id from d where slug='mindfulness'), 'habit','daily','Micro-breaks','Take mindful breaks',3,2
union all select (select id from d where slug='mindfulness'), 'habit','weekly','Stress check','Track and lower stress',5,3
union all select (select id from d where slug='mindfulness'), 'goal',null,'Retreat or detox','Complete a retreat or digital detox',70,4
union all select (select id from d where slug='mindfulness'), 'goal',null,'Build a habit','Install a new positive habit',50,5
union all select (select id from d where slug='mindfulness'), 'goal',null,'Quit a bad habit','Drop a harmful habit',90,6;

-- Personal growth
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select (select id from d where slug='personal'), 'habit','weekly','Reflect in journal','Write weekly reflection',6,1
union all select (select id from d where slug='personal'), 'habit','weekly','Review goals','Weekly goal review',6,2
union all select (select id from d where slug='personal'), 'habit','monthly','Seek feedback','Ask for feedback monthly',8,3
union all select (select id from d where slug='personal'), 'goal',null,'Do a personality test','Complete a test or coaching',50,4
union all select (select id from d where slug='personal'), 'goal',null,'Hit a personal goal','Achieve a personal milestone',80,5
union all select (select id from d where slug='personal'), 'goal',null,'Courageous step','Do a bold meaningful step',90,6;

-- Digital skills
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select (select id from d where slug='digital'), 'habit','weekly','Learn a tool','Study a new digital tool',6,1
union all select (select id from d where slug='digital'), 'habit','weekly','Use AI daily','Apply AI to one task weekly',6,2
union all select (select id from d where slug='digital'), 'habit','monthly','Security hygiene','Update passwords and backups',8,3
union all select (select id from d where slug='digital'), 'goal',null,'Launch a site or automation','Ship something live',90,4
union all select (select id from d where slug='digital'), 'goal',null,'Master a technology','Reach intermediate level',80,5
union all select (select id from d where slug='digital'), 'goal',null,'Create a digital product','Ship a product or template',100,6;

-- Education & Mentorship
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select (select id from d where slug='education'), 'habit','monthly','Help someone learn','Mentor or help learning',8,1
union all select (select id from d where slug='education'), 'habit','weekly','Share insights','Post helpful tips weekly',6,2
union all select (select id from d where slug='education'), 'habit','monthly','Study pedagogy','Read about education monthly',8,3
union all select (select id from d where slug='education'), 'goal',null,'Mentor a student','Mentor for at least a month',70,4
union all select (select id from d where slug='education'), 'goal',null,'Give a talk','Run a lecture or webinar',80,5
union all select (select id from d where slug='education'), 'goal',null,'Publish a guide','Create an educational guide',90,6;

-- Purpose & Meaning
insert into public.growth_tasks (direction_id, task_type, period, title, description, base_points, sort_index)
select (select id from d where slug='purpose'), 'habit','weekly','Review purpose','Reflect on why weekly',6,1
union all select (select id from d where slug='purpose'), 'habit','weekly','Value check','Align weekly plans with values',6,2
union all select (select id from d where slug='purpose'), 'habit','monthly','Integrity audit','Be honest with yourself',8,3
union all select (select id from d where slug='purpose'), 'goal',null,'Write a mission','Formulate personal mission',60,4
union all select (select id from d where slug='purpose'), 'goal',null,'Letter to future self','Write a letter to yourself',50,5
union all select (select id from d where slug='purpose'), 'goal',null,'Value-driven act','Do an act that reflects values',90,6;

commit;
