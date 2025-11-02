-- Migration: Merge 12 directions to 8 directions
-- Merges:
--   - "Education & Mentorship" + "Digital Skills & Tech" -> "Learning & Knowledge"
--   - "Personal Growth & Self-Awareness" + "Mindfulness & Balance" -> "Mindfulness & Inner Balance"
--   - "Health & Fitness" -> "Health & Vitality"
--
-- Migration map:
--   learning -> learning (keep, merge education & digital into it)
--   education -> learning (merge)
--   digital -> learning (merge)
--   mindfulness -> mindfulness (keep, merge personal into it, rename to "Mindfulness & Inner Balance")
--   personal -> mindfulness (merge)
--   health -> health (rename to "Health & Vitality")
--   All others stay the same

begin;

-- Step 1: Get IDs for old and new directions
do $$
declare
  v_learning_id uuid;
  v_education_id uuid;
  v_digital_id uuid;
  v_mindfulness_id uuid;
  v_personal_id uuid;
  v_health_id uuid;
begin
  -- Get direction IDs
  select id into v_learning_id from public.growth_directions where slug = 'learning';
  select id into v_education_id from public.growth_directions where slug = 'education';
  select id into v_digital_id from public.growth_directions where slug = 'digital';
  select id into v_mindfulness_id from public.growth_directions where slug = 'mindfulness';
  select id into v_personal_id from public.growth_directions where slug = 'personal';
  select id into v_health_id from public.growth_directions where slug = 'health';

  -- Step 2: Migrate tasks from education and digital to learning
  if v_education_id is not null and v_learning_id is not null then
    -- Update task direction_id
    update public.growth_tasks 
    set direction_id = v_learning_id 
    where direction_id = v_education_id;
    
    -- Update user_selected_directions
    update public.user_selected_directions 
    set direction_id = v_learning_id 
    where direction_id = v_education_id;
    
    -- Update user_tasks via growth_tasks relationship (tasks will be migrated automatically via cascade)
    -- Update sw_ledger
    update public.sw_ledger 
    set direction_id = v_learning_id 
    where direction_id = v_education_id;
  end if;

  if v_digital_id is not null and v_learning_id is not null then
    -- Update task direction_id
    update public.growth_tasks 
    set direction_id = v_learning_id 
    where direction_id = v_digital_id;
    
    -- Update user_selected_directions
    update public.user_selected_directions 
    set direction_id = v_learning_id 
    where direction_id = v_digital_id;
    
    -- Update sw_ledger
    update public.sw_ledger 
    set direction_id = v_learning_id 
    where direction_id = v_digital_id;
  end if;

  -- Step 3: Migrate tasks from personal to mindfulness
  if v_personal_id is not null and v_mindfulness_id is not null then
    -- Update task direction_id
    update public.growth_tasks 
    set direction_id = v_mindfulness_id 
    where direction_id = v_personal_id;
    
    -- Update user_selected_directions
    update public.user_selected_directions 
    set direction_id = v_mindfulness_id 
    where direction_id = v_personal_id;
    
    -- Update sw_ledger
    update public.sw_ledger 
    set direction_id = v_mindfulness_id 
    where direction_id = v_personal_id;
  end if;

  -- Step 4: Remove duplicate selections (if user had both old and new direction selected)
  -- This handles cases where user had both education and learning selected
  delete from public.user_selected_directions
  where id in (
    select usd1.id
    from public.user_selected_directions usd1
    inner join public.user_selected_directions usd2 
      on usd1.user_id = usd2.user_id 
      and usd1.direction_id = usd2.direction_id
      and usd1.id < usd2.id
  );

  -- Step 5: Delete old directions (education, digital, personal)
  delete from public.growth_directions where slug in ('education', 'digital', 'personal');

  -- Step 6: Update titles for renamed directions
  update public.growth_directions 
  set title = 'Learning & Knowledge',
      emoji = '??'
  where slug = 'learning';

  update public.growth_directions 
  set title = 'Mindfulness & Inner Balance',
      emoji = '?????'
  where slug = 'mindfulness';

  update public.growth_directions 
  set title = 'Health & Vitality',
      emoji = '??'
  where slug = 'health';

  -- Step 7: Update sort_index to reflect new 8-direction structure
  -- 1: learning, 2: career, 3: finance, 4: health, 5: relationships, 6: community, 7: creativity, 8: mindfulness, 9: purpose
  update public.growth_directions set sort_index = 1 where slug = 'learning';
  update public.growth_directions set sort_index = 2 where slug = 'career';
  update public.growth_directions set sort_index = 3 where slug = 'finance';
  update public.growth_directions set sort_index = 4 where slug = 'health';
  update public.growth_directions set sort_index = 5 where slug = 'relationships';
  update public.growth_directions set sort_index = 6 where slug = 'community';
  update public.growth_directions set sort_index = 7 where slug = 'creativity';
  update public.growth_directions set sort_index = 8 where slug = 'mindfulness';
  update public.growth_directions set sort_index = 9 where slug = 'purpose';

end $$;

commit;
