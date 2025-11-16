# Настройка OAuth для быстрой регистрации

Этот проект поддерживает быструю регистрацию через социальные сети: Twitter (X) и Instagram (через Facebook).

## Что было реализовано

1. **Компонент SocialAuthButtons** (`components/SocialAuthButtons.tsx`)
   - Кнопки для авторизации через Twitter и Instagram (Facebook)
   - Автоматическая обработка ошибок
   - Интеграция с темой приложения

2. **Интеграция на страницах**
   - Страница логина (`app/login/LoginClient.tsx`)
   - Страница регистрации (`app/signup/page.tsx`)

3. **Автоматическое создание профиля**
   - Callback обработчик (`app/auth/callback/page.tsx`) автоматически создает профиль из OAuth данных
   - Извлекает имя, аватар и ссылки на социальные сети

## Настройка в Supabase Dashboard

### 1. Twitter (X) OAuth

1. Перейдите в [Supabase Dashboard](https://app.supabase.com) → Ваш проект → Authentication → Providers
2. Найдите **Twitter** и включите его
3. Создайте приложение в [Twitter Developer Portal](https://developer.twitter.com/en/portal):
   - Перейдите в Developer Portal → Projects & Apps → Create App
   - Укажите название приложения и callback URL: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
   - После создания получите:
     - **API Key** (Consumer Key)
     - **API Secret** (Consumer Secret)
4. Скопируйте эти ключи в Supabase Dashboard в настройки Twitter провайдера
5. Сохраните изменения

### 2. Facebook/Instagram OAuth

1. В Supabase Dashboard найдите **Facebook** и включите его
2. Создайте приложение в [Facebook Developers](https://developers.facebook.com/):
   - Перейдите в My Apps → Create App
   - Выберите тип приложения: "Consumer" или "Business"
   - Добавьте продукт "Facebook Login"
   - В настройках Facebook Login укажите:
     - Valid OAuth Redirect URIs: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
   - В настройках приложения получите:
     - **App ID**
     - **App Secret**
3. Скопируйте эти значения в Supabase Dashboard в настройки Facebook провайдера
4. Сохраните изменения

**Примечание:** Instagram не предоставляет отдельный OAuth для обычных приложений. Используется Facebook OAuth, который может предоставить доступ к Instagram для бизнес-аккаунтов, связанных с Facebook.

## Как это работает

1. Пользователь нажимает кнопку "Twitter" или "Instagram" на странице логина/регистрации
2. Происходит редирект на страницу авторизации провайдера
3. Пользователь дает согласие на доступ к данным
4. Провайдер перенаправляет обратно на `/auth/callback`
5. Callback обработчик:
   - Создает или обновляет профиль пользователя
   - Извлекает имя, аватар и ссылки на социальные сети из OAuth данных
   - Устанавливает сессию
   - Перенаправляет на главную страницу (`/feed`)

## Данные, которые извлекаются

### Twitter
- Имя пользователя (из `user_metadata.preferred_username` или `user_metadata.user_name`)
- Аватар (если доступен)
- Ссылка на Twitter профиль

### Facebook/Instagram
- Полное имя (из `user_metadata.full_name` или `user_metadata.name`)
- Аватар (из `user_metadata.avatar_url` или `user_metadata.picture`)
- Ссылка на Instagram (если доступна через Facebook)

## Переменные окружения

Убедитесь, что в `.env.local` или переменных окружения Vercel установлены:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_REDIRECT_ORIGIN=your_domain (опционально)
```

## Тестирование

1. Убедитесь, что OAuth провайдеры настроены в Supabase Dashboard
2. Перейдите на страницу `/login` или `/signup`
3. Нажмите на кнопку "Twitter" или "Instagram"
4. Авторизуйтесь через провайдера
5. Проверьте, что профиль создан автоматически с данными из социальной сети

## Устранение неполадок

### Ошибка "Invalid redirect URI"
- Убедитесь, что callback URL в настройках провайдера точно совпадает с URL в Supabase
- Формат: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

### Профиль не создается
- Проверьте консоль браузера на наличие ошибок
- Убедитесь, что RLS (Row Level Security) политики позволяют создавать профили
- Проверьте, что таблица `profiles` существует и имеет правильную структуру

### Данные не извлекаются
- Разные провайдеры возвращают данные в разных полях `user_metadata`
- Проверьте, какие данные возвращает ваш провайдер, и при необходимости обновите функцию `ensureProfileFromOAuth` в `app/auth/callback/page.tsx`
