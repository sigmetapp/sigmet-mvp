-- Add reply_to_message_id column to dms_messages table
-- This allows messages to reference other messages for reply functionality

-- Add the column
ALTER TABLE public.dms_messages
ADD COLUMN IF NOT EXISTS reply_to_message_id BIGINT REFERENCES public.dms_messages(id) ON DELETE SET NULL;

-- Add index for faster lookups when fetching reply context
CREATE INDEX IF NOT EXISTS idx_dms_messages_reply_to_message_id 
ON public.dms_messages(reply_to_message_id) 
WHERE reply_to_message_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.dms_messages.reply_to_message_id IS 'References the message this message is replying to. NULL if not a reply.';
