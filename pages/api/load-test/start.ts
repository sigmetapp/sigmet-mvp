import type { NextApiRequest, NextApiResponse } from 'next';

// Use require for CommonJS module - Next.js API routes support require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LoadTestEngine = require('../../lib/load-test/loadTestEngine');

// Store active tests in memory (in production, use Redis or similar)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activeTests = new Map<string, any>();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      baseUrl = process.env.BASE_URL || 'http://localhost:3000',
      concurrentUsers = 200,
      durationSeconds = 300,
      rampUpSeconds = 60,
      testUsers = [],
      testId = `test-${Date.now()}`,
    } = req.body;

    // Check if test already exists
    if (activeTests.has(testId)) {
      return res.status(400).json({ error: 'Test with this ID is already running' });
    }

    // Create load test engine
    const engine = new LoadTestEngine({
      baseUrl,
      concurrentUsers: parseInt(concurrentUsers.toString(), 10),
      durationSeconds: parseInt(durationSeconds.toString(), 10),
      rampUpSeconds: parseInt(rampUpSeconds.toString(), 10),
      testUsers: Array.isArray(testUsers) ? testUsers : [],
      onUpdate: (stats) => {
        // Update is handled by status endpoint
      },
    });

    // Store engine
    activeTests.set(testId, engine);

    // Start test asynchronously
    engine.start().catch((error) => {
      console.error('Load test error:', error);
      activeTests.delete(testId);
    });

    // Clean up old tests (older than 1 hour)
    setTimeout(() => {
      activeTests.delete(testId);
    }, (parseInt(durationSeconds.toString(), 10) + 3600) * 1000);

    return res.status(200).json({
      success: true,
      testId,
      message: 'Load test started',
    });
  } catch (error: any) {
    console.error('Error starting load test:', error);
    return res.status(500).json({ 
      error: 'Failed to start load test',
      message: error.message,
    });
  }
}

// Export active tests for other endpoints
export { activeTests };