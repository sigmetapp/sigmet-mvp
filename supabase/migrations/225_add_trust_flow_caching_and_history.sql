-- Trust Flow Caching and History Tracking
-- This migration adds:
-- 1. trust_flow column to profiles table for caching
-- 2. trust_flow_history table for tracking all changes
-- 3. Functions and triggers for automatic TF recalculation

-- Step 1: Add trust_flow column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS trust_flow numeric(10, 2) DEFAULT 5.0;

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS profiles_trust_flow_idx ON public.profiles(trust_flow);

-- Step 2: Create trust_flow_history table
CREATE TABLE IF NOT EXISTS public.trust_flow_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  old_value numeric(10, 2),
  new_value numeric(10, 2),
  change_reason text, -- 'push_created', 'push_deleted', 'manual_recalc', 'backfill', etc.
  push_id bigint references public.trust_pushes(id) on delete set null,
  calculated_by text, -- 'trigger', 'api', 'admin', etc.
  metadata jsonb, -- Additional info like weight, repeat_count, etc.
  created_at timestamptz default now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS trust_flow_history_user_created_idx 
  ON public.trust_flow_history(user_id, created_at desc);
CREATE INDEX IF NOT EXISTS trust_flow_history_push_id_idx 
  ON public.trust_flow_history(push_id) WHERE push_id IS NOT NULL;

-- RLS policies
ALTER TABLE public.trust_flow_history ENABLE ROW LEVEL SECURITY;

-- Anyone can read history (for transparency)
DROP POLICY IF EXISTS "read trust_flow_history" ON public.trust_flow_history;
CREATE POLICY "read trust_flow_history" ON public.trust_flow_history 
  FOR SELECT USING (true);

-- Allow service role and authenticated users to insert (via RPC function with SECURITY DEFINER)
-- The function uses SECURITY DEFINER so it can insert even when called by regular users
DROP POLICY IF EXISTS "insert trust_flow_history" ON public.trust_flow_history;
CREATE POLICY "insert trust_flow_history" ON public.trust_flow_history 
  FOR INSERT WITH CHECK (true); -- Function has SECURITY DEFINER, so this is safe

-- Step 3: Create function to update Trust Flow cache and log history
-- This function is called from the application after calculating TF in TypeScript
-- It updates the cached value and logs the change to history
CREATE OR REPLACE FUNCTION public.update_user_trust_flow(
  p_user_id uuid,
  p_new_value numeric(10, 2),
  p_change_reason text DEFAULT 'manual_recalc',
  p_push_id bigint DEFAULT NULL,
  p_calculated_by text DEFAULT 'api',
  p_metadata jsonb DEFAULT NULL
) RETURNS numeric(10, 2) AS $$
DECLARE
  v_old_value numeric(10, 2);
BEGIN
  -- Get current cached value
  SELECT COALESCE(trust_flow, 5.0) INTO v_old_value
  FROM public.profiles
  WHERE user_id = p_user_id;

  -- Update profiles table with new calculated value
  UPDATE public.profiles
  SET trust_flow = p_new_value
  WHERE user_id = p_user_id;

  -- If value changed, log to history
  IF v_old_value IS DISTINCT FROM p_new_value THEN
    INSERT INTO public.trust_flow_history (
      user_id,
      old_value,
      new_value,
      change_reason,
      push_id,
      calculated_by,
      metadata
    ) VALUES (
      p_user_id,
      v_old_value,
      p_new_value,
      p_change_reason,
      p_push_id,
      p_calculated_by,
      p_metadata
    );
  END IF;

  RETURN p_new_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Note: We don't use triggers for automatic recalculation
-- Instead, the application will call update_user_trust_flow() after calculating TF
-- This ensures the calculation logic stays in TypeScript and is consistent

-- Step 5: Create helper function to get users who need TF recalculation
-- This can be used by admin tools to identify users needing backfill
CREATE OR REPLACE FUNCTION public.get_users_needing_tf_recalc()
RETURNS TABLE(
  user_id uuid,
  current_tf numeric(10, 2),
  has_pushes boolean,
  push_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    p.user_id,
    COALESCE(p.trust_flow, 5.0) as current_tf,
    EXISTS(SELECT 1 FROM public.trust_pushes tp WHERE tp.to_user_id = p.user_id) as has_pushes,
    COALESCE((
      SELECT COUNT(*) 
      FROM public.trust_pushes tp 
      WHERE tp.to_user_id = p.user_id
    ), 0)::bigint as push_count
  FROM public.profiles p
  WHERE EXISTS (
    SELECT 1 FROM public.trust_pushes tp WHERE tp.to_user_id = p.user_id
  )
  ORDER BY push_count DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 8: Initialize trust_flow for existing users (set to 5.0 if NULL)
UPDATE public.profiles
SET trust_flow = 5.0
WHERE trust_flow IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.trust_flow IS 'Cached Trust Flow value. Updated by application after calculation. Base value is 5.0.';
COMMENT ON TABLE public.trust_flow_history IS 'History of all Trust Flow changes. Tracks old/new values, reasons, and metadata.';
COMMENT ON FUNCTION public.update_user_trust_flow(uuid, numeric, text, bigint, text, jsonb) IS 'Updates cached Trust Flow value (calculated in application) and logs change to history if value changed. Called from TypeScript after calculation.';
COMMENT ON FUNCTION public.get_users_needing_tf_recalc() IS 'Returns list of users who have trust pushes and may need TF recalculation. Used for admin backfill operations.';
