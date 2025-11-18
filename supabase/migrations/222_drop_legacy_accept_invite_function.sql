begin;

-- Remove legacy single-argument accept_invite_by_code variant so the new
-- version (with target_user_id/target_user_email parameters and defaults)
-- is always invoked by PostgREST.
drop function if exists public.accept_invite_by_code(text);

commit;
