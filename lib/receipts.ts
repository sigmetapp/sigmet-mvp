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

function toDbMessageId(value: string | number): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
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
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toClientMessageId(value: string | number): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
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
  const dbId = toDbMessageId(messageId);
  if (dbId === null) {
    return;
  }

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('status')
      .eq('message_id', dbId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        logMissingTableOnce();
        return;
      }
      throw error;
    }

    const nowIso = new Date().toISOString();

    if (!data) {
      const { error: insertError } = await supabase.from(TABLE).insert({
        message_id: dbId,
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

    const { error: updateError } = await supabase
      .from(TABLE)
      .update({ status: 'delivered', updated_at: nowIso })
      .eq('message_id', dbId)
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
        .map((id) => toDbMessageId(id))
        .filter((id): id is number => id !== null)
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

    const existingStatus = new Map<number, ReceiptStatus>();
    for (const row of data ?? []) {
      const dbId = toDbMessageId(row.message_id);
      if (dbId !== null) {
        existingStatus.set(dbId, row.status);
      }
    }

    const insertPayload: Array<{ message_id: number; user_id: string; status: ReceiptStatus; created_at: string; updated_at: string }> =
      [];
    const updateIds: number[] = [];
    const nowIso = new Date().toISOString();

    for (const id of normalizedIds) {
      const status = existingStatus.get(id);
      if (!status) {
        insertPayload.push({
          message_id: id,
          user_id,
          status: 'read',
          created_at: nowIso,
          updated_at: nowIso,
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
  const dbId = toDbMessageId(messageId);
  if (dbId === null) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('status, updated_at')
      .eq('message_id', dbId)
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
  const dbIds = Array.from(
    new Set(
      messageIds
        .map((id) => toDbMessageId(id))
        .filter((id): id is number => id !== null)
    )
  );
  if (dbIds.length === 0) {
    return {};
  }

  try {
    const { data, error } = await supabase
      .from<ReceiptRecord>(TABLE)
      .select('message_id, status, updated_at')
      .eq('user_id', userId)
      .in('message_id', dbIds);

    if (error) {
      if (isMissingTableError(error)) {
        logMissingTableOnce();
        return {};
      }
      throw error;
    }

    const result: Record<string, ReceiptResult> = {};
    for (const row of data ?? []) {
      const clientId = toClientMessageId(row.message_id);
      if (!clientId) continue;
      result[clientId] = mapStatusToResult(row.status, row.updated_at);
    }
    return result;
  } catch (err) {
    console.error('[receipts] Failed to fetch receipts', err);
    return {};
  }
}

