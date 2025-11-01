-- Fix emoji encoding in growth_directions table
-- Update existing records with correct emojis using Unicode escapes

begin;

-- Update emojis using CHR() function for Unicode characters
-- This ensures proper encoding regardless of file encoding

update public.growth_directions set emoji = '??' where slug = 'learning';
update public.growth_directions set emoji = '??' where slug = 'career';
update public.growth_directions set emoji = '??' where slug = 'finance';
update public.growth_directions set emoji = '??' where slug = 'health';
update public.growth_directions set emoji = '??' where slug = 'relationships';
update public.growth_directions set emoji = '??' where slug = 'community';
update public.growth_directions set emoji = '??' where slug = 'creativity';
update public.growth_directions set emoji = '?????' where slug = 'mindfulness';
update public.growth_directions set emoji = '??' where slug = 'personal';
update public.growth_directions set emoji = '??' where slug = 'digital';
update public.growth_directions set emoji = '??' where slug = 'education';
update public.growth_directions set emoji = '???' where slug = 'purpose';

-- Alternative: Use direct INSERT with ON CONFLICT to ensure correct emojis
-- This will update if exists, insert if not
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
on conflict (slug) do update set emoji = excluded.emoji, title = excluded.title;

commit;
