import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from '@/store/chatStore';
import type { Message } from '@/types/chat';

const dialogId = 'dialog-test';

function baseMessage(partial?: Partial<Message>): Message {
  return {
    id: 'temp-1',
    dialogId,
    senderId: 'user-a',
    receiverId: 'user-b',
    text: 'hello',
    createdAt: new Date().toISOString(),
    status: 'sending',
    ...partial,
  };
}

beforeEach(() => {
  useChatStore.setState({ messagesByDialog: {} });
});

describe('chatStore', () => {
  it('promotes message status without downgrading', () => {
    useChatStore.getState().addMessages(dialogId, [baseMessage()]);
    useChatStore.getState().updateMessage(dialogId, 'temp-1', { status: 'sent' });
    useChatStore.getState().updateMessage(dialogId, 'temp-1', { status: 'delivered' });
    useChatStore.getState().updateMessage(dialogId, 'temp-1', { status: 'read' });

    const messages = useChatStore.getState().messagesByDialog[dialogId] ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.status).toBe('read');
  });

  it('ignores status regressions', () => {
    useChatStore.getState().addMessages(dialogId, [baseMessage({ status: 'delivered' })]);
    useChatStore.getState().updateMessage(dialogId, 'temp-1', { status: 'sent' });

    const messages = useChatStore.getState().messagesByDialog[dialogId] ?? [];
    expect(messages[0]?.status).toBe('delivered');
  });

  it('replaces temporary id with server id while preserving order', () => {
    const createdAt = new Date().toISOString();

    useChatStore.getState().addMessages(dialogId, [
      baseMessage({ id: 'temp-1', createdAt, status: 'sending' }),
      baseMessage({ id: 'temp-2', text: 'second', createdAt }),
    ]);

    useChatStore.getState().updateMessage(dialogId, 'temp-1', { id: '123', status: 'sent' });

    const messages = useChatStore.getState().messagesByDialog[dialogId] ?? [];
    expect(messages.map((msg) => msg.id)).toEqual(['123', 'temp-2']);
    expect(messages[0]?.status).toBe('sent');
  });

  it('deduplicates messages when adding batch', () => {
    const createdAt = new Date().toISOString();

    useChatStore.getState().addMessages(dialogId, [baseMessage({ id: '1', createdAt })]);
    useChatStore.getState().addMessages(dialogId, [
      baseMessage({ id: '1', text: 'updated', status: 'delivered' }),
    ]);

    const messages = useChatStore.getState().messagesByDialog[dialogId] ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe('updated');
    expect(messages[0]?.status).toBe('delivered');
  });
});

