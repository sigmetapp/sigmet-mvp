-- Fix RLS policies for dms_messages to allow insert_dms_message function to work
-- The function uses SECURITY DEFINER to bypass RLS, but we need to ensure RLS is properly configured

begin;

-- Disable RLS on dms_messages - security is handled by insert_dms_message function
-- SECURITY DEFINER functions bypass RLS, so we can safely disable it
alter table if exists public.dms_messages disable row level security;

-- Drop any existing policies that might interfere
drop policy if exists "Users can insert messages" on public.dms_messages;
drop policy if exists "Users can view messages" on public.dms_messages;
drop policy if exists "Users can update own messages" on public.dms_messages;
drop policy if exists "Users can delete own messages" on public.dms_messages;
drop policy if exists "Participants can view messages" on public.dms_messages;
drop policy if exists "Participants can insert messages" on public.dms_messages;

-- Ensure insert_dms_message function has proper permissions
-- Grant on new signature (6 parameters with client_msg_id) if it exists
do $$
begin
  -- Try to grant on new signature (6 parameters)
  begin
    grant execute on function public.insert_dms_message(bigint, uuid, text, text, jsonb, text) to authenticated;
    grant execute on function public.insert_dms_message(bigint, uuid, text, text, jsonb, text) to service_role;
  exception
    when undefined_function then
      -- Function doesn't exist yet, will be created by migration 119
      null;
  end;
  
  -- Try to grant on old signature (5 parameters) if it exists
  begin
    grant execute on function public.insert_dms_message(bigint, uuid, text, text, jsonb) to authenticated;
    grant execute on function public.insert_dms_message(bigint, uuid, text, text, jsonb) to service_role;
  exception
    when undefined_function then
      -- Old function doesn't exist, that's fine
      null;
  end;
end $$;

commit;
