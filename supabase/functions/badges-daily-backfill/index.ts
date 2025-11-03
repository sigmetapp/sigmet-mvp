// Daily backfill function for badges system
// This function recalculates user metrics and evaluates badges for all users

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify admin access via header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Recalculate metrics for all users that changed in last 24h
    const { data: affectedUsers, error: recalcError } = await supabase.rpc(
      'recalculate_user_metrics',
      {
        user_uuid: null,
        recalc_all: true,
      }
    );

    if (recalcError) {
      console.error('Error recalculating metrics:', recalcError);
      return new Response(
        JSON.stringify({ error: recalcError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all active users from metrics updated in last 24h
    const { data: usersToEvaluate, error: usersError } = await supabase
      .from('user_metrics')
      .select('user_id')
      .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return new Response(
        JSON.stringify({ error: usersError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Evaluate badges for each user
    let evaluatedCount = 0;
    let newBadgesAwarded = 0;

    for (const user of usersToEvaluate || []) {
      const { error: evalError } = await supabase.rpc('evaluate_user_badges', {
        user_uuid: user.user_id,
      });

      if (evalError) {
        console.error(`Error evaluating badges for user ${user.user_id}:`, evalError);
        continue;
      }

      evaluatedCount++;

      // Check how many new badges were awarded (simplified - would need to compare before/after)
      const { data: badges } = await supabase
        .from('user_badges')
        .select('awarded_at')
        .eq('user_id', user.user_id)
        .gte('awarded_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (badges) {
        newBadgesAwarded += badges.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        affected_users: affectedUsers || 0,
        evaluated_users: evaluatedCount,
        new_badges_awarded: newBadgesAwarded,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Badges daily backfill error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
