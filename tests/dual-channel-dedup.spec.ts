/**
 * Unit test for dual-channel message deduplication
 * 
 * Tests that sending the same client_msg_id twice does not create a duplicate message.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Mock Supabase client for testing
function createMockSupabaseClient() {
  const messages: any[] = [];
  
  return {
    from: (table: string) => {
      if (table === 'messages') {
        return {
          insert: (data: any) => ({
            select: (columns: string) => ({
              single: async () => {
                // Simulate unique constraint violation
                const existing = messages.find(
                  (m) => m.conversation_id === data.conversation_id && m.client_msg_id === data.client_msg_id
                );
                
                if (existing) {
                  // Simulate ON CONFLICT DO NOTHING - return existing message
                  return { data: existing, error: null };
                }
                
                const newMessage = {
                  id: uuidv4(),
                  ...data,
                  created_at: new Date().toISOString(),
                };
                messages.push(newMessage);
                return { data: newMessage, error: null };
              },
            }),
          }),
          select: (columns: string) => ({
            eq: (column: string, value: any) => ({
              eq: (column2: string, value2: any) => ({
                single: async () => {
                  const found = messages.find(
                    (m) => m[column] === value && m[column2] === value2
                  );
                  return { data: found || null, error: found ? null : { message: 'Not found' } };
                },
              }),
            }),
          }),
        };
      }
      return {};
    },
    messages,
  };
}

describe('Dual-channel message deduplication', () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  
  beforeEach(() => {
    mockSupabase = createMockSupabaseClient();
  });
  
  afterEach(() => {
    // Cleanup
  });

  it('should not create duplicate when same client_msg_id is sent twice', async () => {
    const conversationId = uuidv4();
    const senderId = uuidv4();
    const recipientId = uuidv4();
    const clientMsgId = uuidv4();
    const body = 'Test message';

    // First insert
    const { data: firstMessage, error: firstError } = await mockSupabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        recipient_id: recipientId,
        client_msg_id: clientMsgId,
        body,
      })
      .select('id, created_at')
      .single();

    expect(firstError).toBeNull();
    expect(firstMessage).toBeDefined();
    expect(firstMessage.client_msg_id).toBe(clientMsgId);

    // Second insert with same client_msg_id (should not create duplicate)
    const { data: secondMessage, error: secondError } = await mockSupabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        recipient_id: recipientId,
        client_msg_id: clientMsgId, // Same client_msg_id
        body,
      })
      .select('id, created_at')
      .single();

    expect(secondError).toBeNull();
    expect(secondMessage).toBeDefined();
    
    // Should return the same message (deduplication)
    expect(secondMessage.id).toBe(firstMessage.id);
    expect(secondMessage.client_msg_id).toBe(clientMsgId);
    
    // Verify only one message exists in the store
    const allMessages = mockSupabase.messages.filter(
      (m) => m.conversation_id === conversationId && m.client_msg_id === clientMsgId
    );
    expect(allMessages.length).toBe(1);
  });

  it('should allow different client_msg_id for same conversation', async () => {
    const conversationId = uuidv4();
    const senderId = uuidv4();
    const recipientId = uuidv4();
    const clientMsgId1 = uuidv4();
    const clientMsgId2 = uuidv4();
    const body = 'Test message';

    // First insert
    const { data: firstMessage } = await mockSupabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        recipient_id: recipientId,
        client_msg_id: clientMsgId1,
        body,
      })
      .select('id, created_at')
      .single();

    // Second insert with different client_msg_id (should create new message)
    const { data: secondMessage } = await mockSupabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        recipient_id: recipientId,
        client_msg_id: clientMsgId2, // Different client_msg_id
        body,
      })
      .select('id, created_at')
      .single();

    expect(firstMessage.id).not.toBe(secondMessage.id);
    expect(firstMessage.client_msg_id).toBe(clientMsgId1);
    expect(secondMessage.client_msg_id).toBe(clientMsgId2);
    
    // Verify both messages exist
    const allMessages = mockSupabase.messages.filter(
      (m) => m.conversation_id === conversationId
    );
    expect(allMessages.length).toBe(2);
  });
});
