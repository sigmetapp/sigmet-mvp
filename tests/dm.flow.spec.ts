import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// Shared mutable auth identity for the mock
let CURRENT_USER_ID = 'userA';

// Minimal response helper
function createRes() {
  const res: Partial<NextApiResponse> & { statusCode?: number; jsonBody?: any } = {};
  res.status = ((code: number) => {
    res.statusCode = code;
    return res as NextApiResponse;
  }) as any;
  res.json = ((body: any) => {
    res.jsonBody = body;
    return res as NextApiResponse;
  }) as any;
  return res as NextApiResponse & { statusCode?: number; jsonBody?: any };
}

// In-memory DB-ish state for this test
const state = {
  threadId: 'thread-1',
  messages: [] as Array<{ id: number; thread_id: string; sender_id: string }>,
  nextMsgId: 1000,
  receiptsUpdates: [] as Array<{ user_id: string; status: string; message_ids: number[] }>,
};

// Mock supabaseServer to inject our fake DB and current user
vi.mock('@/lib/dm/supabaseServer', () => {
  const mockClient = {
    from(table: string) {
      const q: any = { _table: table, _filters: [], _select: '*', _update: undefined };
      q.select = (sel: string) => { q._select = sel; return q; };
      q.eq = (col: string, v: any) => { q._filters.push(['eq', col, v]); return q; };
      q.in = (col: string, vals: any[]) => { q._filters.push(['in', col, vals]); return q; };
      q.lte = (col: string, v: any) => { q._filters.push(['lte', col, v]); return q; };
      q.limit = (_n: number) => q;
      q.order = () => q;

      if (table === 'dms_thread_participants') {
        q.maybeSingle = async () => ({ data: { thread_id: state.threadId }, error: null });
        return q;
      }

      if (table === 'dms_blocks') {
        q.limit = (_n: number) => q;
        // blocks never returned in this flow
        q.then = undefined;
        return new Proxy(q, {
          get(target, prop, receiver) {
            if (prop === 'then') return undefined;
            if (prop === 'single' || prop === 'maybeSingle') return undefined;
            if (prop === 'select' || prop === 'eq' || prop === 'in' || prop === 'limit') {
              return (...args: any[]) => { (target as any)[prop](...args); return receiver; };
            }
            if (prop === 'exec') return async () => ({ data: [], error: null });
            return (target as any)[prop];
          },
        });
      }

      if (table === 'dms_messages') {
        q.insert = (_row: any) => ({ select: (_: string) => ({ single: async () => {
          const id = state.nextMsgId++;
          state.messages.push({ id, thread_id: state.threadId, sender_id: CURRENT_USER_ID });
          return { data: { id, thread_id: state.threadId, created_at: new Date().toISOString() }, error: null };
        } }) });
        q.single = async () => ({ data: { id: state.messages.at(-1)?.id ?? 0 }, error: null });
        q.maybeSingle = async () => ({ data: { id: state.messages.at(-1)?.id ?? 0 }, error: null });
        q.select = (_sel: string) => q;
        q.eq = (col: string, v: any) => { q._filters.push(['eq', col, v]); return q; };
        q.lte = (col: string, v: any) => { q._filters.push(['lte', col, v]); return q; };
        q.limit = (_n: number) => q;
        q.then = undefined;
        q.exec = async () => {
          if (q._select === 'id') {
            const upTo = Number(q._filters.find((f: any) => f[0] === 'lte')?.[2] ?? Number.MAX_SAFE_INTEGER);
            const rows = state.messages.filter((m) => m.id <= upTo).map((m) => ({ id: m.id }));
            return { data: rows, error: null };
          }
          return { data: [], error: null };
        };
        return new Proxy(q, {
          get(target, prop, receiver) {
            if (prop === 'then') return undefined;
            if (prop === 'exec') return (target as any).exec;
            if (prop === 'select' || prop === 'eq' || prop === 'lte' || prop === 'limit') {
              return (...args: any[]) => { (target as any)[prop](...args); return receiver; };
            }
            return (target as any)[prop];
          },
        });
      }

      if (table === 'dms_message_receipts') {
        q.update = (payload: any) => { q._update = payload; return q; };
        q.in = (col: string, ids: number[]) => { q._filters.push(['in', col, ids]); return q; };
        q.then = undefined;
        q.exec = async () => {
          const userId = q._filters.find((f: any) => f[1] === 'user_id')?.[2] as string;
          const status = q._filters.find((f: any) => f[1] === 'status')?.[2] as string;
          const ids = q._filters.find((f: any) => f[1] === 'message_id')?.[2] as number[];
          state.receiptsUpdates.push({ user_id: userId, status, message_ids: ids });
          return { data: [], error: null };
        };
        return new Proxy(q, {
          get(target, prop, receiver) {
            if (prop === 'then') return undefined;
            if (prop === 'exec') return (target as any).exec;
            if (prop === 'select' || prop === 'eq' || prop === 'in' || prop === 'limit' || prop === 'update') {
              return (...args: any[]) => { (target as any)[prop](...args); return receiver; };
            }
            return (target as any)[prop];
          },
        });
      }

      // default passthrough
      q.single = async () => ({ data: {}, error: null });
      q.maybeSingle = async () => ({ data: {}, error: null });
      q.insert = async (_row: any) => ({ data: {}, error: null, select: () => q });
      return q;
    },
  } as any;

  return {
    getAuthedClient: async () => ({ client: mockClient, user: { id: CURRENT_USER_ID } }),
  };
});

// Dynamic imports after mocks
const sendHandler = (await import('../pages/api/dms/messages.send')).default;
const readHandler = (await import('../pages/api/dms/messages.read')).default;

describe('DM flow: send -> delivered -> read', () => {
  beforeEach(() => {
    CURRENT_USER_ID = 'userA';
    state.messages = [];
    state.nextMsgId = 1000;
    state.receiptsUpdates = [];
  });

  it('sends a message and marks receipts as read up to the message id', async () => {
    // A sends a message in thread 1
    {
      const req = { method: 'POST', body: { thread_id: state.threadId, body: 'hello' } } as unknown as NextApiRequest;
      const res = createRes();
      CURRENT_USER_ID = 'userA';
      await sendHandler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.jsonBody?.ok).toBe(true);
      const sentId = res.jsonBody?.message?.id ?? state.messages.at(-1)?.id;
      expect(sentId).toBeTruthy();
    }

    // B reads up to latest message
    {
      const lastId = state.messages.at(-1)!.id;
      const req = { method: 'POST', body: { thread_id: state.threadId, up_to_message_id: lastId } } as unknown as NextApiRequest;
      const res = createRes();
      CURRENT_USER_ID = 'userB';
      await readHandler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.jsonBody?.ok).toBe(true);
      expect(res.jsonBody?.last_read_message_id).toBe(lastId);

      // Verify a receipts update occurred targeting B, delivered -> read, for ids up to lastId
      const update = state.receiptsUpdates.at(-1);
      expect(update).toBeTruthy();
      expect(update!.user_id).toBe('userB');
      expect(update!.status).toBe('delivered');
      expect(update!.message_ids).toContain(lastId);
    }
  });
});
