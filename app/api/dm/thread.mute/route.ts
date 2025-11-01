import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  threadId: z.string().min(1),
  muted: z.boolean(),
  durationMinutes: z.coerce.number().int().min(1).max(10080).optional(), // up to 7 days
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = BodySchema.parse(json);

    const mutedUntil = body.muted && body.durationMinutes
      ? new Date(Date.now() + body.durationMinutes * 60_000).toISOString()
      : null;

    // Stub response
    return NextResponse.json({ ok: true, data: { muted: body.muted, mutedUntil } });
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
