import type { NextApiRequest, NextApiResponse } from 'next';
import { activeTests } from './start';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { testId } = req.body;

    if (!testId || typeof testId !== 'string') {
      return res.status(400).json({ error: 'testId is required' });
    }

    const engine = activeTests.get(testId);
    
    if (!engine) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Stop the test
    engine.stop();

    // Get final stats
    const stats = engine.getStats();

    // Clean up after a delay to allow final stats retrieval
    setTimeout(() => {
      activeTests.delete(testId);
    }, 60000); // Keep for 1 minute after stop

    return res.status(200).json({
      success: true,
      testId,
      message: 'Load test stopped',
      stats,
    });
  } catch (error: any) {
    console.error('Error stopping load test:', error);
    return res.status(500).json({ 
      error: 'Failed to stop load test',
      message: error.message,
    });
  }
}