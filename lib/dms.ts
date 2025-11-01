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

  // Try RPC first
  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('ensure_1on1_thread', {
      a: currentUserId,
      b: partnerId,
    })
    .maybeSingle();

  if (!rpcError && rpcResult) {
    return rpcResult as Thread;
  }

  // Fallback: find existing 1:1 thread
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
    throw new Error(userThreads.error.message);
  }
  if (partnerThreads.error) {
    throw new Error(partnerThreads.error.message);
  }

  const userThreadIds = new Set(
    (userThreads.data || []).map((r) => Number(r.thread_id))
  );
  const partnerThreadIds = new Set(
    (partnerThreads.data || []).map((r) => Number(r.thread_id))
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
      throw new Error(threadError.message);
    }
    if (existingThread) {
      return existingThread as Thread;
    }
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

  if (createError || !newThread) {
    throw new Error(createError?.message || 'Failed to create thread');
  }

  // Add participants
  const { error: participantsError } = await supabase
    .from('dms_thread_participants')
    .insert([
      { thread_id: newThread.id, user_id: currentUserId, role: 'owner' },
      { thread_id: newThread.id, user_id: partnerId, role: 'member' },
    ]);

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  return newThread as Thread;
}

/**
 * List messages in a thread, ordered by id desc (newest first).
 * Returns up to 50 messages.
 */
export async function listMessages(
  threadId: number,
  limit: number = 50
): Promise<Message[]> {
  if (!threadId || Number.isNaN(threadId)) {
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
    .eq('thread_id', threadId)
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
    .eq('thread_id', threadId)
    .order('id', { ascending: false })
    .limit(Math.min(50, Math.max(1, limit)));

  if (messagesError) {
    throw new Error(messagesError.message);
  }

  return (messages || []) as Message[];
}

/**
 * Send a message in a thread.
 * Returns the created message.
 */
export async function sendMessage(
  threadId: number,
  body: string | null,
  attachments: unknown[] = []
): Promise<Message> {
  if (!threadId || Number.isNaN(threadId)) {
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
    .eq('thread_id', threadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }
  if (!membership) {
    throw new Error('Forbidden');
  }

  // Create message
  // If body is null but we have attachments, use empty string to avoid RLS issues
  const messageBody = body || (attachments.length > 0 ? '' : null);
  
  const { data: message, error: messageError } = await supabase
    .from('dms_messages')
    .insert({
      thread_id: threadId,
      sender_id: user.id,
      kind: 'text',
      body: messageBody,
      attachments,
    })
    .select('*')
    .single();

  if (messageError || !message) {
    throw new Error(messageError?.message || 'Failed to send message');
  }

  // Update thread last message refs (best-effort)
  try {
    await supabase
      .from('dms_threads')
      .update({
        last_message_id: message.id,
        last_message_at: message.created_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId);
  } catch {
    // Ignore update errors
  }

  return message as Message;
}
