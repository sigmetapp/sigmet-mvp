import type { Message } from './types';

export function makeMessageReconciler() {
  const byClient = new Map<string, Message>();
  const list: Message[] = [];

  function upsertLocal(partial: Partial<Message> & { client_msg_id: string }) {
    const prev = byClient.get(partial.client_msg_id);
    const next = { ...prev, ...partial } as Message;
    byClient.set(partial.client_msg_id, next);
    
    if (!prev) {
      list.push(next);
    }
    
    // Keep list sorted by created_at desc then id desc
    list.sort((a, b) => {
      const timeCompare = b.created_at.localeCompare(a.created_at);
      if (timeCompare !== 0) return timeCompare;
      
      const aId = a.id ?? 0;
      const bId = b.id ?? 0;
      return bId - aId;
    });
  }

  function hasLocal(id: string): boolean {
    return byClient.has(id);
  }

  function addIncoming(m: Message) {
    if (!hasLocal(m.client_msg_id)) {
      upsertLocal(m);
    }
  }

  return { upsertLocal, addIncoming, hasLocal, list };
}
