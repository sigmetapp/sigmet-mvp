import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const text = String(form.get('text') || '');
  return NextResponse.json({ ok: true, text }, { status: 200 });
}
