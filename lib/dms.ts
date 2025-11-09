'use client';

import { createClient } from '@supabase/supabase-js';
import { assertThreadId, coerceThreadId, type ThreadId } from '@/lib/dm/threadId';

// Helper to create client component Supabase client
function createClientComponentClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
}

export type Thread = {
  id: ThreadId;
  created_by: string;
  is_group: boolean;
  title: string | null;
  created_at: string;
  last_message_at: string | null;
};

export type Message = {
  id: string | number;
  thread_id: ThreadId;
  sender_id: string;
  kind: 'text' | 'system';
  body: string | null;
  attachments: unknown[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  sequence_number?: number | null;
  client_msg_id?: string | null;
  reply_to_message_id?: number | string | null; // Can be number (bigint) or string (UUID) depending on database schema
};

/**
 * Get or create a 1-on-1 thread between current user and partner.
 * Completely rewritten to handle bigint IDs correctly.
 */
export async function getOrCreateThread(
  currentUserId: string,
  partnerId: string
): Promise<Thread> {
  if (!currentUserId || !partnerId || currentUserId === partnerId) {
    throw new Error('Invalid user IDs');
  }

  const supabase = createClientComponentClient();

  // Ensure user is authenticated
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user || user.id !== currentUserId) {
    throw new Error('Unauthorized');
  }

  // Check for blocks
  const { data: blocks, error: blocksErr } = await supabase
    .from('dms_blocks')
    .select('blocker, blocked')
    .in('blocker', [currentUserId, partnerId])
    .in('blocked', [currentUserId, partnerId])
    .limit(1);

  if (blocksErr) {
    throw new Error(blocksErr.message);
  }
  if (blocks && blocks.length > 0) {
    throw new Error('Blocked');
  }

  const selectColumns = 'id, created_by, is_group, title, created_at, last_message_at';

  async function findExistingThread(): Promise<Thread | null> {
    const { data: userParticipantRows, error: userThreadsErr } = await supabase
      .from('dms_thread_participants')
      .select('thread_id')
      .eq('user_id', currentUserId);

    if (userThreadsErr) {
      throw new Error(`Failed to get user threads: ${userThreadsErr.message}`);
    }

    const userThreadIds = new Set<ThreadId>();
    for (const row of userParticipantRows || []) {
      const tid = coerceThreadId(row.thread_id);
      if (tid) {
        userThreadIds.add(tid);
      }
    }

    if (userThreadIds.size === 0) {
      return null;
    }

    const { data: partnerParticipantRows, error: partnerThreadsErr } = await supabase
      .from('dms_thread_participants')
      .select('thread_id')
      .eq('user_id', partnerId)
      .in('thread_id', Array.from(userThreadIds));

    if (partnerThreadsErr) {
      throw new Error(`Failed to get partner threads: ${partnerThreadsErr.message}`);
    }

    const commonIds = new Set<ThreadId>();
    for (const row of partnerParticipantRows || []) {
      const tid = coerceThreadId(row.thread_id);
      if (tid && userThreadIds.has(tid)) {
        commonIds.add(tid);
      }
    }

    if (commonIds.size === 0) {
      return null;
    }

    const { data: existingThreads, error: threadsErr } = await supabase
      .from('dms_threads')
      .select(selectColumns)
      .in('id', Array.from(commonIds))
      .eq('is_group', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (threadsErr) {
      throw new Error(`Failed to get existing thread: ${threadsErr.message}`);
    }

    if (existingThreads && existingThreads.length > 0) {
      const threadRow = existingThreads[0];
      const threadId = coerceThreadId(threadRow.id);
      if (!threadId) {
        throw new Error(`Invalid thread ID format: ${threadRow.id}`);
      }
      return {
        ...threadRow,
        id: threadId,
      } as Thread;
    }

    return null;
  }

  async function ensureParticipants(threadId: ThreadId) {
    const rows = [
      { thread_id: threadId, user_id: currentUserId, role: 'owner' },
      { thread_id: threadId, user_id: partnerId, role: 'member' },
    ];
    const { error: participantsError } = await supabase
      .from('dms_thread_participants')
      .upsert(rows, { onConflict: 'thread_id,user_id', ignoreDuplicates: true });

    if (participantsError) {
      throw new Error(`Failed to add participants: ${participantsError.message}`);
    }
  }

  async function createThread(): Promise<Thread> {
    const { data: newThread, error: insertError } = await supabase
      .from('dms_threads')
      .insert({
        created_by: currentUserId,
        is_group: false,
      })
      .select(selectColumns)
      .single();

    if (newThread && !insertError) {
      const threadId = assertThreadId(newThread.id, 'Invalid thread ID returned from database');
      await ensureParticipants(threadId);
      return {
        ...newThread,
        id: threadId,
      } as Thread;
    }

    // If returning doesn't work (e.g., due to RLS), attempt to find the thread we just created
    if (insertError) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const { data: fetchedThread, error: fetchError } = await supabase
        .from('dms_threads')
        .select(selectColumns)
        .eq('created_by', currentUserId)
        .eq('is_group', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError || !fetchedThread) {
        throw new Error(`Failed to create thread: ${insertError.message} (fetch: ${fetchError?.message || 'No data'})`);
      }

      const threadId = assertThreadId(fetchedThread.id, 'Invalid thread ID returned from database');
      await ensureParticipants(threadId);
      return {
        ...fetchedThread,
        id: threadId,
      } as Thread;
    }

    throw new Error('Failed to create thread: database did not return a row');
  }

  const existing = await findExistingThread();
  if (existing) {
    return existing;
  }

  try {
    return await createThread();
  } catch (err) {
    // As a last resort, check again in case a concurrent request created the thread first
    const fallback = await findExistingThread();
    if (fallback) {
      return fallback;
    }
    throw err;
  }
}

/**
 * List messages in a thread, ordered by id desc (newest first).
 * Returns up to 50 messages.
 */
export type ListMessagesOptions = {
  limit?: number;
};

export async function listMessages(
  threadId: ThreadId,
  options: ListMessagesOptions = {}
): Promise<Message[]> {
  const normalizedThreadId = assertThreadId(threadId, 'Invalid thread_id');

  const supabase = createClientComponentClient();

  // Ensure user is authenticated
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  // Ensure membership
  const { data: membership, error: membershipError } = await supabase
    .from('dms_thread_participants')
    .select('thread_id')
    .eq('thread_id', normalizedThreadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }
  if (!membership) {
    throw new Error('Forbidden');
  }

  const { limit = 50 } = options;

  const { data: messages, error: messagesError } = await supabase
    .from('dms_messages')
    .select('*')
    .eq('thread_id', normalizedThreadId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.min(50, Math.max(1, limit)));

  if (messagesError) {
    throw new Error(messagesError.message);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info(
      '[dms.listMessages] raw',
      (messages ?? []).slice(-5).map((msg: any) => ({
        id: msg?.id ?? null,
        typeofId: typeof msg?.id,
        created_at: msg?.created_at ?? null,
        body: msg?.body ?? null,
      }))
    );
  }

  const messagesWithNormalizedIds = (messages || []).map((msg: any) => {
    const rawId = msg?.id;
    let normalizedId: string | number;
    if (typeof rawId === 'number') {
      normalizedId = rawId;
    } else if (typeof rawId === 'string' && /^\d+$/.test(rawId)) {
      const numeric = Number(rawId);
      normalizedId = Number.isSafeInteger(numeric) ? numeric : rawId;
    } else if (rawId == null) {
      normalizedId = '';
    } else {
      normalizedId = String(rawId);
    }

    return {
      ...msg,
      id: normalizedId,
      thread_id: assertThreadId(msg.thread_id, 'Invalid thread_id in message'),
      sequence_number:
        msg.sequence_number === null || msg.sequence_number === undefined
          ? null
          : typeof msg.sequence_number === 'string'
            ? parseInt(msg.sequence_number, 10)
            : Number(msg.sequence_number),
      client_msg_id: msg.client_msg_id ?? null,
      attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
      reply_to_message_id: msg.reply_to_message_id 
        ? (typeof msg.reply_to_message_id === 'string' 
            ? parseInt(msg.reply_to_message_id, 10) 
            : Number(msg.reply_to_message_id))
        : null,
    };
  });

  return messagesWithNormalizedIds as Message[];
}

/**
 * Send a message in a thread.
 * Returns the created message.
 * Uses API endpoint to bypass RLS policies.
 */
export async function sendMessage(
  threadId: ThreadId,
  body: string | null,
  attachments: unknown[] = [],
  clientMsgId?: string | null,
  replyToMessageId?: number | string | null
): Promise<Message> {
  const normalizedThreadId = assertThreadId(threadId, 'Invalid thread_id');

  const supabase = createClientComponentClient();

  // Ensure user is authenticated
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  // Get session token for API call
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  // Use API endpoint which handles RLS better and supports attachments without body
  const response = await fetch('/api/dms/messages.send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      thread_id: normalizedThreadId,
      body: body || null, // API endpoint will handle empty body with attachments (uses zero-width space)
      attachments: attachments.length > 0 ? attachments : [],
      client_msg_id: clientMsgId ?? null,
      reply_to_message_id: replyToMessageId ?? null,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to send message: ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.ok || !result.message) {
    throw new Error(result.error || 'Failed to send message');
  }

  // Ensure message IDs are numbers
    const message = result.message as any;
    const rawId = message?.id;
    let normalizedId: string | number;
    if (typeof rawId === 'number') {
      normalizedId = rawId;
    } else if (typeof rawId === 'string' && /^\d+$/.test(rawId)) {
      const numeric = Number(rawId);
      normalizedId = Number.isSafeInteger(numeric) ? numeric : rawId;
    } else if (rawId == null) {
      normalizedId = '';
    } else {
      normalizedId = String(rawId);
    }

    return {
      ...message,
      id: normalizedId,
      thread_id: assertThreadId(message.thread_id, 'Invalid thread_id in message'),
      sequence_number:
        message.sequence_number === null || message.sequence_number === undefined
          ? null
          : typeof message.sequence_number === 'string'
            ? parseInt(message.sequence_number, 10)
            : Number(message.sequence_number),
      client_msg_id: (message.client_msg_id ?? clientMsgId ?? null) as string | null,
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      reply_to_message_id: message.reply_to_message_id 
        ? (typeof message.reply_to_message_id === 'string' 
            ? parseInt(message.reply_to_message_id, 10) 
            : Number(message.reply_to_message_id))
        : null,
    } as Message;
}
