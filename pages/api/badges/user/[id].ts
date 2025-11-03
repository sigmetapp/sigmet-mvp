import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { BADGE_CATALOG } from '@/lib/badges/catalog';

interface UserMetrics {
  total_posts: number;
  total_comments: number;
  likes_given: number;
  likes_received: number;
  distinct_commenters: number;
  invited_users_total: number;
  invited_users_with_activity: number;
  comments_on_others_posts: number;
  threads_with_10_comments: number;
  earned_badges_count: number;
  total_posts_last_30d: number;
  consecutive_active_days: number;
  weekly_active_streak: number;
  active_days: number;
  social_weight: number;
}

interface BadgeWithProgress {
  key: string;
  title: string;
  description: string;
  how_to_get: string;
  metric: string;
  threshold: number;
  icon: string;
  color_start: string;
  color_end: string;
  shape: string;
  category: string;
  earned: boolean;
  awardedAt?: string;
  progress: number;
  currentValue: number;
  is_active?: boolean;
}

function calculateProgress(
  badge: typeof BADGE_CATALOG[0],
  metrics: UserMetrics
): { progress: number; currentValue: number } {
  let currentValue = 0;

  // Get current metric value (ensure null/undefined values default to 0)
  switch (badge.metric) {
    case 'total_posts':
      currentValue = metrics.total_posts || 0;
      break;
    case 'total_comments':
      currentValue = metrics.total_comments || 0;
      break;
    case 'likes_given':
      currentValue = metrics.likes_given || 0;
      break;
    case 'likes_received':
    case 'total_likes_received':
      currentValue = metrics.likes_received || 0;
      break;
    case 'distinct_commenters':
      currentValue = metrics.distinct_commenters || 0;
      break;
    case 'invited_users_total':
      currentValue = metrics.invited_users_total || 0;
      break;
    case 'invited_users_with_activity':
      currentValue = metrics.invited_users_with_activity || 0;
      break;
    case 'comments_on_others_posts':
      currentValue = metrics.comments_on_others_posts || 0;
      break;
    case 'threads_with_10_comments':
      currentValue = metrics.threads_with_10_comments || 0;
      break;
    case 'earned_badges_count':
      currentValue = metrics.earned_badges_count || 0;
      break;
    case 'total_posts_last_30d':
      currentValue = metrics.total_posts_last_30d || 0;
      break;
    case 'consecutive_active_days':
      currentValue = metrics.consecutive_active_days || 0;
      break;
    case 'weekly_active_streak':
      currentValue = metrics.weekly_active_streak || 0;
      break;
    case 'active_days':
      currentValue = metrics.active_days || 0;
      break;
    case 'social_weight':
      currentValue = metrics.social_weight || 0;
      break;
    case 'composite_posts_comments_3_5':
      // For composite, progress is average of sub-ratios
      // threshold is 1 (both conditions must be met)
      const posts3 = metrics.total_posts || 0;
      const comments3 = metrics.total_comments || 0;
      const progress3_5 = Math.min(
        (posts3 / 3 + comments3 / 5) / 2,
        1
      );
      // For composite badges, currentValue represents combined progress (0-1 range)
      // We'll scale it to show meaningful numbers
      return {
        progress: progress3_5,
        currentValue: Math.floor(progress3_5 * 100), // Show as percentage (0-100)
      };
    case 'composite_posts_comments_5_10':
      const posts5 = metrics.total_posts || 0;
      const comments5 = metrics.total_comments || 0;
      const progress5_10 = Math.min(
        (posts5 / 5 + comments5 / 10) / 2,
        1
      );
      return {
        progress: progress5_10,
        currentValue: Math.floor(progress5_10 * 100),
      };
    case 'composite_posts_comments_20_50':
      const posts20 = metrics.total_posts || 0;
      const comments20 = metrics.total_comments || 0;
      const progress20_50 = Math.min(
        (posts20 / 20 + comments20 / 50) / 2,
        1
      );
      return {
        progress: progress20_50,
        currentValue: Math.floor(progress20_50 * 100),
      };
    case 'comment_likes_from_distinct_users':
      // This metric needs special handling - for now set to 0
      // TODO: Implement comment_likes_from_distinct_users metric calculation
      currentValue = 0;
      break;
    default:
      // Unknown metric - mark as not implemented
      // currentValue stays 0, which will show as "Locked"
      console.warn(`Unknown badge metric: ${badge.metric}`);
      currentValue = 0;
  }

  // Calculate progress
  const progress = Math.min(currentValue / badge.threshold, 1);

  return { progress, currentValue };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const admin = supabaseAdmin();

    // Get user metrics (initialize if needed)
    let { data: metrics, error: metricsError } = await admin
      .from('user_metrics')
      .select('*')
      .eq('user_id', id)
      .single();

    if (metricsError || !metrics) {
      // Initialize metrics if they don't exist
      const { error: initError } = await admin.rpc('initialize_user_metrics', {
        user_uuid: id,
      });
      if (initError) {
        console.error('Error initializing metrics:', initError);
      }

      // Try again
      const { data: newMetrics, error: newMetricsError } = await admin
        .from('user_metrics')
        .select('*')
        .eq('user_id', id)
        .single();

      if (newMetricsError || !newMetrics) {
        return res.status(404).json({ error: 'User metrics not found' });
      }
      metrics = newMetrics;
    }

    // Refresh metrics from actual activity before calculating progress
    const { error: recalcError } = await admin.rpc('recalculate_user_metrics', {
      user_uuid: id,
      recalc_all: false,
    });
    if (recalcError) {
      console.error('Error recalculating metrics:', recalcError);
    } else {
      const { data: refreshedMetrics, error: refreshedMetricsError } = await admin
        .from('user_metrics')
        .select('*')
        .eq('user_id', id)
        .single();

      if (!refreshedMetricsError && refreshedMetrics) {
        metrics = refreshedMetrics as UserMetrics;
      }
    }

    const metricsObject = { ...(metrics as UserMetrics) };

    const parseCount = (value: unknown): number | null => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? null : parsed;
      }
      return null;
    };

    const { data: totalPostsCount, error: totalPostsError } = await admin.rpc(
      'count_user_posts',
      { user_uuid: id }
    );
    if (totalPostsError) {
      console.error('Error counting total posts:', totalPostsError);
    } else {
      const parsed = parseCount(totalPostsCount);
      if (parsed !== null) {
        metricsObject.total_posts = parsed;
      }
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentPostsCount, error: recentPostsError } = await admin.rpc(
      'count_user_posts',
      { user_uuid: id, since: thirtyDaysAgo }
    );
    if (recentPostsError) {
      console.error('Error counting recent posts:', recentPostsError);
    } else {
      const parsedRecent = parseCount(recentPostsCount);
      if (parsedRecent !== null) {
        metricsObject.total_posts_last_30d = parsedRecent;
      }
    }

    metrics = metricsObject;

    // Run evaluation to ensure badges are granted when thresholds met
    const { error: evalError } = await admin.rpc('evaluate_user_badges', {
      user_uuid: id,
    });
    if (evalError) {
      console.error('Error evaluating badges:', evalError);
    }

    // Get all badges (including inactive for admins to toggle)
    const { data: badges, error: badgesError } = await admin
      .from('badges')
      .select('*')
      .order('category', { ascending: true })
      .order('created_at', { ascending: true });

    if (badgesError) {
      console.error('Error fetching badges:', badgesError);
      return res.status(500).json({ error: badgesError.message });
    }

    // Get earned badges
    const { data: earnedBadges, error: earnedError } = await admin
      .from('user_badges')
      .select('badge_key, awarded_at')
      .eq('user_id', id);

    if (earnedError) {
      console.error('Error fetching earned badges:', earnedError);
      return res.status(500).json({ error: earnedError.message });
    }

    const earnedBadgeKeys = new Set(
      (earnedBadges || []).map((b) => b.badge_key)
    );
    const earnedBadgesMap = new Map(
      (earnedBadges || []).map((b) => [b.badge_key, b.awarded_at])
    );

    // Combine badges with progress and earned status
    const badgesWithProgress: BadgeWithProgress[] = (badges || []).map(
      (badge) => {
        const catalogBadge = BADGE_CATALOG.find((b) => b.key === badge.key);
        const { progress, currentValue } = calculateProgress(
          catalogBadge || {
            key: badge.key,
            metric: badge.metric,
            threshold: badge.threshold,
          } as any,
          metrics as UserMetrics
        );

        let earned = earnedBadgeKeys.has(badge.key);
        const normalizedProgress = earned ? 1 : progress;

        if (!earned && normalizedProgress >= 1) {
          earned = true;
        }

        return {
          key: badge.key,
          title: badge.title,
          description: badge.description,
          how_to_get: badge.how_to_get,
          metric: badge.metric,
          threshold: badge.threshold,
          icon: badge.icon,
          color_start: badge.color_start,
          color_end: badge.color_end,
          shape: badge.shape,
          category: badge.category,
          earned,
          awardedAt: earned ? earnedBadgesMap.get(badge.key) : undefined,
          progress: earned ? 1 : normalizedProgress,
          currentValue,
          is_active: badge.is_active !== false, // Default to true if not set
        };
      }
    );

    // Separate earned and next-to-earn (only show active badges)
    const activeBadges = badgesWithProgress.filter(
      (b) => b.is_active !== false
    );
    const earned = activeBadges.filter((b) => b.earned);
    const nextToEarn = activeBadges
      .filter((b) => !b.earned && b.progress > 0)
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 5);

    return res.status(200).json({
      earned,
      nextToEarn,
      all: badgesWithProgress, // Include all badges (active and inactive) for admin UI
      metrics: metrics as UserMetrics,
    });
  } catch (error: any) {
    console.error('badges/user/[id] error:', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}
