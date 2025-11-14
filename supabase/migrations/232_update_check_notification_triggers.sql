-- Update the check_notification_triggers helper to include the latest notification triggers
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
        'notify_on_event_trigger',
        'notify_goal_reaction_trigger',
        'notify_trust_push_trigger'
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

grant execute on function public.check_notification_triggers() to authenticated;

commit;
