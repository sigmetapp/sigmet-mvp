import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  threadId: z.string().min(1),
  text: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = BodySchema.parse(json);

    // Stub response
    return NextResponse.json({ ok: true, data: { messageId: 'stub-message-id' } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: err.errors.map(e => e.message).join('; ') },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
