/**
 * BullMQ Worker for Message Persistence
 * 
 * Handles async persistence of messages to the database with deduplication.
 * Processes tasks from the 'persistMessage' queue.
 */

import { Worker, Job } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import type { GatewayBroker } from './broker';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let supabaseService: ReturnType<typeof createClient> | null = null;

function getSupabaseService() {
  if (!supabaseService) {
    supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseService;
}

export type PersistMessageJobData = {
  conversationId: string;
  senderId: string;
  recipientId: string;
  clientMsgId: string;
  body: string;
  meta?: Record<string, any>;
};

export type PersistMessageResult = {
  dbMessageId: string;
  dbCreatedAt: string;
};

/**
 * Process a message persistence job
 */
async function processPersistMessage(
  job: Job<PersistMessageJobData>
): Promise<PersistMessageResult> {
  const { conversationId, senderId, recipientId, clientMsgId, body, meta = {} } = job.data;

  const supabase = getSupabaseService();

  // Insert with ON CONFLICT DO NOTHING for deduplication
  // The unique index on (conversation_id, client_msg_id) will prevent duplicates
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      recipient_id: recipientId,
      client_msg_id: clientMsgId,
      body,
      meta,
    })
    .select('id, created_at')
    .single();

  if (error) {
    // Check if it's a unique constraint violation (duplicate)
    if (error.code === '23505' || error.message?.includes('duplicate')) {
      // Message already exists, fetch it
      const { data: existingMessage, error: fetchError } = await supabase
        .from('messages')
        .select('id, created_at')
        .eq('conversation_id', conversationId)
        .eq('client_msg_id', clientMsgId)
        .single();

      if (fetchError || !existingMessage) {
        throw new Error(`Failed to fetch existing message: ${fetchError?.message || 'Not found'}`);
      }

      return {
        dbMessageId: existingMessage.id,
        dbCreatedAt: existingMessage.created_at,
      };
    }

    throw new Error(`Failed to persist message: ${error.message}`);
  }

  if (!message) {
    throw new Error('Message insert returned no data');
  }

  return {
    dbMessageId: message.id,
    dbCreatedAt: message.created_at,
  };
}

/**
 * Create and start a BullMQ worker for message persistence
 */
export function createMessageWorker(
  connection: { host?: string; port?: number; password?: string },
  broker?: GatewayBroker
): Worker<PersistMessageJobData, PersistMessageResult> {
  const worker = new Worker<PersistMessageJobData, PersistMessageResult>(
    'persistMessage',
    async (job) => {
      const result = await processPersistMessage(job);
      
      // Emit message_persisted event via broker if available
      if (broker) {
        try {
          await broker.publish({
            kind: 'message_persisted',
            origin: 'worker',
            conversation_id: job.data.conversationId,
            client_msg_id: job.data.clientMsgId,
            db_message_id: result.dbMessageId,
            db_created_at: result.dbCreatedAt,
          });
        } catch (error) {
          console.error('Failed to publish message_persisted event:', error);
        }
      }

      return result;
    },
    {
      connection: {
        host: connection.host || 'localhost',
        port: connection.port || 6379,
        password: connection.password,
      },
      concurrency: 10,
      removeOnComplete: {
        count: 1000,
        age: 24 * 3600, // 24 hours
      },
      removeOnFail: {
        count: 5000,
        age: 7 * 24 * 3600, // 7 days
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[MessageWorker] Message persisted: ${job.data.clientMsgId} -> ${job.returnvalue.dbMessageId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[MessageWorker] Failed to persist message ${job?.data.clientMsgId}:`, err);
  });

  return worker;
}
