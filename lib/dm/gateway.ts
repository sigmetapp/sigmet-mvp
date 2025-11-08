/**
 * WebSocket Gateway for Real-time Dialog System
 *
 * Handles persistent WebSocket connections for:
 * - Message sending/receiving
 * - Typing indicators
 * - Presence events
 * - Message acknowledgments
 * - Reconnect and offline support
 */

import { randomUUID } from "crypto";
import { Server as HTTPServer } from "http";
import { Server as WebSocketServer, WebSocket } from "ws";
import { createClient } from "@supabase/supabase-js";
import { assertThreadId, type ThreadId } from "./threadId";
import type {
  DeliveryStatus,
  GatewayBroker,
  GatewayBrokerEvent,
} from "./broker";
import { inferMessageKind } from "./messageKind";
import { broadcastDmMessage } from "./realtimeServer";
import { getMessageQueue } from "./messageQueue";
import { incrementCounter, setGauge, recordTimer } from "./metrics";

// Connection state
interface Connection {
  ws: WebSocket;
  userId: string;
  connectedAt: number;
  lastPing: number;
  subscribedThreads: Set<ThreadId>;
}

type GatewayOptions = {
  broker?: GatewayBroker | null;
  logger?: Pick<Console, "log" | "error" | "warn">;
  redis?: { host?: string; port?: number; password?: string; url?: string };
};

const gatewayInstanceId = randomUUID();
let activeBroker: GatewayBroker | null = null;
let brokerUnsubscribe: (() => void) | null = null;
let gatewayLogger: Pick<Console, "log" | "error" | "warn"> = console;
let messageQueue: ReturnType<typeof getMessageQueue> | null = null;

/**
 * Convert thread_id to conversation_id (uuid format)
 * Uses a deterministic approach to convert thread_id (bigint) to UUID
 * In production, consider using UUID v5 with a namespace or a mapping table
 */
function threadIdToConversationId(threadId: ThreadId): string {
  // Convert thread_id to a deterministic UUID
  // For bigint thread_id, we'll create a UUID v5 namespace-like approach
  // Using a simple approach: pad thread_id and create UUID-like string
  const threadIdStr = String(threadId);
  // Create a deterministic UUID from thread_id
  // Pad to 32 hex characters (UUID length without dashes)
  const padded = threadIdStr.padStart(32, "0").slice(0, 32);
  // Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  return `${padded.slice(0, 8)}-${padded.slice(8, 12)}-${padded.slice(12, 16)}-${padded.slice(16, 20)}-${padded.slice(20, 32)}`;
}

// Message types
export type GatewayMessage =
  | { type: "ping" }
  | { type: "pong" }
  | { type: "auth"; token: string }
  | { type: "subscribe"; thread_id: ThreadId }
  | { type: "unsubscribe"; thread_id: ThreadId }
  | {
      type: "send_message";
      thread_id: ThreadId;
      body: string | null;
      attachments: unknown[];
      client_msg_id: string;
    }
  | { type: "typing"; thread_id: ThreadId; typing: boolean }
  | {
      type: "ack";
      message_id: number;
      thread_id: ThreadId;
      status?: DeliveryStatus;
      client_msg_id?: string | null;
    }
  | { type: "sync"; thread_id: ThreadId; last_server_msg_id: number | null };

export type GatewayEvent =
  | {
      type: "message";
      thread_id: ThreadId;
      message: any;
      server_msg_id: number;
      sequence_number: number | null;
    }
  | { type: "typing"; thread_id: ThreadId; user_id: string; typing: boolean }
  | { type: "presence"; thread_id: ThreadId; user_id: string; online: boolean }
  | {
      type: "ack";
      message_id: number;
      thread_id: ThreadId;
      user_id: string;
      status: DeliveryStatus;
      client_msg_id?: string | null;
    }
  | {
      type: "message_ack";
      conversation_id: string;
      client_msg_id: string;
      timestamp: number;
    }
  | {
      type: "message_persisted";
      conversation_id: string;
      client_msg_id: string;
      db_message_id: string;
      db_created_at: string;
    }
  | { type: "error"; error: string; code?: string }
  | { type: "connected" }
  | {
      type: "sync_response";
      thread_id: ThreadId;
      messages: any[];
      last_server_msg_id: number | null;
    };

// Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let supabaseService: ReturnType<typeof createClient> | null = null;

function getSupabaseService() {
  if (!supabaseService) {
    supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseService;
}

// Connection management
const connections = new Map<WebSocket, Connection>();
const userConnections = new Map<string, Set<WebSocket>>();
const threadSubscribers = new Map<ThreadId, Set<WebSocket>>();

// Update connection metrics
function updateConnectionMetrics(): void {
  setGauge("dm.connections", connections.size);
  setGauge(
    "dm.connections.authenticated",
    Array.from(connections.values()).filter((c) => c.userId).length,
  );
  setGauge("dm.threads.subscribed", threadSubscribers.size);
}

// Send message to WebSocket
function send(ws: WebSocket, event: GatewayEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function normalizeMessageRow(raw: any): any {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const normalized = { ...raw };

  if ("id" in normalized) {
    normalized.id =
      typeof normalized.id === "string"
        ? parseInt(normalized.id, 10)
        : Number(normalized.id);
  }

  if (
    "sequence_number" in normalized &&
    normalized.sequence_number !== null &&
    normalized.sequence_number !== undefined
  ) {
    normalized.sequence_number =
      typeof normalized.sequence_number === "string"
        ? parseInt(normalized.sequence_number, 10)
        : Number(normalized.sequence_number);
  }

  if (!Array.isArray(normalized.attachments)) {
    normalized.attachments = [];
  }

  return normalized;
}

async function publishBrokerEvent(
  event: Omit<GatewayBrokerEvent, "origin">,
): Promise<void> {
  if (!activeBroker) {
    return;
  }

  const startTime = Date.now();
  try {
    const payload = {
      ...event,
      origin: gatewayInstanceId,
    } as GatewayBrokerEvent;
    await activeBroker.publish(payload);

    // Record success metrics
    const latency = Date.now() - startTime;
    recordTimer("dm.broker.publish.latency", latency, { kind: event.kind });
    incrementCounter("dm.broker.events.published", { kind: event.kind });
  } catch (error) {
    gatewayLogger.error("Gateway broker publish error:", error);

    // Record error metrics
    const latency = Date.now() - startTime;
    recordTimer("dm.broker.publish.latency", latency, {
      kind: event.kind,
      error: "true",
    });
    incrementCounter("dm.broker.events.publish_failed", { kind: event.kind });
    incrementCounter("dm.errors", { type: "broker_publish" });
  }
}

async function handleBrokerEvent(event: GatewayBrokerEvent): Promise<void> {
  if (event.origin === gatewayInstanceId) {
    return;
  }

  // Record broker event received
  incrementCounter("dm.broker.events.received", { kind: event.kind });

  switch (event.kind) {
    case "message": {
      const normalized = normalizeMessageRow(event.message);
      const serverMsgId = Number(event.server_msg_id);

      // Record message received from broker
      incrementCounter("dm.messages.received", {
        thread_id: String(event.thread_id),
        source: "broker",
      });

      broadcastToThread(event.thread_id, {
        type: "message",
        thread_id: event.thread_id,
        message: normalized,
        server_msg_id: serverMsgId,
        sequence_number:
          event.sequence_number ?? normalized?.sequence_number ?? null,
      });
      break;
    }
    case "ack": {
      broadcastToThread(event.thread_id, {
        type: "ack",
        message_id: event.message_id,
        thread_id: event.thread_id,
        user_id: event.user_id,
        status: event.status,
        client_msg_id: event.client_msg_id ?? null,
      });
      break;
    }
    case "typing": {
      broadcastToThread(event.thread_id, {
        type: "typing",
        thread_id: event.thread_id,
        user_id: event.user_id,
        typing: event.typing,
      });
      break;
    }
    case "presence": {
      broadcastToThread(event.thread_id, {
        type: "presence",
        thread_id: event.thread_id,
        user_id: event.user_id,
        online: event.online,
      });
      break;
    }
    case "message_ack": {
      // Broadcast message_ack to all thread subscribers
      // Find thread_id from conversation_id
      const conversationId = event.conversation_id;
      for (const [threadId, subscribers] of threadSubscribers.entries()) {
        const threadConversationId = threadIdToConversationId(threadId);
        if (threadConversationId === conversationId) {
          const eventMessage: GatewayEvent = {
            type: "message_ack",
            conversation_id: conversationId,
            client_msg_id: event.client_msg_id,
            timestamp: event.timestamp,
          };
          broadcastToThread(threadId, eventMessage);
          break;
        }
      }
      break;
    }
    case "message_persisted": {
      // Find thread_id from conversation_id (reverse mapping)
      // Broadcast message_persisted event to all thread subscribers
      const conversationId = event.conversation_id;
      for (const [threadId, subscribers] of threadSubscribers.entries()) {
        const threadConversationId = threadIdToConversationId(threadId);
        if (threadConversationId === conversationId) {
          const eventMessage: GatewayEvent = {
            type: "message_persisted",
            conversation_id: conversationId,
            client_msg_id: event.client_msg_id,
            db_message_id: event.db_message_id,
            db_created_at: event.db_created_at,
          };
          broadcastToThread(threadId, eventMessage);
          break;
        }
      }
      break;
    }
    default:
      break;
  }
}

function attachBroker(broker: GatewayBroker) {
  if (brokerUnsubscribe) {
    brokerUnsubscribe();
    brokerUnsubscribe = null;
  }

  activeBroker = broker;

  void (async () => {
    try {
      brokerUnsubscribe = await broker.subscribe(handleBrokerEvent);
    } catch (error) {
      gatewayLogger.error("Gateway broker subscribe error:", error);
    }
  })();
}

function emitSentAck(
  conn: Connection,
  threadId: ThreadId,
  serverMsgId: number,
  clientMsgId: string | null,
) {
  if (!clientMsgId) {
    return;
  }

  const ackEvent: GatewayEvent = {
    type: "ack",
    message_id: serverMsgId,
    thread_id: threadId,
    user_id: conn.userId,
    status: "sent",
    client_msg_id: clientMsgId,
  };

  const sockets = userConnections.get(conn.userId);
  if (sockets) {
    for (const ws of sockets) {
      send(ws, ackEvent);
    }
  } else {
    send(conn.ws, ackEvent);
  }
}

function deliverMessageToThread(
  conn: Connection,
  threadId: ThreadId,
  rawMessage: any,
  clientMsgId: string | null,
): { serverMsgId: number; normalized: any } {
  const messageWithClientId = {
    ...rawMessage,
    client_msg_id: rawMessage?.client_msg_id ?? clientMsgId ?? null,
  };

  const normalized = normalizeMessageRow(messageWithClientId);
  const serverMsgId =
    typeof normalized.id === "string"
      ? parseInt(normalized.id, 10)
      : Number(normalized.id);
  const sequenceNumber = normalized.sequence_number ?? null;

  broadcastToThread(threadId, {
    type: "message",
    thread_id: threadId,
    message: normalized,
    server_msg_id: serverMsgId,
    sequence_number: sequenceNumber,
  });

  emitSentAck(
    conn,
    threadId,
    serverMsgId,
    normalized.client_msg_id ?? clientMsgId ?? null,
  );

  void publishBrokerEvent({
    kind: "message",
    thread_id: threadId,
    server_msg_id: serverMsgId,
    sequence_number: sequenceNumber,
    message: normalized,
  });

  void broadcastDmMessage(threadId, normalized).catch((err) => {
    gatewayLogger.warn("Broadcast message mirror failed:", err);
  });

  return { serverMsgId, normalized };
}

// Broadcast to thread subscribers
function broadcastToThread(
  threadId: ThreadId,
  event: GatewayEvent,
  exclude?: WebSocket,
) {
  const subscribers = threadSubscribers.get(threadId);
  if (!subscribers) return;

  const message = JSON.stringify(event);
  let sentCount = 0;
  const startTime = Date.now();

  for (const ws of subscribers) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
        sentCount++;
      } catch (error) {
        console.error("Error sending message to WebSocket:", error);
        incrementCounter("dm.errors", { type: "websocket_send" });
      }
    }
  }

  // Record metrics
  if (sentCount > 0) {
    incrementCounter("dm.messages.broadcast", { thread_id: String(threadId) });
    const latency = Date.now() - startTime;
    recordTimer("dm.broadcast.latency", latency, {
      thread_id: String(threadId),
    });
  }
}

// Authenticate user from token
async function authenticate(token: string): Promise<{ userId: string } | null> {
  const startTime = Date.now();
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    const latency = Date.now() - startTime;
    recordTimer("dm.auth.latency", latency);

    if (error || !user) {
      incrementCounter("dm.auth.failed");
      return null;
    }

    incrementCounter("dm.auth.success");
    return { userId: user.id };
  } catch (error) {
    const latency = Date.now() - startTime;
    recordTimer("dm.auth.latency", latency);
    incrementCounter("dm.auth.failed", { error: "exception" });
    return null;
  }
}

// Handle message sending (dual-channel architecture)
async function handleSendMessage(
  conn: Connection,
  threadId: ThreadId,
  body: string | null,
  attachments: unknown[],
  clientMsgId: string,
) {
  const startTime = Date.now();
  try {
    incrementCounter("dm.messages.send.attempted", {
      thread_id: String(threadId),
    });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      send(conn.ws, {
        type: "error",
        error: "Service role key not configured",
        code: "CONFIG_ERROR",
      });
      return;
    }

    const serviceClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify membership and get recipient
    const [membershipResult, participantsResult] = await Promise.all([
      serviceClient
        .from("dms_thread_participants")
        .select("thread_id")
        .eq("thread_id", threadId)
        .eq("user_id", conn.userId)
        .maybeSingle(),
      serviceClient
        .from("dms_thread_participants")
        .select("user_id")
        .eq("thread_id", threadId),
    ]);

    const { data: membership } = membershipResult;
    if (!membership) {
      send(conn.ws, { type: "error", error: "Forbidden", code: "FORBIDDEN" });
      return;
    }

    // Get recipient (other participant)
    const participants = (participantsResult.data || []) as any[];
    const recipientId = participants
      .map((p: any) => p.user_id as string)
      .find((uid: string) => uid && uid !== conn.userId);

    if (!recipientId) {
      send(conn.ws, {
        type: "error",
        error: "No recipient found",
        code: "NO_RECIPIENT",
      });
      return;
    }

    // Convert thread_id to conversation_id
    const conversationId = threadIdToConversationId(threadId);

    // Prepare message body
    const attachmentsJsonb =
      Array.isArray(attachments) && attachments.length > 0
        ? JSON.parse(JSON.stringify(attachments))
        : [];
    const messageBody = body || (attachmentsJsonb.length > 0 ? "\u200B" : "");

    // STEP 1: Immediately broadcast message_ack to room (both clients)
    // This happens before DB write for instant feedback
    const ackEvent: GatewayEvent = {
      type: "message_ack",
      conversation_id: conversationId,
      client_msg_id: clientMsgId,
      timestamp: Date.now(),
    };
    // Broadcast to all subscribers of this thread
    broadcastToThread(threadId, ackEvent);

    // Also publish via broker for multi-instance support
    void publishBrokerEvent({
      kind: "message_ack",
      origin: gatewayInstanceId,
      conversation_id: conversationId,
      client_msg_id: clientMsgId,
      timestamp: Date.now(),
    });

    const messageKind = inferMessageKind(attachmentsJsonb);

    // STEP 2: Persist message immediately for legacy clients and unread counts
    let persistedMessage: any = null;
    let persistError: unknown = null;

    try {
      const rpcResult = await (serviceClient as any).rpc?.(
        "insert_dms_message",
        {
          p_thread_id: threadId,
          p_sender_id: conn.userId,
          p_body:
            messageBody || (attachmentsJsonb.length > 0 ? "\u200B" : null),
          p_kind: messageKind,
          p_attachments: attachmentsJsonb,
          p_client_msg_id: clientMsgId ?? null,
        },
      );

      if (rpcResult?.error) {
        persistError = rpcResult.error;
      } else if (rpcResult?.data) {
        persistedMessage = rpcResult.data;
      }
    } catch (rpcErr) {
      persistError = rpcErr;
    }

    if (!persistedMessage) {
      const fallbackBody =
        messageBody || (attachmentsJsonb.length > 0 ? "\u200B" : null);
      const { data: fallbackMsg, error: fallbackErr } = await serviceClient
        .from("dms_messages")
        .insert({
          thread_id: threadId,
          sender_id: conn.userId,
          kind: messageKind,
          body: fallbackBody,
          attachments: attachmentsJsonb,
          client_msg_id: clientMsgId ?? null,
        })
        .select("*")
        .single();

      if (fallbackErr || !fallbackMsg) {
        const composedError = (persistError as Error | null) || fallbackErr;
        throw composedError ?? new Error("Failed to persist message");
      }

      persistedMessage = fallbackMsg;
    }

    if (clientMsgId && !persistedMessage.client_msg_id) {
      persistedMessage = {
        ...persistedMessage,
        client_msg_id: clientMsgId,
      };
    }

    const normalizedMessage = {
      ...persistedMessage,
      thread_id: persistedMessage.thread_id ?? threadId,
      attachments: Array.isArray(persistedMessage.attachments)
        ? persistedMessage.attachments
        : attachmentsJsonb,
      body: persistedMessage.body ?? messageBody,
      kind: persistedMessage.kind ?? messageKind,
    };

    const persistedMessageId =
      typeof normalizedMessage.id === "string"
        ? parseInt(normalizedMessage.id, 10)
        : Number(normalizedMessage.id);

    if (!Number.isFinite(persistedMessageId)) {
      throw new Error("Invalid message id after persistence");
    }

    // Update thread metadata asynchronously
    void serviceClient
      .from("dms_threads")
      .update({
        last_message_id: normalizedMessage.id,
        last_message_at: normalizedMessage.created_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId)
      .then(() => undefined)
      .catch((threadErr: unknown) => {
        gatewayLogger.warn("Failed to update thread metadata:", threadErr);
      });

    // Create receipts for all other participants
    const recipientIds = participants
      .map((p: any) => p.user_id as string)
      .filter((uid: string) => uid && uid !== conn.userId);

    if (recipientIds.length > 0) {
      const nowIso = new Date().toISOString();
      const receipts = recipientIds.map((uid) => ({
        message_id: persistedMessageId,
        user_id: uid,
        status: "sent",
        created_at: nowIso,
        updated_at: nowIso,
      }));

      void serviceClient
        .from("dms_message_receipts")
        .upsert(receipts, {
          onConflict: "message_id,user_id",
          ignoreDuplicates: false,
        })
        .then(() => undefined)
        .catch((receiptErr: unknown) => {
          gatewayLogger.warn("Failed to create message receipts:", receiptErr);
        });
    }

    // Broadcast message to subscribers immediately (WebSocket + broker + Supabase fallback)
    const { serverMsgId } = deliverMessageToThread(
      conn,
      threadId,
      normalizedMessage,
      clientMsgId,
    );

    // STEP 3: Queue message for async persistence into new message pipeline (best-effort)
    if (messageQueue) {
      try {
        await messageQueue.add("persist", {
          conversationId,
          senderId: conn.userId,
          recipientId,
          clientMsgId,
          body: messageBody,
          meta: {
            attachments: attachmentsJsonb,
            thread_id: String(threadId),
            legacy_message_id: serverMsgId,
          },
        });
      } catch (queueError) {
        gatewayLogger.error(
          "Failed to queue message for persistence:",
          queueError,
        );
      }
    } else {
      gatewayLogger.log(
        "Message queue not initialized; skipping dual-channel persistence",
      );
    }

    // Record success metrics
    const latency = Date.now() - startTime;
    recordTimer("dm.message.send.latency", latency, {
      thread_id: String(threadId),
    });
    incrementCounter("dm.messages.send.success", {
      thread_id: String(threadId),
    });
  } catch (err: any) {
    gatewayLogger.error("Send message error:", err);

    // Record error metrics
    const latency = Date.now() - startTime;
    recordTimer("dm.message.send.latency", latency, {
      thread_id: String(threadId),
      error: "true",
    });
    incrementCounter("dm.messages.send.failed", {
      thread_id: String(threadId),
      error: err?.code || "unknown",
    });
    incrementCounter("dm.errors", {
      type: "send_message",
      thread_id: String(threadId),
    });

    // Use centralized error handling
    const { handleDmError } = require("./errorHandler");
    handleDmError(err, {
      component: "gateway",
      action: "send_message",
      threadId: String(threadId),
      userId: conn.userId,
    });

    send(conn.ws, {
      type: "error",
      error: err?.message || "Internal error",
      code: "INTERNAL_ERROR",
    });
  }
}

// Handle message sync (for reconnect/offline)
// Uses sequence_number for reliable ordering and synchronization
async function handleSync(
  conn: Connection,
  threadId: ThreadId,
  lastServerMsgId: number | null,
) {
  try {
    const supabase = getSupabaseService();

    // Verify membership
    const { data: membership } = await supabase
      .from("dms_thread_participants")
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("user_id", conn.userId)
      .maybeSingle();

    if (!membership) {
      send(conn.ws, { type: "error", error: "Forbidden", code: "FORBIDDEN" });
      return;
    }

    // Get last sequence_number from last_server_msg_id if provided
    let lastSequenceNumber: number | null = null;
    if (lastServerMsgId !== null) {
      const { data: lastMessage } = await supabase
        .from("dms_messages")
        .select("sequence_number")
        .eq("thread_id", threadId)
        .eq("id", lastServerMsgId)
        .maybeSingle();

      if (lastMessage?.sequence_number) {
        lastSequenceNumber =
          typeof lastMessage.sequence_number === "string"
            ? parseInt(lastMessage.sequence_number, 10)
            : Number(lastMessage.sequence_number);
      }
    }

    // Fetch messages after last sequence_number (more reliable than id)
    let query = supabase
      .from("dms_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("sequence_number", { ascending: true })
      .order("id", { ascending: true }); // Fallback ordering by id

    if (lastSequenceNumber !== null) {
      query = query.gt("sequence_number", lastSequenceNumber);
    } else if (lastServerMsgId !== null) {
      // Fallback to id-based sync if sequence_number not available
      query = query.gt("id", lastServerMsgId);
    }

    const { data: messages, error } = await query.limit(100);

    if (error) {
      send(conn.ws, {
        type: "error",
        error: error.message,
        code: "SYNC_FAILED",
      });
      return;
    }

    // Calculate last_server_msg_id and last_sequence_number
    let lastId = lastServerMsgId;
    let lastSeq = lastSequenceNumber;

    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1]!;
      lastId =
        typeof lastMsg.id === "string"
          ? parseInt(lastMsg.id, 10)
          : Number(lastMsg.id);
      if (
        lastMsg.sequence_number !== null &&
        lastMsg.sequence_number !== undefined
      ) {
        lastSeq =
          typeof lastMsg.sequence_number === "string"
            ? parseInt(lastMsg.sequence_number, 10)
            : Number(lastMsg.sequence_number);
      }
    }

    send(conn.ws, {
      type: "sync_response",
      thread_id: threadId,
      messages: messages || [],
      last_server_msg_id: lastId,
    });
  } catch (err: any) {
    // Use centralized error handling
    const { handleDmError } = require("./errorHandler");
    handleDmError(err, {
      component: "gateway",
      action: "sync",
      threadId: String(threadId),
      userId: conn.userId,
    });

    send(conn.ws, {
      type: "error",
      error: err?.message || "Internal error",
      code: "INTERNAL_ERROR",
    });
  }
}

// Handle typing indicator
async function handleTyping(
  conn: Connection,
  threadId: ThreadId,
  typing: boolean,
) {
  // Broadcast to other subscribers
  broadcastToThread(
    threadId,
    {
      type: "typing",
      thread_id: threadId,
      user_id: conn.userId,
      typing,
    },
    conn.ws,
  );

  void publishBrokerEvent({
    kind: "typing",
    thread_id: threadId,
    user_id: conn.userId,
    typing,
  });
}

// Handle message acknowledgment
async function handleAck(
  conn: Connection,
  messageId: number,
  threadId: ThreadId,
  status: DeliveryStatus = "delivered",
  clientMsgId: string | null = null,
) {
  try {
    const supabase = getSupabaseService();

    // Update receipt
    await supabase.from("dms_message_receipts").upsert(
      {
        message_id: messageId,
        user_id: conn.userId,
        status,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "message_id,user_id",
      },
    );

    if (status === "read") {
      try {
        await supabase
          .from("dms_thread_participants")
          .update({
            last_read_message_id: messageId,
            last_read_at: new Date().toISOString(),
          })
          .eq("thread_id", threadId)
          .eq("user_id", conn.userId);
      } catch (updateErr) {
        gatewayLogger.warn("Ack read update warning:", updateErr);
      }
    }

    // Broadcast acknowledgment
    broadcastToThread(threadId, {
      type: "ack",
      message_id: messageId,
      thread_id: threadId,
      user_id: conn.userId,
      status,
      client_msg_id: clientMsgId,
    });

    void publishBrokerEvent({
      kind: "ack",
      thread_id: threadId,
      message_id: messageId,
      user_id: conn.userId,
      status,
      client_msg_id: clientMsgId,
    });
  } catch (err: any) {
    console.error("Ack error:", err);
  }
}

// Subscribe to thread
function subscribeToThread(conn: Connection, threadId: ThreadId) {
  conn.subscribedThreads.add(threadId);

  let subscribers = threadSubscribers.get(threadId);
  if (!subscribers) {
    subscribers = new Set();
    threadSubscribers.set(threadId, subscribers);
  }
  subscribers.add(conn.ws);

  // Update metrics
  updateConnectionMetrics();
  incrementCounter("dm.threads.subscribed", { thread_id: String(threadId) });
}

// Unsubscribe from thread
function unsubscribeFromThread(conn: Connection, threadId: ThreadId) {
  conn.subscribedThreads.delete(threadId);

  const subscribers = threadSubscribers.get(threadId);
  if (subscribers) {
    subscribers.delete(conn.ws);
    if (subscribers.size === 0) {
      threadSubscribers.delete(threadId);
    }
  }

  // Update metrics
  updateConnectionMetrics();
  incrementCounter("dm.threads.unsubscribed", { thread_id: String(threadId) });
}

// Handle WebSocket message
async function handleMessage(conn: Connection, data: string) {
  try {
    const msg: GatewayMessage = JSON.parse(data);

    switch (msg.type) {
      case "ping":
        send(conn.ws, { type: "pong" } as any);
        conn.lastPing = Date.now();
        break;

      case "pong":
        conn.lastPing = Date.now();
        break;

      case "auth":
        const auth = await authenticate(msg.token);
        if (auth) {
          conn.userId = auth.userId;

          // Add to user connections
          let userConns = userConnections.get(auth.userId);
          if (!userConns) {
            userConns = new Set();
            userConnections.set(auth.userId, userConns);
          }
          userConns.add(conn.ws);

          // Update metrics
          updateConnectionMetrics();
          incrementCounter("dm.connections.authenticated");

          send(conn.ws, { type: "connected" });
        } else {
          incrementCounter("dm.connections.auth_failed");
          send(conn.ws, {
            type: "error",
            error: "Authentication failed",
            code: "AUTH_FAILED",
          });
        }
        break;

      case "subscribe":
        if (!conn.userId) {
          send(conn.ws, {
            type: "error",
            error: "Not authenticated",
            code: "NOT_AUTHENTICATED",
          });
          break;
        }
        subscribeToThread(conn, msg.thread_id);
        break;

      case "unsubscribe":
        unsubscribeFromThread(conn, msg.thread_id);
        break;

      case "send_message":
        if (!conn.userId) {
          send(conn.ws, {
            type: "error",
            error: "Not authenticated",
            code: "NOT_AUTHENTICATED",
          });
          break;
        }
        await handleSendMessage(
          conn,
          msg.thread_id,
          msg.body,
          msg.attachments,
          msg.client_msg_id,
        );
        break;

      case "typing":
        if (!conn.userId) {
          send(conn.ws, {
            type: "error",
            error: "Not authenticated",
            code: "NOT_AUTHENTICATED",
          });
          break;
        }
        await handleTyping(conn, msg.thread_id, msg.typing);
        break;

      case "ack":
        if (!conn.userId) {
          send(conn.ws, {
            type: "error",
            error: "Not authenticated",
            code: "NOT_AUTHENTICATED",
          });
          break;
        }
        {
          const rawStatus = msg.status;
          const status: DeliveryStatus =
            rawStatus === "read" ? "read" : "delivered";
          const clientMsgId = msg.client_msg_id ?? null;
          await handleAck(
            conn,
            msg.message_id,
            msg.thread_id,
            status,
            clientMsgId,
          );
        }
        break;

      case "sync":
        if (!conn.userId) {
          send(conn.ws, {
            type: "error",
            error: "Not authenticated",
            code: "NOT_AUTHENTICATED",
          });
          break;
        }
        await handleSync(conn, msg.thread_id, msg.last_server_msg_id);
        break;

      default:
        send(conn.ws, {
          type: "error",
          error: "Unknown message type",
          code: "UNKNOWN_TYPE",
        });
    }
  } catch (err: any) {
    send(conn.ws, {
      type: "error",
      error: err?.message || "Invalid message",
      code: "INVALID_MESSAGE",
    });
  }
}

// Cleanup connection
function cleanupConnection(ws: WebSocket) {
  const conn = connections.get(ws);
  if (!conn) return;

  // Remove from user connections
  if (conn.userId) {
    const userConns = userConnections.get(conn.userId);
    if (userConns) {
      userConns.delete(ws);
      if (userConns.size === 0) {
        userConnections.delete(conn.userId);
      }
    }
  }

  // Unsubscribe from all threads
  for (const threadId of conn.subscribedThreads) {
    unsubscribeFromThread(conn, threadId);
  }

  connections.delete(ws);

  // Update metrics
  updateConnectionMetrics();
  incrementCounter("dm.connections.closed");
}

// Initialize WebSocket server
export function initGateway(server: HTTPServer, options: GatewayOptions = {}) {
  gatewayLogger = options.logger ?? console;

  // Initialize message queue if Redis config provided
  if (options.redis) {
    messageQueue = getMessageQueue(options.redis);
    gatewayLogger.log("Message queue initialized");
  }

  // Initialize Redis broker if Redis config provided
  if (options.redis && !options.broker) {
    (async () => {
      try {
        // Try to create Redis broker
        const Redis = (await import("ioredis")).default;
        const redisUrl =
          options.redis.url ||
          (options.redis.host && options.redis.port
            ? `redis://${options.redis.password ? `:${options.redis.password}@` : ""}${options.redis.host}:${options.redis.port}`
            : process.env.REDIS_URL);

        if (redisUrl) {
          const redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: null,
            lazyConnect: true,
          });

          await redisClient.connect();

          const { createRedisBroker } = await import("./broker");
          const broker = createRedisBroker(redisClient, {
            stream: "dm:events",
            group: "gateway",
            consumer: `gateway-${gatewayInstanceId}`,
            blockMs: 1000,
            batchSize: 50,
          });

          attachBroker(broker);
          gatewayLogger.log("Redis broker initialized");
        }
      } catch (error) {
        gatewayLogger.warn(
          "Failed to initialize Redis broker, continuing without it:",
          error,
        );
      }
    })();
  }

  if (options.broker) {
    attachBroker(options.broker);
  }

  const wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws: WebSocket) => {
    const conn: Connection = {
      ws,
      userId: "",
      connectedAt: Date.now(),
      lastPing: Date.now(),
      subscribedThreads: new Set(),
    };

    connections.set(ws, conn);

    // Update metrics
    updateConnectionMetrics();
    incrementCounter("dm.connections.opened");

    // Handle messages
    ws.on("message", (data: Buffer) => {
      handleMessage(conn, data.toString());
    });

    // Handle close
    ws.on("close", () => {
      cleanupConnection(ws);
    });

    // Handle error
    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      cleanupConnection(ws);
    });

    // Ping/pong keepalive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        send(ws, { type: "ping" });

        // Check if connection is stale (no pong in 60 seconds)
        if (Date.now() - conn.lastPing > 60000) {
          ws.close();
          clearInterval(pingInterval);
        }
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // Ping every 30 seconds
  });

  gatewayLogger.log("WebSocket gateway initialized on /api/ws", {
    id: gatewayInstanceId,
  });

  // Initialize metrics
  updateConnectionMetrics();

  // Periodic metrics update (every 30 seconds)
  const metricsInterval = setInterval(() => {
    updateConnectionMetrics();
  }, 30000);

  // Cleanup on server shutdown
  process.on("SIGTERM", () => {
    clearInterval(metricsInterval);
  });
  process.on("SIGINT", () => {
    clearInterval(metricsInterval);
  });

  return wss;
}

// Broadcast presence update
export function broadcastPresence(
  threadId: ThreadId,
  userId: string,
  online: boolean,
) {
  broadcastToThread(threadId, {
    type: "presence",
    thread_id: threadId,
    user_id: userId,
    online,
  });

  void publishBrokerEvent({
    kind: "presence",
    thread_id: threadId,
    user_id: userId,
    online,
  });
}
