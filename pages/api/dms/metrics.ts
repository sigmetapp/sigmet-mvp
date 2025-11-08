/**
 * API endpoint for DM system metrics
 * Returns connection count, message latency, error rates, etc.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getMetricsSummary } from '@/lib/dm/metrics';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Get metrics summary
    const summary = getMetricsSummary();

    return res.status(200).json({
      ok: true,
      metrics: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error getting metrics:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
}
