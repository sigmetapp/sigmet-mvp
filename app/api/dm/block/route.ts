import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  userId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = BodySchema.parse(json);

    // Stub response
    return NextResponse.json({ ok: true, data: { userId: body.userId, blocked: true } });
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
