import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z
  .object({
    readReceiptsEnabled: z.boolean().optional(),
    typingIndicatorsEnabled: z.boolean().optional(),
  })
  .refine(
    (obj) => obj.readReceiptsEnabled !== undefined || obj.typingIndicatorsEnabled !== undefined,
    { message: 'At least one setting must be provided' }
  );

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = BodySchema.parse(json);

    // Stub response
    return NextResponse.json({ ok: true, data: { settings: body } });
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
