import type { ThreadId } from '@/lib/dm/threadId';

export type DmReceiptStatus = 'sent' | 'delivered' | 'read';

export type DmReceipt = {
  message_id: string;
  user_id: string;
  status: DmReceiptStatus;
  updated_at: string | null;
};

type ListReceiptsOptions = {
  messageIds?: Array<string | number>;
  recipientIds?: string[];
};

export async function listThreadReceipts(
  threadId: ThreadId,
  options: ListReceiptsOptions = {}
): Promise<DmReceipt[]> {
  if (!threadId) {
    return [];
  }

  try {
      const payload = {
        thread_id: threadId,
        message_ids: (options.messageIds ?? []).map((id) => String(id)),
        recipient_ids: options.recipientIds ?? undefined,
      };

    const response = await fetch('/api/dms/receipts.list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody?.error || response.statusText || 'Failed to load receipts');
    }

    const body = (await response.json()) as { receipts?: DmReceipt[] };
    const receipts = Array.isArray(body.receipts) ? body.receipts : [];
    return receipts.map((row) => ({
      message_id: String(row.message_id),
      user_id: String(row.user_id),
      status: row.status as DmReceiptStatus,
      updated_at: row.updated_at ?? null,
    }));
  } catch (error) {
    console.error('Failed to list DM receipts', error);
    return [];
  }
}
