-- Add reply_to_message_id column to dms_messages table
-- This allows messages to reference other messages for reply functionality

-- Check if column already exists, and get the actual type of id column
DO $$
DECLARE
  id_type text;
  id_udt_name text;
BEGIN
  -- Check if column already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dms_messages' 
    AND column_name = 'reply_to_message_id'
  ) THEN
    -- Get the actual type of the id column
    SELECT data_type, udt_name INTO id_type, id_udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'dms_messages'
    AND column_name = 'id';
    
    -- Add column with the correct type based on actual id column type
    -- According to schema, id should be bigserial (bigint), but check actual type
    IF id_udt_name = 'int8' OR id_type = 'bigint' OR id_type = 'integer' THEN
      -- id is bigint (bigserial)
      ALTER TABLE public.dms_messages
      ADD COLUMN reply_to_message_id BIGINT;
      
      -- Add foreign key constraint
      ALTER TABLE public.dms_messages
      ADD CONSTRAINT dms_messages_reply_to_message_id_fkey
      FOREIGN KEY (reply_to_message_id) 
      REFERENCES public.dms_messages(id) 
      ON DELETE SET NULL;
    ELSIF id_udt_name = 'uuid' OR id_type = 'uuid' THEN
      -- id is uuid (unexpected, but handle it)
      ALTER TABLE public.dms_messages
      ADD COLUMN reply_to_message_id UUID;
      
      -- Add foreign key constraint
      ALTER TABLE public.dms_messages
      ADD CONSTRAINT dms_messages_reply_to_message_id_fkey
      FOREIGN KEY (reply_to_message_id) 
      REFERENCES public.dms_messages(id) 
      ON DELETE SET NULL;
    ELSE
      RAISE EXCEPTION 'Unexpected id column type: % (udt_name: %)', id_type, id_udt_name;
    END IF;
  END IF;
END $$;

-- Add index for faster lookups when fetching reply context
CREATE INDEX IF NOT EXISTS idx_dms_messages_reply_to_message_id 
ON public.dms_messages(reply_to_message_id) 
WHERE reply_to_message_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.dms_messages.reply_to_message_id IS 'References the message this message is replying to. NULL if not a reply.';
