export type Message = {
  id?: number;
  thread_id: number | string;
  sender_id: string;
  client_msg_id: string;
  body: string | null;
  attachments?: unknown[];
  created_at: string;
  delivered_at?: string | null;
  read_at?: string | null;
  status?: 'sending' | 'sent' | 'failed';
  kind?: 'text' | 'system' | 'media' | 'file';
  edited_at?: string | null;
  deleted_at?: string | null;
  sequence_number?: number | null;
};
