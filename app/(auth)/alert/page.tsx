'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import { Bell, MessageSquare, Heart, UserPlus, Shield, AtSign } from 'lucide-react';
import Link from 'next/link';

interface Notification {
  id: number;
  type:
    | 'mention_in_post'
    | 'comment_on_post'
    | 'reaction_on_post'
    | 'comment_on_comment'
    | 'subscription'
    | 'trust_flow_entry';
  actor_id: string | null;
  post_id: number | string | null;
  comment_id: number | string | null;
  trust_feedback_id: number | string | null;
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
}

export default function AlertPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingRead, setMarkingRead] = useState<number | null>(null);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
        const response = await fetch('/api/notifications/list');
        if (response.status === 401) {
          console.log('Not authenticated');
          setLoading(false);
          return;
      }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Failed to load notifications');
        }

        const payload = await response.json();
        const fetchedNotifications: Notification[] = payload.notifications || [];
        const unread = payload.unreadCount || 0;

        if (!fetchedNotifications || fetchedNotifications.length === 0) {
          setNotifications([]);
          setUnreadCount(0);
        return;
      }

        setNotifications(fetchedNotifications);
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
        .is('read_at', null);

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

  const getNotificationIcon = (type: Notification['type'], actor?: Notification['actor']) => {
    const icon = (() => {
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
                  className={`p-3 rounded-lg border transition ${
                    isUnread
                      ? 'bg-primary-blue/10 border-primary-blue/30'
                      : 'bg-gray-800 border-gray-700'
                  }`}
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
                        {isUnread && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                            disabled={markingRead === notification.id}
                            className="flex-shrink-0 px-2 py-0.5 text-xs text-primary-blue hover:text-primary-blue-light border border-primary-blue/30 rounded hover:bg-primary-blue/10 transition"
                          >
                            {markingRead === notification.id ? '...' : 'Read'}
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
