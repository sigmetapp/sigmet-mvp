-- Migration: Optimize DM queries with indexes and improved function
-- Priority 1: Critical performance improvements

-- 1. Add indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_dms_messages_thread_sequence 
ON dms_messages(thread_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_dms_thread_participants_user_thread 
ON dms_thread_participants(user_id, thread_id);

CREATE INDEX IF NOT EXISTS idx_dms_message_receipts_message_user 
ON dms_message_receipts(message_id, user_id);

CREATE INDEX IF NOT EXISTS idx_dms_threads_last_message_at 
ON dms_threads(last_message_at DESC NULLS LAST);

-- 2. Optimize dms_list_partners function with better query plan
-- This function is called frequently and needs to be fast
CREATE OR REPLACE FUNCTION dms_list_partners_optimized(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  partner_id UUID,
  partner_username TEXT,
  partner_full_name TEXT,
  partner_avatar_url TEXT,
  thread_id BIGINT,
  messages24h INTEGER,
  last_message_at TIMESTAMPTZ,
  thread_created_at TIMESTAMPTZ,
  last_message_id BIGINT,
  last_message_body TEXT,
  last_message_kind TEXT,
  last_message_sender_id UUID,
  last_message_attachments JSONB,
  unread_count INTEGER,
  is_pinned BOOLEAN,
  pinned_at TIMESTAMPTZ,
  notifications_muted BOOLEAN,
  mute_until TIMESTAMPTZ,
  last_read_message_id BIGINT,
  last_read_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH user_threads AS (
    -- Get all threads where user is a participant
    SELECT DISTINCT tp.thread_id
    FROM dms_thread_participants tp
    WHERE tp.user_id = p_user_id
  ),
  thread_partners AS (
    -- Get partner info for each thread
    SELECT 
      t.id AS thread_id,
      p.user_id AS partner_id,
      p.username AS partner_username,
      p.full_name AS partner_full_name,
      p.avatar_url AS partner_avatar_url,
      t.last_message_at,
      t.created_at AS thread_created_at,
      t.last_message_id,
      -- Get last message details
      (
        SELECT m.body
        FROM dms_messages m
        WHERE m.thread_id = t.id
          AND m.id = t.last_message_id
        LIMIT 1
      ) AS last_message_body,
      (
        SELECT m.kind
        FROM dms_messages m
        WHERE m.thread_id = t.id
          AND m.id = t.last_message_id
        LIMIT 1
      ) AS last_message_kind,
      (
        SELECT m.sender_id
        FROM dms_messages m
        WHERE m.thread_id = t.id
          AND m.id = t.last_message_id
        LIMIT 1
      ) AS last_message_sender_id,
      (
        SELECT m.attachments
        FROM dms_messages m
        WHERE m.thread_id = t.id
          AND m.id = t.last_message_id
        LIMIT 1
      ) AS last_message_attachments,
      -- Count messages in last 24 hours
      (
        SELECT COUNT(*)
        FROM dms_messages m
        WHERE m.thread_id = t.id
          AND m.created_at >= NOW() - INTERVAL '24 hours'
      )::INTEGER AS messages24h,
      -- Get participant settings
      (
        SELECT tp.is_pinned
        FROM dms_thread_participants tp
        WHERE tp.thread_id = t.id
          AND tp.user_id = p_user_id
        LIMIT 1
      ) AS is_pinned,
      (
        SELECT tp.pinned_at
        FROM dms_thread_participants tp
        WHERE tp.thread_id = t.id
          AND tp.user_id = p_user_id
        LIMIT 1
      ) AS pinned_at,
      (
        SELECT tp.notifications_muted
        FROM dms_thread_participants tp
        WHERE tp.thread_id = t.id
          AND tp.user_id = p_user_id
        LIMIT 1
      ) AS notifications_muted,
      (
        SELECT tp.mute_until
        FROM dms_thread_participants tp
        WHERE tp.thread_id = t.id
          AND tp.user_id = p_user_id
        LIMIT 1
      ) AS mute_until,
      (
        SELECT tp.last_read_message_id
        FROM dms_thread_participants tp
        WHERE tp.thread_id = t.id
          AND tp.user_id = p_user_id
        LIMIT 1
      ) AS last_read_message_id,
      (
        SELECT tp.last_read_at
        FROM dms_thread_participants tp
        WHERE tp.thread_id = t.id
          AND tp.user_id = p_user_id
        LIMIT 1
      ) AS last_read_at,
      -- Calculate unread count
      (
        SELECT COUNT(*)
        FROM dms_messages m
        WHERE m.thread_id = t.id
          AND m.sender_id != p_user_id
          AND m.deleted_at IS NULL
          AND (
            -- No read marker, count all messages
            (SELECT tp.last_read_message_id FROM dms_thread_participants tp 
             WHERE tp.thread_id = t.id AND tp.user_id = p_user_id LIMIT 1) IS NULL
            OR
            -- Count messages after last read
            m.id > (
              SELECT tp.last_read_message_id FROM dms_thread_participants tp 
              WHERE tp.thread_id = t.id AND tp.user_id = p_user_id LIMIT 1
            )
          )
      )::INTEGER AS unread_count
    FROM user_threads ut
    INNER JOIN dms_threads t ON t.id = ut.thread_id
    INNER JOIN dms_thread_participants tp ON tp.thread_id = t.id AND tp.user_id != p_user_id
    INNER JOIN profiles p ON p.user_id = tp.user_id
  )
  SELECT 
    tp.partner_id,
    tp.partner_username,
    tp.partner_full_name,
    tp.partner_avatar_url,
    tp.thread_id,
    tp.messages24h,
    tp.last_message_at,
    tp.thread_created_at,
    tp.last_message_id,
    tp.last_message_body,
    tp.last_message_kind,
    tp.last_message_sender_id,
    tp.last_message_attachments,
    tp.unread_count,
    COALESCE(tp.is_pinned, false) AS is_pinned,
    tp.pinned_at,
    COALESCE(tp.notifications_muted, false) AS notifications_muted,
    tp.mute_until,
    tp.last_read_message_id,
    tp.last_read_at
  FROM thread_partners tp
  ORDER BY 
    COALESCE(tp.is_pinned, false) DESC,
    COALESCE(tp.last_message_at, tp.thread_created_at) DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 3. Add comment explaining the optimization
COMMENT ON FUNCTION dms_list_partners_optimized IS 
'Optimized version of dms_list_partners with better query plan and indexes. 
Uses CTEs for better performance and readability.';

-- 4. Grant execute permission
GRANT EXECUTE ON FUNCTION dms_list_partners_optimized TO authenticated;
