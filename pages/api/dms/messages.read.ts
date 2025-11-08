import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';
import { assertThreadId } from '@/lib/dm/threadId';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { client, user } = await getAuthedClient(req);
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

    // Convert threadId to number for database queries (thread_id is bigint in DB)
    const threadIdNum = Number.parseInt(threadId, 10);
    if (Number.isNaN(threadIdNum)) {
      return res.status(400).json({ ok: false, error: 'Invalid thread_id format' });
    }

    // Ensure membership and get current last_read where supported. If the
    // column does not exist in the database, fall back to a membership-only check.
    let participant: any | null = null;
    {
      const { data, error } = await client
        .from('dms_thread_participants')
        .select('thread_id, last_read_message_id')
        .eq('thread_id', threadIdNum)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!error) {
        participant = data;
      } else if (String(error.message || '').toLowerCase().includes('last_read_message_id')) {
        const { data: data2, error: err2 } = await client
          .from('dms_thread_participants')
          .select('thread_id')
          .eq('thread_id', threadIdNum)
          .eq('user_id', user.id)
          .maybeSingle();
        if (err2) return res.status(400).json({ ok: false, error: err2.message });
        participant = data2 ? { ...data2, last_read_message_id: null } : null;
      } else {
        return res.status(400).json({ ok: false, error: error.message });
      }
    }
    if (!participant) return res.status(403).json({ ok: false, error: 'Forbidden' });

    // Ensure up_to is a message in this thread
    // Convert upTo to number for comparison
    const upToNum = Number.parseInt(upTo, 10);
    if (Number.isNaN(upToNum)) {
      return res.status(400).json({ ok: false, error: 'Invalid up_to_message_id format' });
    }

    const { data: msgCheck } = await client
      .from('dms_messages')
      .select('id, created_at')
      .eq('thread_id', threadIdNum)
      .eq('id', upToNum)
      .maybeSingle();
    if (!msgCheck) {
      // Log for debugging
      console.error('Message not found in thread:', { threadId, threadIdNum, upTo, upToNum });
      return res.status(400).json({ ok: false, error: 'up_to_message_id not in thread' });
    }

    const prev = participant.last_read_message_id ? String(participant.last_read_message_id) : null;
    const nextId = String(upToNum);

    if (nextId !== prev) {
      try {
        // Update last_read_message_id as bigint (number)
        await client
          .from('dms_thread_participants')
          .update({ 
            last_read_message_id: upToNum, 
            last_read_at: msgCheck.created_at || new Date().toISOString() 
          })
          .eq('thread_id', threadIdNum)
          .eq('user_id', user.id);
      } catch (err: any) {
        // Log error for debugging
        console.error('Error updating last_read_message_id:', err);
        // Column may not exist; ignore update failure in that case
      }
    }

    // Mark receipts up to nextId as read
    // Get all message IDs up to and including the target message from partner
    const { data: ids } = await execOrFetch(
      client
        .from('dms_messages')
        .select('id, sender_id')
        .eq('thread_id', threadIdNum)
        .lte('id', upToNum)
        .neq('sender_id', user.id)
        .limit(1000)
    );

    let idList: number[] = (ids || []).map((x: any) => {
      const id = typeof x.id === 'string' ? Number.parseInt(x.id, 10) : Number(x.id);
      return Number.isNaN(id) ? null : id;
    }).filter((id): id is number => id !== null);

    if (idList.length === 0) {
      // Fallback: include the up-to id directly if it's from partner
      const { data: msgCheck2 } = await client
        .from('dms_messages')
        .select('sender_id')
        .eq('thread_id', threadIdNum)
        .eq('id', upToNum)
        .maybeSingle();
      
      if (msgCheck2 && msgCheck2.sender_id !== user.id) {
        idList = [upToNum];
      }
    }

    if (idList.length > 0) {
      try {
        // Update existing receipts to 'read' status
        const updateResult = await execOrFetch(
          client
            .from('dms_message_receipts')
            .update({ status: 'read', updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .in('message_id', idList)
        );
        
        if (updateResult.error) {
          console.error('Error updating receipts:', updateResult.error);
        }
      } catch (updateErr: any) {
        console.error('Error updating receipts:', updateErr);
      }

      // Create receipts with 'read' status for messages that don't have receipts yet
      // First, get messages that don't have receipts
      try {
        const { data: existingReceipts, error: selectErr } = await execOrFetch(
          client
            .from('dms_message_receipts')
            .select('message_id')
            .eq('user_id', user.id)
            .in('message_id', idList)
        );

        if (selectErr) {
          console.error('Error selecting existing receipts:', selectErr);
        }

        const existingMessageIds = new Set(
          (existingReceipts || []).map((r: any) => {
            const id = typeof r.message_id === 'string' ? Number.parseInt(r.message_id, 10) : Number(r.message_id);
            return Number.isNaN(id) ? null : id;
          }).filter((id): id is number => id !== null)
        );

        const messagesWithoutReceipts = idList.filter((msgId) => !existingMessageIds.has(msgId));

        if (messagesWithoutReceipts.length > 0) {
          const receiptsToInsert = messagesWithoutReceipts.map((msgId) => ({
            message_id: msgId,
            user_id: user.id,
            status: 'read' as const,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));

          try {
            const insertResult = await execOrFetch(
              client
                .from('dms_message_receipts')
                .insert(receiptsToInsert)
            );
            
            if (insertResult.error) {
              console.error('Error inserting receipts:', insertResult.error);
              // Try one by one if batch insert fails
              for (const receipt of receiptsToInsert) {
                try {
                  await execOrFetch(
                    client
                      .from('dms_message_receipts')
                      .insert(receipt)
                      .onConflict('message_id,user_id')
                      .merge({ status: 'read', updated_at: new Date().toISOString() })
                  );
                } catch (singleErr: any) {
                  console.error('Error creating single receipt:', singleErr, receipt);
                }
              }
            }
          } catch (insertErr: any) {
            console.error('Error creating receipts:', insertErr);
            // Try one by one if batch insert fails
            for (const receipt of receiptsToInsert) {
              try {
                await execOrFetch(
                  client
                    .from('dms_message_receipts')
                    .insert(receipt)
                    .onConflict('message_id,user_id')
                    .merge({ status: 'read', updated_at: new Date().toISOString() })
                );
              } catch (singleErr: any) {
                console.error('Error creating single receipt:', singleErr, receipt);
              }
            }
          }
        }
      } catch (err: any) {
        console.error('Error processing receipts:', err);
      }
    }

    return res.status(200).json({ ok: true, last_read_message_id: nextId });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Internal error' });
  }
}
