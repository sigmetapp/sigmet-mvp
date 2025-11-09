import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';
import { assertThreadId } from '@/lib/dm/threadId';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);
    
    // Validate user.id is a valid UUID
    if (!user?.id || typeof user.id !== 'string') {
      return res.status(401).json({ ok: false, error: 'Invalid user ID' });
    }
    
    const execOrFetch = async (q: any): Promise<{ data: any; error: any }> => {
      if (typeof q?.exec === 'function') return await q.exec();
      return await q;
    };

    const threadId = (() => {
      try {
        return assertThreadId(req.body?.thread_id, 'Invalid thread_id');
      } catch {
        return null;
      }
    })();
    const upTo = String(req.body?.up_to_message_id || '');

    if (!threadId || !upTo) {
      return res.status(400).json({ ok: false, error: 'Invalid input' });
    }

    // Ensure membership and get current last_read where supported. If the
    // column does not exist in the database, fall back to a membership-only check.
    let participant: any | null = null;
    {
      const { data, error } = await client
        .from('dms_thread_participants')
        .select('thread_id, last_read_message_id')
        .eq('thread_id', threadId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error) {
        participant = data;
      } else if (String(error.message || '').toLowerCase().includes('last_read_message_id')) {
        const { data: data2, error: err2 } = await client
          .from('dms_thread_participants')
          .select('thread_id')
          .eq('thread_id', threadId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (err2) {
          return res.status(400).json({ ok: false, error: err2.message });
        }

        participant = data2 ? { ...data2, last_read_message_id: null } : null;
      } else {
        return res.status(400).json({ ok: false, error: error.message });
      }
    }

    if (!participant) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const { data: msgCheck, error: msgCheckError } = await client
      .from('dms_messages')
      .select('id, created_at, sender_id')
      .eq('thread_id', threadId)
      .eq('id', upTo)
      .maybeSingle();

    if (msgCheckError) {
      console.error('Error verifying message in thread:', {
        threadId,
        upTo,
        error: msgCheckError,
      });
      return res.status(400).json({ ok: false, error: msgCheckError.message || 'Failed to verify message' });
    }

    if (!msgCheck) {
      console.error('Message not found in thread:', { threadId, upTo });
      return res.status(400).json({ ok: false, error: 'up_to_message_id not in thread' });
    }

    const prev = participant.last_read_message_id ? String(participant.last_read_message_id) : null;
    const nextId = String(msgCheck.id ?? upTo);

    if (nextId !== prev) {
      try {
        await client
          .from('dms_thread_participants')
          .update({
            last_read_message_id: msgCheck.id ?? upTo,
            last_read_at: msgCheck.created_at || new Date().toISOString(),
          })
          .eq('thread_id', threadId)
          .eq('user_id', user.id);
      } catch (err: any) {
        console.error('Error updating last_read_message_id:', err);
        // Column may not exist; ignore update failure in that case
      }
    }

    // Mark receipts up to nextId as read
    // Get all message IDs up to and including the target message from partner
    const { data: ids, error: idsError } = await execOrFetch(
      client
        .from('dms_messages')
        .select('id, sender_id, created_at')
        .eq('thread_id', threadId)
        .lte('created_at', msgCheck.created_at)
        .neq('sender_id', user.id)
        .is('deleted_at', null)
        .limit(1000)
    );

    if (idsError) {
      console.error('Error fetching message IDs:', idsError);
      return res.status(400).json({ ok: false, error: idsError.message || 'Failed to fetch messages' });
    }

    let idList: string[] = Array.from(
      new Set(
        (ids || [])
          .map((x: any) => {
            if (x?.id === null || x?.id === undefined) {
              return null;
            }
            const value = String(x.id);
            return value.trim() ? value : null;
          })
          .filter((id): id is string => Boolean(id))
      )
    );

    if (idList.length === 0) {
      // Fallback: include the up-to id directly if it's from partner
      const { data: msgCheck2, error: msgCheck2Error } = await client
        .from('dms_messages')
        .select('sender_id')
        .eq('thread_id', threadId)
        .eq('id', upTo)
        .is('deleted_at', null)
        .maybeSingle();

      if (msgCheck2Error) {
        console.error('Error checking message sender:', msgCheck2Error);
      } else if (msgCheck2 && msgCheck2.sender_id !== user.id) {
        idList = [nextId];
      }
    }

    if (idList.length > 0) {
      // Use upsert to create or update receipts to 'read' status
      const nowIso = new Date().toISOString();
      const receiptsToUpsert = idList.map((msgId) => ({
        message_id: msgId,
        user_id: user.id,
        status: 'read' as const,
        created_at: nowIso,
        updated_at: nowIso,
      }));

      if (receiptsToUpsert.length > 0) {
        // Log for debugging
        console.log('Creating/updating receipts:', {
          count: receiptsToUpsert.length,
          userId: user.id,
          userIdType: typeof user.id,
          firstReceipt: receiptsToUpsert[0],
        });
        
        try {
          // Try upsert first (works in Supabase)
          const upsertResult = await execOrFetch(
            client
              .from('dms_message_receipts')
              .upsert(receiptsToUpsert, {
                onConflict: 'message_id,user_id',
                ignoreDuplicates: false,
              })
          );
          
          if (upsertResult.error) {
            console.error('Error upserting receipts:', upsertResult.error);
            // Fallback: try insert with onConflict one by one
            for (const receipt of receiptsToUpsert) {
              try {
                const insertResult = await execOrFetch(
                  client
                    .from('dms_message_receipts')
                    .insert(receipt)
                    .onConflict('message_id,user_id')
                    .merge({ status: 'read', updated_at: new Date().toISOString() })
                );
                if (insertResult.error) {
                  console.error('Error creating single receipt:', insertResult.error, receipt);
                }
              } catch (singleErr: any) {
                console.error('Error creating single receipt:', singleErr, receipt);
              }
            }
          }
        } catch (upsertErr: any) {
          console.error('Error upserting receipts:', upsertErr);
          // Fallback: try insert with onConflict one by one
          for (const receipt of receiptsToUpsert) {
            try {
              const insertResult = await execOrFetch(
                client
                  .from('dms_message_receipts')
                  .insert(receipt)
                  .onConflict('message_id,user_id')
                  .merge({ status: 'read', updated_at: new Date().toISOString() })
              );
              if (insertResult.error) {
                console.error('Error creating single receipt:', insertResult.error, receipt);
              }
            } catch (singleErr: any) {
              console.error('Error creating single receipt:', singleErr, receipt);
            }
          }
        }
      }
    }

    return res.status(200).json({ ok: true, last_read_message_id: nextId });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}
