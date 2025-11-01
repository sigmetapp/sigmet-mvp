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

  // Use PostgreSQL function to find or create thread (more reliable)
  // This function handles the complexity of finding existing threads correctly
  try {
    const { data: thread, error: rpcError } = await supabase
      .rpc('ensure_1on1_thread', {
        a: currentUserId,
        b: partnerId
      })
      .single();

    if (!rpcError && thread) {
      // Handle the thread response - convert id to number if needed
      let threadId: number | null = null;
      
      // Check if id is a valid number
      if (typeof thread.id === 'number') {
        threadId = thread.id;
      } else if (typeof thread.id === 'string') {
        // If it's a UUID, check if it equals created_by (Supabase bug)
        if (thread.id.includes('-')) {
          // This is a UUID - likely a Supabase bug where created_by is returned as id
          if (thread.id === thread.created_by) {
            console.error('CRITICAL: Supabase returned created_by as id. Querying through participants instead.');
            // Query thread through participants table to ensure we get the right thread with both participants
            const { data: threadParticipants, error: participantsErr } = await supabase
              .from('dms_thread_participants')
              .select('thread_id, dms_threads(id, created_by, is_group, title, created_at, last_message_at)')
              .eq('user_id', currentUserId);
            
            if (!participantsErr && threadParticipants && threadParticipants.length > 0) {
              // Find thread that has both current user and partner as participants
              for (const tp of threadParticipants) {
                const tid = tp.thread_id;
                if (typeof tid === 'number' || (typeof tid === 'string' && !tid.includes('-'))) {
                  const numTid = typeof tid === 'string' ? parseInt(tid, 10) : Number(tid);
                  if (numTid && numTid > 0) {
                    // Check if partner is also in this thread
                    const { data: partnerCheck } = await supabase
                      .from('dms_thread_participants')
                      .select('thread_id')
                      .eq('thread_id', numTid)
                      .eq('user_id', partnerId)
                      .maybeSingle();
                    
                    if (partnerCheck) {
                      // Found a thread with both participants - get full thread data
                      const { data: actualThread } = await supabase
                        .from('dms_threads')
                        .select('id, created_by, is_group, title, created_at, last_message_at')
                        .eq('id', numTid)
                        .eq('is_group', false)
                        .maybeSingle();
                      
                      if (actualThread) {
                        const actualThreadId = typeof actualThread.id === 'number' 
                          ? actualThread.id 
                          : (typeof actualThread.id === 'string' && !actualThread.id.includes('-'))
                            ? parseInt(actualThread.id, 10)
                            : null;
                        
                        if (actualThreadId && actualThreadId > 0) {
                          return {
                            ...actualThread,
                            id: actualThreadId
                          } as Thread;
                        }
                      }
                    }
                  }
                }
              }
            }
          } else {
            // UUID that doesn't match created_by - try to parse as number (shouldn't happen)
            threadId = parseInt(thread.id, 10);
          }
        } else {
          // String number, parse it
          threadId = parseInt(thread.id, 10);
        }
      }
      
      // If we got a valid thread ID, return the thread
      if (threadId && threadId > 0 && !isNaN(threadId)) {
        return {
          ...thread,
          id: threadId
        } as Thread;
      }
    }
    
    // If RPC failed or returned invalid data, fall back to manual query
    if (rpcError) {
      console.warn('RPC ensure_1on1_thread failed, falling back to manual query:', rpcError);
    }
  } catch (rpcErr) {
    console.warn('RPC ensure_1on1_thread exception, falling back to manual query:', rpcErr);
  }

  // Fallback: Manual query for existing thread
  // First, try to find existing thread by querying participants
  const { data: userThreadParticipants, error: userThreadsErr } = await supabase
    .from('dms_thread_participants')
    .select('thread_id')
    .eq('user_id', currentUserId);

  if (userThreadsErr) {
    throw new Error(`Failed to get user threads: ${userThreadsErr.message}`);
  }

  if (userThreadParticipants && userThreadParticipants.length > 0) {
    // Get all thread IDs (both numeric and UUID)
    const userThreadIds = userThreadParticipants
      .map(p => p.thread_id)
      .filter((tid): tid is number | string => tid != null);
    
    if (userThreadIds.length > 0) {
      const { data: partnerThreadParticipants, error: partnerThreadsErr } = await supabase
        .from('dms_thread_participants')
        .select('thread_id')
        .eq('user_id', partnerId)
        .in('thread_id', userThreadIds);

      if (partnerThreadsErr) {
        throw new Error(`Failed to get partner threads: ${partnerThreadsErr.message}`);
      }

      if (partnerThreadParticipants && partnerThreadParticipants.length > 0) {
        // Find common thread IDs
        const userThreadIdSet = new Set(userThreadIds.map(id => String(id)));
        const commonThreadIds = partnerThreadParticipants
          .map(p => String(p.thread_id))
          .filter(id => userThreadIdSet.has(id));

        if (commonThreadIds.length > 0) {
          // Query threads - handle both numeric and UUID thread IDs
          // First try with numeric IDs only
          const numericIds = commonThreadIds
            .map(id => {
              if (typeof id === 'string' && id.includes('-')) return null;
              const num = typeof id === 'string' ? parseInt(id, 10) : Number(id);
              return isNaN(num) || num <= 0 ? null : num;
            })
            .filter((id): id is number => id !== null);

          if (numericIds.length > 0) {
            const { data: existingThreads, error: threadsErr } = await supabase
              .from('dms_threads')
              .select('id, created_by, is_group, title, created_at, last_message_at')
              .in('id', numericIds)
              .eq('is_group', false)
              .order('created_at', { ascending: false })
              .limit(1);

            if (!threadsErr && existingThreads && existingThreads.length > 0) {
              const thread = existingThreads[0];
              
              // Ensure id is a number
              let threadId: number | null = null;
              if (typeof thread.id === 'number') {
                threadId = thread.id;
              } else if (typeof thread.id === 'string') {
                if (thread.id.includes('-')) {
                  // UUID - check if it matches created_by (Supabase bug)
                  if (thread.id === thread.created_by) {
                    console.error('CRITICAL: Supabase bug - id equals created_by');
                    // Skip this thread
                  } else {
                    // Try to parse as number anyway (shouldn't work for UUID)
                    threadId = parseInt(thread.id, 10);
                  }
                } else {
                  threadId = parseInt(thread.id, 10);
                }
              }
              
              if (threadId && threadId > 0 && !isNaN(threadId)) {
                return {
                  ...thread,
                  id: threadId
                } as Thread;
              }
            }
          }
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
    .select('id, created_by, is_group, title, created_at, last_message_at')
    .single();

  if (insertError || !newThread) {
    // If returning doesn't work (RLS issue), try fetching it back
    if (insertError) {
      // Wait a small amount to ensure insert completed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Fetch the thread we just created by querying for the most recent thread by this user
      const { data: fetchedThread, error: fetchError } = await supabase
        .from('dms_threads')
        .select('id, created_by, is_group, title, created_at, last_message_at')
        .eq('created_by', currentUserId)
        .eq('is_group', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError || !fetchedThread) {
        throw new Error(`Failed to create thread: ${insertError.message} (fetch: ${fetchError?.message || 'No data'})`);
      }

      // Handle thread ID - check for UUID bug where id equals created_by
      let threadId: number | null = null;
      
      if (typeof fetchedThread.id === 'number') {
        threadId = fetchedThread.id;
      } else if (typeof fetchedThread.id === 'string') {
        if (fetchedThread.id.includes('-')) {
          // UUID detected
          if (fetchedThread.id === fetchedThread.created_by) {
            // Supabase bug - id equals created_by
            // Since we just created this thread, query by created_by and created_at to find it
            // Wait a small amount to ensure the insert completed
            await new Promise(resolve => setTimeout(resolve, 50));
            
            const { data: actualThreads, error: queryErr } = await supabase
              .from('dms_threads')
              .select('id, created_by, is_group, title, created_at, last_message_at')
              .eq('created_by', currentUserId)
              .eq('is_group', false)
              .gte('created_at', new Date(Date.now() - 5000).toISOString()) // Created in last 5 seconds
              .order('created_at', { ascending: false })
              .limit(1);
            
            if (!queryErr && actualThreads && actualThreads.length > 0) {
              const actualThread = actualThreads[0];
              // Check if actual id is numeric
              if (typeof actualThread.id === 'number') {
                threadId = actualThread.id;
              } else if (typeof actualThread.id === 'string' && !actualThread.id.includes('-')) {
                threadId = parseInt(actualThread.id, 10);
              } else if (typeof actualThread.id === 'string' && actualThread.id.includes('-')) {
                // Still a UUID - this shouldn't happen, but if it does, try querying all recent threads
                const { data: allRecentThreads } = await supabase
                  .from('dms_threads')
                  .select('id, created_by, is_group, title, created_at, last_message_at')
                  .eq('created_by', currentUserId)
                  .eq('is_group', false)
                  .order('created_at', { ascending: false })
                  .limit(10);
                
                if (allRecentThreads && allRecentThreads.length > 0) {
                  // Find first thread with numeric ID
                  for (const t of allRecentThreads) {
                    if (typeof t.id === 'number') {
                      threadId = t.id;
                      break;
                    } else if (typeof t.id === 'string' && !t.id.includes('-')) {
                      const numId = parseInt(t.id, 10);
                      if (numId && numId > 0) {
                        threadId = numId;
                        break;
                      }
                    }
                  }
                }
              }
            }
          } else {
            // UUID that doesn't match created_by - can't convert to number
            console.error('Invalid thread.id from database (UUID):', fetchedThread.id);
            throw new Error(`Invalid thread ID format: ${fetchedThread.id} (expected bigint, got UUID string)`);
          }
        } else {
          // String number, parse it
          threadId = parseInt(fetchedThread.id, 10);
        }
      }
      
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

  // Handle thread ID - check for UUID bug where id equals created_by
  let threadId: number | null = null;
  
  if (typeof newThread.id === 'number') {
    threadId = newThread.id;
  } else if (typeof newThread.id === 'string') {
    if (newThread.id.includes('-')) {
      // UUID detected
      if (newThread.id === newThread.created_by) {
        // Supabase bug - id equals created_by
        // Since we just created this thread, query by created_by and created_at to find it
        // Wait a small amount to ensure the insert completed
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const { data: actualThreads, error: queryErr } = await supabase
          .from('dms_threads')
          .select('id, created_by, is_group, title, created_at, last_message_at')
          .eq('created_by', currentUserId)
          .eq('is_group', false)
          .gte('created_at', new Date(Date.now() - 5000).toISOString()) // Created in last 5 seconds
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (!queryErr && actualThreads && actualThreads.length > 0) {
          const actualThread = actualThreads[0];
          // Check if actual id is numeric
          if (typeof actualThread.id === 'number') {
            threadId = actualThread.id;
          } else if (typeof actualThread.id === 'string' && !actualThread.id.includes('-')) {
            threadId = parseInt(actualThread.id, 10);
          } else if (typeof actualThread.id === 'string' && actualThread.id.includes('-')) {
            // Still a UUID - this shouldn't happen, but if it does, try querying all recent threads
            const { data: allRecentThreads } = await supabase
              .from('dms_threads')
              .select('id, created_by, is_group, title, created_at, last_message_at')
              .eq('created_by', currentUserId)
              .eq('is_group', false)
              .order('created_at', { ascending: false })
              .limit(10);
            
            if (allRecentThreads && allRecentThreads.length > 0) {
              // Find first thread with numeric ID
              for (const t of allRecentThreads) {
                if (typeof t.id === 'number') {
                  threadId = t.id;
                  break;
                } else if (typeof t.id === 'string' && !t.id.includes('-')) {
                  const numId = parseInt(t.id, 10);
                  if (numId && numId > 0) {
                    threadId = numId;
                    break;
                  }
                }
              }
            }
          }
        }
      } else {
        // UUID that doesn't match created_by - can't convert to number
        console.error('Invalid thread.id from database (UUID):', newThread.id);
        throw new Error(`Invalid thread ID format: ${newThread.id} (expected bigint, got UUID string)`);
      }
    } else {
      // String number, parse it
      threadId = parseInt(newThread.id, 10);
    }
  }
  
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
