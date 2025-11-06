/**
 * BullMQ Queue for Message Persistence
 * 
 * Creates and manages the queue for async message persistence.
 */

import { Queue } from 'bullmq';
import type { PersistMessageJobData } from './messageWorker';

let messageQueue: Queue<PersistMessageJobData> | null = null;

export function getMessageQueue(
  connection: { host?: string; port?: number; password?: string }
): Queue<PersistMessageJobData> {
  if (!messageQueue) {
    messageQueue = new Queue<PersistMessageJobData>('persistMessage', {
      connection: {
        host: connection.host || 'localhost',
        port: connection.port || 6379,
        password: connection.password,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          count: 1000,
          age: 24 * 3600, // 24 hours
        },
        removeOnFail: {
          count: 5000,
          age: 7 * 24 * 3600, // 7 days
        },
      },
    });
  }
  return messageQueue;
}
