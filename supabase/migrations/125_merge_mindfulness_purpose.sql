-- Migration: Merge "Mindfulness & Inner Balance" and "Meaning & Purpose" into "Mindfulness & Purpose"
-- This reduces directions from 8 to 7
-- 
-- Migration map:
--   mindfulness -> mindfulness_purpose (merge)
--   purpose -> mindfulness_purpose (merge)
--   All others stay the same

begin;

-- Step 1: Get IDs for old and new directions
do $$
declare
  v_mindfulness_id uuid;
  v_purpose_id uuid;
  v_new_direction_id uuid;
begin
  -- Get direction IDs
  select id into v_mindfulness_id from public.growth_directions where slug = 'mindfulness';
  select id into v_purpose_id from public.growth_directions where slug = 'purpose';

  -- Check if new direction already exists, if not create it
  select id into v_new_direction_id from public.growth_directions where slug = 'mindfulness_purpose';
  
  if v_new_direction_id is null then
    -- Create new merged direction
    insert into public.growth_directions (slug, title, emoji, sort_index)
    values ('mindfulness_purpose', 'Mindfulness & Purpose', '??', 8)
    returning id into v_new_direction_id;
  end if;

  -- Step 2: Migrate tasks from mindfulness to mindfulness_purpose
  if v_mindfulness_id is not null and v_new_direction_id is not null then
    -- Update task direction_id
    update public.growth_tasks 
    set direction_id = v_new_direction_id 
    where direction_id = v_mindfulness_id;
    
    -- Update user_selected_directions
    update public.user_selected_directions 
    set direction_id = v_new_direction_id 
    where direction_id = v_mindfulness_id;
    
    -- Update sw_ledger
    update public.sw_ledger 
    set direction_id = v_new_direction_id 
    where direction_id = v_mindfulness_id;
  end if;

  -- Step 3: Migrate tasks from purpose to mindfulness_purpose
  if v_purpose_id is not null and v_new_direction_id is not null then
    -- Update task direction_id
    update public.growth_tasks 
    set direction_id = v_new_direction_id 
    where direction_id = v_purpose_id;
    
    -- Update user_selected_directions
    update public.user_selected_directions 
    set direction_id = v_new_direction_id 
    where direction_id = v_purpose_id;
    
    -- Update sw_ledger
    update public.sw_ledger 
    set direction_id = v_new_direction_id 
    where direction_id = v_purpose_id;
  end if;

  -- Step 4: Remove duplicate selections (if user had both mindfulness and purpose selected)
  -- This handles cases where user had both old directions selected
  delete from public.user_selected_directions
  where id in (
    select usd1.id
    from public.user_selected_directions usd1
    inner join public.user_selected_directions usd2 
      on usd1.user_id = usd2.user_id 
      and usd1.direction_id = usd2.direction_id
      and usd1.id < usd2.id
  );

  -- Step 5: Delete old directions (mindfulness, purpose)
  delete from public.growth_directions where slug in ('mindfulness', 'purpose');

  -- Step 6: Update sort_index to reflect new 7-direction structure
  -- 1: learning, 2: career, 3: finance, 4: health, 5: relationships, 6: community, 7: creativity, 8: mindfulness_purpose
  update public.growth_directions set sort_index = 1 where slug = 'learning';
  update public.growth_directions set sort_index = 2 where slug = 'career';
  update public.growth_directions set sort_index = 3 where slug = 'finance';
  update public.growth_directions set sort_index = 4 where slug = 'health';
  update public.growth_directions set sort_index = 5 where slug = 'relationships';
  update public.growth_directions set sort_index = 6 where slug = 'community';
  update public.growth_directions set sort_index = 7 where slug = 'creativity';
  update public.growth_directions set sort_index = 8 where slug = 'mindfulness_purpose';

end $$;

commit;
