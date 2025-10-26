# Sigmet MVP Starter (Full)

Next.js 14 + TypeScript + Tailwind + Supabase starter for a social MVP: auth, profile, feed, messages, invites, SW v0.

## Quick start
1. Create a new Supabase project.
2. Copy envs from `.env.example` to your Vercel project settings.
3. Run SQL from `db/schema.sql` in Supabase SQL editor.
4. `npm i` and `npm run dev` locally. Then deploy to Vercel.

## Notes
- API routes are stubs. Replace them with Supabase reads and writes.
- Do not expose Service Role key to the browser. Use it only on the server.
- Add PostHog and Sentry keys if you need analytics and error tracking.
