import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Get current user from session
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Check if data already exists
    const { data: existing, error: checkError } = await supabase
      .from('growth_directions')
      .select('id')
      .limit(1);

    if (checkError && checkError.code !== '42P01') {
      return res.status(500).json({ error: checkError.message });
    }

    if (existing && existing.length > 0) {
      return res.status(200).json({ 
        success: true,
        message: 'Growth data already exists',
        alreadySeeded: true,
      });
    }

    // Read seed SQL file
    const seedPath = path.join(process.cwd(), 'supabase/migrations/121_growth_tracker_seed.sql');
    
    if (!fs.existsSync(seedPath)) {
      return res.status(404).json({ error: 'Seed SQL file not found' });
    }

    const seedSQL = fs.readFileSync(seedPath, 'utf-8');

    // Execute the seed SQL using Supabase admin client
    const { error: seedError } = await supabase.rpc('exec_sql', { sql: seedSQL });

    if (seedError) {
      // If exec_sql doesn't exist, try direct execution
      // For simplicity, we'll just return instructions to run it manually
      // or use a simpler approach: execute statements one by one
      
      // Actually, we can't directly execute multi-statement SQL via RPC
      // The seed should be run via Supabase migrations or manually via SQL editor
      return res.status(400).json({ 
        error: 'Cannot execute seed SQL directly. Please run the migration file 121_growth_tracker_seed.sql via Supabase migrations or SQL editor.',
        instructions: 'Run the SQL file at supabase/migrations/121_growth_tracker_seed.sql in your Supabase SQL editor or apply it as a migration.',
      });
    }

    return res.status(200).json({ 
      success: true,
      message: 'Seeds executed successfully',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
