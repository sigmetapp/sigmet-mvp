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
    if (
      trimmed.length === 36 &&
      /^[0-9a-fA-F-]{36}$/.test(trimmed)
    ) {
      return trimmed.toLowerCase();
    }
    return null;
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
      const numericThreadId = Number.parseInt(threadId, 10);
      if (!Number.isFinite(numericThreadId)) {
        return res.status(400).json({ ok: false, error: 'Invalid thread_id' });
      }

      const { data: participants, error: participantsError } = await client
        .from('dms_thread_participants')
        .select('user_id')
        .eq('thread_id', numericThreadId);

    if (participantsError) {
      return res.status(400).json({ ok: false, error: participantsError.message });
    }

    const participantIds = new Set<string>();
    for (const row of participants ?? []) {
      const normalized = normalizeUserId(row.user_id);
      if (normalized) {
        participantIds.add(normalized);
      }
    }

    if (!participantIds.has(normalizeUserId(user.id) ?? '')) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const normalizedUserId = normalizeUserId(user.id) ?? '';
    const otherParticipantIds = Array.from(participantIds).filter((id) => id !== normalizedUserId);

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

    const messageIdEntries = normalizedMessageIds
      .map((id) => ({
        stringId: id,
        numericId: Number.parseInt(id, 10),
      }))
      .filter(
        (entry): entry is { stringId: string; numericId: number } =>
          Number.isFinite(entry.numericId)
      );

    if (messageIdEntries.length === 0) {
      return res.status(200).json({ ok: true, receipts: [] as ReceiptRow[] });
    }

    const numericIds = messageIdEntries.map((entry) => entry.numericId);
    const stringIdByNumeric = new Map<number, string>(
      messageIdEntries.map((entry) => [entry.numericId, entry.stringId])
    );

    const validRecipientIds = targetRecipientIds.filter(
      (id) => typeof id === 'string' && id.length === 36 && /^[0-9a-f-]{36}$/.test(id)
    );

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[dms][receipts.list] resolved payload', {
        threadId,
        numericThreadId,
        messageIds: normalizedMessageIds,
        numericIds,
        targetRecipientIds,
        validRecipientIds,
      });
    }

    let receiptsQuery = receiptsClient
      .from('dms_message_receipts')
      .select('message_id, user_id, status, updated_at, message:dms_messages!inner(thread_id)')
      .in('message_id', numericIds)
      .eq('message.thread_id', numericThreadId);

    if (validRecipientIds.length > 0) {
      receiptsQuery = receiptsQuery.in('user_id', validRecipientIds);
    }

    const { data: receipts, error: receiptsError } = await receiptsQuery;

    if (receiptsError) {
      return res.status(400).json({ ok: false, error: receiptsError.message });
    }

    const normalized: ReceiptRow[] = (receipts ?? []).map((row: any) => {
      const numericId = Number.parseInt(String(row.message_id), 10);
      const mappedId = Number.isFinite(numericId)
        ? stringIdByNumeric.get(numericId) ?? String(row.message_id)
        : String(row.message_id);

      return {
        message_id: mappedId,
        user_id: String(row.user_id),
        status: row.status as 'sent' | 'delivered' | 'read',
        updated_at: row.updated_at ?? null,
      };
    });

    return res.status(200).json({ ok: true, receipts: normalized });
  } catch (err: any) {
    const status = err?.status || 500;
    return res.status(status).json({ ok: false, error: err?.message || 'Internal error' });
  }
}
