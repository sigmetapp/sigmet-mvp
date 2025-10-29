import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  participantIds: z.array(z.string().min(1)).min(1, 'At least one participant is required'),
  initialMessage: z.string().min(1).max(4000).optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = BodySchema.parse(json);

    // Stub response
    return NextResponse.json({ ok: true, data: { threadId: 'stub-thread-id' } });
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
