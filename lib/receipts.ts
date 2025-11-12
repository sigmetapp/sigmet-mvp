import { supabase } from '@/lib/supabaseClient';

const TABLE = 'dms_message_receipts';
let missingTableLogged = false;

type ReceiptStatus = 'sent' | 'delivered' | 'read';

type ReceiptRecord = {
  message_id: string | number;
  user_id: string;
  status: ReceiptStatus;
  updated_at: string | null;
};

type ReceiptResult = {
  delivered_at: string | null;
  read_at: string | null;
};

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = (error as { message?: string }).message ?? '';
  return (
    message.includes(`relation "${TABLE}" does not exist`) ||
    message.includes(`relation '${TABLE}' does not exist`)
  );
}

function logMissingTableOnce(): void {
  if (missingTableLogged) return;
  const warning = `[receipts] Table "${TABLE}" is missing. DM receipts will be skipped.`;
  if (typeof window === 'undefined') {
    console.warn(`${warning} Ensure the latest migrations are applied.`);
  } else {
    console.warn(warning);
  }
  missingTableLogged = true;
}

function normalizeMessageId(value: string | number): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      !trimmed ||
      trimmed === '-1' ||
      trimmed.toLowerCase() === 'nan' ||
      trimmed.toLowerCase() === 'undefined' ||
      trimmed.toLowerCase() === 'null'
    ) {
      return null;
    }
    return trimmed;
  }
  return null;
}

function mapStatusToResult(status: ReceiptStatus, updatedAt: string | null): ReceiptResult {
  if (status === 'read') {
    return {
      delivered_at: updatedAt,
      read_at: updatedAt,
    };
  }

  if (status === 'delivered') {
    return {
      delivered_at: updatedAt,
      read_at: null,
    };
  }

  return {
    delivered_at: null,
    read_at: null,
  };
}

export async function markDelivered(messageId: string, userId: string): Promise<void> {
  const normalizedId = normalizeMessageId(messageId);
  if (!normalizedId) {
    return;
  }

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('status')
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
      const nowIso = new Date().toISOString();
      const { error: insertError } = await supabase.from(TABLE).insert({
        message_id: normalizedId,
        user_id: userId,
        status: 'delivered',
        created_at: nowIso,
        updated_at: nowIso,
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

    if (data.status === 'read' || data.status === 'delivered') {
      return;
    }

    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabase
      .from(TABLE)
      .update({ status: 'delivered', updated_at: nowIso })
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
  const normalizedIds = Array.from(
    new Set(
      messageIds
        .map((id) => normalizeMessageId(id))
        .filter((id): id is string => Boolean(id))
    )
  );

  if (normalizedIds.length === 0) {
    return;
  }

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('message_id, status')
      .eq('user_id', userId)
      .in('message_id', normalizedIds);

    if (error) {
      if (isMissingTableError(error)) {
        logMissingTableOnce();
        return;
      }
      throw error;
    }

    const existingStatus = new Map<string, ReceiptStatus>();
    for (const row of data ?? []) {
      existingStatus.set(String(row.message_id), row.status);
    }

    const insertPayload: Array<{ message_id: string; user_id: string; status: ReceiptStatus }> = [];
    const updateIds: string[] = [];

    for (const id of normalizedIds) {
      const status = existingStatus.get(id);
      if (!status) {
        insertPayload.push({
          message_id: id,
          user_id,
          status: 'read',
        });
      } else if (status !== 'read') {
        updateIds.push(id);
      }
    }

    const nowIso = new Date().toISOString();

    if (insertPayload.length > 0) {
      const timestampedRows = insertPayload.map((row) => ({
        ...row,
        created_at: nowIso,
        updated_at: nowIso,
      }));
      const { error: insertError } = await supabase.from(TABLE).insert(timestampedRows);
      if (insertError) {
        if (isMissingTableError(insertError)) {
          logMissingTableOnce();
          return;
        }
        throw insertError;
      }
    }

    if (updateIds.length > 0) {
      const { error: updateError } = await supabase
        .from(TABLE)
        .update({ status: 'read', updated_at: nowIso })
        .eq('user_id', userId)
        .in('message_id', updateIds);

      if (updateError) {
        if (isMissingTableError(updateError)) {
          logMissingTableOnce();
          return;
        }
        throw updateError;
      }
    }
  } catch (err) {
    console.error('[receipts] Failed to mark read', err);
  }
}

export async function getReceipt(messageId: string, userId: string): Promise<ReceiptResult | null> {
  const normalizedId = normalizeMessageId(messageId);
  if (!normalizedId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('status, updated_at')
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

    return mapStatusToResult(data.status, data.updated_at);
  } catch (err) {
    console.error('[receipts] Failed to fetch receipt', err);
    return null;
  }
}

export async function getReceiptsForMessages(
  messageIds: string[],
  userId: string
): Promise<Record<string, ReceiptResult>> {
  const normalizedIds = Array.from(
    new Set(
      messageIds
        .map((id) => normalizeMessageId(id))
        .filter((id): id is string => Boolean(id))
    )
  );
  if (normalizedIds.length === 0) {
    return {};
  }

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('message_id, status, updated_at')
      .eq('user_id', userId)
      .in('message_id', normalizedIds);

    if (error) {
      if (isMissingTableError(error)) {
        logMissingTableOnce();
        return {};
      }
      throw error;
    }

    const result: Record<string, ReceiptResult> = {};
    for (const row of data ?? []) {
      const id = normalizeMessageId(row.message_id);
      if (!id) continue;
      result[id] = mapStatusToResult(row.status, row.updated_at);
    }
    return result;
  } catch (err) {
    console.error('[receipts] Failed to fetch receipts', err);
    return {};
  }
}

