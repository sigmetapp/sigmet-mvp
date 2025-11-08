/**
 * Types for the instant, ordered, lossless DM engine
 */

export type DbMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  text: string;
  created_at: string;
};

export type MessageUI = DbMessage & {
  tempId?: string;
  clientGeneratedId?: string; // UUID v4 generated on client
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAtClient?: number; // Date.now()
};

export type MessageCursor = {
  createdAt: string;
  id: string;
};

export type OutboxItem = {
  clientGeneratedId: string;
  threadId: string;
  text: string;
  createdAtClient: number;
  attempts: number;
  nextRetryAt: number;
};
