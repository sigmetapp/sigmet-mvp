import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const supa = supabaseAdmin();
    const user_id = '00000000-0000-0000-0000-000000000000'; // replace with real auth user
    const { error } = await supa.from('profiles').upsert({
      user_id,
      username: payload.username,
      bio: payload.bio,
      country: payload.country
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
