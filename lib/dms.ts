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

  // First, try to find existing thread
  // Get threads where current user is participant
  const { data: userThreadParticipants, error: userThreadsErr } = await supabase
    .from('dms_thread_participants')
    .select('thread_id')
    .eq('user_id', currentUserId);

  if (userThreadsErr) {
    throw new Error(`Failed to get user threads: ${userThreadsErr.message}`);
  }

  if (userThreadParticipants && userThreadParticipants.length > 0) {
    // Get threads where partner is also participant
    const userThreadIds = userThreadParticipants.map(p => p.thread_id);
    
    const { data: partnerThreadParticipants, error: partnerThreadsErr } = await supabase
      .from('dms_thread_participants')
      .select('thread_id')
      .eq('user_id', partnerId)
      .in('thread_id', userThreadIds);

    if (partnerThreadsErr) {
      throw new Error(`Failed to get partner threads: ${partnerThreadsErr.message}`);
    }

    if (partnerThreadParticipants && partnerThreadParticipants.length > 0) {
      // Find common threads
      const userThreadIdSet = new Set(userThreadIds);
      const commonThreadIds = partnerThreadParticipants
        .map(p => p.thread_id)
        .filter(id => userThreadIdSet.has(id));

      if (commonThreadIds.length > 0) {
        // Get the first matching 1:1 thread
        const { data: existingThreads, error: threadsErr } = await supabase
          .from('dms_threads')
          .select('id, created_by, is_group, title, created_at, updated_at, last_message_at')
          .in('id', commonThreadIds)
          .eq('is_group', false)
          .order('created_at', { ascending: false })
          .limit(1);

        if (threadsErr) {
          throw new Error(`Failed to get existing thread: ${threadsErr.message}`);
        }

        if (existingThreads && existingThreads.length > 0) {
          const thread = existingThreads[0];
          // Ensure id is a number (bigint may come as string)
          const threadId = typeof thread.id === 'string' ? parseInt(thread.id, 10) : Number(thread.id);
          
          if (isNaN(threadId) || threadId <= 0) {
            console.error('Invalid thread.id from database:', thread.id, typeof thread.id);
            throw new Error(`Invalid thread ID: ${thread.id}`);
          }

          return {
            ...thread,
            id: threadId
          } as Thread;
        }
      }
    }
  }

  // No existing thread found - create a new one
  // Use returning to get the created thread immediately (avoids race conditions)
  const { data: newThread, error: insertError } = await supabase
    .from('dms_threads')
    .insert({
      created_by: currentUserId,
      is_group: false,
    })
    .select('id, created_by, is_group, title, created_at, updated_at, last_message_at')
    .single();

  if (insertError || !newThread) {
    // If returning doesn't work (RLS issue), try fetching it back
    if (insertError) {
      // Wait a small amount to ensure insert completed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Fetch the thread we just created by querying for the most recent thread by this user
      const { data: fetchedThread, error: fetchError } = await supabase
        .from('dms_threads')
        .select('id, created_by, is_group, title, created_at, updated_at, last_message_at')
        .eq('created_by', currentUserId)
        .eq('is_group', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError || !fetchedThread) {
        throw new Error(`Failed to create thread: ${insertError.message} (fetch: ${fetchError?.message || 'No data'})`);
      }

      // Ensure id is a number
      const threadId = typeof fetchedThread.id === 'string' 
        ? (fetchedThread.id.includes('-') ? null : parseInt(fetchedThread.id, 10))
        : Number(fetchedThread.id);
      
      if (!threadId || isNaN(threadId) || threadId <= 0) {
        console.error('Invalid thread.id from database:', fetchedThread.id, typeof fetchedThread.id);
        throw new Error(`Invalid thread ID format: ${fetchedThread.id} (expected bigint, got ${typeof fetchedThread.id})`);
      }

      // Add participants
      const { error: participantsError } = await supabase
        .from('dms_thread_participants')
        .insert([
          { thread_id: threadId, user_id: currentUserId, role: 'owner' },
          { thread_id: threadId, user_id: partnerId, role: 'member' },
        ]);

      if (participantsError) {
        // Try to clean up the thread we just created
        try {
          await supabase.from('dms_threads').delete().eq('id', threadId);
        } catch {}
        throw new Error(`Failed to add participants: ${participantsError.message}`);
      }

      return {
        ...fetchedThread,
        id: threadId
      } as Thread;
    }
    
    throw new Error(`Failed to create thread: ${insertError?.message || 'No data returned'}`);
  }

  // Ensure id is a number (bigint from database may be string, but should NOT be UUID)
  const threadId = typeof newThread.id === 'string' 
    ? (newThread.id.includes('-') ? null : parseInt(newThread.id, 10))
    : Number(newThread.id);
  
  if (!threadId || isNaN(threadId) || threadId <= 0) {
    console.error('Invalid thread.id from database:', newThread.id, typeof newThread.id);
    throw new Error(`Invalid thread ID format: ${newThread.id} (expected bigint, got ${typeof newThread.id})`);
  }

  // Add participants
  const { error: participantsError } = await supabase
    .from('dms_thread_participants')
    .insert([
      { thread_id: threadId, user_id: currentUserId, role: 'owner' },
      { thread_id: threadId, user_id: partnerId, role: 'member' },
    ]);

  if (participantsError) {
    // Try to clean up the thread we just created
    try {
      await supabase.from('dms_threads').delete().eq('id', threadId);
    } catch {}
    throw new Error(`Failed to add participants: ${participantsError.message}`);
  }

  return {
    ...newThread,
    id: threadId
  } as Thread;
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
  const threadIdNum = typeof threadId === 'string' ? parseInt(threadId, 10) : Number(threadId);
  
  if (!threadIdNum || isNaN(threadIdNum) || threadIdNum <= 0) {
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
    id: typeof msg.id === 'string' ? parseInt(msg.id, 10) : Number(msg.id),
    thread_id: typeof msg.thread_id === 'string' ? parseInt(msg.thread_id, 10) : Number(msg.thread_id)
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
  // Convert to number if string (bigint from database may be string)
  const threadIdNum = typeof threadId === 'string' ? parseInt(threadId, 10) : Number(threadId);
  
  if (!threadIdNum || isNaN(threadIdNum) || threadIdNum <= 0) {
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

  // Ensure message IDs are numbers
  const message = result.message as any;
  return {
    ...message,
    id: typeof message.id === 'string' ? parseInt(message.id, 10) : Number(message.id),
    thread_id: typeof message.thread_id === 'string' ? parseInt(message.thread_id, 10) : Number(message.thread_id)
  } as Message;
}
