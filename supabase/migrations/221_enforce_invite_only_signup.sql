begin;

-- Enforce invite-only signups and automatically mark invites as accepted
create or replace function auth.enforce_invite_only_signup()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  invites_only boolean;
  normalized_code text;
  invite_row public.invites%rowtype;
  user_sw numeric;
  request_role text;
begin
  -- Allow service role and supabase admin operations to bypass the invite check
  request_role := current_setting('request.jwt.claim.role', true);
  if coalesce(request_role, '') in ('service_role', 'supabase_admin') then
    return new;
  end if;

  -- Check if invite-only mode is enabled
  select invites_only
    into invites_only
    from public.site_settings
   where id = 1;

  normalized_code := upper(trim(coalesce(new.raw_app_meta_data ->> 'invite_code', '')));

  if coalesce(invites_only, false) = false then
    -- Invite-only mode disabled: accept code if provided, otherwise do nothing
    if normalized_code = '' then
      return new;
    end if;
  else
    -- Invite-only mode enabled: invite code is mandatory
    if normalized_code = '' then
      raise exception 'Invite code required. Registration is currently invite-only.';
    end if;
  end if;

  -- Cleanup expired invites before validating
  perform public.cleanup_expired_invites();

  -- Fetch invite and lock the row
  select *
    into invite_row
    from public.invites
   where public.invites.invite_code = normalized_code
     and public.invites.status = 'pending'
     and (public.invites.expires_at is null or public.invites.expires_at >= now())
   for update;

  if invite_row is null then
    raise exception 'Invalid or expired invite code. Registration requires a valid invite.';
  end if;

  -- Calculate Social Weight snapshot for the new user
  user_sw := public.calculate_user_sw_at_registration(new.id);

  -- Mark invite as accepted
  update public.invites
     set status = 'accepted',
         accepted_at = now(),
         consumed_by_user_id = new.id,
         consumed_by_user_sw = user_sw,
         invitee_email = coalesce(invite_row.invitee_email, lower(new.email))
   where id = invite_row.id;

  -- Record invite event for analytics/history
  insert into public.invite_events (invite_id, event, meta)
  values (
    invite_row.id,
    'accepted',
    jsonb_build_object(
      'user_id', new.id,
      'via_code', true,
      'user_sw', user_sw,
      'email', lower(new.email)
    )
  );

  return new;
end;
$$;

-- Own the function by postgres to ensure it bypasses RLS
alter function auth.enforce_invite_only_signup() owner to postgres;

-- Attach trigger to auth.users (drop existing if present)
drop trigger if exists enforce_invite_only_signup on auth.users;
create trigger enforce_invite_only_signup
after insert on auth.users
for each row execute function auth.enforce_invite_only_signup();

commit;
