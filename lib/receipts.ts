import { supabase } from '@/lib/supabaseClient';

const TABLE = 'dms_message_receipts';
let missingTableLogged = false;

type ReceiptRecord = {
  message_id: string;
  user_id: string;
  delivered_at: string | null;
  read_at: string | null;
};

type ReceiptResult = {
  delivered_at: string | null;
  read_at: string | null;
};

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = (error as { message?: string }).message ?? '';
  return message.includes(`relation "${TABLE}" does not exist`) || message.includes(`relation '${TABLE}' does not exist`);
}

function logMissingTableOnce() {
  if (missingTableLogged) return;
  if (typeof window === 'undefined') {
    console.warn(`[receipts] Table "${TABLE}" is missing. Run scripts/initReceiptTable.ts to create it.`);
  } else {
    console.warn(`[receipts] Table "${TABLE}" is missing. Message receipts will be skipped.`);
  }
  missingTableLogged = true;
}

function normalizeMessageId(id: string | number): string {
  return typeof id === 'string' ? id : String(id);
}

export async function markDelivered(messageId: string, userId: string): Promise<void> {
  const normalizedId = normalizeMessageId(messageId);
  const now = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('message_id, delivered_at, read_at')
      .eq('message_id', normalizedId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        logMissingTableOnce();
        return;
      }
      throw error;
    }

    if (!data) {
      const { error: insertError } = await supabase.from(TABLE).insert({
        message_id: normalizedId,
        user_id: userId,
        delivered_at: now,
        read_at: null,
      });
      if (insertError) {
        if (isMissingTableError(insertError)) {
          logMissingTableOnce();
          return;
        }
        throw insertError;
      }
      return;
    }

    if (data.delivered_at) {
      return;
    }

    const { error: updateError } = await supabase
      .from(TABLE)
      .update({ delivered_at: now })
      .eq('message_id', normalizedId)
      .eq('user_id', userId);

    if (updateError) {
      if (isMissingTableError(updateError)) {
        logMissingTableOnce();
        return;
      }
      throw updateError;
    }
  } catch (err) {
    console.error('[receipts] Failed to mark delivered', err);
  }
}

export async function markRead(messageIds: string[], userId: string): Promise<void> {
  const uniqueIds = Array.from(new Set(messageIds.map(normalizeMessageId)));
  if (uniqueIds.length === 0) {
    return;
  }

  const now = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('message_id, delivered_at, read_at')
      .eq('user_id', userId)
      .in('message_id', uniqueIds);

    if (error) {
      if (isMissingTableError(error)) {
        logMissingTableOnce();
        return;
      }
      throw error;
    }

    const existing = new Map<string, ReceiptRecord>();
    for (const row of data || []) {
      existing.set(normalizeMessageId(row.message_id), row);
    }

    const rows = uniqueIds
      .map((id) => {
        const record = existing.get(id);
        if (record?.read_at) {
          return null;
        }
        return {
          message_id: id,
          user_id: userId,
          delivered_at: record?.delivered_at ?? now,
          read_at: now,
        };
      })
      .filter(Boolean);

    if (rows.length === 0) {
      return;
    }

    const { error: upsertError } = await supabase
      .from(TABLE)
      .upsert(rows, { onConflict: 'message_id,user_id' });

    if (upsertError) {
      if (isMissingTableError(upsertError)) {
        logMissingTableOnce();
        return;
      }
      throw upsertError;
    }
  } catch (err) {
    console.error('[receipts] Failed to mark read', err);
  }
}

export async function getReceipt(messageId: string, userId: string): Promise<ReceiptResult | null> {
  const normalizedId = normalizeMessageId(messageId);
  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('delivered_at, read_at')
      .eq('message_id', normalizedId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        logMissingTableOnce();
        return null;
      }
      throw error;
    }

    if (!data) {
      return null;
    }

    return {
      delivered_at: data.delivered_at,
      read_at: data.read_at,
    };
  } catch (err) {
    console.error('[receipts] Failed to fetch receipt', err);
    return null;
  }
}

export async function getReceiptsForMessages(
  messageIds: string[],
  userId: string
): Promise<Record<string, ReceiptResult>> {
  const uniqueIds = Array.from(new Set(messageIds.map(normalizeMessageId)));
  if (uniqueIds.length === 0) {
    return {};
  }

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('message_id, delivered_at, read_at')
      .eq('user_id', userId)
      .in('message_id', uniqueIds);

    if (error) {
      if (isMissingTableError(error)) {
        logMissingTableOnce();
        return {};
      }
      throw error;
    }

    const result: Record<string, ReceiptResult> = {};
    for (const row of data || []) {
      const id = normalizeMessageId(row.message_id);
      result[id] = {
        delivered_at: row.delivered_at,
        read_at: row.read_at,
      };
    }
    return result;
  } catch (err) {
    console.error('[receipts] Failed to fetch receipts', err);
    return {};
  }
}

