/**
 * Demo page for the new instant, ordered, lossless DM engine
 * Route: /dm/[conversationId]
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import ChatView from '@/app/(chat)/[dialogId]/ChatView';
import { getOrCreateThread } from '@/lib/dms';

export default function DmPage() {
  return (
    <RequireAuth>
      <DmPageInner />
    </RequireAuth>
  );
}

function DmPageInner() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = params?.conversationId as string;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    })();
  }, []);

  // Get or create thread
  useEffect(() => {
    if (!currentUserId || !conversationId) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // For demo, we'll use conversationId as partnerId
        // In production, you'd parse this differently
        const thread = await getOrCreateThread(currentUserId, conversationId);
        setThreadId(String(thread.id));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load conversation';
        setError(errorMessage);
        console.error('Error loading thread', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUserId, conversationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-white/60">Loading conversation...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!threadId || !currentUserId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-white/60">Invalid conversation</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-white/10 px-4 py-3">
        <h1 className="text-white text-lg font-medium">Chat</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatView
          dialogId={threadId}
          currentUserId={currentUserId}
          otherUserId={conversationId}
        />
      </div>
    </div>
  );
}
