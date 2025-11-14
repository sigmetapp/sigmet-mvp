'use client';

import { useState, useEffect, useRef, TouchEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import { Bell, MessageSquare, Heart, UserPlus, Shield, AtSign, X, TrendingUp, Link2 } from 'lucide-react';
import Link from 'next/link';

interface Notification {
  id: number;
  type:
    | 'mention_in_post'
    | 'comment_on_post'
    | 'reaction_on_post'
    | 'reaction_on_comment'
    | 'comment_on_comment'
    | 'subscription'
    | 'connection'
    | 'trust_flow_entry'
    | 'sw_level_update'
    | 'event';
  actor_id: string | null;
  post_id: number | string | null;
  comment_id: number | string | null;
  trust_feedback_id: number | string | null;
  connection_id: number | string | null;
  sw_level: string | null;
  event_id: number | string | null;
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
  trust_feedback?: {
    id: number | string;
    value: number;
    comment: string | null;
    author_id: string | null;
  } | null;
  event?: {
    id: number | string;
    type: string;
    value: number;
    meta: any;
  } | null;
}

export default function AlertPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingRead, setMarkingRead] = useState<number | null>(null);
  const [hiding, setHiding] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const swipeCurrentX = useRef<number | null>(null);
  const swipeElementId = useRef<number | null>(null);

  useEffect(() => {
    checkAdminStatus();
    loadNotifications();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('is_admin_uid');
      if (!error && data) {
        setIsAdmin(true);
        if (data) {
          loadDebugInfo();
        }
      }
    } catch (err) {
      console.error('Error checking admin status:', err);
    }
  };

  const loadDebugInfo = async () => {
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

      // Check recent notifications
      const { data: recentNotifications, error: recentError } = await supabase
        .from('notifications')
        .select('id, type, created_at, read_at, hidden, actor_id, post_id, comment_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      debugData.recentNotifications = {
        count: recentNotifications?.length ?? 0,
        data: recentNotifications,
        error: recentError?.message,
      };

      // Check notification types distribution
      const { data: typeDistribution, error: typeError } = await supabase
        .from('notifications')
        .select('type')
        .eq('user_id', user.id)
        .eq('hidden', false);

      if (typeDistribution) {
        const distribution: Record<string, number> = {};
        typeDistribution.forEach(n => {
          distribution[n.type] = (distribution[n.type] || 0) + 1;
        });
        debugData.typeDistribution = distribution;
      }

      // Check if triggers exist
      const { data: triggers, error: triggersError } = await supabase
        .rpc('exec_sql', {
          query: `
            SELECT trigger_name, event_object_table, action_statement
            FROM information_schema.triggers
            WHERE trigger_schema = 'public'
            AND trigger_name LIKE '%notification%'
            ORDER BY trigger_name;
          `
        }).catch(() => ({ data: null, error: 'Cannot check triggers (RLS)' }));

      debugData.triggers = {
        error: triggersError?.message || 'Cannot check (requires direct DB access)',
      };

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

      setDebugInfo(debugData);
    } catch (err: any) {
      setDebugError(err.message || 'Failed to load debug info');
      console.error('Error loading debug info:', err);
    }
  };

  const loadNotifications = async () => {
    try {
        const response = await fetch('/api/notifications/list');
        if (response.status === 401) {
          console.log('Not authenticated');
          setLoading(false);
          if (isAdmin) {
            setDebugError('API returned 401 - Not authenticated');
          }
          return;
      }

        if (!response.ok) {
          const text = await response.text();
          const error = text || 'Failed to load notifications';
          console.error('API error:', error);
          if (isAdmin) {
            setDebugError(`API Error (${response.status}): ${error}`);
          }
          throw new Error(error);
        }

        const payload = await response.json();
        const fetchedNotifications: Notification[] = payload.notifications || [];
        const unread = payload.unreadCount || 0;

        if (!fetchedNotifications || fetchedNotifications.length === 0) {
          setNotifications([]);
          setUnreadCount(0);
          if (isAdmin) {
            console.log('No notifications returned from API');
          }
        return;
      }

        setNotifications(fetchedNotifications);
        setUnreadCount(unread);
        
        if (isAdmin && debugInfo) {
          // Update debug info with API response
          setDebugInfo((prev: any) => ({
            ...prev,
            apiResponse: {
              ...prev?.apiResponse,
              actualNotificationsCount: fetchedNotifications.length,
              actualUnreadCount: unread,
            },
          }));
        }
    } catch (err: any) {
      console.error('Error loading notifications:', err);
      if (isAdmin) {
        setDebugError(err.message || 'Unknown error');
      }
    } finally {
      setLoading(false);
    }
  };

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
        case 'mention_in_post':
          return <AtSign size={18} />;
        case 'comment_on_post':
        case 'comment_on_comment':
          return <MessageSquare size={18} />;
        case 'reaction_on_post':
        case 'reaction_on_comment':
          return <Heart size={18} />;
        case 'subscription':
          return <UserPlus size={18} />;
        case 'connection':
          return <Link2 size={18} />;
        case 'trust_flow_entry':
          return <Shield size={18} />;
        case 'sw_level_update':
          return <TrendingUp size={18} />;
        case 'event':
          return <Bell size={18} />;
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
      case 'mention_in_post':
        return `${actorName} mentioned you in a post`;
      case 'comment_on_post':
        return `${actorName} commented on your post`;
      case 'reaction_on_post':
        return `${actorName} reacted to your post`;
      case 'reaction_on_comment':
        return `${actorName} reacted to your comment`;
      case 'comment_on_comment':
        return `${actorName} replied to your comment`;
      case 'subscription':
        return `${actorName} followed you`;
      case 'connection':
        return `${actorName} connected with you`;
      case 'trust_flow_entry':
        return `${actorName} left a Trust Flow entry`;
      case 'sw_level_update':
        return `Your Social Wealth level updated${notification.sw_level ? ` to ${notification.sw_level}` : ''}`;
      case 'event':
        if (notification.event) {
          const eventType = notification.event.type || 'event';
          return `New event: ${eventType}`;
        }
        return 'New event occurred';
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
                onClick={loadDebugInfo}
                className="px-3 py-1.5 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded border border-yellow-500"
                title="Reload debug info"
              >
                🔍 Debug
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
        {isAdmin && (
          <div className="mb-6 bg-gray-900 border border-yellow-600/30 rounded-lg p-4 text-xs font-mono">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-yellow-400 font-bold text-sm">🔧 Debug Information (Admin Only)</h2>
              <button
                onClick={() => setDebugInfo(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
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
                      <div className="mt-2 max-h-40 overflow-y-auto">
                        <pre className="text-xs bg-gray-800 p-2 rounded">
                          {JSON.stringify(debugInfo.recentNotifications.data.slice(0, 5), null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>

                {debugInfo.typeDistribution && (
                  <div className="border-t border-gray-700 pt-2">
                    <strong className="text-yellow-400">Type Distribution:</strong>
                    <pre className="ml-4 mt-1 text-xs bg-gray-800 p-2 rounded">
                      {JSON.stringify(debugInfo.typeDistribution, null, 2)}
                    </pre>
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
                          {notification.trust_feedback?.comment && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                              {notification.trust_feedback.comment}
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
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
