import type { NextApiRequest, NextApiResponse } from 'next';
import { createSupabaseForRequest, getAuthedClient } from '@/lib/dm/supabaseServer';
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
      const rawSequence =
        req.body?.up_to_sequence_number ??
        req.body?.sequence_number ??
        req.body?.sequenceNumber ??
        null;
      const upToSequence =
        typeof rawSequence === 'number' && Number.isFinite(rawSequence)
          ? Math.trunc(rawSequence)
          : typeof rawSequence === 'string' && rawSequence.trim()
            ? Number.parseInt(rawSequence.trim(), 10)
            : null;

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

      let targetMessage: any | null = null;
      let targetError: any = null;

      const { data: msgCheck, error: msgCheckError } = await client
      .from('dms_messages')
      .select('id, created_at, sender_id')
      .eq('thread_id', threadId)
      .eq('id', upTo)
      .maybeSingle();

    if (msgCheckError) {
        targetError = msgCheckError;
      } else {
        targetMessage = msgCheck;
      }

      if (!targetMessage && upToSequence != null && !Number.isNaN(upToSequence)) {
        const { data: bySequence, error: sequenceError } = await client
          .from('dms_messages')
          .select('id, created_at, sender_id')
          .eq('thread_id', threadId)
          .eq('sequence_number', upToSequence)
          .maybeSingle();

        if (sequenceError) {
          targetError = sequenceError;
        } else {
          targetMessage = bySequence;
        }
      }

      if (!targetMessage) {
        const message = targetError?.message || 'up_to_message_id not in thread';
        console.error('Message not found in thread:', { threadId, upTo, upToSequence, error: targetError });
        return res.status(400).json({ ok: false, error: message });
      }

      const nextId = String(targetMessage.id ?? upTo);
      const prev = participant.last_read_message_id ? String(participant.last_read_message_id) : null;

      const serviceClient =
        process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim() !== ''
          ? createSupabaseForRequest(req, true)
          : null;

      const privilegedClient = serviceClient ?? client;

      if (nextId !== prev) {
        try {
          await privilegedClient
            .from('dms_thread_participants')
            .update({
              last_read_message_id: targetMessage.id ?? upTo,
              last_read_at: targetMessage.created_at || new Date().toISOString(),
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
          .lte('created_at', targetMessage.created_at)
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
          .eq('id', nextId)
        .is('deleted_at', null)
        .maybeSingle();

      if (msgCheck2Error) {
        console.error('Error checking message sender:', msgCheck2Error);
      } else if (msgCheck2 && msgCheck2.sender_id !== user.id) {
        idList = [nextId];
      }
    }

    if (idList.length > 0) {
      const nowIso = new Date().toISOString();
      const normalizedIds = idList.map((value) => value.trim()).filter(Boolean);

      const numericIds: number[] = [];
      const numericIdByString = new Map<string, number>();
      for (const idValue of normalizedIds) {
        const parsed = Number.parseInt(idValue, 10);
        if (!Number.isFinite(parsed)) {
          continue;
        }
        numericIds.push(parsed);
        numericIdByString.set(idValue, parsed);
      }

      if (numericIds.length > 0) {
        let existingStatusById = new Map<string, string | null>();
        try {
          const { data: existingRows, error: existingError } = await privilegedClient
            .from('dms_message_receipts')
            .select('message_id, status')
            .eq('user_id', user.id)
            .in('message_id', numericIds);

          if (existingError) {
            throw existingError;
          }

          for (const row of existingRows ?? []) {
            const idValue = String(row.message_id);
            existingStatusById.set(idValue, row.status ?? null);
          }
        } catch (fetchError) {
          console.error('Error fetching existing receipts:', fetchError);
          existingStatusById = new Map();
        }

        const insertPayload: Array<{
          message_id: number;
          user_id: string;
          status: 'read';
          created_at: string;
          updated_at: string;
        }> = [];
        const updateIds: number[] = [];

        for (const [stringId, numericId] of numericIdByString.entries()) {
          const status = existingStatusById.get(stringId);
          if (!status) {
            insertPayload.push({
              message_id: numericId,
              user_id: user.id,
              status: 'read',
              created_at: nowIso,
              updated_at: nowIso,
            });
          } else if (status !== 'read') {
            updateIds.push(numericId);
          }
        }

        if (insertPayload.length > 0) {
          const { error: insertError } = await privilegedClient
            .from('dms_message_receipts')
            .insert(insertPayload);

          if (insertError) {
            console.error('Error inserting read receipts:', insertError);
          }
        }

        if (updateIds.length > 0) {
          const { error: updateError } = await privilegedClient
            .from('dms_message_receipts')
            .update({ status: 'read', updated_at: nowIso })
            .eq('user_id', user.id)
            .in('message_id', updateIds);

          if (updateError) {
            console.error('Error updating read receipts:', updateError);
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
