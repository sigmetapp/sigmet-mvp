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

    console.log('RPC ensure_1on1_thread result:', { rpcResult, rpcError });

    // If RPC exists and returns result, use it
    if (!rpcError && rpcResult) {
      console.log('RPC result full object:', JSON.stringify(rpcResult, null, 2));
      console.log('RPC result.id:', rpcResult.id, 'type:', typeof rpcResult.id);
      console.log('RPC result.created_by:', rpcResult.created_by, 'type:', typeof rpcResult.created_by);
      
      // Check if id exists and is valid
      if (rpcResult.id) {
        // Check if id is UUID (would indicate wrong field or database issue)
        if (typeof rpcResult.id === 'string' && rpcResult.id.includes('-')) {
          console.error('RPC returned UUID as thread.id - this should be bigint!');
          console.error('RPC result:', JSON.stringify(rpcResult, null, 2));
          // Don't use this result - continue to fallback
        } else {
          // Ensure id is a number (bigint from database may be string)
          const threadId = Number(rpcResult.id);
          // UUID strings will be NaN when converted to number
          if (!isNaN(threadId) && threadId > 0) {
            return {
              ...rpcResult,
              id: threadId
            } as Thread;
          } else {
            console.error('RPC returned invalid thread.id:', rpcResult.id, typeof rpcResult.id, '->', threadId);
            // Continue to fallback - don't use invalid result
          }
        }
      } else {
        console.error('RPC result missing id field:', rpcResult);
      }
    } else if (rpcError) {
      console.log('RPC error (continuing to fallback):', rpcError);
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
        .select('id, created_by, is_group, title, created_at, updated_at, last_message_at')
        .in('id', commonThreadIds)
        .eq('is_group', false)
        .order('id', { ascending: false })
        .maybeSingle();

      if (threadError) {
        throw new Error(`Failed to get existing thread: ${threadError.message}`);
      }
      if (existingThread) {
        // Check if id exists and is not UUID
        if (existingThread.id) {
          // If id is UUID string (has dashes), it's wrong - thread.id should be bigint
          if (typeof existingThread.id === 'string' && existingThread.id.includes('-')) {
            console.error('Existing thread has UUID as id (should be bigint):', existingThread);
            // This is wrong - thread.id should be bigint, not UUID
            // Continue to create new thread
          } else {
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
      }
    }
  } catch (fallbackErr) {
    console.error('Error in fallback thread search:', fallbackErr);
    // Continue to create new thread
  }

  // Create new thread
  // Use explicit select to ensure we get the right fields
  const { data: newThread, error: createError } = await supabase
    .from('dms_threads')
    .insert({
      created_by: currentUserId,
      is_group: false,
    })
    .select('id')
    .single();

  if (createError) {
    console.error('Error creating thread:', createError);
    throw new Error(`Failed to create thread: ${createError.message}`);
  }
  
  if (!newThread) {
    console.error('newThread is null or undefined');
    throw new Error('Failed to create thread: thread created but no data returned');
  }
  
  console.log('New thread created, raw response (id only):', newThread);
  console.log('newThread.id:', newThread.id, 'type:', typeof newThread.id);
  
  // Get full thread data to verify
  const { data: fullThread, error: fetchError } = await supabase
    .from('dms_threads')
    .select('id, created_by, is_group, title, created_at, updated_at, last_message_at')
    .eq('id', newThread.id)
    .single();
  
  if (fetchError || !fullThread) {
    console.error('Error fetching created thread:', fetchError);
    // Continue with newThread.id if we have it
  } else {
    console.log('Full thread fetched:', fullThread);
    console.log('Full thread.id:', fullThread.id, 'type:', typeof fullThread.id);
    console.log('Full thread.created_by:', fullThread.created_by, 'type:', typeof fullThread.created_by);
    
    // Use fullThread if available
    if (fullThread.id) {
      newThread.id = fullThread.id;
    }
  }
  
  if (!newThread.id) {
    console.error('New thread missing id field');
    throw new Error('Failed to create thread: thread created but missing id field');
  }

  // Ensure id is a number (bigint from database may be string)
  // Check if it's a UUID string (would be invalid for bigint)
  if (typeof newThread.id === 'string' && newThread.id.includes('-')) {
    console.error('Thread ID is UUID string, expected bigint:', newThread.id);
    // This might indicate that Supabase returned created_by instead of id
    // Try to fetch the thread again by querying for threads created by this user
    const { data: recentThreads } = await supabase
      .from('dms_threads')
      .select('id, created_by')
      .eq('created_by', currentUserId)
      .eq('is_group', false)
      .order('created_at', { ascending: false })
      .limit(1);
    
    console.log('Recent threads by user:', recentThreads);
    
    if (recentThreads && recentThreads.length > 0) {
      const actualThread = recentThreads[0];
      if (actualThread.id && (typeof actualThread.id !== 'string' || !actualThread.id.includes('-'))) {
        console.log('Found actual thread with numeric id:', actualThread.id);
        newThread.id = actualThread.id;
      }
    }
    
    // Final check - if still UUID, fail
    if (typeof newThread.id === 'string' && newThread.id.includes('-')) {
      throw new Error(`Invalid thread ID format: expected number (bigint), got UUID string: ${newThread.id}. This indicates a database/API bug.`);
    }
  }
  
  const threadId = Number(newThread.id);
  if (isNaN(threadId) || threadId <= 0) {
    console.error('Invalid thread id after creation:', newThread.id, typeof newThread.id);
    throw new Error(`Failed to create thread: invalid thread ID ${newThread.id} (type: ${typeof newThread.id})`);
  }
  
  console.log('Successfully created thread with id:', threadId);

  // Get full thread data
  const { data: completeThread } = await supabase
    .from('dms_threads')
    .select('id, created_by, is_group, title, created_at, updated_at, last_message_at')
    .eq('id', threadId)
    .single();

  const threadWithNumericId = completeThread ? {
    ...completeThread,
    id: threadId
  } : {
    id: threadId,
    created_by: currentUserId,
    is_group: false,
    title: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_message_at: null
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
