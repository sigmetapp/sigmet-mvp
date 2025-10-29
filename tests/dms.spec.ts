import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock getAuthedClient to inject a fake supabase client and current user
vi.mock('@/lib/dm/supabaseServer', () => {
  return {
    getAuthedClient: async () => {
      return { client: mockClient, user: { id: CURRENT_USER_ID } };
    },
  };
});

// Simple helpers
const CURRENT_USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

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

// Minimal fake of the supabase client used by handlers
const mockClient = {
  from: (table: string) => {
    return buildQuery(table);
  },
  rpc: (fn: string, _args: any) => {
    return {
      maybeSingle: async () => {
        if (fn === 'ensure_1on1_thread') {
          return { data: { id: 123 }, error: null };
        }
        return { data: null, error: { message: 'unknown rpc' } };
      },
    };
  },
} as any;

// State toggles for test cases
let blockDirection: 'none' | 'otherBlocksCurrent' | 'currentBlocksOther' = 'none';

function buildQuery(table: string) {
  const q: any = {
    _table: table,
    _filters: [] as any[],
    select(_sel: string) { return this; },
    eq(col: string, v: any) { this._filters.push(['eq', col, v]); return this; },
    in(col: string, v: any[]) { this._filters.push(['in', col, v]); return this; },
    is(_col: string, _v: any) { return this; },
    order() { return this; },
    limit() { return this; },
    gt() { return this; },
    neq() { return this; },
    single: async () => ({ data: {}, error: null }),
    maybeSingle: async () => ({ data: {}, error: null }),
    insert: async (_row: any) => ({ data: { id: 456, created_at: new Date().toISOString() }, error: null, select: () => q }),
  };

  q.select = (sel: string) => {
    q._select = sel;
    return q;
  };

  q.limit = (_n: number) => q;

  q.then = undefined; // not a thenable

  if (table === 'dms_blocks') {
    q.select = (_sel: string) => q;
    q.limit = (_n: number) => q;
    q.single = undefined;
    q.maybeSingle = undefined;
    q.then = undefined;
    q.exec = async () => {
      const rows: any[] = [];
      if (blockDirection === 'otherBlocksCurrent') {
        rows.push({ blocker: OTHER_USER_ID, blocked: CURRENT_USER_ID });
      } else if (blockDirection === 'currentBlocksOther') {
        rows.push({ blocker: CURRENT_USER_ID, blocked: OTHER_USER_ID });
      }
      return { data: rows, error: null };
    };
    // emulate supabase-js behavior for await q where methods return promise
    return new Proxy(q, {
      get(target, prop, receiver) {
        if (prop === Symbol.toStringTag) return 'Query';
        if (prop === 'then') {
          return undefined;
        }
        if (prop === 'exec') return target.exec;
        if (prop === 'select' || prop === 'eq' || prop === 'in' || prop === 'limit') {
          return (...args: any[]) => {
            (target as any)[prop](...args);
            return receiver;
          };
        }
        return (target as any)[prop];
      },
      apply() { return q; },
    });
  }

  // dms_thread_participants membership checks return a row
  if (table === 'dms_thread_participants') {
    q.maybeSingle = async () => ({ data: { thread_id: 1 }, error: null });
    q.then = undefined;
    return q;
  }

  // dms_messages insert/select
  if (table === 'dms_messages') {
    q.insert = (_row: any) => ({ select: (_: string) => ({ single: async () => ({ data: { id: 789, thread_id: 1, created_at: new Date().toISOString() }, error: null }) }) });
    return q;
  }

  // default
  return q;
}

// Dynamically import handlers after mocks are in place
const sendHandler = (await import('../pages/api/dms/messages.send')).default;
const createThreadHandler = (await import('../pages/api/dms/threads.create')).default;

describe('DM blocking', () => {
  beforeEach(() => {
    blockDirection = 'none';
  });

  it('prevents sending a message if recipient blocks sender', async () => {
    blockDirection = 'otherBlocksCurrent';
    const req = { method: 'POST', body: { thread_id: 1, body: 'hi' } } as unknown as NextApiRequest;
    const res = createRes();
    await sendHandler(req, res as any);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody?.error).toBe('blocked_by_recipient');
  });

  it('prevents sending a message if sender blocked recipient', async () => {
    blockDirection = 'currentBlocksOther';
    const req = { method: 'POST', body: { thread_id: 1, body: 'hi' } } as unknown as NextApiRequest;
    const res = createRes();
    await sendHandler(req, res as any);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody?.error).toBe('sender_blocked_recipient');
  });

  it('prevents creating a 1:1 thread when blocked either way', async () => {
    blockDirection = 'currentBlocksOther';
    const req = { method: 'POST', body: { participant_ids: [OTHER_USER_ID] } } as unknown as NextApiRequest;
    const res = createRes();
    await createThreadHandler(req, res as any);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody?.error).toBe('blocked');
  });
});
