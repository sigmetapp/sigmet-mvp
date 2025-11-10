-- Add goals column to profiles table
-- Goals will be stored as JSONB array with structure: [{id: string, text: string, target_date: string | null}]

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS goals JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.goals IS 'User goals stored as JSONB array. Each goal has: id (string), text (string), target_date (string | null)';
