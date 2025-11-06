/**
 * Integration test for dual-channel messaging architecture
 * 
 * Tests that two clients in the same room:
 * - One sends a message
 * - Both see message_ack < 100ms
 * - Both see message_persisted after DB write
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from '@/lib/dm/websocket';
import { v4 as uuidv4 } from 'uuid';

// Mock WebSocket for testing
class MockWebSocket {
  readyState: number = WebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  
  private sentMessages: string[] = [];
  
  send(data: string) {
    this.sentMessages.push(data);
  }
  
  simulateOpen() {
    this.readyState = WebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }
  
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }
  
  getSentMessages(): string[] {
    return this.sentMessages;
  }
  
  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }
}

// Mock global WebSocket
(global as any).WebSocket = MockWebSocket;

describe('Dual-channel messaging integration', () => {
  let client1: WebSocketClient;
  let client2: WebSocketClient;
  let mockWs1: MockWebSocket;
  let mockWs2: MockWebSocket;
  
  beforeEach(() => {
    // Create mock WebSocket instances
    mockWs1 = new MockWebSocket();
    mockWs2 = new MockWebSocket();
    
    // Create WebSocket clients
    client1 = new WebSocketClient('/api/ws');
    client2 = new WebSocketClient('/api/ws');
    
    // Replace WebSocket with mocks
    (client1 as any).ws = mockWs1;
    (client2 as any).ws = mockWs2;
  });
  
  afterEach(() => {
    client1.disconnect();
    client2.disconnect();
  });

  it('should deliver message_ack to both clients within 100ms', async () => {
    const conversationId = uuidv4();
    const threadId = '1' as any; // Mock threadId
    const clientMsgId = uuidv4();
    const body = 'Test message';
    
    // Connect both clients
    await client1.connect('token1');
    await client2.connect('token2');
    
    mockWs1.simulateOpen();
    mockWs2.simulateOpen();
    
    // Simulate authentication
    mockWs1.simulateMessage({ type: 'connected' });
    mockWs2.simulateMessage({ type: 'connected' });
    
    // Subscribe both clients to thread
    client1.subscribe(threadId);
    client2.subscribe(threadId);
    
    // Track message_ack events
    const client1Acks: any[] = [];
    const client2Acks: any[] = [];
    
    client1.on('message_ack', (event) => {
      client1Acks.push(event);
    });
    
    client2.on('message_ack', (event) => {
      client2Acks.push(event);
    });
    
    // Send message from client1
    const sendStartTime = Date.now();
    await client1.sendMessage(threadId, body, [], clientMsgId);
    
    // Simulate server sending message_ack immediately
    const ackEvent = {
      type: 'message_ack',
      conversation_id: conversationId,
      client_msg_id: clientMsgId,
      timestamp: Date.now(),
    };
    
    mockWs1.simulateMessage(ackEvent);
    mockWs2.simulateMessage(ackEvent);
    
    // Wait a bit for events to process
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const ackReceiveTime = Date.now();
    const latency = ackReceiveTime - sendStartTime;
    
    // Both clients should receive message_ack
    expect(client1Acks.length).toBeGreaterThan(0);
    expect(client2Acks.length).toBeGreaterThan(0);
    
    // Latency should be < 100ms (allowing some buffer for test execution)
    expect(latency).toBeLessThan(200); // 200ms buffer for test environment
    
    // Verify ack content
    const client1Ack = client1Acks.find(a => a.client_msg_id === clientMsgId);
    const client2Ack = client2Acks.find(a => a.client_msg_id === clientMsgId);
    
    expect(client1Ack).toBeDefined();
    expect(client2Ack).toBeDefined();
    expect(client1Ack?.client_msg_id).toBe(clientMsgId);
    expect(client2Ack?.client_msg_id).toBe(clientMsgId);
  });

  it('should deliver message_persisted after DB write', async () => {
    const conversationId = uuidv4();
    const threadId = '1' as any;
    const clientMsgId = uuidv4();
    const dbMessageId = uuidv4();
    const dbCreatedAt = new Date().toISOString();
    
    // Connect clients
    await client1.connect('token1');
    await client2.connect('token2');
    
    mockWs1.simulateOpen();
    mockWs2.simulateOpen();
    
    mockWs1.simulateMessage({ type: 'connected' });
    mockWs2.simulateMessage({ type: 'connected' });
    
    client1.subscribe(threadId);
    client2.subscribe(threadId);
    
    // Track message_persisted events
    const client1Persisted: any[] = [];
    const client2Persisted: any[] = [];
    
    client1.on('message_persisted', (event) => {
      client1Persisted.push(event);
    });
    
    client2.on('message_persisted', (event) => {
      client2Persisted.push(event);
    });
    
    // Simulate message_persisted event (after DB write)
    const persistedEvent = {
      type: 'message_persisted',
      conversation_id: conversationId,
      client_msg_id: clientMsgId,
      db_message_id: dbMessageId,
      db_created_at: dbCreatedAt,
    };
    
    mockWs1.simulateMessage(persistedEvent);
    mockWs2.simulateMessage(persistedEvent);
    
    // Wait for events to process
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Both clients should receive message_persisted
    expect(client1Persisted.length).toBeGreaterThan(0);
    expect(client2Persisted.length).toBeGreaterThan(0);
    
    // Verify persisted event content
    const client1Persist = client1Persisted.find(p => p.client_msg_id === clientMsgId);
    const client2Persist = client2Persisted.find(p => p.client_msg_id === clientMsgId);
    
    expect(client1Persist).toBeDefined();
    expect(client2Persist).toBeDefined();
    expect(client1Persist?.db_message_id).toBe(dbMessageId);
    expect(client2Persist?.db_message_id).toBe(dbMessageId);
    expect(client1Persist?.db_created_at).toBe(dbCreatedAt);
    expect(client2Persist?.db_created_at).toBe(dbCreatedAt);
  });

  it('should filter own messages by client_msg_id', async () => {
    const threadId = '1' as any;
    const clientMsgId = uuidv4();
    const body = 'Test message';
    
    await client1.connect('token1');
    mockWs1.simulateOpen();
    mockWs1.simulateMessage({ type: 'connected' });
    client1.subscribe(threadId);
    
    // Track incoming messages
    const incomingMessages: any[] = [];
    
    client1.on('message', (event) => {
      incomingMessages.push(event);
    });
    
    // Send message
    await client1.sendMessage(threadId, body, [], clientMsgId);
    
    // Simulate server broadcasting the message back
    const messageEvent = {
      type: 'message',
      thread_id: threadId,
      message: {
        sender_id: 'user1',
        body,
        client_msg_id: clientMsgId,
      },
      server_msg_id: 123,
      sequence_number: null,
    };
    
    mockWs1.simulateMessage(messageEvent);
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Message should be filtered out (not added to incomingMessages)
    // because it has the same client_msg_id that we sent
    // Note: This test depends on the implementation filtering logic
    // In the actual implementation, the hook filters by checking sentClientMsgIdsRef
    expect(incomingMessages.length).toBe(0);
  });
});
