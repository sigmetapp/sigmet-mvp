"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useTheme } from '@/components/ThemeProvider';
import Button from '@/components/Button';

interface SocialAuthButtonsProps {
  mode?: 'login' | 'signup';
  onError?: (error: string) => void;
}

export default function SocialAuthButtons({ mode = 'login', onError }: SocialAuthButtonsProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [loading, setLoading] = useState<string | null>(null);

  const handleSocialAuth = async (provider: 'twitter' | 'facebook') => {
    setLoading(provider);
    try {
      const origin = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_REDIRECT_ORIGIN || '';
      
      const redirectTo = `${origin}/auth/callback`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          // Стандартные scopes для получения базовой информации
          scopes: provider === 'facebook' 
            ? 'email,public_profile' 
            : undefined, // Twitter использует свои стандартные scopes
        },
      });

      if (error) {
        throw error;
      }

      // Редирект произойдет автоматически через OAuth провайдер
    } catch (err: any) {
      console.error(`Social auth error (${provider}):`, err);
      const errorMessage = err?.message || `Failed to authenticate with ${provider === 'twitter' ? 'Twitter' : 'Instagram'}`;
      if (onError) {
        onError(errorMessage);
      }
      setLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className={`w-full border-t ${isLight ? 'border-primary-blue/20' : 'border-white/10'}`} />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className={`px-2 ${isLight ? 'bg-white/80 text-primary-text-secondary' : 'bg-[rgba(31,41,55,0.8)] text-white/70'}`}>
            {mode === 'login' ? 'Or continue with' : 'Or sign up with'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="orange"
          onClick={() => handleSocialAuth('twitter')}
          disabled={loading !== null}
          className="w-full flex items-center justify-center gap-2"
        >
          {loading === 'twitter' ? (
            <>
              <div className="h-4 w-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
              <span>Loading...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>Twitter</span>
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="orange"
          onClick={() => handleSocialAuth('facebook')}
          disabled={loading !== null}
          className="w-full flex items-center justify-center gap-2"
        >
          {loading === 'facebook' ? (
            <>
              <div className="h-4 w-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
              <span>Loading...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
              </svg>
              <span>Instagram</span>
            </>
          )}
        </Button>
      </div>

      <p className={`text-xs text-center ${isLight ? 'text-primary-text-secondary/70' : 'text-white/50'}`}>
        By continuing, you agree to our Terms and Privacy Policy
      </p>
    </div>
  );
}
