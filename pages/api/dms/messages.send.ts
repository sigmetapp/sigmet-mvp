import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getAuthedClient } from '@/lib/dm/supabaseServer';
import { assertThreadId } from '@/lib/dm/threadId';
import { inferMessageKind } from '@/lib/dm/messageKind';
import { broadcastDmMessage } from '@/lib/dm/realtimeServer';
import { publishMessageEvent } from '@/lib/dm/brokerClient';

// Simple in-memory rate limiter for development only.
// For production, use a centralized store like Redis (INCR + EXPIRE)
// or a Postgres table with composite key (user_id, window_start) and a unique constraint,
// to reliably enforce limits across instances and restarts.
const devRateLimits = new Map<string, { count: number; resetAt: number }>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client: authedClient, user } = await getAuthedClient(req);
    // Helper to support both real supabase-js and test doubles that expose `.exec()`
    const execOrFetch = async (q: any): Promise<{ data: any; error: any }> => {
      if (typeof q?.exec === 'function') {
        return await q.exec();
      }
      return await q;
    };

    // Development-only rate limit: 20 messages per 30 seconds per user
    if (process.env.NODE_ENV !== 'production') {
      const windowMs = 30_000;
      const limit = 20;
      const key = `user:${user.id}`;
      const now = Date.now();
      const entry = devRateLimits.get(key) || { count: 0, resetAt: now + windowMs };
      if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + windowMs;
      }
      entry.count += 1;
      devRateLimits.set(key, entry);
      if (entry.count > limit) {
        const retryAfter = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
        return res.status(429).json({ ok: false, error: 'rate_limited', retry_after: retryAfter });
      }
    }

    const threadId = (() => {
      try {
        return assertThreadId(req.body?.thread_id, 'Invalid thread_id');
      } catch {
        return null;
      }
    })();
  let body = (req.body?.body as string | undefined) ?? null;
  const attachments = (req.body?.attachments as unknown) ?? [];
  const attachmentsArray = Array.isArray(attachments) ? attachments : [];
  const client_msg_id = (req.body?.client_msg_id as string | undefined) ?? null;
  const messageKind = inferMessageKind(attachmentsArray);

    if (!threadId) {
      return res.status(400).json({ ok: false, error: 'Invalid thread_id' });
    }

    // If body is null but we have attachments, use a placeholder to avoid RLS issues
    // RLS policies might require non-empty body, so we use a non-empty string
    // This will be hidden in UI if it's just whitespace or placeholder
    if (!body && attachmentsArray.length > 0) {
      // Use a placeholder that will be filtered in UI
      body = '\u200B'; // Zero-width space character - invisible but non-empty
    }

    // Ensure membership and load participants in parallel
    const [membershipResult, participantsResult] = await Promise.all([
      authedClient
        .from('dms_thread_participants')
        .select('thread_id')
        .eq('thread_id', threadId)
        .eq('user_id', user.id)
        .maybeSingle(),
      authedClient
        .from('dms_thread_participants')
        .select('user_id')
        .eq('thread_id', threadId)
    ]);

    const { data: membership, error: membershipErr } = membershipResult;
    if (membershipErr) return res.status(400).json({ ok: false, error: membershipErr.message });
    if (!membership) return res.status(403).json({ ok: false, error: 'Forbidden' });

    // Extract other participant ids
    const otherIds = ((participantsResult.data || []) as any[])
      .map((p: any) => p.user_id)
      .filter((uid: string) => uid !== user.id);

    // Validate blocks in parallel (if participants exist)
    if (otherIds.length > 0) {
      const [blocks2Result, blocks1Result] = await Promise.all([
        execOrFetch(
          authedClient
            .from('dms_blocks')
            .select('blocker, blocked')
            .eq('blocker', user.id)
            .in('blocked', otherIds)
            .limit(1)
        ),
        execOrFetch(
          authedClient
            .from('dms_blocks')
            .select('blocker, blocked')
            .in('blocker', otherIds)
            .eq('blocked', user.id)
            .limit(1)
        )
      ]);

      const { data: blocks2, error: b2err } = blocks2Result;
      if (b2err) return res.status(400).json({ ok: false, error: b2err.message });
      if (blocks2 && blocks2.length > 0) {
        return res.status(403).json({ ok: false, error: 'sender_blocked_recipient' });
      }

      const { data: blocks1, error: b1err } = blocks1Result;
      if (b1err) return res.status(400).json({ ok: false, error: b1err.message });
      if (blocks1 && blocks1.length > 0) {
        return res.status(403).json({ ok: false, error: 'blocked_by_recipient' });
      }
    }
    // Use PostgreSQL function to insert message (bypasses RLS via SECURITY DEFINER)
    // This is more reliable than service role key. When the RPC helper is unavailable
    // (e.g. in unit tests with lightweight mocks), fall back to the direct insert path.
    let message: any = null;
    let msgErr: any = null;

    if (typeof (authedClient as any).rpc === 'function') {
      try {
        // Try with client_msg_id first (6 parameters) if provided
        if (client_msg_id) {
          const rpcResult = await (authedClient as any).rpc('insert_dms_message', {
            p_thread_id: threadId,
            p_sender_id: user.id,
            p_body: body || (attachmentsArray.length > 0 ? '\u200B' : null),
            p_kind: messageKind,
            p_attachments: attachmentsArray,
            p_client_msg_id: client_msg_id,
          });
          
          if (rpcResult?.data) {
            message = rpcResult.data;
          } else if (rpcResult?.error) {
            msgErr = rpcResult.error;
          }
        }
        
        // If no message yet (either no client_msg_id or previous call failed), try without it (5 parameters)
        if (!message && !msgErr) {
          const rpcResult = await (authedClient as any).rpc('insert_dms_message', {
            p_thread_id: threadId,
            p_sender_id: user.id,
            p_body: body || (attachmentsArray.length > 0 ? '\u200B' : null),
            p_kind: messageKind,
            p_attachments: attachmentsArray,
          });
          
          if (rpcResult?.data) {
            message = rpcResult.data;
            // If we have client_msg_id but used 5-param version, update it manually in fallback
            if (client_msg_id && message) {
              // Will be handled in fallback insert
            }
          } else if (rpcResult?.error) {
            msgErr = rpcResult.error;
          }
        }
      } catch (rpcError: any) {
        console.error('RPC call error:', rpcError);
        msgErr = rpcError;
      }
    } else {
      msgErr = { message: 'rpc_not_available' };
    }

    // If RPC doesn't work, fallback to direct insert with service role
    let finalMessage = message;
    if (msgErr || !message) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const fallbackClient = serviceRoleKey 
        ? createClient(url, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : authedClient;
      
      const insertData: any = {
        thread_id: threadId,
        sender_id: user.id,
        kind: messageKind,
        body: body || (attachmentsArray.length > 0 ? '\u200B' : null),
        attachments: attachmentsArray,
      };
      
      // Add client_msg_id if provided (for idempotency)
      if (client_msg_id) {
        insertData.client_msg_id = client_msg_id;
      }
      
      // Try insert first
      const { data: fallbackMsg, error: fallbackErr } = await fallbackClient
        .from('dms_messages')
        .insert(insertData)
        .select('*')
        .single();
      
      // If we have client_msg_id and got a unique constraint error, try to fetch existing message
      if (client_msg_id && fallbackErr && (fallbackErr.code === '23505' || fallbackErr.message?.includes('duplicate'))) {
        // Unique constraint violation - message already exists, fetch it
        const { data: existingMsg, error: fetchErr } = await fallbackClient
          .from('dms_messages')
          .select('*')
          .eq('thread_id', threadId)
          .eq('client_msg_id', client_msg_id)
          .single();
        
        if (existingMsg && !fetchErr) {
          finalMessage = existingMsg;
        } else {
          console.error('Failed to fetch existing message:', fetchErr);
        }
      } else if (fallbackMsg) {
        finalMessage = fallbackMsg;
      } else if (fallbackErr) {
        console.error('Fallback insert error:', fallbackErr);
        console.error('Original RPC error:', msgErr);
        return res.status(400).json({ 
          ok: false, 
          error: msgErr?.message || fallbackErr?.message || 'Failed to send message',
          details: {
            rpcError: msgErr,
            fallbackError: fallbackErr,
          }
        });
      }
      
      if (!finalMessage) {
        console.error('Fallback insert error: no message returned');
        console.error('Original RPC error:', msgErr);
        return res.status(400).json({ 
          ok: false, 
          error: msgErr?.message || 'Failed to send message',
          details: {
            rpcError: msgErr,
          }
        });
      }
    }

    if (!finalMessage) {
      console.error('No message created. RPC error:', msgErr);
      return res.status(400).json({ 
        ok: false, 
        error: msgErr?.message || 'Failed to send message',
        details: { rpcError: msgErr }
      });
    }

    // Prepare service role client for parallel operations
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const serviceClient = serviceRoleKey 
      ? createClient(url, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : authedClient;

    // Run thread update, receipts creation, and broadcast in parallel (non-blocking)
    const parallelOps: Promise<any>[] = [];

    // Thread update (handled by function, but update anyway if function failed)
    parallelOps.push(
      serviceClient
        .from('dms_threads')
        .update({
          last_message_id: finalMessage.id,
          last_message_at: finalMessage.created_at,
        })
        .eq('id', threadId)
        .then(() => {})
        .catch(() => {}) // Ignore errors
    );

    // Create receipts for all recipients (except sender)
    if (otherIds.length > 0) {
      const receipts = otherIds.map((recipientId) => ({
        message_id: finalMessage.id,
        user_id: recipientId,
        status: 'sent',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      
      parallelOps.push(
        serviceClient
          .from('dms_message_receipts')
          .upsert(receipts, {
            onConflict: 'message_id,user_id',
            ignoreDuplicates: false,
          })
          .then(() => {})
          .catch((receiptErr) => {
            console.error('Error creating receipts:', receiptErr);
          })
      );
    }

    // Broadcast to realtime subscribers (non-blocking)
    parallelOps.push(
      (async () => {
        try {
          const serverMsgId = typeof finalMessage.id === 'string' ? parseInt(finalMessage.id, 10) : Number(finalMessage.id);
          const sequenceNumber = finalMessage.sequence_number ?? null;
          await publishMessageEvent(threadId, finalMessage, serverMsgId, sequenceNumber);
        } catch (broadcastErr) {
          console.error('DM broadcast error:', broadcastErr);
        }
      })()
    );

    // Don't wait for parallel operations - return immediately
    Promise.all(parallelOps).catch(() => {});

    // Push notifications (when recipient tab is not active):
    // For each user in `otherIds`, call Edge Function `push` with
    // { toUserId, title, body, url } to deliver a notification.
    // Example (pseudo):
    // await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/push`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
    //   body: JSON.stringify({ toUserId, title, body, url }),
    // });

    return res.status(200).json({ ok: true, message: finalMessage });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}
