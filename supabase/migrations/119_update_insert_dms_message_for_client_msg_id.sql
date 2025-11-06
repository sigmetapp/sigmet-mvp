-- Update insert_dms_message function to support client_msg_id
-- This allows deduplication of messages sent via WebSocket

-- Drop old function if exists (with old signature - 5 parameters)
drop function if exists public.insert_dms_message(bigint, uuid, text, text, jsonb);

-- Create new function with client_msg_id support (6 parameters)
create or replace function public.insert_dms_message(
  p_thread_id bigint,
  p_sender_id uuid,
  p_body text,
  p_kind text,
  p_attachments jsonb,
  p_client_msg_id text default null
)
returns public.dms_messages
language plpgsql
security definer -- Runs as function owner, bypasses RLS
as $$
declare
  v_message public.dms_messages;
  v_user_id uuid;
begin
  -- For service role calls, skip auth.uid() check and use p_sender_id directly
  -- This allows the function to work when called from WebSocket gateway with service role
  -- SECURITY DEFINER functions run as the function owner (postgres), so auth.uid() may be null
  -- We trust p_sender_id when called via service role
  v_user_id := auth.uid();
  
  -- If auth.uid() is null (service role call), use p_sender_id directly
  -- Otherwise verify that auth.uid() matches p_sender_id
  if v_user_id is not null and v_user_id != p_sender_id then
    raise exception 'Unauthorized: user ID mismatch';
  end if;
  
  -- Verify thread membership (bypasses RLS due to SECURITY DEFINER)
  -- Use service role context to check membership
  if not exists (
    select 1 from public.dms_thread_participants
    where thread_id = p_thread_id
      and user_id = p_sender_id
  ) then
    raise exception 'Forbidden: not a participant';
  end if;
  
  -- Check for duplicate client_msg_id if provided
  if p_client_msg_id is not null then
    if exists (
      select 1 from public.dms_messages
      where thread_id = p_thread_id
        and client_msg_id = p_client_msg_id
    ) then
      -- Return existing message instead of creating duplicate
      select * into v_message
      from public.dms_messages
      where thread_id = p_thread_id
        and client_msg_id = p_client_msg_id
      limit 1;
      return v_message;
    end if;
  end if;
  
  -- Insert message (bypasses RLS due to SECURITY DEFINER)
  -- Handle null body when attachments exist - use zero-width space
  insert into public.dms_messages (
    thread_id,
    sender_id,
    kind,
    body,
    attachments,
    client_msg_id,
    created_at
  ) values (
    p_thread_id,
    p_sender_id,
    coalesce(p_kind, 'text'),
    case 
      when p_body is not null then p_body
      when p_attachments is not null and jsonb_array_length(p_attachments) > 0 then chr(8203) -- Zero-width space (U+200B)
      else null
    end,
    coalesce(p_attachments, '[]'::jsonb),
    p_client_msg_id,
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

-- Grant execute permission to authenticated users and service_role (with new signature)
grant execute on function public.insert_dms_message(bigint, uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.insert_dms_message(bigint, uuid, text, text, jsonb, text) to service_role;

-- Update comment
comment on function public.insert_dms_message is 
  'Inserts a DM message bypassing RLS policies. Verifies user authentication and thread membership. Supports client_msg_id for deduplication.';
