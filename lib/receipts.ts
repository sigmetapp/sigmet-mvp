import { supabase } from '@/lib/supabaseClient';

const TABLE = 'dms_message_receipts';
let missingTableLogged = false;

type ReceiptStatus = 'sent' | 'delivered' | 'read';

type ReceiptRecord = {
  message_id: number;
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

function logMissingTableOnce() {
  if (missingTableLogged) return;
  const warning = `[receipts] Table "${TABLE}" is missing. DM receipts will be skipped.`;
  if (typeof window === 'undefined') {
    console.warn(`${warning} Ensure the latest migrations are applied.`);
  } else {
    console.warn(warning);
  }
  missingTableLogged = true;
}

function toNumericMessageId(value: string | number): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
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
  const numericId = toNumericMessageId(messageId);
  if (numericId === null) {
    return;
  }

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('status')
      .eq('message_id', numericId)
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
        message_id: numericId,
        user_id: userId,
        status: 'delivered',
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

    const { error: updateError } = await supabase
      .from(TABLE)
      .update({ status: 'delivered' })
      .eq('message_id', numericId)
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
  const numericIds = Array.from(
    new Set(
      messageIds
        .map((id) => toNumericMessageId(id))
        .filter((id): id is number => id !== null)
    )
  );
  if (numericIds.length === 0) {
    return;
  }

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('message_id, status')
      .eq('user_id', userId)
      .in('message_id', numericIds);

    if (error) {
      if (isMissingTableError(error)) {
        logMissingTableOnce();
        return;
      }
      throw error;
    }

    const existingStatus = new Map<number, ReceiptStatus>();
    for (const row of data ?? []) {
      existingStatus.set(row.message_id, row.status);
    }

    const insertPayload: Array<{ message_id: number; user_id: string; status: ReceiptStatus }> = [];
    const updateIds: number[] = [];

    for (const id of numericIds) {
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

    if (insertPayload.length > 0) {
      const { error: insertError } = await supabase.from(TABLE).insert(insertPayload);
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
        .update({ status: 'read' })
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
  const numericId = toNumericMessageId(messageId);
  if (numericId === null) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('status, updated_at')
      .eq('message_id', numericId)
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
  const numericIds = Array.from(
    new Set(
      messageIds
        .map((id) => toNumericMessageId(id))
        .filter((id): id is number => id !== null)
    )
  );
  if (numericIds.length === 0) {
    return {};
  }

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('message_id, status, updated_at')
      .eq('user_id', userId)
      .in('message_id', numericIds);

    if (error) {
      if (isMissingTableError(error)) {
        logMissingTableOnce();
        return {};
      }
      throw error;
    }

    const result: Record<string, ReceiptResult> = {};
    for (const row of data ?? []) {
      result[String(row.message_id)] = mapStatusToResult(row.status, row.updated_at);
    }
    return result;
  } catch (err) {
    console.error('[receipts] Failed to fetch receipts', err);
    return {};
  }
}

