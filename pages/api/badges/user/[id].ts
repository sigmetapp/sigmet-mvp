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

  // Get current metric value
  switch (badge.metric) {
    case 'total_posts':
      currentValue = metrics.total_posts;
      break;
    case 'total_comments':
      currentValue = metrics.total_comments;
      break;
    case 'likes_given':
      currentValue = metrics.likes_given;
      break;
    case 'likes_received':
    case 'total_likes_received':
      currentValue = metrics.likes_received;
      break;
    case 'distinct_commenters':
      currentValue = metrics.distinct_commenters;
      break;
    case 'invited_users_total':
      currentValue = metrics.invited_users_total;
      break;
    case 'invited_users_with_activity':
      currentValue = metrics.invited_users_with_activity;
      break;
    case 'comments_on_others_posts':
      currentValue = metrics.comments_on_others_posts;
      break;
    case 'threads_with_10_comments':
      currentValue = metrics.threads_with_10_comments;
      break;
    case 'earned_badges_count':
      currentValue = metrics.earned_badges_count;
      break;
    case 'total_posts_last_30d':
      currentValue = metrics.total_posts_last_30d;
      break;
    case 'consecutive_active_days':
      currentValue = metrics.consecutive_active_days;
      break;
    case 'weekly_active_streak':
      currentValue = metrics.weekly_active_streak;
      break;
    case 'active_days':
      currentValue = metrics.active_days;
      break;
    case 'social_weight':
      currentValue = metrics.social_weight;
      break;
    case 'composite_posts_comments_3_5':
      // For composite, progress is average of sub-ratios
      const progress3_5 = Math.min(
        (metrics.total_posts / 3 + metrics.total_comments / 5) / 2,
        1
      );
      return {
        progress: progress3_5,
        currentValue: progress3_5 >= 1 ? 1 : 0,
      };
    case 'composite_posts_comments_5_10':
      const progress5_10 = Math.min(
        (metrics.total_posts / 5 + metrics.total_comments / 10) / 2,
        1
      );
      return {
        progress: progress5_10,
        currentValue: progress5_10 >= 1 ? 1 : 0,
      };
    case 'composite_posts_comments_20_50':
      const progress20_50 = Math.min(
        (metrics.total_posts / 20 + metrics.total_comments / 50) / 2,
        1
      );
      return {
        progress: progress20_50,
        currentValue: progress20_50 >= 1 ? 1 : 0,
      };
    case 'comment_likes_from_distinct_users':
      // This metric needs special handling - for now set to 0
      currentValue = 0;
      break;
    default:
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
        const earned = earnedBadgeKeys.has(badge.key);
        const { progress, currentValue } = calculateProgress(
          catalogBadge || {
            key: badge.key,
            metric: badge.metric,
            threshold: badge.threshold,
          } as any,
          metrics as UserMetrics
        );

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
          progress: earned ? 1 : progress,
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
