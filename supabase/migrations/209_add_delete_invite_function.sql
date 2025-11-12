begin;

-- Function to delete invite (for admin or owner)
create or replace function public.delete_invite(invite_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  current_user_id uuid;
  invite_record record;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Get invite record
  select * into invite_record
  from public.invites
  where id = invite_id;

  if invite_record is null then
    raise exception 'Invite not found';
  end if;

  -- Check if user is admin or owner
  if not public.is_admin() and invite_record.inviter_user_id != current_user_id then
    raise exception 'Permission denied. Only admin or invite owner can delete invites.';
  end if;

  -- Delete the invite
  delete from public.invites
  where id = invite_id;
end;
$$;

-- Grant execute permission
grant execute on function public.delete_invite(uuid) to authenticated;

commit;
