begin;

-- Ensure accept_invite_by_code can be called multiple times by the same user
-- (e.g., after email confirmation) without failing, while still preventing reuse
create or replace function public.accept_invite_by_code(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  invite_record public.invites%rowtype;
  user_sw numeric;
  normalized_code text;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  normalized_code := upper(trim(invite_code));
  if normalized_code is null or normalized_code = '' then
    raise exception 'Invalid invite code';
  end if;

  -- Clean up expired invites before processing
  perform public.cleanup_expired_invites();

  select *
    into invite_record
    from public.invites
   where public.invites.invite_code = normalized_code
   for update;

  if invite_record is null then
    raise exception 'Invalid or expired invite code';
  end if;

  -- Allow idempotent calls for the same user
  if invite_record.status = 'accepted' then
    if invite_record.consumed_by_user_id = current_user_id then
      return invite_record.id;
    else
      raise exception 'Invite code already used by another user';
    end if;
  end if;

  if invite_record.status <> 'pending' then
    raise exception 'Invalid or expired invite code';
  end if;

  if invite_record.expires_at is not null and invite_record.expires_at < now() then
    raise exception 'Invite code has expired';
  end if;

  user_sw := public.calculate_user_sw_at_registration(current_user_id);

  update public.invites
     set status = 'accepted',
         accepted_at = now(),
         consumed_by_user_id = current_user_id,
         consumed_by_user_sw = user_sw
   where id = invite_record.id;

  insert into public.invite_events (invite_id, event, meta)
  values (invite_record.id, 'accepted', jsonb_build_object(
    'user_id', current_user_id,
    'via_code', true,
    'user_sw', user_sw
  ));

  return invite_record.id;
end;
$$;

grant execute on function public.accept_invite_by_code(text) to authenticated;

commit;
