"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import Button from '@/components/Button';
import { useTheme } from '@/components/ThemeProvider';
import { resolveDirectionEmoji } from '@/lib/directions';

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

type TaskSummaryItem = {
  id: string;
  type: Task['task_type'];
  title: string;
  period: Task['period'];
  directionId: string;
  directionTitle: string;
  directionSlug: string;
  directionIsPrimary: boolean;
  userTaskId: string | null;
  basePoints: number;
};

const toTitleCase = (value: string | null | undefined) => {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const getTaskElementId = (item: Pick<TaskSummaryItem, 'id' | 'type'>) =>
  item.type === 'habit' ? `habit-card-${item.id}` : `goal-card-${item.id}`;

const prepareDirections = (rawDirections: Direction[]) => {
  const uniqueSortedDirections = Array.from(
    new Map(rawDirections.map((dir) => [dir.id, dir])).values()
  )
    .sort((a, b) => a.sort_index - b.sort_index)
    .map((dir) => ({
      ...dir,
      emoji: resolveDirectionEmoji(dir.slug, dir.emoji),
    }));

  return uniqueSortedDirections.filter(
    (dir, index, array) => array.findIndex((candidate) => candidate.slug === dir.slug) === index
  );
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
  const [summaryTasks, setSummaryTasks] = useState<{ primary: TaskSummaryItem[]; secondary: TaskSummaryItem[] }>({
    primary: [],
    secondary: [],
  });
  const [focusTask, setFocusTask] = useState<TaskSummaryItem | null>(null);
  const [pinnedTask, setPinnedTask] = useState<TaskSummaryItem | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [notification, setNotification] = useState<{ message: string } | null>(null);

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
  }, [directions, selectedDirection, tasks]);

  useEffect(() => {
    if (pinnedTask && pinnedTask.directionId !== selectedDirection) {
      setPinnedTask(null);
    }
  }, [selectedDirection, pinnedTask]);

  useEffect(() => {
    if (!focusTask) return;
    if (focusTask.directionId !== selectedDirection) return;

    const targetId = getTaskElementId(focusTask);
    const timeout = window.setTimeout(() => {
      focusTaskCard(targetId);
      setFocusTask(null);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [focusTask, selectedDirection, tasks]);

  useEffect(() => {
    if (!highlightedTaskId) return;

    const timeout = window.setTimeout(() => setHighlightedTaskId(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [highlightedTaskId]);

  useEffect(() => {
    if (!notification) return;

    const timeout = window.setTimeout(() => setNotification(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notification]);

  async function loadDirections() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setDirections([]);
        setSelectedDirection(null);
        return;
      }

      const res = await fetch('/api/growth/directions.list', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load directions');
      }

      const { directions: dirs } = await res.json();
      const rawDirections: Direction[] = Array.isArray(dirs) ? dirs : [];

      let dedupedBySlug = prepareDirections(rawDirections);

      const selectedPrimaryDirections = dedupedBySlug.filter((dir) => dir.isSelected && dir.isPrimary);
      const selectedSecondaryDirections = dedupedBySlug.filter((dir) => dir.isSelected && !dir.isPrimary);
      
      if (selectedPrimaryDirections.length > 3) {
        const extraPrimary = selectedPrimaryDirections.slice(3);
        alert('You can only keep three primary directions. The most recently added extras were deselected.');

        for (const extra of extraPrimary) {
          try {
            await fetch('/api/growth/directions.toggle', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ directionId: extra.id }),
            });
          } catch (toggleError) {
            console.error('Error enforcing primary limit:', toggleError);
          }
        }

        const refreshedRes = await fetch('/api/growth/directions.list', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!refreshedRes.ok) {
          throw new Error('Failed to refresh directions after enforcing primary limit');
        }

        const { directions: refreshedDirs } = await refreshedRes.json();
        dedupedBySlug = prepareDirections(Array.isArray(refreshedDirs) ? refreshedDirs : []);
      }
      
      // Also check secondary limit
      const refreshedSecondaryCount = dedupedBySlug.filter((dir) => dir.isSelected && !dir.isPrimary).length;
      if (refreshedSecondaryCount > 3) {
        const extraSecondary = dedupedBySlug.filter((dir) => dir.isSelected && !dir.isPrimary).slice(3);
        alert('You can only keep three additional directions. The most recently added extras were deselected.');

        for (const extra of extraSecondary) {
          try {
            await fetch('/api/growth/directions.toggle', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ directionId: extra.id }),
            });
          } catch (toggleError) {
            console.error('Error enforcing secondary limit:', toggleError);
          }
        }

        const refreshedRes = await fetch('/api/growth/directions.list', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!refreshedRes.ok) {
          throw new Error('Failed to refresh directions after enforcing secondary limit');
        }

        const { directions: refreshedDirs } = await refreshedRes.json();
        dedupedBySlug = prepareDirections(Array.isArray(refreshedDirs) ? refreshedDirs : []);
      }

      setDirections(dedupedBySlug);

      setSelectedDirection((prev) => {
        if (prev && dedupedBySlug.some((dir) => dir.id === prev)) {
          return prev;
        }

        const firstPrimarySelected = dedupedBySlug.find((dir) => dir.isSelected && dir.isPrimary);
        if (firstPrimarySelected) {
          return firstPrimarySelected.id;
        }

        const firstSelected = dedupedBySlug.find((dir) => dir.isSelected);
        if (firstSelected) {
          return firstSelected.id;
        }

        return dedupedBySlug[0]?.id ?? null;
      });
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
      if (!session) {
        setSummaryTasks({ primary: [], secondary: [] });
        return;
      }

      // Include all selected directions and directions with active tasks
      const relevantDirections = directions.filter(
        (dir) =>
          dir.isSelected ||
          dir.stats.activeHabits > 0 ||
          dir.stats.activeGoals > 0
      );

      if (relevantDirections.length === 0) {
        setSummaryTasks({ primary: [], secondary: [] });
        return;
      }

      const summaryItems: TaskSummaryItem[] = [];
      const isTaskInWork = (task: Task) => task.isActivated && (!task.userTask || task.userTask.status === 'active');

      // Load tasks for all relevant directions (selected or currently active)
      // Process each direction to ensure all tasks are included
      await Promise.all(
        relevantDirections.map(async (dir) => {
          try {
            let directionTasks: { habits: Task[]; goals: Task[] } = { habits: [], goals: [] };

            if (dir.id === selectedDirection) {
              directionTasks = tasks;
            } else {
              const res = await fetch(`/api/growth/tasks.list?directionId=${dir.id}`, {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              });

              if (!res.ok) {
                throw new Error('Failed to load tasks');
              }

              const { habits, goals } = await res.json();

              const uniqueHabits = Array.from(
                new Map((habits || []).map((habit: Task) => [habit.id, habit])).values()
              );
              const uniqueGoals = Array.from(
                new Map((goals || []).map((goal: Task) => [goal.id, goal])).values()
              );

              directionTasks = { habits: uniqueHabits, goals: uniqueGoals };
            }

            const activeHabits = (directionTasks.habits || []).filter(isTaskInWork);
            const activeGoals = (directionTasks.goals || []).filter(isTaskInWork);

            // Ensure isPrimary is correctly set - use dir.isPrimary from the directions list
            const directionIsPrimary = dir.isPrimary ?? false;

            activeHabits.forEach((habit) => {
              summaryItems.push({
                id: habit.id,
                type: 'habit',
                title: habit.title,
                period: habit.period,
                directionId: dir.id,
                directionTitle: dir.title,
                directionSlug: dir.slug,
                directionIsPrimary: directionIsPrimary,
                userTaskId: habit.userTask?.id ?? null,
                basePoints: habit.base_points,
              });
            });

            activeGoals.forEach((goal) => {
              summaryItems.push({
                id: goal.id,
                type: 'goal',
                title: goal.title,
                period: goal.period,
                directionId: dir.id,
                directionTitle: dir.title,
                directionSlug: dir.slug,
                directionIsPrimary: directionIsPrimary,
                userTaskId: goal.userTask?.id ?? null,
                basePoints: goal.base_points,
              });
            });
          } catch (summaryError) {
            console.error(`Error loading tasks for direction ${dir.id}:`, summaryError);
          }
        })
      );

      const uniqueSummaryItems = Array.from(
        new Map(
          summaryItems.map((item) => [item.userTaskId ?? `${item.id}-${item.type}`, item])
        ).values()
      ).sort((a, b) => {
        if (a.directionIsPrimary !== b.directionIsPrimary) {
          return a.directionIsPrimary ? -1 : 1;
        }
        if (a.directionTitle === b.directionTitle) {
          return a.title.localeCompare(b.title);
        }
        return a.directionTitle.localeCompare(b.directionTitle);
      });

      // Filter tasks by isPrimary - ensure strict boolean comparison
      const primaryTasks = uniqueSummaryItems.filter((item) => item.directionIsPrimary === true);
      const secondaryTasks = uniqueSummaryItems.filter((item) => item.directionIsPrimary === false);

      // Ensure all tasks are properly categorized and included
      setSummaryTasks({
        primary: primaryTasks,
        secondary: secondaryTasks,
      });
    } catch (error: any) {
      console.error('Error loading summary:', error);
      setSummaryTasks({ primary: [], secondary: [] });
    } finally {
      setLoadingSummary(false);
    }
  }

  const getDisplayedTasks = (list: Task[], type: Task['task_type']) => {
    const targetId =
      pinnedTask && pinnedTask.type === type && pinnedTask.directionId === selectedDirection
        ? pinnedTask.id
        : undefined;

    if (!targetId) {
      return list.slice(0, 3);
    }

    const targetIndex = list.findIndex((task) => task.id === targetId);
    if (targetIndex === -1) {
      return list.slice(0, 3);
    }

    const prioritized = [
      list[targetIndex],
      ...list.slice(0, targetIndex),
      ...list.slice(targetIndex + 1),
    ];

    return prioritized.slice(0, 3);
  };

  function focusTaskCard(targetId: string) {
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedTaskId(targetId);
    }
  }

  function handleSummaryTaskClick(item: TaskSummaryItem) {
    setPinnedTask(item);
    if (item.directionId !== selectedDirection) {
      setFocusTask(item);
      setSelectedDirection(item.directionId);
      return;
    }

    setFocusTask(item);
  }

  async function toggleDirection(directionId: string) {
    if (toggling.has(directionId)) return;
    const direction = directions.find((d) => d.id === directionId);
    if (!direction) return;

    const selectedPrimaryCount = directions.reduce(
      (count, dir) => (dir.isSelected && dir.isPrimary ? count + 1 : count),
      0
    );
    const selectedSecondaryCount = directions.reduce(
      (count, dir) => (dir.isSelected && !dir.isPrimary ? count + 1 : count),
      0
    );

    if (!direction.isSelected) {
      if (direction.isPrimary && selectedPrimaryCount >= 3) {
        setNotification({ message: 'Cannot add more than 3 primary directions' });
        return;
      }
      if (!direction.isPrimary && selectedSecondaryCount >= 3) {
        setNotification({ message: 'Cannot add more than 3 additional directions' });
        return;
      }
    }

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
        const errorData = await res.json().catch(() => ({ error: 'Failed to toggle direction' }));
        throw new Error(errorData.error || 'Failed to toggle direction');
      }

      await loadDirections();
    } catch (error: any) {
      console.error('Error toggling direction:', error);
      setNotification({ message: error.message || 'Failed to toggle direction' });
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
    
    // Find the task to determine its direction
    const allTasks = [...tasks.habits, ...tasks.goals];
    const task = allTasks.find((t) => t.id === taskId);
    
    if (!task) {
      setNotification({ message: 'Task not found' });
      return;
    }
    
    // Find the direction for this task
    const taskDirection = directions.find((d) => d.id === task.direction_id);
    
    if (!taskDirection) {
      setNotification({ message: 'Direction not found for task' });
      return;
    }
    
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
      setNotification({ message: error.message || 'Failed to activate task' });
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
    const taskInfo = `${String.fromCodePoint(0x1F4CB)} Task: ${task.title}

${String.fromCodePoint(0x1F4DD)} Description: ${task.description}

${String.fromCodePoint(0x2705)} Check-in progress`;
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

  const selectedPrimaryDirections = directions.filter((d) => d.isSelected && d.isPrimary);
  const selectedSecondaryDirections = directions.filter((d) => d.isSelected && !d.isPrimary);
  const selectedPrimaryCount = selectedPrimaryDirections.length;
  const selectedSecondaryCount = selectedSecondaryDirections.length;
  const primaryLimitReached = selectedPrimaryCount >= 3;
  const secondaryLimitReached = selectedSecondaryCount >= 3;
  const displayedHabits = getDisplayedTasks(tasks.habits, 'habit');
  const displayedGoals = getDisplayedTasks(tasks.goals, 'goal');
  const extraHabits = Math.max(0, tasks.habits.length - displayedHabits.length);
  const extraGoals = Math.max(0, tasks.goals.length - displayedGoals.length);

  const renderSummaryTaskList = (list: TaskSummaryItem[]) => {
    if (loadingSummary) {
      return (
        <div className="min-h-[120px] flex items-center">
          <p className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
            Loading...
          </p>
        </div>
      );
    }

    if (list.length === 0) {
      return (
        <div className="min-h-[120px] flex items-center">
          <p className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
            No cards in work yet
          </p>
        </div>
      );
    }

    return (
      <>
        <div className="space-y-2 min-h-[120px]">
          {list.map((item) => (
            <button
              key={`${item.directionId}-${item.id}-${item.type}`}
              type="button"
              onClick={() => handleSummaryTaskClick(item)}
              className={`w-full text-left flex items-center gap-3 p-2 rounded-lg transition relative ${
                isLight ? 'bg-telegram-bg-secondary hover:bg-telegram-blue/10' : 'bg-white/5 hover:bg-white/10'
              } ${item.directionIsPrimary ? 'ring-2 ring-telegram-blue/30' : ''}`}
            >
              {item.directionIsPrimary && (
                <div className="absolute top-0 right-0 w-2 h-2 bg-telegram-blue rounded-full"></div>
              )}
              <span className="text-lg">
                {resolveDirectionEmoji(item.directionSlug)}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                  {item.title}
                </p>
                <p className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                  {item.type === 'habit'
                    ? `Habit${item.period ? ` - ${toTitleCase(item.period)}` : ''}`
                    : 'Goal'}
                  {` - ${item.directionTitle}`}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                  item.type === 'habit'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-blue-500/15 text-blue-400'
                }`}
              >
                {item.type === 'habit' ? 'Habit' : 'Goal'}
              </span>
            </button>
          ))}
        </div>
      </>
    );
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

      {/* Notification */}
      {notification && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg animate-in fade-in slide-in-from-top-5">
          <div className="flex items-center gap-3">
            <span className="text-lg" aria-hidden="true">
              {String.fromCodePoint(0x26A0)}
            </span>
            <p className="font-medium">{notification.message}</p>
            <button
              onClick={() => setNotification(null)}
              className="ml-4 text-white/80 hover:text-white transition"
              aria-label="Close notification"
            >
              {String.fromCodePoint(0x2715)}
            </button>
          </div>
        </div>
      )}

      {/* Summary Section */}
      {!loading && (
        <div className={`telegram-card-glow p-4 md:p-6 mb-6 ${isLight ? '' : ''} min-h-[400px]`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className={`font-semibold text-lg ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
              {String.fromCodePoint(0x1F4CA)} Work & Focus Overview
            </h2>
            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <span className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                Primary: {selectedPrimaryCount} / 3, Additional: {selectedSecondaryCount} / 3
              </span>
              <span className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                Active tasks: {summaryTasks.primary.length + summaryTasks.secondary.length} total
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <section className="min-h-[200px]">
              <h3 className={`font-medium text-sm mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                Habits
                {(() => {
                  const allHabits = [...summaryTasks.primary, ...summaryTasks.secondary].filter(item => item.type === 'habit');
                  return allHabits.length > 0 ? ` (${allHabits.length})` : '';
                })()}
              </h3>
              {/* Priority Habits */}
              {summaryTasks.primary.filter(item => item.type === 'habit').length > 0 && (
                <div className="mb-4">
                  <h4 className={`text-xs font-medium mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                    Priority Directions ({summaryTasks.primary.filter(item => item.type === 'habit').length})
                  </h4>
                  {renderSummaryTaskList(summaryTasks.primary.filter(item => item.type === 'habit'))}
                </div>
              )}
              {/* Additional Habits */}
              {summaryTasks.secondary.filter(item => item.type === 'habit').length > 0 && (
                <div>
                  <h4 className={`text-xs font-medium mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                    Additional Directions ({summaryTasks.secondary.filter(item => item.type === 'habit').length})
                  </h4>
                  {renderSummaryTaskList(summaryTasks.secondary.filter(item => item.type === 'habit'))}
                </div>
              )}
              {/* Empty state */}
              {summaryTasks.primary.filter(item => item.type === 'habit').length === 0 && 
               summaryTasks.secondary.filter(item => item.type === 'habit').length === 0 && 
               !loadingSummary && (
                <div className="min-h-[120px] flex items-center">
                  <p className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                    No habits in work yet
                  </p>
                </div>
              )}
            </section>

            <section className="min-h-[200px]">
              <h3 className={`font-medium text-sm mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                Goals
                {(() => {
                  const allGoals = [...summaryTasks.primary, ...summaryTasks.secondary].filter(item => item.type === 'goal');
                  return allGoals.length > 0 ? ` (${allGoals.length})` : '';
                })()}
              </h3>
              {/* Priority Goals */}
              {summaryTasks.primary.filter(item => item.type === 'goal').length > 0 && (
                <div className="mb-4">
                  <h4 className={`text-xs font-medium mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                    Priority Directions ({summaryTasks.primary.filter(item => item.type === 'goal').length})
                  </h4>
                  {renderSummaryTaskList(summaryTasks.primary.filter(item => item.type === 'goal'))}
                </div>
              )}
              {/* Additional Goals */}
              {summaryTasks.secondary.filter(item => item.type === 'goal').length > 0 && (
                <div>
                  <h4 className={`text-xs font-medium mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                    Additional Directions ({summaryTasks.secondary.filter(item => item.type === 'goal').length})
                  </h4>
                  {renderSummaryTaskList(summaryTasks.secondary.filter(item => item.type === 'goal'))}
                </div>
              )}
              {/* Empty state */}
              {summaryTasks.primary.filter(item => item.type === 'goal').length === 0 && 
               summaryTasks.secondary.filter(item => item.type === 'goal').length === 0 && 
               !loadingSummary && (
                <div className="min-h-[120px] flex items-center">
                  <p className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                    No goals in work yet
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {loading ? (
        <div className={`text-center py-12 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
          Loading...
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
                  const disableSelectionPrimary = !dir.isSelected && dir.isPrimary && primaryLimitReached;
                  const disableSelectionSecondary = !dir.isSelected && !dir.isPrimary && secondaryLimitReached;
                  const disableSelection = disableSelectionPrimary || disableSelectionSecondary;
                  const buttonLabel = isToggling
                    ? '...'
                    : dir.isSelected
                    ? 'Selected'
                    : disableSelection
                    ? 'Limit'
                    : 'Add';

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
                          <div>
                            <span className="font-medium text-sm">{dir.title}</span>
                            <div className={`text-[10px] uppercase tracking-wide ${isSelected ? 'text-white/70' : isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                              {dir.isPrimary ? 'Primary direction' : 'Additional direction'}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (disableSelection) return;
                            toggleDirection(dir.id);
                          }}
                          disabled={isToggling || disableSelection}
                          title={disableSelectionPrimary ? 'Cannot add more than 3 primary directions' : disableSelectionSecondary ? 'Cannot add more than 3 additional directions' : undefined}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium transition ${
                            dir.isSelected
                              ? 'bg-white/20 text-white'
                              : isLight
                              ? 'border border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10'
                              : 'border border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15'
                          } ${disableSelection && !dir.isSelected ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {buttonLabel}
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
                    Loading tasks...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                    {/* Habits */}
                    <section className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className={`font-semibold text-lg ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                          Habits ({displayedHabits.length})
                        </h3>
                        {extraHabits > 0 && (
                          <span className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                            +{extraHabits} more available
                          </span>
                        )}
                      </div>
                      {displayedHabits.length === 0 ? (
                        <div className={`text-center py-8 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                          No habits available
                        </div>
                      ) : (
                        displayedHabits.map((habit) => {
                          const isActivating = activating.has(habit.id);
                          const isActive = habit.isActivated && habit.userTask?.status === 'active';
                          const isModalOpen = showCheckInModal?.userTaskId === habit.userTask?.id;
                          const elementId = `habit-card-${habit.id}`;
                          const isHighlighted = highlightedTaskId === elementId;

                          return (
                            <div
                              key={habit.id}
                              id={elementId}
                              className={`telegram-card-glow p-4 md:p-6 space-y-4 transition ${
                                isHighlighted ? 'ring-2 ring-telegram-blue shadow-lg' : ''
                              } ${isLight ? '' : ''}`}
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
                                      {`${String.fromCodePoint(0x1F525)} ${habit.userTask.current_streak}`}
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
                                    {isActivating ? 'Activating...' : 'Activate'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </section>

                    {/* Goals */}
                    <section className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className={`font-semibold text-lg ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                          Goals ({displayedGoals.length})
                        </h3>
                        {extraGoals > 0 && (
                          <span className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                            +{extraGoals} more available
                          </span>
                        )}
                      </div>
                      {displayedGoals.length === 0 ? (
                        <div className={`text-center py-8 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                          No goals available
                        </div>
                      ) : (
                        displayedGoals.map((goal) => {
                          const isActivating = activating.has(goal.id);
                          const isCompleting = completing.has(goal.userTask?.id || '');
                          const isActive = goal.isActivated && goal.userTask?.status === 'active';
                          const isCompleted = goal.userTask?.status === 'completed';
                          const elementId = `goal-card-${goal.id}`;
                          const isHighlighted = highlightedTaskId === elementId;

                          return (
                            <div
                              key={goal.id}
                              id={elementId}
                              className={`telegram-card-glow p-4 md:p-6 space-y-4 transition ${
                                isHighlighted ? 'ring-2 ring-telegram-blue shadow-lg' : ''
                              } ${isLight ? '' : ''}`}
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
                                    Completed
                                  </div>
                                ) : isActive ? (
                                  <>
                                    <Button
                                      onClick={() => setShowCompleteModal({ taskId: goal.id, userTaskId: goal.userTask!.id })}
                                      disabled={isCompleting}
                                      variant="primary"
                                      className="flex-1"
                                    >
                                      {isCompleting ? 'Completing...' : 'Complete'}
                                    </Button>
                                    <Button
                                      onClick={() => deactivateTask(goal.userTask!.id)}
                                      disabled={isActivating}
                                      variant="secondary"
                                    >
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    onClick={() => activateTask(goal.id)}
                                    disabled={isActivating}
                                    variant="primary"
                                    className="flex-1"
                                  >
                                    {isActivating ? 'Activating...' : 'Activate'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </section>
                  </div>
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
                    {`${String.fromCodePoint(0x1F5BC)} Image`}
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
                    {`${String.fromCodePoint(0x1F3A5)} Video`}
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
