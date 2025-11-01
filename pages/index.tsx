// pages/index.tsx
import Head from "next/head";
import { GetServerSideProps } from "next";
import { createClient } from "@supabase/supabase-js";
import React, { useEffect } from "react";
import { useRouter } from "next/router";
import Button from "@/components/Button";

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
    // Клиентская проверка авторизации (fallback)
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
                ✨ Новое: Быстрая лента и аналитика
              </div>
              <h1 className="text-4xl md:text-6xl font-bold text-telegram-text tracking-tight mb-4">
                Создавай свой{" "}
                <span className="bg-gradient-to-r from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent">
                  социальный вес
                </span>{" "}
                через реальный прогресс
              </h1>
              <p className="mt-4 text-telegram-text-secondary text-lg leading-relaxed">
                Sigmet помогает тебе расти целенаправленно. Делись контентом, отслеживай цели и наблюдай свою эволюцию через данные.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button href="/signup" variant="primary">Создать аккаунт</Button>
                <Button href="/login" variant="secondary">Войти</Button>
              </div>
            </div>

            <div className="relative">
              <div className="telegram-card-glow p-6 md:p-8 backdrop-blur-sm">
                <h3 className="text-telegram-text font-semibold text-xl mb-4">🚀 Быстрый старт</h3>
                <ol className="mt-4 space-y-3 text-telegram-text-secondary list-decimal list-inside">
                  <li className="pl-2">Зарегистрируйся и подтверди email</li>
                  <li className="pl-2">Настрой профиль и аватар</li>
                  <li className="pl-2">Выбери 3 ключевых направления роста</li>
                  <li className="pl-2">Начни делиться и отслеживать прогресс</li>
                </ol>
                <Button href="/signup" variant="primary" className="mt-6 w-full">Начать</Button>
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
              <h3 className="text-telegram-text font-semibold text-xl mb-2">Целевые сообщества</h3>
              <p className="text-telegram-text-secondary leading-relaxed">
                Фокус на важном. Присоединяйся к группам, которые соответствуют твоим целям — меньше шума, больше смысла.
              </p>
            </div>
            
            <div className="telegram-card-feature group">
              <div className="icon-wrapper mb-4">
                <div className="w-12 h-12 rounded-full bg-telegram-blue/20 flex items-center justify-center text-2xl group-hover:bg-telegram-blue/30 transition-colors">
                  ⚖️
                </div>
              </div>
              <h3 className="text-telegram-text font-semibold text-xl mb-2">Прозрачный социальный вес</h3>
              <p className="text-telegram-text-secondary leading-relaxed">
                Репутация, построенная на проверенной активности, вкладе и обучении.
              </p>
            </div>
            
            <div className="telegram-card-feature group">
              <div className="icon-wrapper mb-4">
                <div className="w-12 h-12 rounded-full bg-telegram-blue/20 flex items-center justify-center text-2xl group-hover:bg-telegram-blue/30 transition-colors">
                  🪶
                </div>
              </div>
              <h3 className="text-telegram-text font-semibold text-xl mb-2">Экосистема для создателей</h3>
              <p className="text-telegram-text-secondary leading-relaxed">
                Полная аналитика, справедливое авторство и видимость для каждого создателя.
              </p>
            </div>
          </div>

          {/* Updates Section */}
          <div className="mt-20 telegram-card-glow p-6 md:p-8 backdrop-blur-sm">
            <h3 className="text-telegram-text text-xl font-semibold mb-4">📢 Последние обновления</h3>
            <ul className="text-telegram-text-secondary list-disc list-inside space-y-2">
              <li>Новая панель профиля с аналитикой</li>
              <li>Быстрая загрузка контента в ленте</li>
              <li>Улучшенный процесс онбординга</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
