/**
 * Test for real-time message delivery delays
 * 
 * This test checks if messages are delivered in real-time without delays
 * and appear in the dialog immediately without requiring a page refresh.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Real-time Message Delivery', () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Skipping real-time tests: Supabase credentials not configured');
    return;
  }

  let supabase: ReturnType<typeof createClient>;
  let testThreadId: number;
  let user1Id: string;
  let user2Id: string;

  beforeAll(async () => {
    supabase = createClient(supabaseUrl, supabaseKey);
    
    // Create test users and thread (simplified for testing)
    // In real scenario, you would need proper authentication
    // This is a placeholder test structure
  });

  afterAll(async () => {
    // Cleanup test data
  });

  it('should deliver messages in real-time without delays', async () => {
    // Test that messages appear immediately via real-time subscription
    // without requiring a page refresh
    
    const messages: any[] = [];
    let messageReceived = false;
    const startTime = Date.now();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`test-thread:${testThreadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dms_messages',
          filter: `thread_id=eq.${testThreadId}`,
        },
        (payload) => {
          messages.push(payload.new);
          messageReceived = true;
        }
      )
      .subscribe();

    // Wait for subscription to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Send a test message
    const { data: message, error } = await supabase
      .from('dms_messages')
      .insert({
        thread_id: testThreadId,
        sender_id: user1Id,
        body: 'Test message',
        kind: 'text',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(message).toBeTruthy();

    // Wait for real-time event (should be immediate, max 2 seconds)
    const maxWaitTime = 2000;
    const checkInterval = 100;
    let waited = 0;

    while (!messageReceived && waited < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    const deliveryTime = Date.now() - startTime;

    // Message should be received via real-time subscription
    expect(messageReceived).toBe(true);
    expect(messages.length).toBeGreaterThan(0);
    
    // Delivery should be fast (less than 2 seconds)
    expect(deliveryTime).toBeLessThan(2000);

    // Cleanup
    await channel.unsubscribe();
  });

  it('should not require page refresh to see new messages', async () => {
    // Test that messages appear in the dialog immediately
    // This simulates the user experience
    
    const messages: any[] = [];
    let subscriptionActive = false;

    // Subscribe to real-time updates (simulating useDmRealtime hook)
    const channel = supabase
      .channel(`test-thread:${testThreadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dms_messages',
          filter: `thread_id=eq.${testThreadId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            messages.push(payload.new);
          }
        }
      )
      .subscribe((status) => {
        subscriptionActive = status === 'SUBSCRIBED';
      });

    // Wait for subscription
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(subscriptionActive).toBe(true);

    // Send multiple messages quickly
    const messageCount = 5;
    const sentMessages: any[] = [];

    for (let i = 0; i < messageCount; i++) {
      const { data: message } = await supabase
        .from('dms_messages')
        .insert({
          thread_id: testThreadId,
          sender_id: user1Id,
          body: `Test message ${i}`,
          kind: 'text',
        })
        .select()
        .single();

      if (message) {
        sentMessages.push(message);
      }

      // Small delay between messages
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Wait for all real-time events
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // All messages should be received via real-time subscription
    expect(messages.length).toBeGreaterThanOrEqual(messageCount);

    // Cleanup
    await channel.unsubscribe();
  });

  it('should handle high message frequency without delays', async () => {
    // Test that the system can handle rapid message delivery
    // without throttling or delays
    
    const messages: any[] = [];
    const startTime = Date.now();

    const channel = supabase
      .channel(`test-thread:${testThreadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dms_messages',
          filter: `thread_id=eq.${testThreadId}`,
        },
        (payload) => {
          messages.push(payload.new);
        }
      )
      .subscribe();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Send 10 messages rapidly
    const rapidMessages = 10;
    for (let i = 0; i < rapidMessages; i++) {
      await supabase
        .from('dms_messages')
        .insert({
          thread_id: testThreadId,
          sender_id: user1Id,
          body: `Rapid message ${i}`,
          kind: 'text',
        });
    }

    // Wait for all events
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const totalTime = Date.now() - startTime;
    const avgTimePerMessage = totalTime / rapidMessages;

    // All messages should be received
    expect(messages.length).toBeGreaterThanOrEqual(rapidMessages);
    
    // Average delivery time should be reasonable (less than 500ms per message)
    expect(avgTimePerMessage).toBeLessThan(500);

    await channel.unsubscribe();
  });
});
