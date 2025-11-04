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

type CompletedTaskRecord = {
  id: string;
  taskId: string;
  title: string;
  taskType: 'habit' | 'goal';
  pointsAwarded: number;
  basePoints: number;
  completedAt: string;
  postId: number | null;
  direction: {
    id: string;
    title: string;
    slug: string;
    emoji: string;
  };
};

const toTitleCase = (value: string | null | undefined) => {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const getTaskElementId = (item: Pick<TaskSummaryItem, 'id' | 'type'>) =>
  item.type === 'habit' ? `habit-card-${item.id}` : `goal-card-${item.id}`;

const formatPoints = (value: number | null | undefined) => {
  const numeric = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return numeric.toLocaleString('en-US');
};

const IN_DEVELOPMENT_SLUGS = new Set([
  'creativity',
  'mindfulness_purpose',
  'relationships',
  'career',
  'finance',
]);

const isDirectionInDevelopment = (slug: string) => IN_DEVELOPMENT_SLUGS.has(slug);

const COMPLETED_PAGE_SIZE = 5;

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
  const [showCompleteModal, setShowCompleteModal] = useState<{ userTaskId: string; task: Task } | null>(null);
  const [completeForm, setCompleteForm] = useState({ 
    proofUrl: '', 
    note: '',
    body: '',
    image: null as File | null,
    video: null as File | null,
    reactions: [] as string[] // Array of reaction kinds: 'proud', 'grateful', 'drained'
  });
  const [publishingCompletePost, setPublishingCompletePost] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState<{ userTaskId: string; task: Task } | null>(null);
  const [checkInPostForm, setCheckInPostForm] = useState({ 
    body: '', 
    image: null as File | null, 
    video: null as File | null,
    reactions: [] as string[] // Array of reaction kinds: 'proud', 'grateful', 'drained'
  });
  const [publishingPost, setPublishingPost] = useState(false);
  const [summaryTasks, setSummaryTasks] = useState<{ primary: TaskSummaryItem[]; secondary: TaskSummaryItem[] }>({
    primary: [],
    secondary: [],
  });
  const [focusTask, setFocusTask] = useState<TaskSummaryItem | null>(null);
  const [pinnedTask, setPinnedTask] = useState<TaskSummaryItem | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type?: 'success' | 'error' } | null>(null);
  const [completedTasks, setCompletedTasks] = useState<CompletedTaskRecord[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [completedPage, setCompletedPage] = useState(0);
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const [resettingAllTasks, setResettingAllTasks] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [resettingAchievements, setResettingAchievements] = useState(false);

  useEffect(() => {
    loadDirections();
    checkAdmin();
  }, []);

  async function checkAdmin() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsAdmin(false);
        return;
      }
      const { data, error } = await supabase.rpc('is_admin_uid');
      setIsAdmin(data ?? false);
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
    }
  }

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
    loadCompletedTasks();
  }, []);

  useEffect(() => {
    setCompletedPage((prev) => {
      const maxPage = Math.max(0, Math.ceil(completedTasks.length / COMPLETED_PAGE_SIZE) - 1);
      return Math.min(prev, maxPage);
    });
  }, [completedTasks.length]);

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
      
      // Enforce limit: max 3 priority directions
      if (selectedPrimaryDirections.length > 3) {
        const extraPrimary = selectedPrimaryDirections.slice(3);
        alert('You can only keep three priority directions. The most recently added extras were deselected.');

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
            console.error('Error enforcing priority limit:', toggleError);
          }
        }

        const refreshedRes = await fetch('/api/growth/directions.list', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!refreshedRes.ok) {
          throw new Error('Failed to refresh directions after enforcing priority limit');
        }

        const { directions: refreshedDirs } = await refreshedRes.json();
        dedupedBySlug = prepareDirections(Array.isArray(refreshedDirs) ? refreshedDirs : []);
      }

      setDirections(dedupedBySlug);

      setSelectedDirection((prev) => {
        if (prev && dedupedBySlug.some((dir) => dir.id === prev)) {
          return prev;
        }

        const firstPrimarySelected = dedupedBySlug.find(
          (dir) => dir.isSelected && dir.isPrimary && !isDirectionInDevelopment(dir.slug)
        );
        if (firstPrimarySelected) {
          return firstPrimarySelected.id;
        }

        const firstSelected = dedupedBySlug.find(
          (dir) => dir.isSelected && !isDirectionInDevelopment(dir.slug)
        );
        if (firstSelected) {
          return firstSelected.id;
        }

        // Default to Community & Society if available
        const communityDirection = dedupedBySlug.find((dir) => dir.slug === 'community');
        if (communityDirection) {
          return communityDirection.id;
        }

        // Otherwise find first direction that's not in development
        const availableDirections = dedupedBySlug.filter((dir) => !isDirectionInDevelopment(dir.slug));

        return availableDirections[0]?.id ?? dedupedBySlug[0]?.id ?? null;
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
            // For selected directions, dir.isPrimary comes from user_selected_directions.is_primary
            // true = Primary, false = Additional
            // For unselected directions with active tasks, treat as Additional (false)
            let directionIsPrimary = false;
            if (dir.isSelected) {
              // For selected directions, use the isPrimary value from the API
              // This comes from user_selected_directions.is_primary
              directionIsPrimary = dir.isPrimary === true;
            } else {
              // For unselected directions with active tasks, treat as Additional
              directionIsPrimary = false;
            }

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
      // Primary tasks: directionIsPrimary === true
      // Secondary tasks: directionIsPrimary === false (including undefined/null)
      const primaryTasks = uniqueSummaryItems.filter((item) => item.directionIsPrimary === true);
      const secondaryTasks = uniqueSummaryItems.filter((item) => {
        // Include all tasks that are NOT primary (false, undefined, null)
        return item.directionIsPrimary !== true;
      });

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

  async function loadCompletedTasks() {
    setLoadingCompleted(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setCompletedTasks([]);
        setTotalPoints(0);
        return;
      }

      const res = await fetch('/api/growth/completed.tasks', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load completed tasks');
      }

      const { completedTasks: tasks, totalPoints: points } = await res.json();
      const normalizedTasks: CompletedTaskRecord[] = Array.isArray(tasks)
        ? tasks.map((task: any) => ({
            ...task,
            postId:
              typeof task?.postId === 'number' && Number.isFinite(task.postId)
                ? task.postId
                : typeof task?.postId === 'string' && !Number.isNaN(Number(task.postId))
                ? Number(task.postId)
                : null,
          }))
        : [];
      setCompletedTasks(normalizedTasks);
      setTotalPoints(points || 0);
      setCompletedPage(0);
    } catch (error: any) {
      console.error('Error loading completed tasks:', error);
      setCompletedTasks([]);
      setTotalPoints(0);
      setCompletedPage(0);
    } finally {
      setLoadingCompleted(false);
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

    // Check if direction is in development (inactive)
    const isInDevelopment = isDirectionInDevelopment(direction.slug);

    if (isInDevelopment) {
      setNotification({ message: 'This direction is currently in development and cannot be selected' });
      return;
    }

    const selectedPrimaryCount = directions.reduce(
      (count, dir) => (dir.isSelected && dir.isPrimary ? count + 1 : count),
      0
    );

    if (!direction.isSelected) {
      // When selecting a category, it always becomes primary (priority)
      // Check if limit is reached (max 3 primary directions)
      if (selectedPrimaryCount >= 3) {
        setNotification({ message: 'Cannot add more than 3 primary directions' });
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

    // Check if direction is in development (inactive)
    const isInDevelopment = isDirectionInDevelopment(taskDirection.slug);

    if (isInDevelopment) {
      setNotification({ message: 'Cannot activate tasks from directions that are currently in development' });
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

  async function resetAllTasks() {
    const activeTasksCount = summaryTasks.primary.length + summaryTasks.secondary.length;
    
    if (activeTasksCount === 0) {
      setNotification({ message: 'No active tasks to reset' });
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to reset all ${activeTasksCount} active tasks? This will deactivate all habits and goals currently in work.`
    );

    if (!confirmed) {
      return;
    }

    setResettingAllTasks(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setNotification({ message: 'Session expired. Please refresh the page.' });
        return;
      }

      const res = await fetch('/api/growth/tasks.resetAll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to reset tasks' }));
        throw new Error(errorData.error || 'Failed to reset tasks');
      }

      const { count } = await res.json();
      setNotification({ 
        message: `Successfully reset ${count || activeTasksCount} task${count !== 1 ? 's' : ''}` 
      });

      // Reload all data
      await loadSummary();
      if (selectedDirection) {
        await loadTasks(selectedDirection);
      }
      await loadCompletedTasks();
    } catch (error: any) {
      console.error('Error resetting all tasks:', error);
      setNotification({ message: error.message || 'Failed to reset tasks' });
    } finally {
      setResettingAllTasks(false);
    }
  }

  async function resetAllAchievements() {
    if (!isAdmin) {
      setNotification({ message: 'Admin access required' });
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to reset all achievements? This will delete all completed tasks, check-ins, and points. This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    setResettingAchievements(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setNotification({ message: 'Session expired. Please refresh the page.' });
        return;
      }

      const res = await fetch('/api/growth/achievements.resetAll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to reset achievements' }));
        throw new Error(errorData.error || 'Failed to reset achievements');
      }

      setNotification({ 
        message: 'All achievements have been reset successfully',
        type: 'success'
      });

      // Reload all data
      await loadCompletedTasks();
      await loadDirections();
      if (selectedDirection) {
        await loadTasks(selectedDirection);
      }
      await loadSummary();
    } catch (error: any) {
      console.error('Error resetting achievements:', error);
      setNotification({ message: error.message || 'Failed to reset achievements' });
    } finally {
      setResettingAchievements(false);
    }
  }

  function openCheckInModal(userTaskId: string, task: Task) {
    setShowCheckInModal({ userTaskId, task });
    // Pre-fill post with task information
    const taskInfo = `${task.title}\n${task.description}`;
    setCheckInPostForm({ body: taskInfo, image: null, video: null, reactions: [] });
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

      // Get direction for category - use title without emoji
      const taskDirection = directions.find((d) => d.id === showCheckInModal.task.direction_id);
      // Clean title from emoji or extra characters - take only text
      let category = taskDirection?.title || null;
      if (category) {
        // Remove emoji and special characters - keep only alphanumeric, spaces, &, and common punctuation
        // Remove emoji pattern: match emoji unicode ranges
        category = category
          .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emoji range 1
          .replace(/[\u{2600}-\u{26FF}]/gu, '') // Emoji range 2
          .replace(/[\u{2700}-\u{27BF}]/gu, '') // Emoji range 3
          .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoji range 4
          .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Emoji range 5
          .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Emoji range 6
          .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '') // Emoji range 7
          .trim();
        // If after removing emoji the string is empty or only whitespace, use original title
        if (!category || category.length === 0) {
          category = taskDirection?.title || null;
        }
      }

      // Create post in feed
      const { data: newPost, error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: session.user.id,
          body: checkInPostForm.body.trim() || null,
          image_url,
          video_url,
          category,
        })
        .select('id')
        .single();

      if (postError) throw postError;

      // Add reactions if any selected
      if (newPost && checkInPostForm.reactions.length > 0) {
        const reactionInserts = checkInPostForm.reactions.map((kind) => ({
          post_id: newPost.id,
          user_id: session.user.id,
          kind,
        }));

        const { error: reactionsError } = await supabase
          .from('post_reactions')
          .insert(reactionInserts);

        if (reactionsError) {
          console.error('Error adding reactions:', reactionsError);
          // Don't fail the whole operation if reactions fail
        }
      }

      // Perform check-in after post is created
      const res = await fetch('/api/growth/habits.checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userTaskId: showCheckInModal.userTaskId, postId: newPost?.id ?? null }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to check in');
      }

      // Reset form and close modal
      setCheckInPostForm({ body: '', image: null, video: null, reactions: [] });
      setShowCheckInModal(null);
      
      // Reload tasks to show updated check-in status
      await loadTasks(selectedDirection!);
      // Reload summary after check-in
      await loadSummary();
      // Reload completed tasks to update total points
      await loadCompletedTasks();
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
    if (!showCompleteModal) return;
    if (completing.has(userTaskId) || publishingCompletePost) return;
    
    // Check if post should be created
    const shouldCreatePost = Boolean(
      completeForm.body.trim() ||
        completeForm.image ||
        completeForm.video ||
        completeForm.reactions.length > 0
    );

    setPublishingCompletePost(shouldCreatePost);
    setCompleting((prev) => new Set(prev).add(userTaskId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Sign in required');
        return;
      }

      let createdPostId: number | null = null;

      // Create post if needed
      if (shouldCreatePost) {
        let image_url: string | null = null;
        let video_url: string | null = null;
        
        if (completeForm.image) {
          image_url = await uploadToStorage(completeForm.image, 'images');
        }
        if (completeForm.video) {
          video_url = await uploadToStorage(completeForm.video, 'videos');
        }

        // Get direction for category - use title without emoji
        const taskDirection = directions.find((d) => d.id === showCompleteModal.task.direction_id);
        // Clean title from emoji or extra characters - take only text
        let category = taskDirection?.title || null;
        if (category) {
          // Remove emoji and special characters - keep only alphanumeric, spaces, &, and common punctuation
          category = category
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emoji range 1
            .replace(/[\u{2600}-\u{26FF}]/gu, '') // Emoji range 2
            .replace(/[\u{2700}-\u{27BF}]/gu, '') // Emoji range 3
            .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoji range 4
            .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Emoji range 5
            .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Emoji range 6
            .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '') // Emoji range 7
            .trim();
          if (!category || category.length === 0) {
            category = taskDirection?.title || null;
          }
        }

        // Create post in feed
        const { data: newPost, error: postError } = await supabase
          .from('posts')
          .insert({
            user_id: session.user.id,
            body: completeForm.body.trim() || null,
            image_url,
            video_url,
            category,
          })
          .select('id')
          .single();

        if (postError) throw postError;

        createdPostId = newPost?.id ?? null;

        // Add reactions if any selected
        if (newPost && completeForm.reactions.length > 0) {
          const reactionInserts = completeForm.reactions.map((kind) => ({
            post_id: newPost.id,
            user_id: session.user.id,
            kind,
          }));

          const { error: reactionsError } = await supabase
            .from('post_reactions')
            .insert(reactionInserts);

          if (reactionsError) {
            console.error('Error adding reactions:', reactionsError);
            // Don't fail the whole operation if reactions fail
          }
        }
      }

      // Complete the goal
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
          postId: createdPostId,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to complete goal');
      }

      setShowCompleteModal(null);
      setCompleteForm({ proofUrl: '', note: '', body: '', image: null, video: null, reactions: [] });
      await loadTasks(selectedDirection!);
      // Reload summary after completing goal
      await loadSummary();
      // Reload completed tasks to show new completion
      await loadCompletedTasks();
    } catch (error: any) {
      console.error('Error completing goal:', error);
      alert(error.message || 'Failed to complete goal');
    } finally {
      setPublishingCompletePost(false);
      setCompleting((prev) => {
        const next = new Set(prev);
        next.delete(userTaskId);
        return next;
      });
    }
  }

  const currentDirection = directions.find((d) => d.id === selectedDirection);

  const selectedPrimaryDirections = directions.filter((d) => d.isSelected && d.isPrimary);
  const selectedPrimaryCount = selectedPrimaryDirections.length;
  const primaryLimitReached = selectedPrimaryCount >= 3;
  const displayedHabits = getDisplayedTasks(tasks.habits, 'habit');
  const displayedGoals = getDisplayedTasks(tasks.goals, 'goal');
  const extraHabits = Math.max(0, tasks.habits.length - displayedHabits.length);
  const extraGoals = Math.max(0, tasks.goals.length - displayedGoals.length);
  const totalHabits = tasks.habits.length;
  const totalGoals = tasks.goals.length;
  const totalCompletedPages = Math.ceil(completedTasks.length / COMPLETED_PAGE_SIZE) || 1;
  const paginatedCompletedTasks = completedTasks.slice(
    completedPage * COMPLETED_PAGE_SIZE,
    completedPage * COMPLETED_PAGE_SIZE + COMPLETED_PAGE_SIZE
  );
  const completedRangeStart = completedTasks.length === 0 ? 0 : completedPage * COMPLETED_PAGE_SIZE + 1;
  const completedRangeEnd = completedTasks.length === 0
    ? 0
    : Math.min(completedTasks.length, completedPage * COMPLETED_PAGE_SIZE + paginatedCompletedTasks.length);

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
                <p className={`text-xs font-semibold mt-1 flex items-center gap-1 ${isLight ? 'text-telegram-blue' : 'text-telegram-blue-light'}`}>
                  <span aria-hidden="true">{String.fromCodePoint(0x1F3C6)}</span>
                  {formatPoints(item.basePoints)} pts
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-2xl md:text-3xl font-semibold tracking-tight ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
              Growth Directions
            </h1>
            <p className={`mt-1 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
              Select directions and activate tasks to track your growth.
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button
                onClick={resetAllAchievements}
                disabled={resettingAchievements}
                variant="secondary"
                className="text-sm"
              >
                {resettingAchievements ? 'Resetting...' : 'Reset All Achievements'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-[9999] text-white px-6 py-3 rounded-lg shadow-lg animate-in fade-in slide-in-from-top-5 ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-lg" aria-hidden="true">
              {notification.type === 'success' ? String.fromCodePoint(0x2705) : String.fromCodePoint(0x26A0)}
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


      {/* Completed Tasks & Total Points Section */}
      {!loading && (
        <div className={`p-4 md:p-6 mb-6 rounded-lg border ${isLight ? 'bg-telegram-bg-secondary border-telegram-blue/10' : 'bg-white/5 border-telegram-blue/20'}`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
            <div>
              <h2 className={`font-semibold text-base mb-1 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                {String.fromCodePoint(0x1F389)} Completed Tasks & Points
              </h2>
              <p className={`text-sm ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                Track your achievements and earned points
              </p>
            </div>
            <div className={`relative inline-flex items-center justify-center px-6 py-4 rounded-2xl ${
              isLight 
                ? 'bg-gradient-to-r from-telegram-blue/10 to-telegram-blue-light/10 border-2 border-telegram-blue/20' 
                : 'bg-gradient-to-r from-telegram-blue/20 to-telegram-blue-light/20 border-2 border-telegram-blue/30'
            }`}>
              <div className="text-center">
                <div className={`text-xs uppercase tracking-wider mb-1 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                  Total Points
                </div>
                <div className={`text-3xl font-bold bg-gradient-to-r ${isLight ? 'from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent' : 'from-telegram-blue-light to-telegram-blue bg-clip-text text-transparent'}`}>
                  {totalPoints.toLocaleString('en-US')}
                </div>
              </div>
            </div>
          </div>

          {loadingCompleted ? (
            <div className={`text-center py-12 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
              <div className="inline-flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-telegram-blue border-t-transparent rounded-full animate-spin"></div>
                <span>Loading completed tasks...</span>
              </div>
            </div>
          ) : completedTasks.length === 0 ? (
            <div className={`text-center py-12 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
              <div className="text-4xl mb-3">{String.fromCodePoint(0x1F4ED)}</div>
              <p className="text-sm font-medium">No completed tasks yet</p>
              <p className="text-xs mt-1 opacity-70">Complete your first goal to see it here!</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className={`border-b ${isLight ? 'border-telegram-blue/10' : 'border-telegram-blue/20'}`}>
                      <th className={`py-2 px-3 text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                        Task
                      </th>
                      <th className={`py-2 px-3 text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                        Type
                      </th>
                      <th className={`py-2 px-3 text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                        Direction
                      </th>
                      <th className={`py-2 px-3 text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                        Completed
                      </th>
                      <th className={`py-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-right ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                        Points
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCompletedTasks.map((task, index) => (
                      <tr
                        key={task.id}
                        className={`text-xs ${
                          isLight
                            ? 'hover:bg-telegram-blue/5 border-b border-telegram-blue/5'
                            : 'hover:bg-white/5 border-b border-white/5'
                        } ${index % 2 === 0 ? (isLight ? 'bg-telegram-bg-secondary/40' : 'bg-white/5') : ''}`}
                      >
                        <td className="py-2 px-3 align-middle">
                          <div className="flex items-center gap-2">
                            <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${
                              task.taskType === 'habit'
                                ? 'bg-emerald-500/10'
                                : 'bg-blue-500/10'
                            }`}>
                              <span className="text-lg">
                                {resolveDirectionEmoji(task.direction.slug, task.direction.emoji)}
                              </span>
                            </div>
                            <div>
                              <div className={`font-semibold text-sm leading-tight ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                                {task.title}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 align-middle">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                              task.taskType === 'habit'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-blue-500/15 text-blue-400'
                            }`}
                          >
                            {task.taskType === 'habit' ? 'Habit' : 'Goal'}
                          </span>
                        </td>
                        <td className={`py-2 px-3 align-middle text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                          {task.direction.title}
                        </td>
                        <td className={`py-2 px-3 align-middle text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                          {task.completedAt ? (
                            <div className="flex flex-col leading-tight">
                              <span className="font-medium text-[11px]">{new Date(task.completedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}</span>
                              <span className="text-[10px] opacity-70">
                                {new Date(task.completedAt).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                })}
                              </span>
                            </div>
                          ) : (
                            <span className="opacity-50">{String.fromCodePoint(0x2014)}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 align-middle">
                          <div className="flex flex-col items-end leading-tight">
                            <div className={`text-sm font-semibold ${isLight ? 'text-telegram-blue' : 'text-telegram-blue-light'}`}>
                              {task.pointsAwarded.toLocaleString('en-US')}
                            </div>
                            {task.pointsAwarded !== task.basePoints && (
                              <div className={`text-[10px] ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                                <span className="opacity-70">base: {task.basePoints.toLocaleString('en-US')}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {completedTasks.length > COMPLETED_PAGE_SIZE && (
                <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-xs">
                  <span className={`${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                    Showing {completedRangeStart}-{completedRangeEnd} of {completedTasks.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCompletedPage((prev) => Math.max(prev - 1, 0))}
                      disabled={completedPage === 0}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition ${
                        completedPage === 0
                          ? 'opacity-40 cursor-not-allowed'
                          : isLight
                          ? 'border-telegram-blue/40 text-telegram-blue hover:bg-telegram-blue/10'
                          : 'border-telegram-blue/40 text-telegram-blue-light hover:bg-telegram-blue/15'
                      }`}
                    >
                      Prev
                    </button>
                    <span className={`text-[11px] font-medium ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                      Page {completedPage + 1} / {totalCompletedPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCompletedPage((prev) => Math.min(prev + 1, totalCompletedPages - 1))}
                      disabled={completedPage >= totalCompletedPages - 1}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition ${
                        completedPage >= totalCompletedPages - 1
                          ? 'opacity-40 cursor-not-allowed'
                          : isLight
                          ? 'border-telegram-blue/40 text-telegram-blue hover:bg-telegram-blue/10'
                          : 'border-telegram-blue/40 text-telegram-blue-light hover:bg-telegram-blue/15'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
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
            <div className={`p-4 rounded-lg border ${isLight ? 'bg-telegram-bg-secondary border-telegram-blue/10' : 'bg-white/5 border-telegram-blue/20'}`}>
              <h2 className={`font-semibold mb-3 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                Directions
              </h2>
              <div className="space-y-2">
                {directions
                  .filter((dir) => {
                    // Filter out directions in development
                    return !isDirectionInDevelopment(dir.slug);
                  })
                  .map((dir) => {
                  const isToggling = toggling.has(dir.id);
                  const isSelected = selectedDirection === dir.id;
                  
                  // Check if direction is in development
                  const isInDevelopment = isDirectionInDevelopment(dir.slug);
                  
                  // When selecting a category, it always becomes primary (priority)
                  // Disable selection if limit is reached (max 3 primary directions)
                  const disableSelection = (!dir.isSelected && primaryLimitReached) || isInDevelopment;
                  const buttonLabel = isToggling
                    ? '...'
                    : isInDevelopment
                    ? 'In development'
                    : dir.isSelected
                    ? 'Selected'
                    : disableSelection
                    ? 'Limit'
                    : 'Add';

                  return (
                    <div
                      key={dir.id}
                      className={`p-3 rounded-xl transition ${
                        isInDevelopment 
                          ? 'cursor-not-allowed opacity-60' 
                          : 'cursor-pointer'
                      } ${
                        isSelected
                          ? isLight
                            ? 'bg-telegram-blue text-white'
                            : 'bg-telegram-blue text-white'
                          : isLight
                          ? 'border border-telegram-blue/20 hover:bg-telegram-blue/10'
                          : 'border border-telegram-blue/30 hover:bg-telegram-blue/15'
                      }`}
                      onClick={() => {
                        if (!isInDevelopment) {
                          setSelectedDirection(dir.id);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-medium text-sm">{dir.title}</span>
                            <div className={`text-[10px] uppercase tracking-wide ${isSelected ? 'text-white/70' : isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                              {isInDevelopment ? 'In development' : dir.isSelected ? 'Priority direction' : 'Available'}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (disableSelection || isInDevelopment) return;
                            toggleDirection(dir.id);
                          }}
                          disabled={isToggling || disableSelection || isInDevelopment}
                          title={
                            isInDevelopment 
                              ? 'This direction is currently in development' 
                              : (!dir.isSelected && primaryLimitReached)
                              ? 'Cannot add more than 3 priority directions' 
                              : undefined
                          }
                          className={`px-2 py-0.5 rounded-full text-xs font-medium transition ${
                            isInDevelopment
                              ? 'border border-gray-400/30 text-gray-400 cursor-not-allowed'
                              : dir.isSelected
                              ? 'bg-white/20 text-white'
                              : isLight
                              ? 'border border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10'
                              : 'border border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15'
                          } ${(disableSelection || isInDevelopment) && !dir.isSelected ? 'opacity-60 cursor-not-allowed' : ''}`}
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
                  <div className={`p-4 rounded-lg border mb-6 ${isLight ? 'bg-telegram-bg-secondary border-telegram-blue/10' : 'bg-white/5 border-telegram-blue/20'}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div>
                        <h2 className={`font-semibold text-base ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
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
                        <h3 className={`font-semibold text-base ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                          Habits ({totalHabits})
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
                              className={`p-4 md:p-6 space-y-4 rounded-lg border transition ${
                                isHighlighted ? 'ring-2 ring-telegram-blue' : ''
                              } ${isLight ? 'bg-telegram-bg-secondary border-telegram-blue/10' : 'bg-white/5 border-telegram-blue/20'}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
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
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                        isLight
                                          ? 'bg-telegram-blue/15 text-telegram-blue'
                                          : 'bg-telegram-blue/20 text-telegram-blue-light'
                                      }`}
                                    >
                                      <span aria-hidden="true">{String.fromCodePoint(0x1F3C6)}</span>
                                      {formatPoints(habit.base_points)} pts
                                    </span>
                                  </div>
                                  <p className={`text-sm mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                                    {habit.description}
                                  </p>
                                  <div className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                                    Earn {formatPoints(habit.base_points)} pts per check-in
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
                        <h3 className={`font-semibold text-base ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                          Goals ({totalGoals})
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
                              className={`p-4 md:p-6 space-y-4 rounded-lg border transition ${
                                isHighlighted ? 'ring-2 ring-telegram-blue' : ''
                              } ${isLight ? 'bg-telegram-bg-secondary border-telegram-blue/10' : 'bg-white/5 border-telegram-blue/20'}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
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
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                        isLight
                                          ? 'bg-telegram-blue/15 text-telegram-blue'
                                          : 'bg-telegram-blue/20 text-telegram-blue-light'
                                      }`}
                                    >
                                      <span aria-hidden="true">{String.fromCodePoint(0x1F3C6)}</span>
                                      {formatPoints(goal.base_points)} pts
                                    </span>
                                  </div>
                                  <p className={`text-sm mb-2 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                                    {goal.description}
                                  </p>
                                  <div className={`text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                                    Earn {formatPoints(goal.base_points)} pts when completed
                                  </div>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                {isCompleted ? (
                                  <Button
                                    onClick={() => activateTask(goal.id)}
                                    disabled={isActivating}
                                    variant="primary"
                                    className="flex-1"
                                  >
                                    {isActivating ? 'Reactivating...' : 'Activate again'}
                                  </Button>
                                ) : isActive ? (
                                  <>
                                    <Button
                                      onClick={() => {
                                        // Use goal directly since it's already a Task object from displayedGoals
                                        setShowCompleteModal({ userTaskId: goal.userTask!.id, task: goal });
                                        // Pre-fill post with goal information
                                        const goalInfo = `${goal.title}\n${goal.description}`;
                                        setCompleteForm({ proofUrl: '', note: '', body: goalInfo, image: null, video: null, reactions: [] });
                                      }}
                                      disabled={isCompleting || publishingCompletePost}
                                      variant="primary"
                                      className="flex-1"
                                    >
                                      {(isCompleting || publishingCompletePost) ? 'Completing...' : 'Complete'}
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
            className={`absolute inset-0 ${isLight ? 'bg-black/60' : 'bg-black/90'}`}
            onClick={() => !publishingCompletePost && !completing.has(showCompleteModal.userTaskId) && setShowCompleteModal(null)}
          />
          <div className={`relative z-10 w-full max-w-xl mx-4 ${isLight ? 'bg-gradient-to-br from-telegram-blue/10 to-telegram-blue-light/10 border-2 border-telegram-blue/30 bg-white' : 'bg-gradient-to-br from-telegram-blue/20 to-telegram-blue-light/20 border-2 border-telegram-blue/40 bg-[rgba(15,22,35,0.98)]'} rounded-xl p-4 space-y-2 shadow-2xl`}>
            <div className="flex items-center justify-between">
              <h3 className={`font-semibold text-base ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                Complete Goal & Publish
              </h3>
              <button
                onClick={() => !publishingCompletePost && !completing.has(showCompleteModal.userTaskId) && setShowCompleteModal(null)}
                className={`transition ${isLight ? 'text-telegram-text-secondary hover:text-telegram-blue' : 'text-telegram-text-secondary hover:text-telegram-blue-light'}`}
                aria-label="Close"
              >
                ?
              </button>
            </div>
            
            {/* Task Info Display */}
            <div className={`p-2 rounded-lg ${isLight ? 'bg-telegram-blue/10 border border-telegram-blue/20' : 'bg-telegram-blue/15 border border-telegram-blue/30'}`}>
              <div className={`text-[10px] font-medium mb-0.5 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                Goal Information
              </div>
              <div className={`font-semibold text-sm ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                {showCompleteModal.task.title}
              </div>
              <div className={`text-xs mt-0.5 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                {showCompleteModal.task.description}
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                  Post Content
                </label>
                <div className="relative">
                  <textarea
                    value={completeForm.body}
                    onChange={(e) => setCompleteForm((prev) => ({ ...prev, body: e.target.value }))}
                    placeholder="Share your achievement and thoughts about completing this goal..."
                    rows={6}
                    className={`input w-full pr-10 ${isLight ? 'placeholder-telegram-text-secondary/60' : 'placeholder-telegram-text-secondary/50'}`}
                  />
                  <div className="absolute bottom-2 right-2">
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      id="complete-media-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (file) {
                          if (file.type.startsWith('image/')) {
                            setCompleteForm((prev) => ({ ...prev, image: file, video: null }));
                          } else if (file.type.startsWith('video/')) {
                            setCompleteForm((prev) => ({ ...prev, video: file, image: null }));
                          }
                        }
                      }}
                    />
                    <label
                      htmlFor="complete-media-input"
                      className={`inline-flex items-center px-2 py-1.5 rounded-lg border text-xs cursor-pointer transition ${
                        isLight
                          ? 'border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10 bg-white'
                          : 'border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15 bg-[rgba(15,22,35,0.98)]'
                      }`}
                      title="Attach photo or video"
                    >
                      {String.fromCodePoint(0x1F4F7)}
                    </label>
                  </div>
                  {(completeForm.image || completeForm.video) && (
                    <div className={`mt-1 text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                      {completeForm.image ? completeForm.image.name : completeForm.video?.name}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className={`block text-xs font-medium mb-0.5 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                  Category (auto)
                </label>
                <div className={`p-1.5 rounded-lg ${isLight ? 'bg-telegram-blue/10 border border-telegram-blue/20' : 'bg-telegram-blue/15 border border-telegram-blue/30'}`}>
                  <span className={`text-xs ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                    {(() => {
                      const taskDirection = directions.find((d) => d.id === showCompleteModal.task.direction_id);
                      return taskDirection ? `${resolveDirectionEmoji(taskDirection.slug, taskDirection.emoji)} ${taskDirection.title}` : 'Not specified';
                    })()}
                  </span>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                  Reactions
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { kind: 'proud', emoji: String.fromCodePoint(0x1F7E2), label: 'Proud' }, // ??
                    { kind: 'grateful', emoji: String.fromCodePoint(0x1FA75), label: 'Grateful' }, // ??
                    { kind: 'drained', emoji: String.fromCodePoint(0x26AB), label: 'Drained' }, // ?
                  ].map((reaction) => {
                    const isSelected = completeForm.reactions.includes(reaction.kind);
                    return (
                      <button
                        key={reaction.kind}
                        type="button"
                        onClick={() => {
                          setCompleteForm((prev) => ({
                            ...prev,
                            reactions: isSelected
                              ? prev.reactions.filter((r) => r !== reaction.kind)
                              : [...prev.reactions, reaction.kind],
                          }));
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                          isSelected
                            ? isLight
                              ? 'bg-telegram-blue text-white border-telegram-blue shadow-md'
                              : 'bg-telegram-blue text-white border-telegram-blue shadow-md'
                            : isLight
                            ? 'border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10'
                            : 'border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15'
                        }`}
                      >
                        <span className="mr-1">{reaction.emoji}</span>
                        {reaction.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => completeGoal(showCompleteModal.userTaskId)}
                disabled={publishingCompletePost || completing.has(showCompleteModal.userTaskId)}
                variant="primary"
                className="flex-1"
              >
                {publishingCompletePost ? 'Publishing...' : completing.has(showCompleteModal.userTaskId) ? 'Completing...' : 'Complete & Publish'}
              </Button>
              <Button
                onClick={() => {
                  setShowCompleteModal(null);
                  setCompleteForm({ proofUrl: '', note: '', body: '', image: null, video: null, reactions: [] });
                }}
                disabled={publishingCompletePost || completing.has(showCompleteModal.userTaskId)}
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
            className={`absolute inset-0 ${isLight ? 'bg-black/60' : 'bg-black/90'}`}
            onClick={() => !publishingPost && setShowCheckInModal(null)}
          />
          <div className={`relative z-10 w-full max-w-xl mx-4 ${isLight ? 'bg-gradient-to-br from-telegram-blue/10 to-telegram-blue-light/10 border-2 border-telegram-blue/30 bg-white' : 'bg-gradient-to-br from-telegram-blue/20 to-telegram-blue-light/20 border-2 border-telegram-blue/40 bg-[rgba(15,22,35,0.98)]'} rounded-xl p-4 space-y-2 shadow-2xl`}>
            <div className="flex items-center justify-between">
              <h3 className={`font-semibold text-base ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
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
            <div className={`p-2 rounded-lg ${isLight ? 'bg-telegram-bg-secondary' : 'bg-white/5'}`}>
              <div className={`text-[10px] font-medium mb-0.5 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                Task Information
              </div>
              <div className={`font-semibold text-sm ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                {showCheckInModal.task.title}
              </div>
              <div className={`text-xs mt-0.5 ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                {showCheckInModal.task.description}
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                  Post Content
                </label>
                <div className="relative">
                  <textarea
                    value={checkInPostForm.body}
                    onChange={(e) => setCheckInPostForm((prev) => ({ ...prev, body: e.target.value }))}
                    placeholder="Add your thoughts about this check-in..."
                    rows={6}
                    className={`input w-full pr-10 ${isLight ? 'placeholder-telegram-text-secondary/60' : 'placeholder-telegram-text-secondary/50'}`}
                  />
                  <div className="absolute bottom-2 right-2">
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      id="checkin-media-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (file) {
                          if (file.type.startsWith('image/')) {
                            setCheckInPostForm((prev) => ({ ...prev, image: file, video: null }));
                          } else if (file.type.startsWith('video/')) {
                            setCheckInPostForm((prev) => ({ ...prev, video: file, image: null }));
                          }
                        }
                      }}
                    />
                    <label
                      htmlFor="checkin-media-input"
                      className={`inline-flex items-center px-2 py-1.5 rounded-lg border text-xs cursor-pointer transition ${
                        isLight
                          ? 'border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10 bg-white'
                          : 'border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15 bg-[rgba(15,22,35,0.98)]'
                      }`}
                      title="Attach photo or video"
                    >
                      {String.fromCodePoint(0x1F4F7)}
                    </label>
                  </div>
                  {(checkInPostForm.image || checkInPostForm.video) && (
                    <div className={`mt-1 text-xs ${isLight ? 'text-telegram-text-secondary' : 'text-telegram-text-secondary'}`}>
                      {checkInPostForm.image ? checkInPostForm.image.name : checkInPostForm.video?.name}
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                  Category (automatically set)
                </label>
                <div className={`p-2 rounded-lg ${isLight ? 'bg-telegram-bg-secondary' : 'bg-white/5'}`}>
                  <span className={`text-sm ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                    {(() => {
                      const taskDirection = directions.find((d) => d.id === showCheckInModal.task.direction_id);
                      return taskDirection ? `${resolveDirectionEmoji(taskDirection.slug, taskDirection.emoji)} ${taskDirection.title}` : 'Not specified';
                    })()}
                  </span>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
                  Reactions
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { kind: 'proud', emoji: String.fromCodePoint(0x1F7E2), label: 'Proud' }, // ??
                    { kind: 'grateful', emoji: String.fromCodePoint(0x1FA75), label: 'Grateful' }, // ??
                    { kind: 'drained', emoji: String.fromCodePoint(0x26AB), label: 'Drained' }, // ?
                  ].map((reaction) => {
                    const isSelected = checkInPostForm.reactions.includes(reaction.kind);
                    return (
                      <button
                        key={reaction.kind}
                        type="button"
                        onClick={() => {
                          setCheckInPostForm((prev) => ({
                            ...prev,
                            reactions: isSelected
                              ? prev.reactions.filter((r) => r !== reaction.kind)
                              : [...prev.reactions, reaction.kind],
                          }));
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                          isSelected
                            ? isLight
                              ? 'bg-telegram-blue text-white border-telegram-blue'
                              : 'bg-telegram-blue text-white border-telegram-blue'
                            : isLight
                            ? 'border-telegram-blue/30 text-telegram-blue hover:bg-telegram-blue/10'
                            : 'border-telegram-blue/30 text-telegram-blue-light hover:bg-telegram-blue/15'
                        }`}
                      >
                        <span className="mr-1">{reaction.emoji}</span>
                        {reaction.label}
                      </button>
                    );
                  })}
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
                  setCheckInPostForm({ body: '', image: null, video: null, reactions: [] });
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
