'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState('Finishing sign-in...');

  useEffect(() => {
    let timeout: any;

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        // Ensure profile exists and is populated with OAuth data
        await ensureProfileFromOAuth(session.user);
        
        // Ensure server cookies are set before redirect
        const response = await fetch('/api/auth/set-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ event: 'SIGNED_IN', session }),
        });

        if (response.ok) {
          router.replace('/feed');
        } else {
          // Still redirect even if cookie setting fails
          router.replace('/feed');
        }
      }
    });

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        await ensureProfileFromOAuth(data.user);
        
        const { data: sessionData } = await supabase.auth.getSession();
        const response = await fetch('/api/auth/set-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ event: 'SIGNED_IN', session: sessionData.session ?? null }),
        });

        router.replace('/feed');
      } else {
        timeout = setTimeout(async () => {
          const { data: again } = await supabase.auth.getUser();
          if (again?.user) {
            await ensureProfileFromOAuth(again.user);
            
            const { data: sessionData } = await supabase.auth.getSession();
            await fetch('/api/auth/set-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ event: 'SIGNED_IN', session: sessionData.session ?? null }),
            });

            router.replace('/feed');
          } else {
            setMessage('You can close this tab and return to the app.');
          }
        }, 2500);
      }
    })();

    return () => {
      listener.subscription.unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
  }, [router]);

  async function ensureProfileFromOAuth(user: any) {
    try {
      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url, instagram_url, twitter_url')
        .eq('user_id', user.id)
        .single();

      if (!existingProfile) {
        // Extract data from OAuth provider
        const metadata = user.user_metadata || {};
        const provider = user.app_metadata?.provider || 'email';
        
        // Get name from metadata (different providers use different fields)
        const fullName = metadata.full_name || 
                        metadata.name || 
                        `${metadata.first_name || ''} ${metadata.last_name || ''}`.trim() ||
                        metadata.preferred_username ||
                        metadata.user_name ||
                        null;

        // Get avatar from metadata
        const avatarUrl = metadata.avatar_url || 
                         metadata.picture || 
                         metadata.avatar ||
                         null;

        // Get social media URLs based on provider
        let instagramUrl = null;
        let twitterUrl = null;
        
        if (provider === 'facebook') {
          // Facebook OAuth - can extract Instagram if available
          instagramUrl = metadata.instagram_username 
            ? `https://instagram.com/${metadata.instagram_username}` 
            : null;
        } else if (provider === 'twitter') {
          // Twitter OAuth
          const twitterUsername = metadata.preferred_username || 
                                 metadata.user_name || 
                                 metadata.screen_name;
          twitterUrl = twitterUsername 
            ? `https://twitter.com/${twitterUsername}` 
            : null;
        }

        // Create profile with OAuth data
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            full_name: fullName,
            avatar_url: avatarUrl,
            instagram_url: instagramUrl,
            twitter_url: twitterUrl,
          });

        if (insertError) {
          console.error('Error creating profile from OAuth:', insertError);
        }
      } else {
        // Profile exists, but update it with OAuth data if available
        const metadata = user.user_metadata || {};
        const provider = user.app_metadata?.provider || 'email';
        
        const updates: any = {};
        
        // Update name if not set
        if (!existingProfile.full_name) {
          const fullName = metadata.full_name || 
                          metadata.name || 
                          `${metadata.first_name || ''} ${metadata.last_name || ''}`.trim() ||
                          metadata.preferred_username ||
                          metadata.user_name ||
                          null;
          if (fullName) updates.full_name = fullName;
        }

        // Update avatar if not set
        if (!existingProfile.avatar_url) {
          const avatarUrl = metadata.avatar_url || 
                           metadata.picture || 
                           metadata.avatar ||
                           null;
          if (avatarUrl) updates.avatar_url = avatarUrl;
        }

        // Update social URLs based on provider
        if (provider === 'facebook' && !existingProfile.instagram_url) {
          const instagramUsername = metadata.instagram_username;
          if (instagramUsername) {
            updates.instagram_url = `https://instagram.com/${instagramUsername}`;
          }
        } else if (provider === 'twitter' && !existingProfile.twitter_url) {
          const twitterUsername = metadata.preferred_username || 
                                 metadata.user_name || 
                                 metadata.screen_name;
          if (twitterUsername) {
            updates.twitter_url = `https://twitter.com/${twitterUsername}`;
          }
        }

        // Update profile if there are changes
        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update(updates)
            .eq('user_id', user.id);

          if (updateError) {
            console.error('Error updating profile from OAuth:', updateError);
          }
        }
      }
    } catch (error) {
      console.error('Error ensuring profile from OAuth:', error);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center text-white/80">
        <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-white/30 border-t-transparent animate-spin" />
        <div>{message}</div>
      </div>
    </div>
  );
}
