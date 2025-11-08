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
-- Note: This function matches the signature of the original dms_list_partners
-- but uses a simpler query structure for better performance
CREATE OR REPLACE FUNCTION dms_list_partners_optimized(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  thread_id TEXT,
  partner_id UUID,
  partner_username TEXT,
  partner_full_name TEXT,
  partner_avatar_url TEXT,
  last_message_id TEXT,
  last_message_body TEXT,
  last_message_kind TEXT,
  last_message_sender_id UUID,
  last_message_attachments JSONB,
  last_message_at TIMESTAMPTZ,
  messages24h INTEGER,
  unread_count INTEGER,
  is_pinned BOOLEAN,
  pinned_at TIMESTAMPTZ,
  notifications_muted BOOLEAN,
  mute_until TIMESTAMPTZ,
  last_read_message_id TEXT,
  last_read_at TIMESTAMPTZ,
  thread_created_at TIMESTAMPTZ
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked_threads AS (
    SELECT
      tp.thread_id,
      COALESCE(tp.notifications_muted, false) AS notifications_muted,
      tp.mute_until,
      COALESCE(tp.is_pinned, false) AS is_pinned,
      tp.pinned_at,
      tp.last_read_message_id,
      tp.last_read_at,
      t.created_at,
      t.last_message_id,
      t.last_message_at,
      ROW_NUMBER() OVER (
        ORDER BY
          COALESCE(tp.is_pinned, false) DESC,
          tp.pinned_at DESC NULLS LAST,
          t.last_message_at DESC NULLS LAST,
          t.created_at DESC,
          tp.thread_id DESC
      ) AS rn
    FROM dms_thread_participants tp
    JOIN dms_threads t ON t.id = tp.thread_id
    WHERE tp.user_id = p_user_id
      AND t.is_group = false
  ),
  limited_threads AS (
    SELECT *
    FROM ranked_threads
    WHERE rn > COALESCE(p_offset, 0)
      AND rn <= COALESCE(p_offset, 0) + COALESCE(p_limit, 20)
  ),
  partners AS (
    SELECT
      tp.thread_id,
      tp.user_id AS partner_id
    FROM dms_thread_participants tp
    JOIN limited_threads lt ON lt.thread_id = tp.thread_id
    WHERE tp.user_id <> p_user_id
  ),
  last_messages AS (
    SELECT
      lt.thread_id,
      lm.id,
      lm.body,
      lm.kind,
      lm.sender_id,
      lm.attachments,
      lm.created_at
    FROM limited_threads lt
    LEFT JOIN LATERAL (
      SELECT
        m.id::TEXT AS id,
        m.body,
        m.kind,
        m.sender_id,
        m.attachments,
        m.created_at
      FROM dms_messages m
      WHERE m.thread_id = lt.thread_id
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
    ) lm ON true
  ),
  messages_24h AS (
    SELECT
      m.thread_id,
      COUNT(*) FILTER (WHERE m.deleted_at IS NULL) AS cnt
    FROM dms_messages m
    JOIN limited_threads lt ON lt.thread_id = m.thread_id
    WHERE m.created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY m.thread_id
  ),
  unread_receipts AS (
    SELECT
      msg.thread_id,
      COUNT(*) FILTER (WHERE COALESCE(r.status, 'sent') <> 'read') AS unread_count
    FROM dms_message_receipts r
    JOIN dms_messages msg ON msg.id = r.message_id
    JOIN limited_threads lt ON lt.thread_id = msg.thread_id
    WHERE r.user_id = p_user_id
      AND msg.deleted_at IS NULL
      AND msg.sender_id <> p_user_id
    GROUP BY msg.thread_id
  ),
  unread_fallback AS (
    SELECT
      lt.thread_id,
      COUNT(*) AS unread_count
    FROM limited_threads lt
    JOIN dms_messages msg ON msg.thread_id = lt.thread_id
    WHERE msg.deleted_at IS NULL
      AND msg.sender_id <> p_user_id
      AND NOT EXISTS (
        SELECT 1
        FROM dms_message_receipts r
        WHERE r.message_id = msg.id
          AND r.user_id = p_user_id
          AND r.status = 'read'
      )
    GROUP BY lt.thread_id
  )
  SELECT
    lt.thread_id::TEXT AS thread_id,
    p.partner_id,
    prof.username,
    prof.full_name,
    prof.avatar_url,
    COALESCE(lm.id, lt.last_message_id::TEXT) AS last_message_id,
    lm.body,
    lm.kind,
    lm.sender_id,
    COALESCE(lm.attachments, '[]'::jsonb) AS last_message_attachments,
    COALESCE(lm.created_at, lt.last_message_at) AS last_message_at,
    COALESCE(m24.cnt, 0) AS messages24h,
    COALESCE(ur.unread_count, uf.unread_count, 0) AS unread_count,
    lt.is_pinned,
    lt.pinned_at,
    lt.notifications_muted,
    lt.mute_until,
    lt.last_read_message_id::TEXT AS last_read_message_id,
    lt.last_read_at,
    lt.created_at AS thread_created_at
  FROM limited_threads lt
  JOIN partners p ON p.thread_id = lt.thread_id
  LEFT JOIN profiles prof ON prof.user_id = p.partner_id
  LEFT JOIN last_messages lm ON lm.thread_id = lt.thread_id
  LEFT JOIN messages_24h m24 ON m24.thread_id = lt.thread_id
  LEFT JOIN unread_receipts ur ON ur.thread_id = lt.thread_id
  LEFT JOIN unread_fallback uf ON uf.thread_id = lt.thread_id
  ORDER BY
    lt.is_pinned DESC,
    lt.pinned_at DESC NULLS LAST,
    lt.last_message_at DESC NULLS LAST,
    lt.created_at DESC,
    lt.thread_id DESC;
$$;

-- 3. Add comment explaining the optimization
COMMENT ON FUNCTION dms_list_partners_optimized IS 
'Optimized version of dms_list_partners with better query plan and indexes. 
Uses CTEs for better performance and readability.';

-- 4. Grant execute permission
GRANT EXECUTE ON FUNCTION dms_list_partners_optimized TO authenticated;
