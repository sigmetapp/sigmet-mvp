'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import { Bell, MessageSquare, Heart, UserPlus, Shield, AtSign } from 'lucide-react';
import Link from 'next/link';

interface Notification {
  id: number;
  type: 'mention_in_post' | 'comment_on_post' | 'reaction_on_post' | 'comment_on_comment' | 'subscription' | 'trust_flow_entry';
  actor_id: string | null;
  post_id: number | null;
  comment_id: string | null;
  trust_feedback_id: number | null;
  read_at: string | null;
  created_at: string;
  actor?: {
    user_id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  };
  post?: {
    id: number;
    text: string | null;
    author_id: string;
  };
  comment?: {
    id: number;
    text: string;
    post_id: number;
    author_id: string;
  };
  trust_feedback?: {
    id: number;
    value: number;
    comment: string | null;
    author_id: string | null;
  };
}

export default function AlertPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingRead, setMarkingRead] = useState<number | null>(null);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No user found');
        setLoading(false);
        return;
      }

      console.log('Loading notifications for user:', user.id);

      // First, try to get notifications without joins to see if they exist
      const { data: simpleData, error: simpleError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (simpleError) {
        console.error('Error loading simple notifications:', simpleError);
        throw simpleError;
      }

      console.log('Found notifications (simple):', simpleData?.length || 0);

      // Load notifications with related data
      // First, get all notifications
      const { data: notificationsData, error: notificationsError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (notificationsError) {
        console.error('Error loading notifications:', notificationsError);
        setNotifications(simpleData || []);
        const unread = (simpleData || []).filter(n => !n.read_at).length;
        setUnreadCount(unread);
        return;
      }

      if (!notificationsData || notificationsData.length === 0) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      // Get all unique actor IDs
      const actorIds = notificationsData
        .map(n => n.actor_id)
        .filter((id): id is string => id !== null)
        .filter((id, index, self) => self.indexOf(id) === index);

      // Get all unique post IDs
      const postIds = notificationsData
        .map(n => n.post_id)
        .filter((id): id is number => id !== null)
        .filter((id, index, self) => self.indexOf(id) === index);

      // Get all unique comment IDs
      const commentIds = notificationsData
        .map(n => n.comment_id)
        .filter((id): id is string => id !== null)
        .filter((id, index, self) => self.indexOf(id) === index);

      // Get all unique trust feedback IDs
      const trustFeedbackIds = notificationsData
        .map(n => n.trust_feedback_id)
        .filter((id): id is number => id !== null)
        .filter((id, index, self) => self.indexOf(id) === index);

      // Load all related data in parallel
      const [actorsData, postsData, commentsData, trustFeedbackData] = await Promise.all([
        actorIds.length > 0
          ? supabase
              .from('profiles')
              .select('user_id, username, full_name, avatar_url')
              .in('user_id', actorIds)
          : Promise.resolve({ data: [] }),
        postIds.length > 0
          ? supabase
              .from('posts')
              .select('id, text, author_id')
              .in('id', postIds)
          : Promise.resolve({ data: [] }),
        commentIds.length > 0
          ? supabase
              .from('comments')
              .select('id, text, post_id, author_id')
              .in('id', commentIds)
          : Promise.resolve({ data: [] }),
        trustFeedbackIds.length > 0
          ? supabase
              .from('trust_feedback')
              .select('id, value, comment, author_id')
              .in('id', trustFeedbackIds)
          : Promise.resolve({ data: [] }),
      ]);

      // Create maps for quick lookup
      const actorsMap = new Map(
        (actorsData.data || []).map(a => [a.user_id, a])
      );
      const postsMap = new Map(
        (postsData.data || []).map(p => [p.id, p])
      );
      const commentsMap = new Map(
        (commentsData.data || []).map(c => [c.id, c])
      );
      const trustFeedbackMap = new Map(
        (trustFeedbackData.data || []).map(tf => [tf.id, tf])
      );

      // Enrich notifications with related data
      const enrichedNotifications = notificationsData.map(n => ({
        ...n,
        actor: n.actor_id ? actorsMap.get(n.actor_id) : undefined,
        post: n.post_id ? postsMap.get(n.post_id) : undefined,
        comment: n.comment_id ? commentsMap.get(n.comment_id) : undefined,
        trust_feedback: n.trust_feedback_id ? trustFeedbackMap.get(n.trust_feedback_id) : undefined,
      }));

      console.log('Found notifications (enriched):', enrichedNotifications.length);
      setNotifications(enrichedNotifications);

      // Count unread
      const unread = enrichedNotifications.filter(n => !n.read_at).length;
      setUnreadCount(unread);
    } catch (err: any) {
      console.error('Error loading notifications:', err);
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
        .is('read_at', null);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err: any) {
      console.error('Error marking all as read:', err);
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'mention_in_post':
        return <AtSign size={18} />;
      case 'comment_on_post':
      case 'comment_on_comment':
        return <MessageSquare size={18} />;
      case 'reaction_on_post':
        return <Heart size={18} />;
      case 'subscription':
        return <UserPlus size={18} />;
      case 'trust_flow_entry':
        return <Shield size={18} />;
      default:
        return <Bell size={18} />;
    }
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
      case 'comment_on_comment':
        return `${actorName} replied to your comment`;
      case 'subscription':
        return `${actorName} followed you`;
      case 'trust_flow_entry':
        return `${actorName} left a Trust Flow entry`;
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
    if (notification.trust_feedback_id && notification.actor_id) {
      return `/profile/${notification.actor_id}`;
    }
    if (notification.actor_id) {
      return `/profile/${notification.actor_id}`;
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
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 text-sm text-primary-blue hover:text-primary-blue-light border border-primary-blue/30 rounded-lg hover:bg-primary-blue/10 transition"
            >
              Mark all as read
            </button>
          )}
        </div>

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
                  className={`p-4 rounded-lg border transition ${
                    isUnread
                      ? 'bg-primary-blue/10 border-primary-blue/30'
                      : 'bg-gray-800 border-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full grid place-items-center ${
                      isUnread ? 'bg-primary-blue/20 text-primary-blue' : 'bg-gray-700 text-gray-400'
                    }`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className={`text-sm ${isUnread ? 'text-white font-medium' : 'text-gray-300'}`}>
                            {getNotificationText(notification)}
                          </p>
                          {notification.post?.text && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                              {notification.post.text}
                            </p>
                          )}
                          {notification.comment?.text && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                              {notification.comment.text}
                            </p>
                          )}
                          {notification.trust_feedback?.comment && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                              {notification.trust_feedback.comment}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-2">
                            {formatDate(notification.created_at)}
                          </p>
                        </div>
                        {isUnread && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                            disabled={markingRead === notification.id}
                            className="flex-shrink-0 px-2 py-1 text-xs text-primary-blue hover:text-primary-blue-light border border-primary-blue/30 rounded hover:bg-primary-blue/10 transition"
                          >
                            {markingRead === notification.id ? '...' : 'Mark as read'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );

              if (link) {
                return (
                  <Link key={notification.id} href={link}>
                    {content}
                  </Link>
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
