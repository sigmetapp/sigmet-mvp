-- Create a function to insert messages that bypasses RLS
-- This function will be called with SECURITY DEFINER to run as the function owner (postgres)
-- which bypasses RLS policies

create or replace function public.insert_dms_message(
  p_thread_id bigint,
  p_sender_id uuid,
  p_kind text default 'text',
  p_body text,
  p_attachments jsonb default '[]'::jsonb
)
returns public.dms_messages
language plpgsql
security definer -- Runs as function owner, bypasses RLS
as $$
declare
  v_message public.dms_messages;
  v_user_id uuid;
begin
  -- Verify user exists and is authenticated
  v_user_id := auth.uid();
  if v_user_id is null or v_user_id != p_sender_id then
    raise exception 'Unauthorized';
  end if;
  
  -- Verify thread membership (using RLS-aware check)
  if not exists (
    select 1 from public.dms_thread_participants
    where thread_id = p_thread_id
      and user_id = p_sender_id
  ) then
    raise exception 'Forbidden: not a participant';
  end if;
  
  -- Insert message (bypasses RLS due to SECURITY DEFINER)
  insert into public.dms_messages (
    thread_id,
    sender_id,
    kind,
    body,
    attachments,
    created_at
  ) values (
    p_thread_id,
    p_sender_id,
    p_kind,
    p_body,
    p_attachments,
    now()
  )
  returning * into v_message;
  
  -- Update thread last message (bypasses RLS)
  update public.dms_threads
  set 
    last_message_id = v_message.id,
    last_message_at = v_message.created_at,
    updated_at = now()
  where id = p_thread_id;
  
  return v_message;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.insert_dms_message to authenticated;

-- Create comment
comment on function public.insert_dms_message is 
  'Inserts a DM message bypassing RLS policies. Verifies user authentication and thread membership.';
