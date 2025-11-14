-- Add function to check notification triggers status
-- This allows the debug panel to verify triggers are active
begin;

create or replace function public.check_notification_triggers()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb := '[]'::jsonb;
  trigger_record record;
begin
  for trigger_record in
    select 
      trigger_name,
      event_object_table,
      action_timing,
      event_manipulation,
      action_statement
    from information_schema.triggers
    where trigger_schema = 'public'
      and trigger_name in (
        'notify_comment_on_post_trigger',
        'notify_comment_on_comment_trigger',
        'notify_reaction_on_post_trigger',
        'notify_reaction_on_comment_trigger',
        'notify_connection_trigger',
        'notify_on_event_trigger'
      )
    order by trigger_name
  loop
    result := result || jsonb_build_object(
      'name', trigger_record.trigger_name,
      'table', trigger_record.event_object_table,
      'timing', trigger_record.action_timing,
      'event', trigger_record.event_manipulation
    );
  end loop;
  
  return result;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.check_notification_triggers() to authenticated;

commit;
