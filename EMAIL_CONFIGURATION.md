# Настройка Email для подтверждения регистрации

Этот документ описывает, как настроить email для подтверждения регистрации в Supabase.

## Проблемы

1. **Отправитель email**: По умолчанию Supabase использует `noreply@mail.app.supabase.io`
2. **URL подтверждения**: Нужно настроить, чтобы ссылка вела на `https://sigmet.app`

## Решение

### 1. Настройка отправителя email (SMTP)

Чтобы изменить отправителя email с `noreply@mail.app.supabase.io` на ваш домен (например, `noreply@sigmet.app`), нужно настроить SMTP в Supabase Dashboard:

#### Шаги:

1. Откройте [Supabase Dashboard](https://app.supabase.com)
2. Выберите ваш проект
3. Перейдите в **Settings** → **Auth** → **SMTP Settings**
4. Включите **Enable Custom SMTP**
5. Заполните настройки SMTP:
   - **Sender email**: `noreply@sigmet.app` (или другой email на вашем домене)
   - **Sender name**: `Sigmet` (или другое имя)
   - **Host**: SMTP хост вашего провайдера (например, для SendGrid: `smtp.sendgrid.net`)
   - **Port**: Обычно `587` для TLS или `465` для SSL
   - **Username**: Ваш SMTP username
   - **Password**: Ваш SMTP password
   - **Secure**: Выберите `TLS` или `SSL` в зависимости от порта

#### Популярные SMTP провайдеры:

- **SendGrid**: `smtp.sendgrid.net:587` (TLS)
- **Mailgun**: `smtp.mailgun.org:587` (TLS)
- **AWS SES**: `email-smtp.{region}.amazonaws.com:587` (TLS)
- **Postmark**: `smtp.postmarkapp.com:587` (TLS)
- **Resend**: `smtp.resend.com:587` (TLS)

#### Важно:

- Email должен быть на вашем домене (`@sigmet.app`)
- Домен должен быть верифицирован у SMTP провайдера
- Для некоторых провайдеров нужно настроить SPF/DKIM записи в DNS

### 2. Настройка Site URL

Чтобы ссылки подтверждения вели на `https://sigmet.app`, нужно настроить Site URL в Supabase:

#### Шаги:

1. Откройте [Supabase Dashboard](https://app.supabase.com)
2. Выберите ваш проект
3. Перейдите в **Settings** → **API**
4. Найдите поле **Site URL**
5. Установите значение: `https://sigmet.app`
6. Сохраните изменения

### 3. Настройка переменной окружения

В коде уже используется переменная `NEXT_PUBLIC_REDIRECT_ORIGIN` для настройки URL подтверждения.

#### Локальная разработка:

Добавьте в `.env.local`:
```env
NEXT_PUBLIC_REDIRECT_ORIGIN=http://localhost:3000
```

#### Production (Vercel):

1. Откройте настройки проекта в Vercel
2. Перейдите в **Settings** → **Environment Variables**
3. Добавьте переменную:
   - **Name**: `NEXT_PUBLIC_REDIRECT_ORIGIN`
   - **Value**: `https://sigmet.app`
   - **Environment**: Production (и другие окружения по необходимости)

### 4. Кастомизация email шаблонов (опционально)

Вы можете кастомизировать шаблоны email в Supabase Dashboard:

1. Перейдите в **Settings** → **Auth** → **Email Templates**
2. Выберите шаблон **Confirm signup**
3. Отредактируйте текст и HTML
4. Используйте переменные:
   - `{{ .ConfirmationURL }}` - ссылка для подтверждения
   - `{{ .Email }}` - email пользователя
   - `{{ .SiteURL }}` - URL сайта

#### Пример кастомного шаблона:

**Subject**: `Подтвердите регистрацию на Sigmet`

**Body**:
```
Здравствуйте!

Спасибо за регистрацию на Sigmet. Пожалуйста, подтвердите ваш email, перейдя по ссылке:

{{ .ConfirmationURL }}

Если вы не регистрировались на Sigmet, просто проигнорируйте это письмо.

С уважением,
Команда Sigmet
```

## Проверка

После настройки:

1. Зарегистрируйте тестового пользователя
2. Проверьте, что email приходит с правильного адреса (например, `noreply@sigmet.app`)
3. Проверьте, что ссылка подтверждения ведет на `https://sigmet.app/auth/callback`
4. Убедитесь, что после перехода по ссылке пользователь успешно подтверждает email

## Troubleshooting

### Email не отправляется

- Проверьте настройки SMTP в Supabase Dashboard
- Убедитесь, что SMTP провайдер не блокирует отправку
- Проверьте логи в Supabase Dashboard → **Logs** → **Auth**

### Ссылка подтверждения ведет не туда

- Проверьте **Site URL** в Supabase Dashboard (Settings → API)
- Проверьте переменную `NEXT_PUBLIC_REDIRECT_ORIGIN` в Vercel
- Убедитесь, что домен `sigmet.app` правильно настроен в Vercel

### Email попадает в спам

- Настройте SPF записи для вашего домена
- Настройте DKIM записи
- Используйте репутабельный SMTP провайдер
- Избегайте спам-триггеров в тексте письма
