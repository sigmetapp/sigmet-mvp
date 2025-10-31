-- Update trust_feedback policy to prevent users from giving feedback to themselves
drop policy if exists "insert trust_feedback" on public.trust_feedback;
-- Prevent users from giving feedback to themselves
create policy "insert trust_feedback" on public.trust_feedback for insert 
  with check (auth.uid() is not null and auth.uid() != target_user_id);
