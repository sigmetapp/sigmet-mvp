'use client';

import { createClient } from '@supabase/supabase-js';

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
  id: number;
  created_by: string;
  is_group: boolean;
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

export type Message = {
  id: number;
  thread_id: number;
  sender_id: string;
  kind: 'text' | 'system';
  body: string | null;
  attachments: unknown[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

/**
 * Get or create a 1-on-1 thread between current user and partner.
 * Uses RPC ensure_1on1_thread if available, otherwise falls back to manual lookup/creation.
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

  // Try RPC first (if exists)
  try {
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('ensure_1on1_thread', {
        a: currentUserId,
        b: partnerId,
      })
      .maybeSingle();

    // If RPC exists and returns result, use it
    if (!rpcError && rpcResult && rpcResult.id) {
      // Ensure id is a number (bigint from database may be string)
      const threadId = Number(rpcResult.id);
      if (!isNaN(threadId) && threadId > 0) {
        return {
          ...rpcResult,
          id: threadId
        } as Thread;
      }
    }
    // If RPC doesn't exist or returns error, continue with fallback
    // (this is fine - RPC is optional)
  } catch (rpcErr) {
    // RPC might not exist - continue with fallback
    console.log('RPC ensure_1on1_thread not available or error, using fallback:', rpcErr);
  }

  // Fallback: find existing 1:1 thread
  try {
    const [userThreads, partnerThreads] = await Promise.all([
      supabase
        .from('dms_thread_participants')
        .select('thread_id')
        .eq('user_id', currentUserId),
      supabase
        .from('dms_thread_participants')
        .select('thread_id')
        .eq('user_id', partnerId),
    ]);

    if (userThreads.error) {
      throw new Error(`Failed to get user threads: ${userThreads.error.message}`);
    }
    if (partnerThreads.error) {
      throw new Error(`Failed to get partner threads: ${partnerThreads.error.message}`);
    }

    const userThreadIds = new Set(
      (userThreads.data || []).map((r) => {
        const tid = Number(r.thread_id);
        return isNaN(tid) ? null : tid;
      }).filter((id): id is number => id !== null)
    );
    const partnerThreadIds = new Set(
      (partnerThreads.data || []).map((r) => {
        const tid = Number(r.thread_id);
        return isNaN(tid) ? null : tid;
      }).filter((id): id is number => id !== null)
    );

    const commonThreadIds: number[] = [];
    for (const id of userThreadIds) {
      if (partnerThreadIds.has(id)) {
        commonThreadIds.push(id);
      }
    }

    if (commonThreadIds.length > 0) {
      const { data: existingThread, error: threadError } = await supabase
        .from('dms_threads')
        .select('*')
        .in('id', commonThreadIds)
        .eq('is_group', false)
        .order('id', { ascending: false })
        .maybeSingle();

      if (threadError) {
        throw new Error(`Failed to get existing thread: ${threadError.message}`);
      }
      if (existingThread && existingThread.id) {
        const threadId = Number(existingThread.id);
        if (!isNaN(threadId) && threadId > 0) {
          // Ensure id is a number (bigint from database may be string)
          return {
            ...existingThread,
            id: threadId
          } as Thread;
        }
      }
    }
  } catch (fallbackErr) {
    console.error('Error in fallback thread search:', fallbackErr);
    // Continue to create new thread
  }

  // Create new thread
  const { data: newThread, error: createError } = await supabase
    .from('dms_threads')
    .insert({
      created_by: currentUserId,
      is_group: false,
    })
    .select('*')
    .single();

  if (createError) {
    console.error('Error creating thread:', createError);
    throw new Error(`Failed to create thread: ${createError.message}`);
  }
  
  if (!newThread || !newThread.id) {
    console.error('New thread is missing or has no id:', newThread);
    throw new Error('Failed to create thread: thread created but missing data');
  }

  // Ensure id is a number (bigint from database may be string)
  const threadId = Number(newThread.id);
  if (isNaN(threadId) || threadId <= 0) {
    console.error('Invalid thread id after creation:', newThread.id, typeof newThread.id);
    throw new Error(`Failed to create thread: invalid thread ID ${newThread.id}`);
  }

  const threadWithNumericId = {
    ...newThread,
    id: threadId
  };

  // Add participants
  const { error: participantsError } = await supabase
    .from('dms_thread_participants')
    .insert([
      { thread_id: threadId, user_id: currentUserId, role: 'owner' },
      { thread_id: threadId, user_id: partnerId, role: 'member' },
    ]);

  if (participantsError) {
    console.error('Error adding participants:', participantsError);
    // Try to clean up the thread we just created
    try {
      await supabase.from('dms_threads').delete().eq('id', threadId);
    } catch {}
    throw new Error(`Failed to add participants: ${participantsError.message}`);
  }

  return threadWithNumericId as Thread;
}

/**
 * List messages in a thread, ordered by id desc (newest first).
 * Returns up to 50 messages.
 */
export async function listMessages(
  threadId: number | string,
  limit: number = 50
): Promise<Message[]> {
  // Convert to number if string (bigint from database may be string)
  const threadIdNum = typeof threadId === 'string' ? Number(threadId) : threadId;
  
  if (!threadIdNum || Number.isNaN(threadIdNum) || threadIdNum <= 0) {
    console.error('Invalid thread_id in listMessages:', threadId, typeof threadId, '->', threadIdNum);
    throw new Error('Invalid thread_id');
  }

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
    .eq('thread_id', threadIdNum)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }
  if (!membership) {
    throw new Error('Forbidden');
  }

  const { data: messages, error: messagesError } = await supabase
    .from('dms_messages')
    .select('*')
    .eq('thread_id', threadIdNum)
    .order('id', { ascending: false })
    .limit(Math.min(50, Math.max(1, limit)));

  if (messagesError) {
    throw new Error(messagesError.message);
  }

  // Ensure message IDs are numbers
  const messagesWithNumericIds = (messages || []).map((msg: any) => ({
    ...msg,
    id: Number(msg.id),
    thread_id: Number(msg.thread_id)
  }));

  return messagesWithNumericIds as Message[];
}

/**
 * Send a message in a thread.
 * Returns the created message.
 * Uses API endpoint to bypass RLS policies.
 */
export async function sendMessage(
  threadId: number | string,
  body: string | null,
  attachments: unknown[] = []
): Promise<Message> {
  // Convert to number if string (bigint from database)
  const threadIdNum = typeof threadId === 'string' ? Number(threadId) : threadId;
  
  if (!threadIdNum || Number.isNaN(threadIdNum) || threadIdNum <= 0) {
    console.error('Invalid thread_id:', threadId, typeof threadId);
    throw new Error('Invalid thread_id');
  }

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
      thread_id: threadIdNum, // Ensure it's a number
      body: body || null, // API endpoint will handle empty body with attachments (uses zero-width space)
      attachments: attachments.length > 0 ? attachments : [],
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

  return result.message as Message;
}
