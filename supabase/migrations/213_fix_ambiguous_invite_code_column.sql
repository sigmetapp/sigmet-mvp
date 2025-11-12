begin;

-- Fix ambiguous column reference "invite_code" in validate_invite_code function
-- The column name needs to be explicitly qualified with the table name
create or replace function public.validate_invite_code(invite_code text)
returns boolean
language plpgsql
security definer
as $$
declare
  invite_record record;
begin
  -- Find pending invite by code that is not expired
  -- Explicitly qualify the column name to avoid ambiguity
  select * into invite_record
  from public.invites
  where public.invites.invite_code = upper(trim(validate_invite_code.invite_code))
    and status = 'pending'
    and (expires_at is null or expires_at >= now());

  -- Return true if valid pending invite exists, false otherwise
  return invite_record is not null;
end;
$$;

-- Fix ambiguous column reference "invite_code" in accept_invite_by_code function
-- The column name needs to be explicitly qualified with the table name
create or replace function public.accept_invite_by_code(invite_code text)
returns uuid
language plpgsql
security definer
as $$
declare
  current_user_id uuid;
  invite_record record;
  invite_id uuid;
  user_sw numeric;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Cleanup expired invites first
  perform public.cleanup_expired_invites();

  -- Find pending invite by code with lock, check expiration
  -- Explicitly qualify the column name to avoid ambiguity
  select * into invite_record
  from public.invites
  where public.invites.invite_code = upper(trim(accept_invite_by_code.invite_code))
    and status = 'pending'
    and (expires_at is null or expires_at >= now())
  for update;

  if invite_record is null then
    raise exception 'Invalid or expired invite code';
  end if;

  -- Calculate user SW at registration time
  user_sw := public.calculate_user_sw_at_registration(current_user_id);

  -- Update invite status and store SW
  update public.invites
  set 
    status = 'accepted',
    accepted_at = now(),
    consumed_by_user_id = current_user_id,
    consumed_by_user_sw = user_sw
  where id = invite_record.id;

  invite_id := invite_record.id;

  -- Record event
  insert into public.invite_events (invite_id, event, meta)
  values (invite_id, 'accepted', jsonb_build_object(
    'user_id', current_user_id,
    'via_code', true,
    'user_sw', user_sw
  ));

  return invite_id;
end;
$$;

-- Grant execute permissions (in case they were dropped)
grant execute on function public.validate_invite_code(text) to anon;
grant execute on function public.validate_invite_code(text) to authenticated;
grant execute on function public.accept_invite_by_code(text) to authenticated;

commit;
