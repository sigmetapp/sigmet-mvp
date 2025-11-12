import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient, createSupabaseForRequest } from '@/lib/dm/supabaseServer';
import { assertThreadId } from '@/lib/dm/threadId';

type ReceiptRow = {
  message_id: string;
  user_id: string;
  status: 'sent' | 'delivered' | 'read';
  updated_at: string | null;
};

function normalizeMessageId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? value.toString() : null;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const lowered = trimmed.toLowerCase();
    if (lowered === 'nan' || lowered === 'undefined' || lowered === 'null') {
      return null;
    }

    return trimmed;
  }
  return null;
}

function normalizeUserId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { client, user } = await getAuthedClient(req);

    const threadId = (() => {
      try {
        return assertThreadId(req.body?.thread_id, 'Invalid thread_id');
      } catch {
        return null;
      }
    })();

    if (!threadId) {
      return res.status(400).json({ ok: false, error: 'Invalid thread_id' });
    }

    // Verify the requester participates in the thread and gather participant list
    const { data: participants, error: participantsError } = await client
      .from('dms_thread_participants')
      .select('user_id')
      .eq('thread_id', threadId);

    if (participantsError) {
      return res.status(400).json({ ok: false, error: participantsError.message });
    }

    const participantIds = new Set<string>((participants ?? []).map((row: any) => String(row.user_id)));
    if (!participantIds.has(user.id)) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const otherParticipantIds = Array.from(participantIds).filter((id) => id !== user.id);

    const requestedRecipientIds = Array.isArray(req.body?.recipient_ids)
      ? req.body.recipient_ids
          .map(normalizeUserId)
          .filter((id): id is string => Boolean(id))
      : null;

    let targetRecipientIds: string[];
    if (requestedRecipientIds && requestedRecipientIds.length > 0) {
      const filtered = requestedRecipientIds.filter((id) => otherParticipantIds.includes(id));
      if (filtered.length === 0) {
        return res.status(200).json({ ok: true, receipts: [] as ReceiptRow[] });
      }
      targetRecipientIds = filtered;
    } else {
      targetRecipientIds = otherParticipantIds;
    }

    // Normalize message IDs
    const rawMessageIds = Array.isArray(req.body?.message_ids) ? req.body.message_ids : [];
    const normalizedMessageIds = rawMessageIds
      .map(normalizeMessageId)
      .filter((id): id is string => Boolean(id));

    if (normalizedMessageIds.length === 0) {
      return res.status(200).json({ ok: true, receipts: [] as ReceiptRow[] });
    }

    const serviceClient =
      process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim() !== ''
        ? createSupabaseForRequest(req, true)
        : null;

    const receiptsClient = serviceClient ?? client;

    let receiptsQuery = receiptsClient
      .from('dms_message_receipts')
      .select('message_id, user_id, status, updated_at, message:dms_messages!inner(thread_id)')
      .in('message_id', normalizedMessageIds)
      .eq('message.thread_id', threadId);

    if (targetRecipientIds.length > 0) {
      receiptsQuery = receiptsQuery.in('user_id', targetRecipientIds);
    }

    const { data: receipts, error: receiptsError } = await receiptsQuery;

    if (receiptsError) {
      return res.status(400).json({ ok: false, error: receiptsError.message });
    }

    const normalized: ReceiptRow[] = (receipts ?? []).map((row: any) => ({
      message_id: String(row.message_id),
      user_id: String(row.user_id),
      status: row.status as 'sent' | 'delivered' | 'read',
      updated_at: row.updated_at ?? null,
    }));

    return res.status(200).json({ ok: true, receipts: normalized });
  } catch (err: any) {
    const status = err?.status || 500;
    return res.status(status).json({ ok: false, error: err?.message || 'Internal error' });
  }
}
