import type { NextApiRequest, NextApiResponse } from 'next';
import { activeTests } from './start';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { testId } = req.query;

    if (!testId || typeof testId !== 'string') {
      // Return all active tests
      const tests = Array.from(activeTests.entries()).map(([id, engine]) => ({
        testId: id,
        stats: engine.getStats(),
      }));
      
      return res.status(200).json({
        tests,
        count: tests.length,
      });
    }

    // Get specific test
    const engine = activeTests.get(testId);
    
    if (!engine) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const stats = engine.getStats();

    return res.status(200).json({
      testId,
      stats,
    });
  } catch (error: any) {
    console.error('Error getting test status:', error);
    return res.status(500).json({ 
      error: 'Failed to get test status',
      message: error.message,
    });
  }
}