import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

type PushPayload = {
  toUserId: string;
  title: string;
  body: string;
  url?: string;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { toUserId, title, body, url } = payload;
  console.log("[edge-function:push]", { toUserId, title, body, url });

  // Best-effort analytics: push_sent via PostHog HTTP API
  try {
    const token = Deno.env.get("POSTHOG_SERVER_KEY") || Deno.env.get("POSTHOG_KEY") || Deno.env.get("POSTHOG_API_KEY");
    const host = Deno.env.get("POSTHOG_HOST") || "https://app.posthog.com";
    if (token) {
      await fetch(`${host}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: token,
          event: "push_sent",
          distinct_id: toUserId,
          properties: { to_user_id: toUserId, url: url ?? null },
        }),
      });
    }
  } catch (_) {
    // ignore analytics errors
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
