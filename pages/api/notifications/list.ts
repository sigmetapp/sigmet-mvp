import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient } from '@/lib/dm/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

    try {
      const { client, user } = await getAuthedClient(req);
      const userId = user.id;

      const { limit = 1000, offset = 0 } = req.query;
      const limitNum = Math.min(Number(limit) || 1000, 1000);
      const offsetNum = Number(offset) || 0;

      const { data: notificationsData, error: notificationsError } = await client
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offsetNum, offsetNum + limitNum - 1);

      if (notificationsError) throw notificationsError;

      const notifications = notificationsData || [];

      const actorIds = Array.from(
        new Set(
          notifications
            .map((n) => n.actor_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const postIdsRaw = notifications
        .map((n) => n.post_id)
        .filter((id): id is number | string => id !== null && id !== undefined);
      const postIdsNumeric = Array.from(
        new Set(
          postIdsRaw
            .map((id) => (typeof id === 'number' ? id : /^\d+$/.test(id) ? Number(id) : null))
            .filter((id): id is number => id !== null)
        )
      );

      const commentIdsRaw = notifications
        .map((n) => n.comment_id)
        .filter((id): id is number | string => id !== null && id !== undefined);
      const commentIdsNumeric = Array.from(
        new Set(
          commentIdsRaw
            .map((id) => (typeof id === 'number' ? id : /^\d+$/.test(id) ? Number(id) : null))
            .filter((id): id is number => id !== null)
        )
      );
      const commentIdsUuid = Array.from(
        new Set(
          commentIdsRaw
            .map((id) => {
              if (typeof id === 'string' && !/^\d+$/.test(id)) {
                return id;
              }
              return null;
            })
            .filter((id): id is string => Boolean(id))
        )
      );

      const trustIdsRaw = notifications
        .map((n) => n.trust_feedback_id)
        .filter((id): id is number | string => id !== null && id !== undefined);
      const trustIdsNumeric = Array.from(
        new Set(
          trustIdsRaw
            .map((id) => (typeof id === 'number' ? id : /^\d+$/.test(id) ? Number(id) : null))
            .filter((id): id is number => id !== null)
        )
      );

      const actorsMap = new Map<string, any>();
      if (actorIds.length > 0) {
        const { data: actorsData, error: actorsError } = await client
          .from('profiles')
          .select('user_id, username, full_name, avatar_url')
          .in('user_id', actorIds);
        if (!actorsError && actorsData) {
          for (const actor of actorsData) {
            actorsMap.set(actor.user_id, actor);
          }
        } else if (actorsError) {
          console.warn('Failed to load profiles for notifications:', actorsError);
        }
      }

      const postsMap = new Map<string, any>();
      if (postIdsNumeric.length > 0) {
        const { data: postsData, error: postsError } = await client
          .from('posts')
          .select('id, text, body, author_id, user_id')
          .in('id', postIdsNumeric);
        if (!postsError && postsData) {
          for (const post of postsData) {
            postsMap.set(String(post.id), post);
          }
        } else if (postsError) {
          console.warn('Failed to load posts for notifications:', postsError);
        }
      }

      const commentsMap = new Map<string, any>();
      if (commentIdsNumeric.length > 0) {
        const { data: numericComments, error: numericCommentsError } = await client
          .from('comments')
          .select('id, text, body, post_id, author_id, user_id, parent_id')
          .in('id', commentIdsNumeric);
        if (!numericCommentsError && numericComments) {
          for (const comment of numericComments) {
            commentsMap.set(String(comment.id), comment);
          }
        } else if (numericCommentsError) {
          console.warn('Failed to load numeric comments for notifications:', numericCommentsError);
        }
      }
      if (commentIdsUuid.length > 0) {
        const { data: uuidComments, error: uuidCommentsError } = await client
          .from('comments')
          .select('id, text, body, post_id, author_id, user_id, parent_id')
          .in('id', commentIdsUuid);
        if (!uuidCommentsError && uuidComments) {
          for (const comment of uuidComments) {
            commentsMap.set(String(comment.id), comment);
          }
        } else if (uuidCommentsError) {
          console.warn('Failed to load uuid comments for notifications:', uuidCommentsError);
        }
      }

      const trustFeedbackMap = new Map<string, any>();
      if (trustIdsNumeric.length > 0) {
        const { data: trustFeedbackData, error: trustFeedbackError } = await client
          .from('trust_feedback')
          .select('id, value, comment, author_id')
          .in('id', trustIdsNumeric);
        if (!trustFeedbackError && trustFeedbackData) {
          for (const trust of trustFeedbackData) {
            trustFeedbackMap.set(String(trust.id), trust);
          }
        } else if (trustFeedbackError) {
          console.warn('Failed to load trust feedback for notifications:', trustFeedbackError);
        }
      }

      const enrichedNotifications = notifications.map((n) => ({
        ...n,
        actor: n.actor_id ? actorsMap.get(n.actor_id) ?? null : null,
        post: n.post_id !== null && n.post_id !== undefined ? postsMap.get(String(n.post_id)) ?? null : null,
        comment:
          n.comment_id !== null && n.comment_id !== undefined
            ? commentsMap.get(String(n.comment_id)) ?? null
            : null,
        trust_feedback:
          n.trust_feedback_id !== null && n.trust_feedback_id !== undefined
            ? trustFeedbackMap.get(String(n.trust_feedback_id)) ?? null
            : null,
      }));

      const { count: unreadCount } = await client
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null);

      return res.json({
        notifications: enrichedNotifications,
        unreadCount: unreadCount || 0,
      });
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
