// pages/index.tsx
import Head from "next/head";
import { GetServerSideProps } from "next";
import { createClient } from "@supabase/supabase-js";
import React, { useEffect } from "react";
import { useRouter } from "next/router";
import Button from "@/components/Button";
import ThemeToggle from "@/components/ThemeToggle";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  // Проверяем сессию из cookies
  const cookieHeader = context.req.headers.cookie || "";
  const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split("=");
    if (key && value) {
      acc[key.trim()] = decodeURIComponent(value.trim());
    }
    return acc;
  }, {} as Record<string, string>);

  // Ищем токен авторизации в cookies
  let accessToken: string | undefined;
  
  // Прямой access token
  if (cookies["sb-access-token"]) {
    accessToken = cookies["sb-access-token"];
  } 
  // Generic auth token (JSON формат)
  else if (cookies["sb-generic-auth-token"]) {
    try {
      const parsed = JSON.parse(cookies["sb-generic-auth-token"]);
      accessToken = parsed?.access_token;
    } catch {
      // Если не JSON, пробуем как прямой токен
      accessToken = cookies["sb-generic-auth-token"];
    }
  }
  // Ищем любой cookie с auth-token
  else {
    for (const [key, value] of Object.entries(cookies)) {
      if (key.includes("auth-token")) {
        try {
          const parsed = JSON.parse(value);
          accessToken = parsed?.access_token || parsed;
          break;
        } catch {
          accessToken = value;
          break;
        }
      }
    }
  }

  if (accessToken) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (user && !error) {
        return {
          redirect: {
            destination: "/page",
            permanent: false,
          },
        };
      }
    } catch {
      // Игнорируем ошибки проверки токена
    }
  }

  return {
    props: {},
  };
};

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Client-side auth check (fallback)
    const checkAuth = async () => {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push("/page");
      }
    };
    checkAuth();
  }, [router]);

  return (
    <>
      <Head>
        <title>Sigmet</title>
        <meta name="description" content="Sigmet social network" />
      </Head>

      <section className="relative overflow-hidden min-h-screen bg-telegram-gradient">
        {/* Theme toggle button */}
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle />
        </div>

        {/* Telegram-style gradient background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(51, 144, 236, 0.15), transparent 50%), radial-gradient(circle at 80% 70%, rgba(51, 144, 236, 0.1), transparent 50%)",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-24">
          {/* Hero Section */}
          <div className="grid md:grid-cols-2 gap-10 items-center mb-20">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-telegram-blue/20 bg-telegram-blue/10 px-3 py-1 text-xs text-telegram-blue mb-4 backdrop-blur-sm">
                ✨ New: Faster feed and analytics
              </div>
              <h1 className="text-4xl md:text-6xl font-bold text-telegram-text tracking-tight mb-4">
                Build your{" "}
                <span className="bg-gradient-to-r from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent">
                  social weight
                </span>{" "}
                through real progress
              </h1>
              <p className="mt-4 text-telegram-text-secondary text-lg leading-relaxed">
                Sigmet helps you grow with purpose. Share content, track goals, and see your evolution through data.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button href="/signup" variant="primary">Create account</Button>
                <Button href="/login" variant="secondary">Sign in</Button>
              </div>
            </div>

            <div className="relative">
              <div className="telegram-card-glow p-6 md:p-8 backdrop-blur-sm">
                <h3 className="text-telegram-text font-semibold text-xl mb-4">🚀 Quick start</h3>
                <ol className="mt-4 space-y-3 text-telegram-text-secondary list-decimal list-inside">
                  <li className="pl-2">Sign up and confirm your email</li>
                  <li className="pl-2">Set up your profile and avatar</li>
                  <li className="pl-2">Choose 3 key growth directions</li>
                  <li className="pl-2">Start sharing and tracking progress</li>
                </ol>
                <Button href="/signup" variant="primary" className="mt-6 w-full">Get started</Button>
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="telegram-card-feature group">
              <div className="icon-wrapper mb-4">
                <div className="w-12 h-12 rounded-full bg-telegram-blue/20 flex items-center justify-center text-2xl group-hover:bg-telegram-blue/30 transition-colors">
                  🎯
                </div>
              </div>
              <h3 className="text-telegram-text font-semibold text-xl mb-2">Purpose-driven communities</h3>
              <p className="text-telegram-text-secondary leading-relaxed">
                Focus on what matters. Join groups that align with your goals — less noise, more meaning.
              </p>
            </div>
            
            <div className="telegram-card-feature group">
              <div className="icon-wrapper mb-4">
                <div className="w-12 h-12 rounded-full bg-telegram-blue/20 flex items-center justify-center text-2xl group-hover:bg-telegram-blue/30 transition-colors">
                  ⚖️
                </div>
              </div>
              <h3 className="text-telegram-text font-semibold text-xl mb-2">Transparent social weight</h3>
              <p className="text-telegram-text-secondary leading-relaxed">
                Reputation built from verified activity, contributions, and learning.
              </p>
            </div>
            
            <div className="telegram-card-feature group">
              <div className="icon-wrapper mb-4">
                <div className="w-12 h-12 rounded-full bg-telegram-blue/20 flex items-center justify-center text-2xl group-hover:bg-telegram-blue/30 transition-colors">
                  🪶
                </div>
              </div>
              <h3 className="text-telegram-text font-semibold text-xl mb-2">Creator-first ecosystem</h3>
              <p className="text-telegram-text-secondary leading-relaxed">
                Full analytics, fair authorship, and visibility for every creator.
              </p>
            </div>
          </div>

          {/* Updates Section */}
          <div className="mt-20 telegram-card-glow p-6 md:p-8 backdrop-blur-sm">
            <h3 className="text-telegram-text text-xl font-semibold mb-4">📢 Latest updates</h3>
            <ul className="text-telegram-text-secondary list-disc list-inside space-y-2">
              <li>New profile dashboard with analytics</li>
              <li>Faster content loading in feed</li>
              <li>Improved onboarding flow</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
