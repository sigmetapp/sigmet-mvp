import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { data, error } = await supabase.from('profiles').select('*').limit(1)
    if (error) throw error

    res.status(200).json({ ok: true, rows: data?.length ?? 0 })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
}
