// pages/index.tsx
import Head from "next/head";
import { GetServerSideProps } from "next";
import { createClient } from "@supabase/supabase-js";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Button from "@/components/Button";
import { SW_LEVELS, LEVEL_COLOR_SCHEMES, type SWLevel } from "@/lib/swLevels";

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

interface StatsData {
  newUsers: { '24h': number; '7d': number; '30d': number };
  newPosts: { '24h': number; '7d': number; '30d': number };
  newComments: { '24h': number; '7d': number; '30d': number };
  newReactions: { '24h': number; '7d': number; '30d': number };
}

interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  type: 'guideline' | 'changelog';
  published_at: string;
}

export default function Home() {
  const router = useRouter();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [latestPosts, setLatestPosts] = useState<BlogPost[]>([]);

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

    // Fetch statistics
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats/public');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();

    // Fetch latest blog posts
    const fetchLatestPosts = async () => {
      try {
        const response = await fetch('/api/blog/posts.list?limit=3');
        if (response.ok) {
          const data = await response.json();
          setLatestPosts(data.posts || []);
        }
      } catch (error) {
        console.error('Error fetching latest posts:', error);
      }
    };
    fetchLatestPosts();
  }, [router]);

  return (
    <>
      <Head>
        <title>Sigmet</title>
        <meta name="description" content="Sigmet social network" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
      </Head>

      <section className="relative overflow-hidden min-h-screen bg-primary-gradient">
        {/* Primary-style gradient background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(51, 144, 236, 0.15), transparent 50%), radial-gradient(circle at 80% 70%, rgba(51, 144, 236, 0.1), transparent 50%)",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-24">
          {/* Hero Section */}
          <div className="grid md:grid-cols-2 gap-8 md:gap-10 items-center mb-16 sm:mb-20">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-blue/20 bg-primary-blue/10 px-2.5 sm:px-3 py-1 text-xs text-primary-blue mb-3 sm:mb-4 backdrop-blur-sm">
                ✨ New: Faster feed and analytics
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-primary-text tracking-tight mb-3 sm:mb-4">
                Build your{" "}
                <span className="bg-gradient-to-r from-primary-blue to-primary-blue-light bg-clip-text text-transparent">
                  social weight
                </span>{" "}
                through real progress
              </h1>
              <p className="mt-3 sm:mt-4 text-primary-text-secondary text-base sm:text-lg leading-relaxed">
                Sigmet helps you grow with purpose. Share content, track goals, and see your evolution through data.
              </p>
              <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row flex-wrap gap-3">
                <Button href="/signup" variant="primary" className="w-full sm:w-auto">Create account</Button>
                <Button href="/login" variant="secondary" className="w-full sm:w-auto">Sign in</Button>
              </div>
            </div>

            <div className="relative mt-8 md:mt-0">
              <div className="backdrop-blur-sm">
                <h3 className="text-primary-text font-bold text-2xl sm:text-3xl md:text-4xl mb-6 sm:mb-8 text-center md:text-left bg-gradient-to-r from-primary-blue to-primary-blue-light bg-clip-text text-transparent">Quick start</h3>
                <div className="space-y-2 mb-6 sm:mb-8">
                  {/* Step 1 */}
                  <div className="group relative backdrop-blur-sm border border-primary-blue/20 rounded-lg transition-all duration-300 hover:border-primary-blue/40 hover:shadow-[0_4px_12px_rgba(51,144,236,0.15)]" style={{ padding: '8px 12px', background: 'rgba(31, 41, 55, 0.4)' }}>
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary-blue/20 flex items-center justify-center font-bold text-primary-text text-xs sm:text-sm group-hover:bg-primary-blue/30 transition-colors">
                        1
                      </div>
                      <p className="text-primary-text text-xs sm:text-sm flex-1">
                        Choose directions that interest you for development
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="group relative backdrop-blur-sm border border-primary-blue/20 rounded-lg transition-all duration-300 hover:border-primary-blue/40 hover:shadow-[0_4px_12px_rgba(51,144,236,0.15)]" style={{ padding: '8px 12px', background: 'rgba(31, 41, 55, 0.4)' }}>
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary-blue/20 flex items-center justify-center font-bold text-primary-text text-xs sm:text-sm group-hover:bg-primary-blue/30 transition-colors">
                        2
                      </div>
                      <p className="text-primary-text text-xs sm:text-sm flex-1">
                        Move through tasks and goals, support and be supported by the community
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="group relative backdrop-blur-sm border border-primary-blue/20 rounded-lg transition-all duration-300 hover:border-primary-blue/40 hover:shadow-[0_4px_12px_rgba(51,144,236,0.15)]" style={{ padding: '8px 12px', background: 'rgba(31, 41, 55, 0.4)' }}>
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary-blue/20 flex items-center justify-center font-bold text-primary-text text-xs sm:text-sm group-hover:bg-primary-blue/30 transition-colors">
                        3
                      </div>
                      <p className="text-primary-text text-xs sm:text-sm flex-1">
                        Develop your profile, get new SW results
                      </p>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="group relative backdrop-blur-sm border border-primary-blue/20 rounded-lg transition-all duration-300 hover:border-primary-blue/40 hover:shadow-[0_4px_12px_rgba(51,144,236,0.15)]" style={{ padding: '8px 12px', background: 'rgba(31, 41, 55, 0.4)' }}>
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary-blue/20 flex items-center justify-center font-bold text-primary-text text-xs sm:text-sm group-hover:bg-primary-blue/30 transition-colors">
                        4
                      </div>
                      <p className="text-primary-text text-xs sm:text-sm flex-1">
                        Unlock new features for advanced users
                      </p>
                    </div>
                  </div>

                  {/* Step 5 */}
                  <div className="group relative backdrop-blur-sm border border-primary-blue/20 rounded-lg transition-all duration-300 hover:border-primary-blue/40 hover:shadow-[0_4px_12px_rgba(51,144,236,0.15)]" style={{ padding: '8px 12px', background: 'rgba(31, 41, 55, 0.4)' }}>
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary-blue/20 flex items-center justify-center font-bold text-primary-text text-xs sm:text-sm group-hover:bg-primary-blue/30 transition-colors">
                        5
                      </div>
                      <p className="text-primary-text text-xs sm:text-sm flex-1">
                        Develop your personality comprehensively with our social network
                      </p>
                    </div>
                  </div>
                </div>
                <Button href="/signup" variant="primary" className="w-full">Get started</Button>
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="mt-12 sm:mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="group relative backdrop-blur-sm border border-primary-blue/20 rounded-xl transition-all duration-300 hover:border-primary-blue/40 hover:shadow-[0_8px_24px_rgba(51,144,236,0.2)] overflow-hidden" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(51, 144, 236, 0.08) 0%, rgba(31, 41, 55, 0.6) 50%, rgba(91, 168, 240, 0.06) 100%)' }}>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(51, 144, 236, 0.15), transparent 70%)' }}></div>
              <div className="relative z-10">
                <div className="icon-wrapper mb-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-gradient-to-br from-primary-blue/30 to-primary-blue-light/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-[0_4px_12px_rgba(51,144,236,0.3)]">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 border-2 border-primary-text rounded-sm rotate-45"></div>
                  </div>
                </div>
                <h3 className="text-primary-text font-semibold text-xl sm:text-2xl mb-3">New Paradigm</h3>
                <p className="text-primary-text-secondary text-sm sm:text-base leading-relaxed">
                  The old concept of social networks is outdated. Society needs a new, productive system of interaction where the time you spend online brings real results and value, not just a break from reality.
                </p>
              </div>
            </div>
            
            <div className="group relative backdrop-blur-sm border border-primary-blue/20 rounded-xl transition-all duration-300 hover:border-primary-blue/40 hover:shadow-[0_8px_24px_rgba(51,144,236,0.2)] overflow-hidden" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(91, 168, 240, 0.08) 0%, rgba(31, 41, 55, 0.6) 50%, rgba(51, 144, 236, 0.06) 100%)' }}>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(91, 168, 240, 0.15), transparent 70%)' }}></div>
              <div className="relative z-10">
                <div className="icon-wrapper mb-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-gradient-to-br from-primary-blue-light/30 to-primary-blue/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-[0_4px_12px_rgba(91,168,240,0.3)]">
                    <div className="flex flex-col gap-1">
                      <div className="w-5 h-1 bg-primary-text rounded-full"></div>
                      <div className="w-4 h-1 bg-primary-text rounded-full"></div>
                      <div className="w-3 h-1 bg-primary-text rounded-full"></div>
                    </div>
                  </div>
                </div>
                <h3 className="text-primary-text font-semibold text-xl sm:text-2xl mb-3">SW</h3>
                <p className="text-primary-text-secondary text-sm sm:text-base leading-relaxed">
                  A complex combined metric that reflects a person's contribution within the network, and in the future, beyond it. Every action and effort you make is recorded and visible — never lost in the void.
                </p>
              </div>
            </div>
            
            <div className="group relative backdrop-blur-sm border border-primary-blue/20 rounded-xl transition-all duration-300 hover:border-primary-blue/40 hover:shadow-[0_8px_24px_rgba(51,144,236,0.2)] overflow-hidden" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(51, 144, 236, 0.06) 0%, rgba(31, 41, 55, 0.6) 50%, rgba(91, 168, 240, 0.08) 100%)' }}>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(51, 144, 236, 0.15), transparent 70%)' }}></div>
              <div className="relative z-10">
                <div className="icon-wrapper mb-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-gradient-to-br from-primary-blue/25 to-primary-blue-light/25 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-[0_4px_12px_rgba(51,144,236,0.3)]">
                    <div className="relative w-6 h-6 sm:w-7 sm:h-7">
                      <div className="absolute top-0 left-0 w-3 h-3 border-2 border-primary-text border-r-0 border-b-0 rounded-tl"></div>
                      <div className="absolute bottom-0 right-0 w-3 h-3 border-2 border-primary-text border-l-0 border-t-0 rounded-br"></div>
                    </div>
                  </div>
                </div>
                <h3 className="text-primary-text font-semibold text-xl sm:text-2xl mb-3">TF</h3>
                <p className="text-primary-text-secondary text-sm sm:text-base leading-relaxed">
                  In today's digital world, trust and honesty require new verification formats. We introduce a new indicator that makes it possible. Now, when you evaluate someone, you'll look at their verified profile, not guess who they really are.
                </p>
              </div>
            </div>
          </div>

          {/* SW Levels Table */}
          <div className="mt-12 sm:mt-16 md:mt-20">
            <div className="card-glow-primary p-4 sm:p-6 backdrop-blur-sm">
              <div className="text-center mb-4 sm:mb-5">
                <h2 className="text-xl sm:text-2xl font-bold text-primary-text mb-2 bg-gradient-to-r from-primary-blue to-primary-blue-light bg-clip-text text-transparent">
                  Social Weight Levels
                </h2>
                <p className="text-sm sm:text-base text-primary-text-secondary">
                  Your progress is visible. Grow your SW and unlock new visual recognition.
                </p>
              </div>
              
              <div className="overflow-x-auto overflow-y-visible">
                <div className="min-w-full">
                  <div className="flex items-center justify-center gap-2 sm:gap-4 pb-8">
                    {SW_LEVELS.map((level, index) => {
                      const colorScheme = LEVEL_COLOR_SCHEMES[level.name] || LEVEL_COLOR_SCHEMES['Beginner'];
                      const showGlow = level.name !== 'Beginner';
                      const isLast = index === SW_LEVELS.length - 1;
                      
                      // Progressive glow parameters by level (from AvatarWithBadge - exact copy)
                      const getGlowParams = (levelName: string, colorScheme: { hex: string }) => {
                        const levelParams: Record<string, any> = {
                          'Growing': {
                            borderWidth: 1.5,
                            outerGlow: { r1: 8, r2: 12, r3: 16, o1: '30', o2: '20', o3: '15' },
                            imageGlow: { r1: 6, r2: 10, r3: 14, r4: 4, o1: '40', o2: '30', o3: '20', o4: '10' },
                            gradient: '15'
                          },
                          'Advance': {
                            borderWidth: 2,
                            outerGlow: { r1: 10, r2: 16, r3: 22, o1: '40', o2: '28', o3: '20' },
                            imageGlow: { r1: 8, r2: 14, r3: 20, r4: 5, o1: '50', o2: '38', o3: '28', o4: '15' },
                            gradient: '20'
                          },
                          'Expert': {
                            borderWidth: 2.5,
                            outerGlow: { r1: 12, r2: 20, r3: 28, o1: '50', o2: '36', o3: '25' },
                            imageGlow: { r1: 10, r2: 18, r3: 26, r4: 6, o1: '60', o2: '46', o3: '36', o4: '20' },
                            gradient: '25'
                          },
                          'Leader': {
                            borderWidth: 3,
                            outerGlow: { r1: 14, r2: 24, r3: 34, o1: '60', o2: '44', o3: '30' },
                            imageGlow: { r1: 12, r2: 22, r3: 32, r4: 7, o1: '70', o2: '54', o3: '44', o4: '25' },
                            gradient: '30'
                          },
                          'Angel': {
                            borderWidth: 3.5,
                            outerGlow: { r1: 16, r2: 28, r3: 40, o1: '70', o2: '52', o3: '35' },
                            imageGlow: { r1: 14, r2: 26, r3: 38, r4: 8, o1: '80', o2: '62', o3: '52', o4: '30' },
                            gradient: '35'
                          }
                        };
                        return levelParams[levelName] || null;
                      };
                      
                      const glowParams = showGlow ? getGlowParams(level.name, colorScheme) : null;
                      const og = glowParams?.outerGlow;
                      const ig = glowParams?.imageGlow;
                      
                      return (
                        <React.Fragment key={level.name}>
                          <div className="flex flex-col items-center">
                            {/* Level name */}
                            <div className="mb-3">
                              <span className={`font-bold text-xs sm:text-sm ${colorScheme.text}`}>
                                {level.name}
                              </span>
                            </div>
                            {/* Avatar with glow */}
                            <div className="relative" style={{ paddingBottom: '40px' }}>
                              <div className="relative w-12 h-12 sm:w-14 sm:h-14">
                                {/* Outer glow ring */}
                                {glowParams && (
                                  <div
                                    className="absolute inset-0 rounded-full pointer-events-none"
                                    style={{
                                      boxShadow: `0 0 ${og.r1}px ${colorScheme.hex}${og.o1}, 0 0 ${og.r2}px ${colorScheme.hex}${og.o2}, 0 0 ${og.r3}px ${colorScheme.hex}${og.o3}`,
                                      background: `radial-gradient(circle at center, ${colorScheme.hex}${glowParams.gradient}, transparent 70%)`,
                                      animation: 'glowPulse 2s ease-in-out infinite',
                                      animationDelay: `${index * 0.2}s`
                                    }}
                                  />
                                )}
                                {/* Avatar circle */}
                                <div
                                  className={`absolute inset-0 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm transition-all duration-500 hover:scale-110 ${
                                    showGlow ? '' : 'border border-white/10 bg-gray-600/30'
                                  }`}
                                  style={
                                    glowParams && colorScheme
                                      ? {
                                          border: `${glowParams.borderWidth} solid ${colorScheme.hex}`,
                                          boxShadow: `0 0 ${ig.r1}px ${colorScheme.hex}${ig.o1}, 0 0 ${ig.r2}px ${colorScheme.hex}${ig.o2}, 0 0 ${ig.r3}px ${colorScheme.hex}${ig.o3}, inset 0 0 ${ig.r4}px ${colorScheme.hex}${ig.o4}`,
                                          background: `radial-gradient(circle, ${colorScheme.hex}40, ${colorScheme.hex}20)`
                                        }
                                      : { backgroundColor: 'rgba(156, 163, 175, 0.3)' }
                                  }
                                >
                                  {level.name.charAt(0)}
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* Arrow between avatars - centered relative to avatars */}
                          {!isLast && (
                            <div className="flex items-center justify-center" style={{ minWidth: '24px', marginBottom: '40px', alignSelf: 'center' }}>
                              <div className="text-primary-blue-light text-xl sm:text-2xl">
                                →
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
              
              <div className="mt-4 sm:mt-5 text-center">
                <p className="text-primary-text-secondary text-xs sm:text-sm mb-3">
                  Every action counts. Build your reputation through meaningful contributions.
                </p>
                <Button href="/signup" variant="primary" className="w-full sm:w-auto text-sm">Start Building Your SW</Button>
              </div>
            </div>
          </div>

          {/* Why Sigmet.app & Updates Section */}
          <div className="mt-12 sm:mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Why Sigmet.app Section */}
            <div className="card-glow-primary p-6 sm:p-8 md:p-10 backdrop-blur-sm">
              <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary-text mb-3 sm:mb-4">
                  Why Sigmet.app?
                </h2>
                <p className="text-lg sm:text-xl text-primary-text-secondary">
                  A calm, focused alternative to endless feeds.
                </p>
              </div>
              
              <div className="space-y-4 sm:space-y-5">
                <div className="flex gap-4 sm:gap-5 items-start">
                  <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-primary-blue via-primary-blue-light to-primary-blue flex items-center justify-center font-extrabold text-xl sm:text-2xl shadow-[0_0_20px_rgba(51,144,236,0.6)] ring-2 ring-primary-blue/50 border-2 border-white/20">
                    <span className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">1</span>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-primary-text-secondary text-sm sm:text-base leading-relaxed">
                      <span className="font-semibold text-primary-text">Social Weight (SW):</span> progress across multiple life areas - not a vanity score.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 sm:gap-5 items-start">
                  <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-primary-blue via-primary-blue-light to-primary-blue flex items-center justify-center font-extrabold text-xl sm:text-2xl shadow-[0_0_20px_rgba(51,144,236,0.6)] ring-2 ring-primary-blue/50 border-2 border-white/20">
                    <span className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">2</span>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-primary-text-secondary text-sm sm:text-base leading-relaxed">
                      <span className="font-semibold text-primary-text">Personal roadmap & micro-challenges</span> that nudge you forward without pressure.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 sm:gap-5 items-start">
                  <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-primary-blue via-primary-blue-light to-primary-blue flex items-center justify-center font-extrabold text-xl sm:text-2xl shadow-[0_0_20px_rgba(51,144,236,0.6)] ring-2 ring-primary-blue/50 border-2 border-white/20">
                    <span className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">3</span>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-primary-text-secondary text-sm sm:text-base leading-relaxed">
                      <span className="font-semibold text-primary-text">Customize your own feed</span> - more freedom, less noise.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 sm:gap-5 items-start">
                  <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-primary-blue via-primary-blue-light to-primary-blue flex items-center justify-center font-extrabold text-xl sm:text-2xl shadow-[0_0_20px_rgba(51,144,236,0.6)] ring-2 ring-primary-blue/50 border-2 border-white/20">
                    <span className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">4</span>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-primary-text-secondary text-sm sm:text-base leading-relaxed">
                      <span className="font-semibold text-primary-text">Private today. Web3-ready tomorrow</span> (ENS/DID, SBT, VC) - you own your identity.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 sm:gap-5 items-start">
                  <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-primary-blue via-primary-blue-light to-primary-blue flex items-center justify-center font-extrabold text-xl sm:text-2xl shadow-[0_0_20px_rgba(51,144,236,0.6)] ring-2 ring-primary-blue/50 border-2 border-white/20">
                    <span className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">5</span>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-primary-text-secondary text-sm sm:text-base leading-relaxed">
                      <span className="font-semibold text-primary-text">AI Compass</span> - your personal guide that helps maintain daily balance and awareness across chosen life areas.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Updates Section */}
            <div className="card-glow-primary p-5 sm:p-6 md:p-8 backdrop-blur-sm">
              <h3 className="text-primary-text text-lg sm:text-xl font-semibold mb-3 sm:mb-4">📢 Latest updates</h3>
              {latestPosts.length > 0 ? (
                <ul className="text-primary-text-secondary text-sm sm:text-base list-disc list-inside space-y-1.5 sm:space-y-2">
                  {latestPosts.map((post) => (
                    <li key={post.id}>
                      <Link
                        href={`/blog/${post.slug}`}
                        className="text-primary-blue hover:text-primary-blue-light hover:underline transition-colors"
                      >
                        {post.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="text-primary-text-secondary text-sm sm:text-base list-disc list-inside space-y-1.5 sm:space-y-2">
                  <li>New profile dashboard with analytics</li>
                  <li>Faster content loading in feed</li>
                  <li>Improved onboarding flow</li>
                </ul>
              )}
              
              {/* Statistics Section */}
              <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/10">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-primary-text text-center mb-4 sm:mb-6">
                  📊 Network Statistics
                </h2>
                
                {loading ? (
                  <div className="text-center text-primary-text-secondary py-8 font-mono text-sm">
                    Loading statistics...
                  </div>
                ) : stats ? (
                  <div className="overflow-x-auto">
                    <div className="bg-black/20 border border-primary-blue/30 rounded p-4 font-mono text-sm">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-primary-blue/40">
                            <th className="text-left py-2 px-3 text-primary-text font-semibold text-xs sm:text-sm"></th>
                            <th className="text-center py-2 px-3 text-primary-text font-semibold text-xs sm:text-sm">24 hours</th>
                            <th className="text-center py-2 px-3 text-primary-text font-semibold text-xs sm:text-sm">7 days</th>
                            <th className="text-center py-2 px-3 text-primary-text font-semibold text-xs sm:text-sm">30 days</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-primary-blue/20 hover:bg-primary-blue/5 transition-colors">
                            <td className="py-2 px-3 text-primary-text font-medium text-xs sm:text-sm">👥 New Users</td>
                            <td className="py-2 px-3 text-center text-primary-blue-light text-xs sm:text-sm font-mono font-semibold">{stats.newUsers['24h'].toLocaleString()}</td>
                            <td className="py-2 px-3 text-center text-primary-blue-light text-xs sm:text-sm font-mono font-semibold">{stats.newUsers['7d'].toLocaleString()}</td>
                            <td className="py-2 px-3 text-center text-primary-blue-light text-xs sm:text-sm font-mono font-semibold">{stats.newUsers['30d'].toLocaleString()}</td>
                          </tr>
                          <tr className="border-b border-primary-blue/20 hover:bg-primary-blue/5 transition-colors">
                            <td className="py-2 px-3 text-primary-text font-medium text-xs sm:text-sm">📝 New Posts</td>
                            <td className="py-2 px-3 text-center text-primary-blue-light text-xs sm:text-sm font-mono font-semibold">{stats.newPosts['24h'].toLocaleString()}</td>
                            <td className="py-2 px-3 text-center text-primary-blue-light text-xs sm:text-sm font-mono font-semibold">{stats.newPosts['7d'].toLocaleString()}</td>
                            <td className="py-2 px-3 text-center text-primary-blue-light text-xs sm:text-sm font-mono font-semibold">{stats.newPosts['30d'].toLocaleString()}</td>
                          </tr>
                          <tr className="border-b border-primary-blue/20 hover:bg-primary-blue/5 transition-colors">
                            <td className="py-2 px-3 text-primary-text font-medium text-xs sm:text-sm">💬 New Comments</td>
                            <td className="py-2 px-3 text-center text-primary-blue-light text-xs sm:text-sm font-mono font-semibold">{stats.newComments['24h'].toLocaleString()}</td>
                            <td className="py-2 px-3 text-center text-primary-blue-light text-xs sm:text-sm font-mono font-semibold">{stats.newComments['7d'].toLocaleString()}</td>
                            <td className="py-2 px-3 text-center text-primary-blue-light text-xs sm:text-sm font-mono font-semibold">{stats.newComments['30d'].toLocaleString()}</td>
                          </tr>
                          <tr className="hover:bg-primary-blue/5 transition-colors">
                            <td className="py-2 px-3 text-primary-text font-medium text-xs sm:text-sm">❤️ New Reactions</td>
                            <td className="py-2 px-3 text-center text-primary-blue-light text-xs sm:text-sm font-mono font-semibold">{stats.newReactions['24h'].toLocaleString()}</td>
                            <td className="py-2 px-3 text-center text-primary-blue-light text-xs sm:text-sm font-mono font-semibold">{stats.newReactions['7d'].toLocaleString()}</td>
                            <td className="py-2 px-3 text-center text-primary-blue-light text-xs sm:text-sm font-mono font-semibold">{stats.newReactions['30d'].toLocaleString()}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-primary-text-secondary py-8 font-mono text-sm">
                    Failed to load statistics
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Social Media Follow Section */}
          <div className="mt-12 sm:mt-16 md:mt-20">
            <div className="card-glow-primary p-6 sm:p-8 md:p-10 backdrop-blur-sm text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary-text mb-3 sm:mb-4">
                Follow Sigmet for Updates
              </h2>
              <p className="text-primary-text-secondary text-base sm:text-lg mb-6 sm:mb-8">
                Stay in the loop about the project launch, closed beta access, and upcoming releases.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Button
                  href="https://x.com/sigmetapp"
                  variant="primary"
                  className="w-full sm:w-auto min-w-[200px]"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Follow on X
                </Button>
                <Button
                  href="https://t.me/sigmetapp"
                  variant="secondary"
                  className="w-full sm:w-auto min-w-[200px]"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Join Telegram
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
