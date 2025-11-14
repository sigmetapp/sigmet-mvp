'use client';

import { useState, useEffect, useRef, TouchEvent, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import { Bell, MessageSquare, Heart, Shield, X, TrendingUp, Flame, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import Link from 'next/link';

interface Notification {
  id: number;
    type:
      | 'comment_on_post'
      | 'comment_on_comment'
      | 'reaction_on_post'
      | 'reaction_on_comment'
      | 'goal_reaction'
      | 'trust_flow_entry'
      | 'sw_level_update';
  actor_id: string | null;
  post_id: number | string | null;
  comment_id: number | string | null;
    sw_level: string | null;
      trust_push_id?: number | string | null;
      goal_id?: string | null;
      goal_reaction_kind?: string | null;
  read_at: string | null;
  created_at: string;
  actor?: {
    user_id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  };
  post?: {
    id: number | string;
    text?: string | null;
    body?: string | null;
    author_id?: string | null;
    user_id?: string | null;
  } | null;
  comment?: {
    id: number | string;
    text?: string | null;
    body?: string | null;
    post_id: number | string;
    author_id?: string | null;
    user_id?: string | null;
    parent_id?: number | string | null;
  } | null;
    trust_push?: {
      id: number | string;
      type: 'positive' | 'negative';
      reason: string | null;
      created_at?: string | null;
    } | null;
}

const NOTIFICATIONS_PER_PAGE = 30;

export default function AlertPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingRead, setMarkingRead] = useState<number | null>(null);
  const [hiding, setHiding] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
    const [debugInfo, setDebugInfo] = useState<any>(null);
    const [debugError, setDebugError] = useState<string | null>(null);
    const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const swipeStartX = useRef<number | null>(null);
  const swipeCurrentX = useRef<number | null>(null);
  const swipeElementId = useRef<number | null>(null);

  const loadDebugInfo = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setDebugError('User not authenticated');
        return;
      }

      const debugData: any = {
        userId: user.id,
        userEmail: user.email,
        timestamp: new Date().toISOString(),
      };

      // Check notifications count directly from DB
      const { count: totalCount, error: totalError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const { count: unreadCountDb, error: unreadError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('hidden', false)
        .is('read_at', null);

      const { count: hiddenCount, error: hiddenError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('hidden', true);

      debugData.notifications = {
        total: totalCount ?? 0,
        unread: unreadCountDb ?? 0,
        hidden: hiddenCount ?? 0,
        errors: {
          total: totalError?.message,
          unread: unreadError?.message,
          hidden: hiddenError?.message,
        },
      };

      // Check recent notifications - get ALL notifications including hidden
          const { data: recentNotifications, error: recentError } = await supabase
            .from('notifications')
            .select('id, type, created_at, read_at, hidden, actor_id, post_id, comment_id, sw_level, trust_push_id, goal_id, goal_reaction_kind')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      debugData.recentNotifications = {
        count: recentNotifications?.length ?? 0,
        data: recentNotifications,
        error: recentError?.message,
      };

      // Check notification types distribution - ALL notifications including hidden
      const { data: typeDistribution, error: typeError } = await supabase
        .from('notifications')
        .select('type, created_at, hidden')
        .eq('user_id', user.id);
      
      // Also check notifications by date ranges
      const now = new Date();
      const cutoffDate = new Date('2025-11-10T08:34:09');
          const { data: notificationsAfterCutoff, error: afterCutoffError } = await supabase
            .from('notifications')
            .select('id, type, created_at, hidden, actor_id, post_id, comment_id, trust_push_id, goal_id, goal_reaction_kind, sw_level')
        .eq('user_id', user.id)
        .gt('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (typeDistribution) {
        const distribution: Record<string, number> = {};
        const distributionByHidden: Record<string, { total: number; hidden: number; visible: number }> = {};
        typeDistribution.forEach(n => {
          distribution[n.type] = (distribution[n.type] || 0) + 1;
          if (!distributionByHidden[n.type]) {
            distributionByHidden[n.type] = { total: 0, hidden: 0, visible: 0 };
          }
          distributionByHidden[n.type].total++;
          if (n.hidden) {
            distributionByHidden[n.type].hidden++;
          } else {
            distributionByHidden[n.type].visible++;
          }
        });
        debugData.typeDistribution = distribution;
        debugData.typeDistributionByHidden = distributionByHidden;
      }
      
      debugData.notificationsAfterCutoff = {
        count: notificationsAfterCutoff?.length ?? 0,
        data: notificationsAfterCutoff,
        error: afterCutoffError?.message,
        cutoffDate: cutoffDate.toISOString(),
      };
      
        // Check for notifications with different fields populated
          const { data: notificationsWithTrustPushId, error: trustPushIdError } = await supabase
          .from('notifications')
          .select('id, type, created_at, trust_push_id')
          .eq('user_id', user.id)
          .not('trust_push_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10);
          
          const { data: notificationsWithGoalId, error: goalIdError } = await supabase
            .from('notifications')
            .select('id, type, created_at, goal_id, goal_reaction_kind')
            .eq('user_id', user.id)
            .not('goal_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10);

        debugData.specialNotifications = {
          withTrustPushId: {
            count: notificationsWithTrustPushId?.length ?? 0,
            data: notificationsWithTrustPushId,
            error: trustPushIdError?.message,
            },
            withGoalId: {
              count: notificationsWithGoalId?.length ?? 0,
              data: notificationsWithGoalId,
              error: goalIdError?.message,
          },
        };

      // Check if triggers exist and are active
      let triggersInfo: any = { error: null, note: null, triggers: [] };
      try {
        // Try to use the check_notification_triggers function
        const { data: triggersData, error: triggersError } = await supabase.rpc('check_notification_triggers');
        
        if (triggersError) {
          triggersInfo.note = 'Cannot check triggers via function. Check Supabase dashboard → Database → Triggers.';
          triggersInfo.error = triggersError.message;
        } else {
          triggersInfo.triggers = triggersData || [];
        }
        
        // Always set expected triggers for comparison
          triggersInfo.expectedTriggers = [
            { name: 'notify_comment_on_post_trigger', table: 'comments', event: 'INSERT' },
            { name: 'notify_comment_on_comment_trigger', table: 'comments', event: 'INSERT' },
            { name: 'notify_reaction_on_post_trigger', table: 'post_reactions', event: 'INSERT' },
            { name: 'notify_reaction_on_comment_trigger', table: 'comment_reactions', event: 'INSERT' },
            { name: 'notify_goal_reaction_trigger', table: 'goal_reactions', event: 'INSERT' },
            { name: 'notify_trust_push_trigger', table: 'trust_pushes', event: 'INSERT' },
            { name: 'notify_sw_level_change_trigger', table: 'sw_scores', event: 'UPDATE' },
          ];
      } catch (triggersErr: any) {
        triggersInfo.error = triggersErr.message || 'Cannot check triggers';
          triggersInfo.expectedTriggers = [
            { name: 'notify_comment_on_post_trigger', table: 'comments', event: 'INSERT' },
            { name: 'notify_comment_on_comment_trigger', table: 'comments', event: 'INSERT' },
            { name: 'notify_reaction_on_post_trigger', table: 'post_reactions', event: 'INSERT' },
            { name: 'notify_reaction_on_comment_trigger', table: 'comment_reactions', event: 'INSERT' },
            { name: 'notify_goal_reaction_trigger', table: 'goal_reactions', event: 'INSERT' },
            { name: 'notify_trust_push_trigger', table: 'trust_pushes', event: 'INSERT' },
            { name: 'notify_sw_level_change_trigger', table: 'sw_scores', event: 'UPDATE' },
          ];
      }

      // Note: create_notification function should exist if triggers are working
      // We can't directly check it via RPC, but if triggers are found, the function exists
      triggersInfo.createNotificationFunction = {
        exists: triggersInfo.triggers && triggersInfo.triggers.length > 0,
        note: 'Function existence inferred from triggers. If triggers are missing, function may need to be recreated.',
      };

      debugData.triggers = triggersInfo;

      // Check API response
      try {
        const apiResponse = await fetch('/api/notifications/list');
        const apiData = await apiResponse.json();
        debugData.apiResponse = {
          status: apiResponse.status,
          statusText: apiResponse.statusText,
          dataKeys: apiData ? Object.keys(apiData) : [],
          notificationsCount: apiData?.notifications?.length ?? 0,
          unreadCount: apiData?.unreadCount ?? 0,
          error: apiData?.error,
        };
      } catch (apiErr: any) {
        debugData.apiResponse = {
          error: apiErr.message,
        };
      }

      // Check RLS policies
      debugData.rlsInfo = {
        note: 'RLS policies can be checked in Supabase dashboard',
      };

      // Check recent comments on user's posts to see if notifications were created
      const { data: userPosts, error: postsError } = await supabase
        .from('posts')
        .select('id, author_id, user_id, text, body, created_at')
        .or(`author_id.eq.${user.id},user_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (userPosts && userPosts.length > 0) {
        const postIds = userPosts.map(p => p.id);
        const { data: recentComments, error: commentsError } = await supabase
          .from('comments')
          .select('id, post_id, author_id, user_id, text, body, created_at')
          .in('post_id', postIds)
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (recentComments && recentComments.length > 0) {
          // Check if notifications exist for these comments
          const commentIds = recentComments.map(c => c.id).filter((id): id is number => typeof id === 'number');
          const { data: commentNotifications, error: commentNotifError } = await supabase
            .from('notifications')
            .select('id, type, comment_id, post_id, created_at, actor_id')
            .eq('user_id', user.id)
            .eq('type', 'comment_on_post')
            .in('comment_id', commentIds.length > 0 ? commentIds : [-1]) // Use -1 if empty to avoid SQL error
            .order('created_at', { ascending: false });
          
          debugData.recentCommentsAnalysis = {
            userPostsCount: userPosts.length,
            recentCommentsCount: recentComments.length,
            comments: recentComments.map(c => ({
              id: c.id,
              post_id: c.post_id,
              author_id: c.author_id || c.user_id,
              text: (c.text || c.body || '').substring(0, 50),
              created_at: c.created_at,
            })),
            notificationsForComments: commentNotifications || [],
            notificationsCount: commentNotifications?.length || 0,
            missingNotifications: recentComments.filter(c => {
              const commentId = c.id;
              return !commentNotifications?.some(n => n.comment_id === commentId);
            }).map(c => ({
              comment_id: c.id,
              post_id: c.post_id,
              comment_author: c.author_id || c.user_id,
              created_at: c.created_at,
            })),
            errors: {
              posts: postsError?.message,
              comments: commentsError?.message,
              notifications: commentNotifError?.message,
            },
          };
        } else {
          debugData.recentCommentsAnalysis = {
            userPostsCount: userPosts.length,
            recentCommentsCount: 0,
            error: commentsError?.message || 'No comments found',
          };
        }
      } else {
        debugData.recentCommentsAnalysis = {
          userPostsCount: 0,
          error: postsError?.message || 'No posts found for user',
        };
      }

      setDebugInfo(debugData);
    } catch (err: any) {
      setDebugError(err.message || 'Failed to load debug info');
      console.error('Error loading debug info:', err);
    }
  }, []);

    const loadNotifications = useCallback(async (page: number = currentPage) => {
    try {
        const offset = (page - 1) * NOTIFICATIONS_PER_PAGE;
        const response = await fetch(`/api/notifications/list?limit=${NOTIFICATIONS_PER_PAGE}&offset=${offset}`);
        if (response.status === 401) {
          console.log('Not authenticated');
          setLoading(false);
          setDebugError((prev) => prev || 'API returned 401 - Not authenticated');
          return;
      }

        if (!response.ok) {
          const text = await response.text();
          const error = text || 'Failed to load notifications';
          console.error('API error:', error);
          setDebugError((prev) => prev || `API Error (${response.status}): ${error}`);
          throw new Error(error);
        }

        const payload = await response.json();
        const fetchedNotifications: Notification[] = payload.notifications || [];
        const unread = payload.unreadCount || 0;
        const total = payload.totalCount || 0;

        if (!fetchedNotifications || fetchedNotifications.length === 0) {
          setNotifications([]);
          setUnreadCount(unread);
          setTotalCount(total);
          console.log('No notifications returned from API');
        return;
      }

        setNotifications(fetchedNotifications);
        setUnreadCount(unread);
        setTotalCount(total);
          
          if (isAdmin && isDebugPanelOpen) {
            loadDebugInfo();
          }
    } catch (err: any) {
      console.error('Error loading notifications:', err);
      setDebugError((prev) => prev || err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
    }, [currentPage, isAdmin, isDebugPanelOpen, loadDebugInfo]);

  const checkAdminStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('is_admin_uid');
      if (!error && data) {
        setIsAdmin(true);
        } else {
          setIsAdmin(false);
      }
    } catch (err) {
      console.error('Error checking admin status:', err);
    }
  };

    useEffect(() => {
      checkAdminStatus();
    }, []);

    useEffect(() => {
      loadNotifications(currentPage);
    }, [currentPage, loadNotifications]);

    useEffect(() => {
      if (isAdmin && isDebugPanelOpen) {
        loadDebugInfo();
      }
    }, [isAdmin, isDebugPanelOpen, loadDebugInfo]);

  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return;
    setLoading(true);
    setCurrentPage(newPage);
    // Scroll to top when changing pages
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

    const toggleDebugPanel = () => {
      setIsDebugPanelOpen((prev) => {
        if (prev) {
          setDebugInfo(null);
          setDebugError(null);
        }
        return !prev;
      });
    };

    const closeDebugPanel = () => {
      setIsDebugPanelOpen(false);
      setDebugInfo(null);
      setDebugError(null);
    };

  // Subscribe to realtime updates for notifications list
  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return null;

      const channel = supabase
        .channel(`notifications_list:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // Debounce to avoid too many updates
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
              if (mounted) {
                // Reload notifications for current page when changes occur
                // This ensures new notifications appear on page 1
                const pageToReload = currentPage;
                loadNotifications(pageToReload);
                // Dispatch event to update badge counter in Header
                window.dispatchEvent(new CustomEvent('notification:update'));
              }
            }, 300);
          }
        )
        .subscribe();

      return channel;
    };

    let channel: any = null;
    setupRealtime().then((ch) => {
      if (mounted) {
        channel = ch;
      }
    });

    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [currentPage, loadNotifications]);

  // Subscribe to realtime updates for debug info (admin only)
    useEffect(() => {
      if (!isAdmin || !isDebugPanelOpen) return;

    let mounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return null;

      const channel = supabase
        .channel(`debug_notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            // Debounce to avoid too many updates
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
              if (mounted) {
                loadDebugInfo();
              }
            }, 500);
          }
        )
        .subscribe();

      return channel;
    };

    let channel: any = null;
    setupRealtime().then((ch) => {
      if (mounted) {
        channel = ch;
      }
    });

    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
    }, [isAdmin, isDebugPanelOpen, loadDebugInfo]);

  const markAsRead = async (notificationId: number) => {
    if (markingRead === notificationId) return;
    setMarkingRead(notificationId);

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      // Dispatch event to update badge counter in Header
      window.dispatchEvent(new CustomEvent('notification:read'));
    } catch (err: any) {
      console.error('Error marking notification as read:', err);
    } finally {
      setMarkingRead(null);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .is('read_at', null)
        .eq('hidden', false);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
      
      // Dispatch event to update badge counter in Header
      window.dispatchEvent(new CustomEvent('notification:read'));
    } catch (err: any) {
      console.error('Error marking all as read:', err);
    }
  };

  const hideNotification = async (notificationId: number) => {
    if (hiding === notificationId) return;
    setHiding(notificationId);

    try {
      const response = await fetch('/api/notifications/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });

      if (!response.ok) throw new Error('Failed to hide notification');

      // Remove from local state
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      // Update unread count if it was unread
      const notification = notifications.find(n => n.id === notificationId);
      if (notification && !notification.read_at) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      
      // Dispatch event to update badge counter in Header
      window.dispatchEvent(new CustomEvent('notification:read'));
    } catch (err: any) {
      console.error('Error hiding notification:', err);
    } finally {
      setHiding(null);
    }
  };

  // Swipe gesture handlers for mobile
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>, notificationId: number) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeElementId.current = notificationId;
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (swipeStartX.current === null) return;
    swipeCurrentX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (swipeStartX.current === null || swipeCurrentX.current === null || swipeElementId.current === null) {
      swipeStartX.current = null;
      swipeCurrentX.current = null;
      swipeElementId.current = null;
      return;
    }

    const diff = swipeStartX.current - swipeCurrentX.current;
    const threshold = 100; // Minimum swipe distance

    // Swipe left to hide (more than threshold)
    if (diff > threshold) {
      hideNotification(swipeElementId.current);
    }

    swipeStartX.current = null;
    swipeCurrentX.current = null;
    swipeElementId.current = null;
  };

  const getNotificationIcon = (type: Notification['type'], actor?: Notification['actor']) => {
      const icon = (() => {
        switch (type) {
          case 'comment_on_post':
          case 'comment_on_comment':
            return <MessageSquare size={18} />;
          case 'reaction_on_post':
          case 'reaction_on_comment':
            return <Heart size={18} />;
          case 'goal_reaction':
            return <Flame size={18} />;
          case 'trust_flow_entry':
            return <Shield size={18} />;
          case 'sw_level_update':
            return <TrendingUp size={18} />;
          default:
            return <Bell size={18} />;
        }
      })();

    // If actor has avatar, show it with icon overlay
    if (actor?.avatar_url) {
      return (
        <div className="relative w-full h-full">
          <img
            src={actor.avatar_url}
            alt={actor.full_name || actor.username || 'User'}
            className="w-full h-full rounded-full object-cover ring-1 ring-gray-700/50"
          />
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-gray-800 dark:bg-gray-900 border border-gray-800 dark:border-gray-900 flex items-center justify-center text-white shadow-md z-10">
            <div className="scale-[0.65]">
              {icon}
            </div>
          </div>
        </div>
      );
    }

    return icon;
  };

  const getNotificationText = (notification: Notification) => {
    // Try to get actor name from different sources
    let actorName = 'Someone';
    
    if (notification.actor) {
      // Prefer full_name, then username
      if (notification.actor.full_name && notification.actor.full_name.trim()) {
        actorName = notification.actor.full_name;
      } else if (notification.actor.username && notification.actor.username.trim()) {
        actorName = notification.actor.username;
      }
    }
    
    // If actor is not loaded, try to load it separately
    if (actorName === 'Someone' && notification.actor_id) {
      // This will be handled by the query, but we can add a fallback
      console.log('Actor not loaded for notification:', notification.id, 'actor_id:', notification.actor_id);
    }
    
        switch (notification.type) {
          case 'comment_on_post':
            return `${actorName} commented on your post`;
          case 'reaction_on_post':
            return `${actorName} reacted to your post`;
          case 'reaction_on_comment':
            return `${actorName} reacted to your comment`;
          case 'comment_on_comment':
            return `${actorName} replied to your comment`;
          case 'goal_reaction':
            return `${actorName} reacted to your goal${notification.goal_reaction_kind ? ` (${notification.goal_reaction_kind})` : ''}`;
          case 'trust_flow_entry':
            if (notification.trust_push) {
              const isPositive = notification.trust_push.type === 'positive';
              return `${actorName} ${isPositive ? 'boosted' : 'reduced'} your Trust Flow`;
            }
            return `${actorName} left a Trust Flow entry`;
          case 'sw_level_update':
            return `Your Social Wealth level updated${notification.sw_level ? ` to ${notification.sw_level}` : ''}`;
          default:
            return 'New notification';
        }
      };

  const getNotificationLink = (notification: Notification) => {
    if (notification.post_id) {
      return `/post/${notification.post_id}`;
    }
    if (notification.comment_id && notification.comment?.post_id) {
      return `/post/${notification.comment.post_id}`;
    }
    // For profile links, use username if available, otherwise use user_id
    if (notification.actor_id) {
      if (notification.actor?.username) {
        return `/u/${notification.actor.username}`;
      }
      return `/u/${notification.actor_id}`;
    }
    return null;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  return (
    <RequireAuth>
      <div className="max-w-4xl mx-auto px-4 py-6 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
            <Bell size={24} />
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 px-2 py-1 bg-primary-blue text-white text-sm font-medium rounded-full">
                {unreadCount}
              </span>
            )}
          </h1>
          <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={toggleDebugPanel}
                  className={`px-3 py-1.5 text-xs rounded border flex items-center gap-1 transition ${
                    isDebugPanelOpen
                      ? 'bg-yellow-600/80 border-yellow-500 text-white'
                      : 'bg-gray-800/60 border-yellow-500/60 text-yellow-200 hover:bg-gray-800'
                  }`}
                  aria-pressed={isDebugPanelOpen}
                  aria-expanded={isDebugPanelOpen}
                  title="Toggle debug panel"
                >
                  <Menu size={14} />
                  {isDebugPanelOpen ? 'Hide debug' : 'Debug panel'}
                </button>
              )}
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-4 py-2 text-sm text-primary-blue hover:text-primary-blue-light border border-primary-blue/30 rounded-lg hover:bg-primary-blue/10 transition"
              >
                Mark all as read
              </button>
            )}
          </div>
        </div>

          {/* Debug Panel for Admins */}
          {isAdmin && isDebugPanelOpen && (
            <div className="mb-6 bg-gray-900 border border-yellow-600/30 rounded-lg p-4 text-xs font-mono">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-yellow-400 font-bold text-sm">🔧 Debug Information (Admin Only)</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadDebugInfo}
                    className="text-yellow-300 hover:text-yellow-100 px-2 py-1 rounded border border-yellow-500/40 text-[11px]"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={closeDebugPanel}
                    className="text-gray-400 hover:text-white"
                    aria-label="Close debug panel"
                  >
                    ✕
                  </button>
                </div>
              </div>
            
            {debugError && (
              <div className="mb-3 p-2 bg-red-900/30 border border-red-600/50 rounded text-red-300">
                <strong>Error:</strong> {debugError}
              </div>
            )}

            {debugInfo ? (
              <div className="space-y-3 text-gray-300">
                <div>
                  <strong className="text-yellow-400">User ID:</strong> {debugInfo.userId}
                  <br />
                  <strong className="text-yellow-400">Email:</strong> {debugInfo.userEmail}
                  <br />
                  <strong className="text-yellow-400">Timestamp:</strong> {debugInfo.timestamp}
                </div>

                <div className="border-t border-gray-700 pt-2">
                  <strong className="text-yellow-400">Database Notifications:</strong>
                  <ul className="ml-4 mt-1 space-y-1">
                    <li>Total: <span className="text-white">{debugInfo.notifications?.total ?? 'N/A'}</span></li>
                    <li>Unread: <span className="text-white">{debugInfo.notifications?.unread ?? 'N/A'}</span></li>
                    <li>Hidden: <span className="text-white">{debugInfo.notifications?.hidden ?? 'N/A'}</span></li>
                    {debugInfo.notifications?.errors && (
                      <li className="text-red-400">
                        Errors: {JSON.stringify(debugInfo.notifications.errors, null, 2)}
                      </li>
                    )}
                  </ul>
                </div>

                <div className="border-t border-gray-700 pt-2">
                  <strong className="text-yellow-400">Recent Notifications (last 10):</strong>
                  <div className="ml-4 mt-1">
                    Count: <span className="text-white">{debugInfo.recentNotifications?.count ?? 0}</span>
                    {debugInfo.recentNotifications?.error && (
                      <div className="text-red-400 mt-1">Error: {debugInfo.recentNotifications.error}</div>
                    )}
                    {debugInfo.recentNotifications?.data && debugInfo.recentNotifications.data.length > 0 && (
                      <>
                        <div className="mt-2 text-xs">
                          <strong className="text-yellow-300">Latest dates:</strong>
                          <ul className="ml-2 mt-1 space-y-0.5">
                            {debugInfo.recentNotifications.data.slice(0, 5).map((n: any, idx: number) => (
                              <li key={idx} className="text-gray-300">
                                {idx + 1}. {n.type} - {n.created_at ? new Date(n.created_at).toISOString() : 'N/A'}
                                {n.read_at && <span className="text-gray-500 ml-2">(read)</span>}
                                {n.hidden && <span className="text-red-400 ml-2">(hidden)</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="mt-2 max-h-40 overflow-y-auto">
                          <pre className="text-xs bg-gray-800 p-2 rounded">
                            {JSON.stringify(debugInfo.recentNotifications.data.slice(0, 5), null, 2)}
                          </pre>
                        </div>
                      </>
                    )}
                    {(!debugInfo.recentNotifications?.data || debugInfo.recentNotifications.data.length === 0) && (
                      <div className="text-gray-500 mt-1">No recent notifications found</div>
                    )}
                  </div>
                </div>

                {debugInfo.typeDistribution && (
                  <div className="border-t border-gray-700 pt-2">
                    <strong className="text-yellow-400">Type Distribution (All):</strong>
                    <pre className="ml-4 mt-1 text-xs bg-gray-800 p-2 rounded">
                      {JSON.stringify(debugInfo.typeDistribution, null, 2)}
                    </pre>
                    {debugInfo.typeDistributionByHidden && (
                      <>
                        <strong className="text-yellow-300 mt-2 block">By Hidden Status:</strong>
                        <pre className="ml-4 mt-1 text-xs bg-gray-800 p-2 rounded">
                          {JSON.stringify(debugInfo.typeDistributionByHidden, null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
                )}

                {debugInfo.notificationsAfterCutoff && (
                  <div className="border-t border-gray-700 pt-2">
                    <strong className="text-yellow-400">Notifications After Cutoff (2025-11-10T08:34:09):</strong>
                    <div className="ml-4 mt-1">
                      Count: <span className="text-white">{debugInfo.notificationsAfterCutoff.count ?? 0}</span>
                      {debugInfo.notificationsAfterCutoff.error && (
                        <div className="text-red-400 mt-1">Error: {debugInfo.notificationsAfterCutoff.error}</div>
                      )}
                      {debugInfo.notificationsAfterCutoff.data && debugInfo.notificationsAfterCutoff.data.length > 0 && (
                        <>
                          <div className="mt-2 text-xs">
                            <strong className="text-yellow-300">Latest after cutoff:</strong>
                            <ul className="ml-2 mt-1 space-y-0.5">
                              {debugInfo.notificationsAfterCutoff.data.slice(0, 10).map((n: any, idx: number) => (
                                <li key={idx} className="text-gray-300">
                                  {idx + 1}. {n.type} - {n.created_at ? new Date(n.created_at).toISOString() : 'N/A'}
                                  {n.hidden && <span className="text-red-400 ml-2">(hidden)</span>}
                                  {n.post_id && <span className="text-purple-400 ml-2">post_id: {n.post_id}</span>}
                                  {n.comment_id && <span className="text-orange-400 ml-2">comment_id: {n.comment_id}</span>}
                                  {n.trust_push_id && <span className="text-yellow-300 ml-2">trust_push_id: {n.trust_push_id}</span>}
                                  {n.goal_id && <span className="text-pink-300 ml-2">goal_id: {n.goal_id}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            <pre className="text-xs bg-gray-800 p-2 rounded">
                              {JSON.stringify(debugInfo.notificationsAfterCutoff.data.slice(0, 10), null, 2)}
                            </pre>
                          </div>
                        </>
                      )}
                      {(!debugInfo.notificationsAfterCutoff.data || debugInfo.notificationsAfterCutoff.data.length === 0) && (
                        <div className="text-gray-500 mt-1">No notifications found after cutoff date</div>
                      )}
                    </div>
                  </div>
                )}

                  {debugInfo.specialNotifications && (
                    <div className="border-t border-gray-700 pt-2">
                      <strong className="text-yellow-400">Special Notifications:</strong>
                      <div className="ml-4 mt-1 space-y-2">
                        {debugInfo.specialNotifications.withTrustPushId && (
                          <div>
                            <strong className="text-yellow-300">With trust_push_id:</strong>
                            <div className="text-xs">
                              Count: <span className="text-white">{debugInfo.specialNotifications.withTrustPushId.count ?? 0}</span>
                              {debugInfo.specialNotifications.withTrustPushId.error && (
                                <div className="text-red-400">Error: {debugInfo.specialNotifications.withTrustPushId.error}</div>
                              )}
                              {debugInfo.specialNotifications.withTrustPushId.data && debugInfo.specialNotifications.withTrustPushId.data.length > 0 && (
                                <div className="mt-1 max-h-20 overflow-y-auto">
                                  <pre className="text-xs bg-gray-800 p-2 rounded">
                                    {JSON.stringify(debugInfo.specialNotifications.withTrustPushId.data, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {debugInfo.specialNotifications.withGoalId && (
                          <div>
                            <strong className="text-yellow-300">With goal_id:</strong>
                            <div className="text-xs">
                              Count: <span className="text-white">{debugInfo.specialNotifications.withGoalId.count ?? 0}</span>
                              {debugInfo.specialNotifications.withGoalId.error && (
                                <div className="text-red-400">Error: {debugInfo.specialNotifications.withGoalId.error}</div>
                              )}
                              {debugInfo.specialNotifications.withGoalId.data && debugInfo.specialNotifications.withGoalId.data.length > 0 && (
                                <div className="mt-1 max-h-20 overflow-y-auto">
                                  <pre className="text-xs bg-gray-800 p-2 rounded">
                                    {JSON.stringify(debugInfo.specialNotifications.withGoalId.data, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                <div className="border-t border-gray-700 pt-2">
                  <strong className="text-yellow-400">API Response:</strong>
                  <div className="ml-4 mt-1">
                    Status: <span className="text-white">{debugInfo.apiResponse?.status ?? 'N/A'}</span>
                    <br />
                    Notifications from API: <span className="text-white">{debugInfo.apiResponse?.notificationsCount ?? 0}</span>
                    <br />
                    Unread from API: <span className="text-white">{debugInfo.apiResponse?.unreadCount ?? 0}</span>
                    {debugInfo.apiResponse?.actualNotificationsCount !== undefined && (
                      <>
                        <br />
                        Actual loaded: <span className="text-white">{debugInfo.apiResponse.actualNotificationsCount}</span>
                      </>
                    )}
                    {debugInfo.apiResponse?.error && (
                      <div className="text-red-400 mt-1">Error: {debugInfo.apiResponse.error}</div>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-700 pt-2">
                  <strong className="text-yellow-400">UI State:</strong>
                  <div className="ml-4 mt-1">
                    Loading: <span className="text-white">{loading ? 'Yes' : 'No'}</span>
                    <br />
                    Notifications in state: <span className="text-white">{notifications.length}</span>
                    <br />
                    Unread count in state: <span className="text-white">{unreadCount}</span>
                  </div>
                </div>

                <div className="border-t border-gray-700 pt-2">
                  <strong className="text-yellow-400">Triggers Info:</strong>
                  <div className="ml-4 mt-1 text-xs">
                    {debugInfo.triggers?.note && (
                      <div className="text-yellow-300">{debugInfo.triggers.note}</div>
                    )}
                    {debugInfo.triggers?.error && (
                      <div className="text-red-400">Error: {debugInfo.triggers.error}</div>
                    )}
                    
                    {debugInfo.triggers?.createNotificationFunction && (
                      <div className="mt-2">
                        <strong className="text-yellow-300">create_notification function:</strong>
                        <div className="ml-2">
                          {debugInfo.triggers.createNotificationFunction.exists ? (
                            <span className="text-green-400">✓ Exists</span>
                          ) : (
                            <span className="text-red-400">✗ Missing: {debugInfo.triggers.createNotificationFunction.error}</span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {debugInfo.triggers?.triggers && Array.isArray(debugInfo.triggers.triggers) && debugInfo.triggers.triggers.length > 0 && (
                      <div className="mt-2">
                        <strong className="text-yellow-300">Found Triggers ({debugInfo.triggers.triggers.length}):</strong>
                        <ul className="ml-2 mt-1 space-y-0.5">
                          {debugInfo.triggers.triggers.map((t: any, idx: number) => (
                            <li key={idx} className="text-green-400">
                              ✓ {t.name || t.trigger_name} on {t.table || t.event_object_table} ({t.event || t.event_manipulation || 'INSERT'})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {debugInfo.triggers?.expectedTriggers && (
                      <div className="mt-2">
                        <strong className="text-yellow-300">Expected Triggers:</strong>
                        <ul className="ml-2 mt-1 space-y-0.5">
                          {debugInfo.triggers.expectedTriggers.map((t: any, idx: number) => {
                            const found = debugInfo.triggers?.triggers?.some((tr: any) => 
                              (tr.name || tr.trigger_name) === t.name
                            );
                            return (
                              <li key={idx} className={found ? 'text-green-400' : 'text-red-400'}>
                                {found ? '✓' : '✗'} {t.name} on {t.table} ({t.event})
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    
                    {(!debugInfo.triggers?.triggers || debugInfo.triggers.triggers.length === 0) && !debugInfo.triggers?.expectedTriggers && (
                      <div className="mt-2 text-gray-400">
                          Check Supabase dashboard → Database → Triggers for:
                          <ul className="ml-4 mt-1 list-disc">
                            <li>notify_comment_on_post_trigger (on comments table, INSERT)</li>
                            <li>notify_comment_on_comment_trigger (on comments table, INSERT)</li>
                            <li>notify_reaction_on_post_trigger (on post_reactions table, INSERT)</li>
                            <li>notify_reaction_on_comment_trigger (on comment_reactions table, INSERT)</li>
                            <li>notify_goal_reaction_trigger (on goal_reactions table, INSERT)</li>
                            <li>notify_trust_push_trigger (on trust_pushes table, INSERT)</li>
                            <li>notify_sw_level_change_trigger (on sw_scores table, UPDATE)</li>
                          </ul>
                      </div>
                    )}
                  </div>
                </div>

                {debugInfo.recentCommentsAnalysis && (
                  <div className="border-t border-gray-700 pt-2">
                    <strong className="text-yellow-400">Recent Comments Analysis:</strong>
                    <div className="ml-4 mt-1 text-xs">
                      <div>
                        User posts found: <span className="text-white">{debugInfo.recentCommentsAnalysis.userPostsCount ?? 0}</span>
                      </div>
                      <div>
                        Recent comments on your posts: <span className="text-white">{debugInfo.recentCommentsAnalysis.recentCommentsCount ?? 0}</span>
                      </div>
                      <div>
                        Notifications created: <span className="text-white">{debugInfo.recentCommentsAnalysis.notificationsCount ?? 0}</span>
                      </div>
                      {debugInfo.recentCommentsAnalysis.missingNotifications && debugInfo.recentCommentsAnalysis.missingNotifications.length > 0 && (
                        <div className="mt-2">
                          <strong className="text-red-400">⚠️ Missing Notifications ({debugInfo.recentCommentsAnalysis.missingNotifications.length}):</strong>
                          <ul className="ml-2 mt-1 space-y-1">
                            {debugInfo.recentCommentsAnalysis.missingNotifications.map((missing: any, idx: number) => (
                              <li key={idx} className="text-red-300">
                                Comment ID: {missing.comment_id}, Post ID: {missing.post_id}, 
                                Comment Author: {missing.comment_author?.substring(0, 8)}...,
                                Created: {missing.created_at ? new Date(missing.created_at).toISOString() : 'N/A'}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {debugInfo.recentCommentsAnalysis.comments && debugInfo.recentCommentsAnalysis.comments.length > 0 && (
                        <div className="mt-2">
                          <strong className="text-yellow-300">Recent Comments:</strong>
                          <div className="mt-1 max-h-40 overflow-y-auto">
                            <pre className="text-xs bg-gray-800 p-2 rounded">
                              {JSON.stringify(debugInfo.recentCommentsAnalysis.comments.slice(0, 10), null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                      {debugInfo.recentCommentsAnalysis.errors && (
                        <div className="mt-2 text-red-400">
                          Errors: {JSON.stringify(debugInfo.recentCommentsAnalysis.errors, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500">Click "Debug" button to load debug information</div>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-800 p-4 rounded-lg animate-pulse">
                <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-700 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-gray-800 p-8 rounded-lg text-center">
            <Bell size={48} className="mx-auto mb-4 text-gray-500" />
            <p className="text-gray-400">You have no notifications yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => {
              const link = getNotificationLink(notification);
              const isUnread = !notification.read_at;
              const content = (
                <div
                  className={`relative p-3 rounded-lg border transition touch-pan-y ${
                    isUnread
                      ? 'bg-primary-blue/10 border-primary-blue/30'
                      : 'bg-gray-800 border-gray-700'
                  }`}
                  onTouchStart={(e) => handleTouchStart(e, notification.id)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`flex-shrink-0 w-9 h-9 rounded-full ${
                      notification.actor?.avatar_url 
                        ? '' 
                        : `grid place-items-center ${isUnread ? 'bg-primary-blue/20 text-primary-blue' : 'bg-gray-700 text-gray-400'}`
                    }`}>
                      {getNotificationIcon(notification.type, notification.actor)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className={`text-sm leading-snug ${isUnread ? 'text-white font-medium' : 'text-gray-300'}`}>
                            {getNotificationText(notification)}
                            <span className="text-xs text-gray-500 font-normal ml-1.5">
                              • {formatDate(notification.created_at)}
                            </span>
                          </p>
                            {notification.post && (notification.post.text || notification.post.body) && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                {notification.post.text || notification.post.body}
                            </p>
                          )}
                            {notification.comment && (notification.comment.text || notification.comment.body) && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                {notification.comment.text || notification.comment.body}
                            </p>
                          )}
                            {notification.trust_push?.reason && (
                              <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                {notification.trust_push.reason}
                              </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isUnread && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                markAsRead(notification.id);
                              }}
                              disabled={markingRead === notification.id}
                              className="px-2 py-0.5 text-xs text-primary-blue hover:text-primary-blue-light border border-primary-blue/30 rounded hover:bg-primary-blue/10 transition"
                              title="Mark as read"
                            >
                              {markingRead === notification.id ? '...' : 'Read'}
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              hideNotification(notification.id);
                            }}
                            disabled={hiding === notification.id}
                            className="px-2 py-1 text-xs text-gray-400 hover:text-red-400 border border-gray-600 rounded hover:bg-gray-700/50 transition flex items-center justify-center"
                            title="Hide notification permanently"
                          >
                            {hiding === notification.id ? '...' : <X size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Swipe hint for mobile - only show on unread notifications */}
                  {isUnread && (
                    <div className="md:hidden absolute inset-y-0 right-0 flex items-center pr-2 text-xs text-gray-500 pointer-events-none">
                      <span className="opacity-30">← Swipe to hide</span>
                    </div>
                  )}
                </div>
              );

              if (link) {
                return (
                  <div key={notification.id} className="relative">
                    <Link href={link} className="block">
                      {content}
                    </Link>
                  </div>
                );
              }

              return <div key={notification.id}>{content}</div>;
            })}
            
            {/* Pagination */}
            {(totalCount > NOTIFICATIONS_PER_PAGE || currentPage > 1) && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || loading}
                  className={`px-3 py-2 rounded-lg border transition flex items-center gap-1 ${
                    currentPage === 1 || loading
                      ? 'opacity-50 cursor-not-allowed border-gray-700 text-gray-500'
                      : 'border-primary-blue/30 text-primary-blue hover:bg-primary-blue/10'
                  }`}
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                
                <div className="px-4 py-2 text-sm text-gray-400">
                  Page {currentPage}
                  {totalCount > 0 && (
                    <span className="ml-1">
                      (showing {((currentPage - 1) * NOTIFICATIONS_PER_PAGE) + 1}-
                      {Math.min(currentPage * NOTIFICATIONS_PER_PAGE, totalCount)} of {totalCount})
                    </span>
                  )}
                </div>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage * NOTIFICATIONS_PER_PAGE >= totalCount || loading}
                  className={`px-3 py-2 rounded-lg border transition flex items-center gap-1 ${
                    currentPage * NOTIFICATIONS_PER_PAGE >= totalCount || loading
                      ? 'opacity-50 cursor-not-allowed border-gray-700 text-gray-500'
                      : 'border-primary-blue/30 text-primary-blue hover:bg-primary-blue/10'
                  }`}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
