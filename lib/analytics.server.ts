import { PostHog } from "posthog-node";

const key = process.env.POSTHOG_KEY;
const host = process.env.POSTHOG_HOST || "https://app.posthog.com";

// Lazily create client to avoid build-time failures without key
export function getServerPH() {
  if (!key) return null;
  return new PostHog(key, { host });
}

// Utilities that safely no-op without a key
export async function captureServer(event: string, props?: Record<string, any>) {
  const ph = getServerPH();
  if (!ph) return;
  await ph.capture({ event, properties: props || {} });
}

export async function identifyServer(
  distinctId: string,
  props?: Record<string, any>
) {
  const ph = getServerPH();
  if (!ph) return;
  await ph.identify({ distinctId, properties: props || {} });
}
