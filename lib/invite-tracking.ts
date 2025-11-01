'use client';

import { supabase } from './supabaseClient';
import { ph } from './analytics.client';

/**
 * Track user activity and check if it's the first time
 * This function:
 * 1. Records the activity in user_activity table
 * 2. Checks if this user accepted an invite
 * 3. If it's their first activity (first_post or first_sw_event) and they accepted an invite, sends invitee_active event
 */
export async function trackUserActivity(
  userId: string,
  kind: 'first_post' | 'first_sw_event' | 'daily_login'
): Promise<void> {
  try {
    // Check if this activity already exists for this user
    const { data: existing } = await supabase
      .from('user_activity')
      .select('id')
      .eq('user_id', userId)
      .eq('kind', kind)
      .limit(1)
      .maybeSingle();

    // If already exists, don't track again (only track first occurrence)
    if (existing) {
      return;
    }

    // For first_post, verify this is actually the first post
    // (this helps catch race conditions and ensures accuracy)
    if (kind === 'first_post') {
      // Try author_id first (from schema), fallback to user_id if needed
      let { count } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', userId);
      
      // If count is null or 0, try user_id (some deployments might use this)
      if (count === null || count === 0) {
        const { count: countUserId } = await supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        count = countUserId;
      }
      
      // If count > 1, there are already posts, so skip tracking
      // Note: count might be 1 if we just created the post, which is correct
      if (count !== null && count > 1) {
        return;
      }
    }

    // Insert activity
    const { error: insertError } = await supabase
      .from('user_activity')
      .insert({
        user_id: userId,
        kind
      });

    if (insertError) {
      console.error('Error tracking user activity:', insertError);
      return;
    }

    // Check if this user accepted an invite
    const { data: inviteData } = await supabase
      .from('invites')
      .select('id, inviter_user_id, invitee_email')
      .eq('consumed_by_user_id', userId)
      .eq('status', 'accepted')
      .limit(1)
      .single();

    // If user accepted an invite AND this is their first_post or first_sw_event, send invitee_active event
    if (inviteData && (kind === 'first_post' || kind === 'first_sw_event')) {
      ph.capture('invitee_active', {
        invite_id: inviteData.id,
        inviter_user_id: inviteData.inviter_user_id,
        invitee_email: inviteData.invitee_email,
        activity_kind: kind,
        user_id: userId
      });
    }
  } catch (err) {
    console.error('Error in trackUserActivity:', err);
  }
}

/**
 * Track when an invite is accepted
 * This should be called after successfully accepting an invite
 */
export async function trackInviteAccepted(inviteId: string, userId: string): Promise<void> {
  try {
    // Get invite details for PostHog
    const { data: inviteData } = await supabase
      .from('invites')
      .select('id, inviter_user_id, invitee_email')
      .eq('id', inviteId)
      .single();

    if (inviteData) {
      ph.capture('invite_accepted', {
        invite_id: inviteId,
        inviter_user_id: inviteData.inviter_user_id,
        invitee_email: inviteData.invitee_email,
        user_id: userId
      });
    }
  } catch (err) {
    console.error('Error in trackInviteAccepted:', err);
  }
}
