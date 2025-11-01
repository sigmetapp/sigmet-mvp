"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import Button from '@/components/Button';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';

type Direction = {
  id: string;
  slug: string;
  title: string;
  emoji: string;
  sort_index: number;
  isSelected: boolean;
  isPrimary: boolean;
  stats: {
    activeHabits: number;
    activeGoals: number;
    maxStreak: number;
    swPoints: number;
  };
};

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
  } | null;
  lastChecked?: string | null;
};

export default function GrowthDirectionsPage() {
  return (
    <RequireAuth>
      <GrowthDirectionsInner />
    </RequireAuth>
  );
}

function GrowthDirectionsInner() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [loading, setLoading] = useState(true);
  const [directions, setDirections] = useState<Direction[]>([]);
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  const [tasks, setTasks] = useState<{ habits: Task[]; goals: Task[] }>({ habits: [], goals: [] });
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [activating, setActivating] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [showCompleteModal, setShowCompleteModal] = useState<{ taskId: string; userTaskId: string } | null>(null);
  const [completeForm, setCompleteForm] = useState({ proofUrl: '', note: '' });
  const [showCheckInModal, setShowCheckInModal] = useState<{ userTaskId: string; task: Task } | null>(null);
  const [checkInPostForm, setCheckInPostForm] = useState({ body: '', image: null as File | null, video: null as File | null });
  const [publishingPost, setPublishingPost] = useState(false);
  const [allActiveHabits, setAllActiveHabits] = useState<Task[]>([]);
  const [allActiveGoals, setAllActiveGoals] = useState<Task[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    loadDirections();
  }, []);

  useEffect(() => {
    if (selectedDirection) {
      loadTasks(selectedDirection);
    }
  }, [selectedDirection]);

  useEffect(() => {
    if (directions.length > 0) {
      loadSummary();
    }
  }, [directions, selectedDirection]);

  async function loadDirections() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/growth/directions.list', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load directions');
      }

      const { directions: dirs } = await res.json();
      setDirections(dirs || []);
      
      // Auto-select first direction if none selected
      if (dirs && dirs.length > 0 && !selectedDirection) {
        setSelectedDirection(dirs[0].id);
      }
    } catch (error: any) {
      console.error('Error loading directions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTasks(directionId: string) {
    setLoadingTasks(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/growth/tasks.list?directionId=${directionId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load tasks');
      }

      const { habits, goals } = await res.json();
      
      // Remove duplicates by task id
      const uniqueHabits = Array.from(
        new Map((habits || []).map((h: Task) => [h.id, h])).values()
      );
      const uniqueGoals = Array.from(
        new Map((goals || []).map((g: Task) => [g.id, g])).values()
      );
      
      setTasks({ habits: uniqueHabits, goals: uniqueGoals });
    } catch (error: any) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoadingTasks(false);
    }
  }

  async function loadSummary() {
    setLoadingSummary(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get all selected directions except the currently selected one
      const selectedDirs = directions.filter((d) => d.isSelected && d.id !== selectedDirection);
      
      if (selectedDirs.length === 0) {
        setAllActiveHabits([]);
        setAllActiveGoals([]);
        return;
      }

      // Load tasks from all selected directions (excluding current)
      const allHabits: Task[] = [];
      const allGoals: Task[] = [];

      for (const dir of selectedDirs) {
        try {
          const res = await fetch(`/api/growth/tasks.list?directionId=${dir.id}`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

          if (res.ok) {
            const { habits, goals } = await res.json();
            
            // Filter only active tasks
            const activeHabits = (habits || []).filter(
              (h: Task) => h.isActivated && h.userTask?.status === 'active'
            );
            const activeGoals = (goals || []).filter(
              (g: Task) => g.isActivated && g.userTask?.status === 'active'
            );

            // Add direction info to tasks
            activeHabits.forEach((h: Task) => {
              allHabits.push({ ...h, direction_id: dir.id });
            });
            activeGoals.forEach((g: Task) => {
              allGoals.push({ ...g, direction_id: dir.id });
            });
          }
        } catch (error) {
          console.error(`Error loading tasks for direction ${dir.id}:`, error);
        }
      }

      setAllActiveHabits(allHabits);
      setAllActiveGoals(allGoals);
    } catch (error: any) {
      console.error('Error loading summary:', error);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function toggleDirection(directionId: string) {
    if (toggling.has(directionId)) return;
    setToggling((prev) => new Set(prev).add(directionId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/growth/directions.toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ directionId }),
      });

      if (!res.ok) {
        throw new Error('Failed to toggle direction');
      }

      await loadDirections();
      // Reload summary after toggling direction
      setTimeout(() => loadSummary(), 500);
    } catch (error: any) {
      console.error('Error toggling direction:', error);
      alert(error.message || 'Failed to toggle direction');
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(directionId);
        return next;
      });
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

      await loadTasks(selectedDirection!);
      // Reload summary after activating task
      await loadSummary();
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

      await loadTasks(selectedDirection!);
      // Reload summary after deactivating task
      await loadSummary();
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

  function openCheckInModal(userTaskId: string, task: Task) {
    setShowCheckInModal({ userTaskId, task });
    // Pre-fill post with task information
    const taskInfo = `?? Task: ${task.title}

?? Description: ${task.description}

? Check-in progress`;
    setCheckInPostForm({ body: taskInfo, image: null, video: null });
  }

  async function uploadToStorage(file: File, folder: 'images' | 'videos') {
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const bucket = supabase.storage.from('posts');
    const { error } = await bucket.upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    const { data } = bucket.getPublicUrl(path);
    return data.publicUrl as string;
  }

  async function publishCheckInPost() {
    if (!showCheckInModal) return;
    if (!checkInPostForm.body.trim() && !checkInPostForm.image && !checkInPostForm.video) {
      alert('Post cannot be empty');
      return;
    }

    setPublishingPost(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Sign in required');
        return;
      }

      let image_url: string | null = null;
      let video_url: string | null = null;
      
      if (checkInPostForm.image) {
        image_url = await uploadToStorage(checkInPostForm.image, 'images');
      }
      if (checkInPostForm.video) {
        video_url = await uploadToStorage(checkInPostForm.video, 'videos');
      }

      // Create post in feed
      const { error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: session.user.id,
          body: checkInPostForm.body.trim() || null,
          image_url,
          video_url,
        });

      if (postError) throw postError;

      // Perform check-in after post is created
      const res = await fetch('/api/growth/habits.checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userTaskId: showCheckInModal.userTaskId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to check in');
      }

      // Reset form and close modal
      setCheckInPostForm({ body: '', image: null, video: null });
      setShowCheckInModal(null);
      
      // Reload tasks to show updated check-in status
      await loadTasks(selectedDirection!);
      // Reload summary after check-in
      await loadSummary();
    } catch (error: any) {
      console.error('Error publishing check-in post:', error);
      alert(error.message || 'Failed to publish post');
    } finally {
      setPublishingPost(false);
    }
  }

  async function checkInHabit(userTaskId: string) {
    // Find the task to pass to modal
    const allTasks = [...tasks.habits, ...tasks.goals];
    const task = allTasks.find((t) => t.userTask?.id === userTaskId);
    if (!task) {
      alert('Task not found');
      return;
    }
    
    openCheckInModal(userTaskId, task);
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

      setShowCompleteModal(null);
      setCompleteForm({ proofUrl: '', note: '' });
      await loadTasks(selectedDirection!);
      // Reload summary after completing goal
      await loadSummary();
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

  const currentDirection = directions.find((d) => d.id === selectedDirection);
  
  // Get top 3 selected directions
  const topSelectedDirections = directions
    .filter((d) => d.isSelected)
    .slice(0, 3);
  
  // Helper function to get emoji for direction
  const getDirectionEmoji = (slug: string) => {
    const emojiMap: Record<string, string> = {
      'learning': '??',
      'career': '??',
      'finance': '??',
      'health': '??',
      'relationships': '??',
      'community': '??',
      'creativity': '??',
      'mindfulness': '?????',
      'personal': '??',
      'digital': '??',
      'education': '??',
      'purpose': '???',
    };
    return emojiMap[slug] || '??';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h1 className={`text-2xl md:text-3xl font-semibold tracking-tight ${isLight ? 'bg-gradient-to-r from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent' : 'gradient-text'}`}>
          Growth Directions
        </h1>
        <p className={`mt-1 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
          Select directions and activate tasks to track your growth.
        </p>
      </div>

      {/* Summary Section */}
      {!loading && (
        <div className={`telegram-card-glow p-4 md:p-6 mb-6 ${isLight ? '' : ''}`}>
          <h2 className={`font-semibold text-lg mb-4 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
            ?? Summary for Work & Analysis
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {/* Top 3 Selected Directions */}
            <div>
              <h3 className={`font-medium text-sm mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                Top 3 Selected Categories
              </h3>
              {topSelectedDirections.length === 0 ? (
                <p className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                  No categories selected
                </p>
              ) : (
                <div className="space-y-2">
                  {topSelectedDirections.map((dir) => (
                    <div
                      key={dir.id}
                      className={`flex items-center gap-2 p-2 rounded-lg ${isLight ? 'bg-telegram-bg-secondary' : 'bg-white/5'}`}
                    >
                      <span className="text-lg">{getDirectionEmoji(dir.slug)}</span>
                      <span className={`text-sm font-medium ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                        {dir.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Habits */}
            <div>
              <h3 className={`font-medium text-sm mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                Active Habits ({allActiveHabits.length})
              </h3>
              {loadingSummary ? (
                <p className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                  Loading...
                </p>
              ) : allActiveHabits.length === 0 ? (
                <p className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                  No active habits
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {allActiveHabits.map((habit) => {
                    const dir = directions.find((d) => d.id === habit.direction_id);
                    return (
                      <div
                        key={habit.id}
                        className={`flex items-center gap-2 p-2 rounded-lg ${isLight ? 'bg-telegram-bg-secondary' : 'bg-white/5'}`}
                      >
                        <span className="text-sm">{getDirectionEmoji(dir?.slug || '')}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium truncate ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                            {habit.title}
                          </p>
                          {habit.userTask && (
                            <p className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                              ?? Streak: {habit.userTask.current_streak} | ? Check-ins: {habit.userTask.total_checkins}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Active Goals */}
            <div>
              <h3 className={`font-medium text-sm mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                Active Goals ({allActiveGoals.length})
              </h3>
              {loadingSummary ? (
                <p className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                  Loading...
                </p>
              ) : allActiveGoals.length === 0 ? (
                <p className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                  No active goals
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {allActiveGoals.map((goal) => {
                    const dir = directions.find((d) => d.id === goal.direction_id);
                    return (
                      <div
                        key={goal.id}
                        className={`flex items-center gap-2 p-2 rounded-lg ${isLight ? 'bg-telegram-bg-secondary' : 'bg-white/5'}`}
                      >
                        <span className="text-sm">{getDirectionEmoji(dir?.slug || '')}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium truncate ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                            {goal.title}
                          </p>
                          {goal.userTask && (
                            <p className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                              Status: {goal.userTask.status === 'active' ? 'Active' : goal.userTask.status === 'completed' ? 'Completed' : 'Archived'}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className={`text-center py-12 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
          Loading?
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Directions List */}
          <div className="lg:col-span-1 space-y-4">
            <div className={`telegram-card-glow p-4 ${isLight ? '' : ''}`}>
              <h2 className={`font-semibold mb-3 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                Directions
              </h2>
              <div className="space-y-2">
                {directions.map((dir) => {
                  const isToggling = toggling.has(dir.id);
                  const isSelected = selectedDirection === dir.id;

                  return (
                    <div
                      key={dir.id}
                      className={`p-3 rounded-xl transition cursor-pointer ${
                        isSelected
                          ? isLight
                            ? 'bg-telegram-blue text-white'
                            : 'bg-telegram-blue text-white'
                          : isLight
                          ? 'border border-telegram-blue/20 hover:bg-telegram-blue/10'
                          : 'border border-telegram-blue/30 hover:bg-telegram-blue/15'
                      }`}
                      onClick={() => setSelectedDirection(dir.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {(() => {
                              // Fix emoji mapping if they come as ?? from DB
                              const emojiMap: Record<string, string> = {
                                'learning': '??',
                            'career': '??',
                            'finance': '??',
                            'health': '??',
                            'relationships': '??',
                            'community': '??',
                            'creativity': '??',
                            'mindfulness': '?????',
                            'personal': '??',
                            'digital': '??',
                            'education': '??',
                            'purpose': '???',
                              };
                              if (dir.emoji === '??' || dir.emoji === '???' || dir.emoji?.includes('?')) {
                                return emojiMap[dir.slug] || dir.emoji;
                              }
                              return dir.emoji || emojiMap[dir.slug] || '??';
                            })()}
                          </span>
                          <span className="font-medium text-sm">{dir.title}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleDirection(dir.id);
                          }}
                          disabled={isToggling}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium transition ${
                            dir.isSelected
                              ? 'bg-white/20 text-white'
                              : isLight
                              ? 'border border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10'
                              : 'border border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15'
                          }`}
                        >
                          {isToggling ? '?' : dir.isSelected ? 'Selected' : 'Add'}
                        </button>
                      </div>
                      {dir.stats.swPoints > 0 && (
                        <div className={`mt-2 text-xs ${isSelected ? 'text-white/80' : isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                          {dir.stats.swPoints} SW points
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tasks View */}
          <div className="lg:col-span-2 space-y-6">
            {selectedDirection ? (
              <>
                  <div className={`telegram-card-glow p-4 ${isLight ? '' : ''}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-3xl">
                        {(() => {
                          // Always use emoji map by slug to ensure correct display
                          if (!currentDirection) return '';
                          const emojiMap: Record<string, string> = {
                            'learning': '??',
                            'career': '??',
                            'finance': '??',
                            'health': '??',
                            'relationships': '??',
                            'community': '??',
                            'creativity': '??',
                            'mindfulness': '?????',
                            'personal': '??',
                            'digital': '??',
                            'education': '??',
                            'purpose': '???',
                          };
                          // Always return emoji from map based on slug
                          return emojiMap[currentDirection.slug] || currentDirection.emoji || '??';
                        })()}
                      </span>
                      <div>
                        <h2 className={`font-semibold text-xl ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                          {currentDirection?.title}
                        </h2>
                        <p className={`text-sm ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                          {currentDirection?.stats.activeHabits} habits, {currentDirection?.stats.activeGoals} goals active
                        </p>
                      </div>
                    </div>
                  </div>

                {loadingTasks ? (
                  <div className={`text-center py-12 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                    Loading tasks?
                  </div>
                ) : (
                  <>
                    {/* Habits */}
                    <div className="space-y-4">
                      <h3 className={`font-semibold text-lg ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                        Habits ({tasks.habits.length})
                      </h3>
                      {tasks.habits.length === 0 ? (
                        <div className={`text-center py-8 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                          No habits available
                        </div>
                      ) : (
                        tasks.habits.map((habit) => {
                          const isActivating = activating.has(habit.id);
                          const isActive = habit.isActivated && habit.userTask?.status === 'active';
                          const isModalOpen = showCheckInModal?.userTaskId === habit.userTask?.id;

                          return (
                            <div
                              key={habit.id}
                              className={`telegram-card-glow p-4 md:p-6 space-y-4 ${isLight ? '' : ''}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h4 className={`font-semibold ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                                      {habit.title}
                                    </h4>
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
                                  <p className={`text-sm mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                                    {habit.description}
                                  </p>
                                  <div className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
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
                                      Total Check-ins
                                    </div>
                                    <div className={`text-lg font-semibold ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                                      {habit.userTask.total_checkins}
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="flex gap-2">
                                {isActive ? (
                                  <>
                                    <Button
                                      onClick={() => checkInHabit(habit.userTask!.id)}
                                      disabled={publishingPost || isModalOpen}
                                      variant="primary"
                                      className="flex-1"
                                    >
                                      {publishingPost && isModalOpen ? 'Publishing...' : 'Check in'}
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

                    {/* Goals */}
                    <div className="space-y-4 mt-8">
                      <h3 className={`font-semibold text-lg ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                        Goals ({tasks.goals.length})
                      </h3>
                      {tasks.goals.length === 0 ? (
                        <div className={`text-center py-8 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                          No goals available
                        </div>
                      ) : (
                        tasks.goals.map((goal) => {
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
                                    <h4 className={`font-semibold ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                                      {goal.title}
                                    </h4>
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
                                  <p className={`text-sm mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                                    {goal.description}
                                  </p>
                                  <div className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                                    {goal.base_points} points
                                  </div>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                {isCompleted ? (
                                  <div className={`text-sm ${isLight ? 'text-green-600' : 'text-green-400'}`}>
                                    Completed on {goal.userTask?.id ? '?' : ''}
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
                  </>
                )}
              </>
            ) : (
              <div className={`text-center py-12 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                Select a direction to view tasks
              </div>
            )}
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

      {/* Check-in Post Modal */}
      {showCheckInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className={`absolute inset-0 ${isLight ? 'bg-black/50' : 'bg-black/80'}`}
            onClick={() => !publishingPost && setShowCheckInModal(null)}
          />
          <div className={`relative z-10 w-full max-w-xl mx-4 ${isLight ? 'bg-white' : 'bg-[rgba(15,22,35,0.95)]'} rounded-2xl p-6 space-y-4`}>
            <div className="flex items-center justify-between">
              <h3 className={`font-semibold text-lg ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                Create Check-in Post
              </h3>
              <button
                onClick={() => !publishingPost && setShowCheckInModal(null)}
                className={`transition ${isLight ? 'text-telegram-text-secondary hover:text-telegram-blue' : 'text-telegram-text-secondary hover:text-telegram-blue-light'}`}
                aria-label="Close"
              >
                ?
              </button>
            </div>
            
            {/* Task Info Display */}
            <div className={`p-3 rounded-xl ${isLight ? 'bg-telegram-bg-secondary' : 'bg-white/5'}`}>
              <div className={`text-xs font-medium mb-1 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                Task Information
              </div>
              <div className={`font-semibold ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                {showCheckInModal.task.title}
              </div>
              <div className={`text-sm mt-1 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                {showCheckInModal.task.description}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                  Post Content
                </label>
                <textarea
                  value={checkInPostForm.body}
                  onChange={(e) => setCheckInPostForm((prev) => ({ ...prev, body: e.target.value }))}
                  placeholder="Add your thoughts about this check-in..."
                  rows={6}
                  className={`input w-full ${isLight ? 'placeholder-telegram-text-secondary/60' : 'placeholder-telegram-text-secondary/50'}`}
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                  Media (optional)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="checkin-image-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (file && file.type.startsWith('image/')) {
                        setCheckInPostForm((prev) => ({ ...prev, image: file, video: null }));
                      }
                    }}
                  />
                  <label
                    htmlFor="checkin-image-input"
                    className={`px-3 py-2 rounded-xl border text-sm cursor-pointer transition ${
                      isLight
                        ? 'border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10'
                        : 'border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15'
                    }`}
                  >
                    ?? Image
                  </label>
                  
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    id="checkin-video-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (file && file.type.startsWith('video/')) {
                        setCheckInPostForm((prev) => ({ ...prev, video: file, image: null }));
                      }
                    }}
                  />
                  <label
                    htmlFor="checkin-video-input"
                    className={`px-3 py-2 rounded-xl border text-sm cursor-pointer transition ${
                      isLight
                        ? 'border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10'
                        : 'border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15'
                    }`}
                  >
                    ?? Video
                  </label>
                  
                  {(checkInPostForm.image || checkInPostForm.video) && (
                    <span className={`text-sm ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                      {checkInPostForm.image ? `Image: ${checkInPostForm.image.name}` : `Video: ${checkInPostForm.video?.name}`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={publishCheckInPost}
                disabled={publishingPost}
                variant="primary"
                className="flex-1"
              >
                {publishingPost ? 'Publishing...' : 'Publish & Check-in'}
              </Button>
              <Button
                onClick={() => {
                  setShowCheckInModal(null);
                  setCheckInPostForm({ body: '', image: null, video: null });
                }}
                disabled={publishingPost}
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
