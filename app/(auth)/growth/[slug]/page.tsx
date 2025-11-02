"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import Button from '@/components/Button';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';
import { resolveDirectionEmoji } from '@/lib/directions';

type Task = {
  id: string;
  direction_id: string;
  task_type: 'habit' | 'goal';
  period: 'daily' | 'weekly' | 'monthly' | null;
  title: string;
  description: string;
  base_points: number;
  sort_index: number;
  isActivated: boolean;
  userTask: {
    id: string;
    status: 'active' | 'completed' | 'archived';
    current_streak: number;
    longest_streak: number;
    total_checkins: number;
    started_at: string;
    completed_at: string | null;
  } | null;
  lastChecked?: string | null;
};

type Direction = {
  id: string;
  slug: string;
  title: string;
  emoji: string;
  sort_index: number;
};

type Tab = 'habits' | 'goals' | 'overview';

export default function DirectionDetailPage() {
  return (
    <RequireAuth>
      <DirectionDetailInner />
    </RequireAuth>
  );
}

function DirectionDetailInner() {
  const params = useParams();
  const router = useRouter();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState<Direction | null>(null);
  const [habits, setHabits] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('habits');
  const [checkingIn, setCheckingIn] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [activating, setActivating] = useState<Set<string>>(new Set());
  const [showCompleteModal, setShowCompleteModal] = useState<{ taskId: string; userTaskId: string } | null>(null);
  const [completeForm, setCompleteForm] = useState({ proofUrl: '', note: '' });

  useEffect(() => {
    loadData();
  }, [slug]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get direction info
      const { data: dirs } = await supabase
        .from('growth_directions')
        .select('*')
        .eq('slug', slug)
        .single();

      if (!dirs) {
        router.push('/growth');
        return;
      }

      setDirection(dirs);

      // Get tasks
      const res = await fetch(`/api/growth/tasks.list?directionId=${dirs.id}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load tasks');
      }

      const { habits: h, goals: g } = await res.json();
      setHabits(h || []);
      setGoals(g || []);
    } catch (error: any) {
      console.error('Error loading data:', error);
      alert(error.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function activateTask(taskId: string) {
    if (activating.has(taskId)) return;
    setActivating((prev) => new Set(prev).add(taskId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/growth/tasks.activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ taskId }),
      });

      if (!res.ok) {
        throw new Error('Failed to activate task');
      }

      // Track analytics
      const { ph } = await import('@/lib/analytics.client');
      ph.capture('growth_task_activated', { task_id: taskId, direction_id: direction?.id });

      await loadData();
    } catch (error: any) {
      console.error('Error activating task:', error);
      alert(error.message || 'Failed to activate task');
    } finally {
      setActivating((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }

  async function deactivateTask(userTaskId: string) {
    if (activating.has(userTaskId)) return;
    setActivating((prev) => new Set(prev).add(userTaskId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/growth/tasks.deactivate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userTaskId }),
      });

      if (!res.ok) {
        throw new Error('Failed to deactivate task');
      }

      // Track analytics
      const { ph } = await import('@/lib/analytics.client');
      ph.capture('growth_task_deactivated', { user_task_id: userTaskId, direction_id: direction?.id });

      await loadData();
    } catch (error: any) {
      console.error('Error deactivating task:', error);
      alert(error.message || 'Failed to deactivate task');
    } finally {
      setActivating((prev) => {
        const next = new Set(prev);
        next.delete(userTaskId);
        return next;
      });
    }
  }

  async function checkInHabit(userTaskId: string) {
    if (checkingIn.has(userTaskId)) return;
    setCheckingIn((prev) => new Set(prev).add(userTaskId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/growth/habits.checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userTaskId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to check in');
      }

      const result = await res.json();

      // Track analytics
      const task = habits.find((h) => h.userTask?.id === userTaskId);
      const { ph } = await import('@/lib/analytics.client');
      ph.capture('habit_checkin_done', {
        user_task_id: userTaskId,
        task_id: task?.id,
        direction_id: direction?.id,
        period: task?.period,
        streak: result.streak,
        points: result.checkin?.points_awarded || 0,
      });

      await loadData();
    } catch (error: any) {
      console.error('Error checking in:', error);
      alert(error.message || 'Failed to check in');
    } finally {
      setCheckingIn((prev) => {
        const next = new Set(prev);
        next.delete(userTaskId);
        return next;
      });
    }
  }

  async function completeGoal(userTaskId: string) {
    if (completing.has(userTaskId)) return;
    setCompleting((prev) => new Set(prev).add(userTaskId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/growth/goals.complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userTaskId,
          proofUrl: completeForm.proofUrl || null,
          note: completeForm.note || null,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to complete goal');
      }

      // Track analytics
      const task = goals.find((g) => g.userTask?.id === userTaskId);
      const { ph } = await import('@/lib/analytics.client');
      ph.capture('goal_completed', {
        user_task_id: userTaskId,
        task_id: task?.id,
        direction_id: direction?.id,
        points: task?.base_points || 0,
      });

      setShowCompleteModal(null);
      setCompleteForm({ proofUrl: '', note: '' });
      await loadData();
    } catch (error: any) {
      console.error('Error completing goal:', error);
      alert(error.message || 'Failed to complete goal');
    } finally {
      setCompleting((prev) => {
        const next = new Set(prev);
        next.delete(userTaskId);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className={`text-center py-12 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
          Loading?
        </div>
      </div>
    );
  }

  if (!direction) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <Link href="/growth" className={`text-sm mb-2 inline-block ${isLight ? 'text-telegram-blue hover:text-telegram-blue-dark' : 'text-telegram-blue-light hover:text-telegram-blue'}`}>
          ? Back to Growth
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-4xl">
            {resolveDirectionEmoji(direction.slug, direction.emoji)}
          </span>
          <h1 className={`text-2xl md:text-3xl font-semibold tracking-tight ${isLight ? 'bg-gradient-to-r from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent' : 'gradient-text'}`}>
            {direction.title}
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-white/10">
        {(['Habits', 'Goals', 'Overview'] as const).map((label) => {
          const tab = label.toLowerCase() as Tab;
          const active = activeTab === tab;
          return (
            <button
              key={label}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 ${
                active
                  ? isLight
                    ? 'border-telegram-blue text-telegram-blue'
                    : 'border-telegram-blue-light text-telegram-blue-light'
                  : isLight
                  ? 'border-transparent text-telegram-text-secondary hover:text-telegram-blue'
                  : 'border-transparent text-telegram-text-secondary hover:text-telegram-blue-light'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === 'habits' && (
        <div className="space-y-4">
          {habits.length === 0 ? (
            <div className={`text-center py-12 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
              No habits available
            </div>
          ) : (
            habits.map((habit) => {
              const isActivating = activating.has(habit.id);
              const isCheckingIn = checkingIn.has(habit.userTask?.id || '');
              const isActive = habit.isActivated && habit.userTask?.status === 'active';

              return (
                <div
                  key={habit.id}
                  className={`telegram-card-glow p-4 md:p-6 space-y-4 ${isLight ? '' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className={`font-semibold ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                          {habit.title}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          habit.period === 'daily'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : habit.period === 'weekly'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-purple-500/20 text-purple-400'
                        }`}>
                          {habit.period?.charAt(0).toUpperCase() + habit.period.slice(1)}
                        </span>
                      </div>
                      <p className={`text-sm ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                        {habit.description}
                      </p>
                      <div className={`mt-2 text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                        {habit.base_points} points per check-in
                      </div>
                    </div>
                  </div>

                  {isActive && habit.userTask && (
                    <div className={`grid grid-cols-2 gap-4 p-3 rounded-xl ${isLight ? 'bg-telegram-bg-secondary' : 'bg-white/5'}`}>
                      <div>
                        <div className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                          Current Streak
                        </div>
                        <div className={`text-lg font-semibold ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                          ?? {habit.userTask.current_streak}
                        </div>
                      </div>
                      <div>
                        <div className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                          Longest Streak
                        </div>
                        <div className={`text-lg font-semibold ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                          {habit.userTask.longest_streak}
                        </div>
                      </div>
                      <div>
                        <div className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                          Total Check-ins
                        </div>
                        <div className={`text-lg font-semibold ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                          {habit.userTask.total_checkins}
                        </div>
                      </div>
                      <div>
                        <div className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                          Last Done
                        </div>
                        <div className={`text-sm ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                          {habit.lastChecked
                            ? new Date(habit.lastChecked).toLocaleDateString()
                            : 'Never'}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {isActive ? (
                      <>
                        <Button
                          onClick={() => checkInHabit(habit.userTask!.id)}
                          disabled={isCheckingIn}
                          variant="primary"
                          className="flex-1"
                        >
                          {isCheckingIn ? 'Checking in?' : 'Check in'}
                        </Button>
                        <Button
                          onClick={() => deactivateTask(habit.userTask!.id)}
                          disabled={isActivating}
                          variant="secondary"
                        >
                          Deactivate
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={() => activateTask(habit.id)}
                        disabled={isActivating}
                        variant="primary"
                        className="flex-1"
                      >
                        {isActivating ? 'Activating?' : 'Activate'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'goals' && (
        <div className="space-y-4">
          {goals.length === 0 ? (
            <div className={`text-center py-12 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
              No goals available
            </div>
          ) : (
            goals.map((goal) => {
              const isActivating = activating.has(goal.id);
              const isCompleting = completing.has(goal.userTask?.id || '');
              const isActive = goal.isActivated && goal.userTask?.status === 'active';
              const isCompleted = goal.userTask?.status === 'completed';

              return (
                <div
                  key={goal.id}
                  className={`telegram-card-glow p-4 md:p-6 space-y-4 ${isLight ? '' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className={`font-semibold ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                          {goal.title}
                        </h3>
                        {isCompleted && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                            Completed
                          </span>
                        )}
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                            Active
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                        {goal.description}
                      </p>
                      <div className={`mt-2 text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                        {goal.base_points} points
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {isCompleted ? (
                      <div className={`text-sm ${isLight ? 'text-green-600' : 'text-green-400'}`}>
                        Completed on {goal.userTask?.completed_at ? new Date(goal.userTask.completed_at).toLocaleDateString() : ''}
                      </div>
                    ) : isActive ? (
                      <Button
                        onClick={() => setShowCompleteModal({ taskId: goal.id, userTaskId: goal.userTask!.id })}
                        disabled={isCompleting}
                        variant="primary"
                        className="flex-1"
                      >
                        {isCompleting ? 'Completing?' : 'Complete'}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => activateTask(goal.id)}
                        disabled={isActivating}
                        variant="primary"
                        className="flex-1"
                      >
                        {isActivating ? 'Activating?' : 'Activate'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'overview' && (
        <div className={`telegram-card-glow p-4 md:p-6 space-y-4 ${isLight ? '' : ''}`}>
          <h2 className={`font-semibold text-lg ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
            Overview
          </h2>
          <div className={`text-sm ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
            Overview stats and charts coming soon
          </div>
        </div>
      )}

      {/* Complete Goal Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className={`absolute inset-0 ${isLight ? 'bg-black/50' : 'bg-black/80'}`}
            onClick={() => setShowCompleteModal(null)}
          />
          <div className={`relative z-10 w-full max-w-md mx-4 ${isLight ? 'bg-white' : 'bg-[rgba(15,22,35,0.95)]'} rounded-2xl p-6 space-y-4`}>
            <h3 className={`font-semibold text-lg ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
              Complete Goal
            </h3>
            <div className="space-y-3">
              <div>
                <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                  Proof URL (optional)
                </label>
                <input
                  type="url"
                  value={completeForm.proofUrl}
                  onChange={(e) => setCompleteForm((prev) => ({ ...prev, proofUrl: e.target.value }))}
                  placeholder="https://..."
                  className={`input w-full ${isLight ? '' : ''}`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                  Note (optional)
                </label>
                <textarea
                  value={completeForm.note}
                  onChange={(e) => setCompleteForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="Add a note about completing this goal..."
                  rows={3}
                  className={`input w-full ${isLight ? '' : ''}`}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => completeGoal(showCompleteModal.userTaskId)}
                variant="primary"
                className="flex-1"
              >
                Complete
              </Button>
              <Button
                onClick={() => {
                  setShowCompleteModal(null);
                  setCompleteForm({ proofUrl: '', note: '' });
                }}
                variant="secondary"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
