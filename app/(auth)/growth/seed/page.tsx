"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import Button from '@/components/Button';
import { useTheme } from '@/components/ThemeProvider';

export default function SeedGrowthPage() {
  return (
    <RequireAuth>
      <SeedGrowthInner />
    </RequireAuth>
  );
}

function SeedGrowthInner() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState<boolean | null>(null);

  useEffect(() => {
    checkData();
  }, []);

  async function checkData() {
    try {
      const { data: directions, error } = await supabase
        .from('growth_directions')
        .select('id')
        .limit(1);

      if (error) {
        if (error.code === '42P01') {
          // Table doesn't exist
          setHasData(false);
          return;
        }
        throw error;
      }

      setHasData((directions?.length || 0) > 0);
    } catch (err: any) {
      setError(err.message);
      setHasData(false);
    }
  }

  async function runSeeds() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      // Read the seed SQL file
      const response = await fetch('/supabase/migrations/121_growth_tracker_seed.sql');
      if (!response.ok) {
        throw new Error('Failed to load seed SQL file');
      }

      const seedSQL = await response.text();

      // Execute the seed SQL using Supabase RPC or admin client
      // Since we can't directly execute SQL from the client, we'll use a server action
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Call an API route to run the seeds
      const res = await fetch('/api/growth/seed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to run seeds');
      }

      const result = await res.json();
      setMessage(`Seeds executed successfully! ${result.message || ''}`);
      setHasData(true);
    } catch (err: any) {
      setError(err.message || 'Failed to run seeds');
    } finally {
      setLoading(false);
    }
  }

  if (hasData === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className={`text-center py-12 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
          Checking...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className={`text-2xl md:text-3xl font-semibold tracking-tight ${isLight ? 'bg-gradient-to-r from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent' : 'gradient-text'}`}>
          Seed Growth Data
        </h1>
        <p className={`mt-1 text-sm ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
          Run the seed SQL to populate growth directions and tasks.
        </p>
      </div>

      <div className={`telegram-card-glow p-4 md:p-6 space-y-4 ${isLight ? '' : ''}`}>
        {hasData ? (
          <div className={`p-4 rounded-xl ${isLight ? 'bg-green-50 border border-green-200' : 'bg-green-500/10 border border-green-500/30'}`}>
            <div className={`font-medium ${isLight ? 'text-green-800' : 'text-green-400'}`}>
              ? Growth data already exists
            </div>
            <div className={`mt-1 text-sm ${isLight ? 'text-green-700' : 'text-green-500/80'}`}>
              Directions and tasks have already been seeded. You can navigate to /growth to start using the Growth Tracker.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`p-4 rounded-xl ${isLight ? 'bg-yellow-50 border border-yellow-200' : 'bg-yellow-500/10 border border-yellow-500/30'}`}>
              <div className={`font-medium ${isLight ? 'text-yellow-800' : 'text-yellow-400'}`}>
                ? No growth data found
              </div>
              <div className={`mt-1 text-sm ${isLight ? 'text-yellow-700' : 'text-yellow-500/80'}`}>
                Run the seed script to populate 12 directions with 3 habits and 3 goals each.
              </div>
            </div>

            {message && (
              <div className={`p-4 rounded-xl ${isLight ? 'bg-blue-50 border border-blue-200' : 'bg-blue-500/10 border border-blue-500/30'}`}>
                <div className={`font-medium ${isLight ? 'text-blue-800' : 'text-blue-400'}`}>
                  {message}
                </div>
              </div>
            )}

            {error && (
              <div className={`p-4 rounded-xl ${isLight ? 'bg-red-50 border border-red-200' : 'bg-red-500/10 border border-red-500/30'}`}>
                <div className={`font-medium ${isLight ? 'text-red-800' : 'text-red-400'}`}>
                  Error: {error}
                </div>
              </div>
            )}

            <Button
              onClick={runSeeds}
              disabled={loading}
              variant="primary"
              className="w-full"
            >
              {loading ? 'Running seeds...' : 'Run Seeds'}
            </Button>

            <div className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
              <p>This will:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Create 12 growth directions (Learning, Career, Finance, etc.)</li>
                <li>Add 3 habits per direction (daily, weekly, or monthly)</li>
                <li>Add 3 goals per direction</li>
              </ul>
            </div>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-white/10">
          <Button href="/growth" variant="secondary" className="w-full">
            Go to Growth Tracker
          </Button>
        </div>
      </div>
    </div>
  );
}
