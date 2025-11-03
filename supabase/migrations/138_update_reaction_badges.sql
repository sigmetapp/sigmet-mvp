begin;

update public.badges
set description = 'The community reacts to your posts.',
    how_to_get = 'Collect at least 50 reactions on your posts.',
    metric = 'likes_received',
    updated_at = now()
where key = 'feedback_hero';

update public.badges
set description = 'Your work resonates widely.',
    how_to_get = 'Collect at least 200 total reactions.',
    updated_at = now()
where key = 'recognized_voice';

commit;
