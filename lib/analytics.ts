/*
  Analytics helper for PostHog (client + server)
  - Client: uses posthog-js, initialized on demand
  - Server: uses posthog-node, safe no-op if token missing
*/

// Shared types
export type AnalyticsEventProps = Record<string, unknown> | undefined;

// ---------- Client (Browser) ----------
let posthogClient: any | null = null;
let posthogClientReady = false;

export async function initAnalyticsClient(): Promise<void> {
  if (typeof window === 'undefined') return; // SSR guard
  if (posthogClientReady) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';
  try {
    const mod: any = await import('posthog-js');
    const ph = mod.default || mod;
    ph.init(key, {
      api_host: host,
      autocapture: true,
      capture_pageview: false,
    });
    posthogClient = ph;
    posthogClientReady = true;
  } catch (err) {
    // Swallow errors to avoid breaking the app when analytics fails
    // eslint-disable-next-line no-console
    console.warn('PostHog client init failed', err);
  }
}

export function identifyUser(distinctId: string | null | undefined, props?: Record<string, any>): void {
  if (typeof window === 'undefined') return;
  if (!distinctId) return;
  if (!posthogClientReady || !posthogClient) return;
  try {
    posthogClient.identify(distinctId, props);
  } catch {}
}

export function trackClient(event: string, properties?: AnalyticsEventProps): void {
  if (typeof window === 'undefined') return;
  if (!posthogClientReady || !posthogClient) return;
  try {
    posthogClient.capture(event, properties || {});
  } catch {}
}

// ---------- Server (Node, API routes) ----------
let posthogServer: any | null = null;
let posthogServerReady = false;

function ensureServerClient(): void {
  if (posthogServerReady) return;
  const token = process.env.POSTHOG_SERVER_KEY || process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_API_KEY;
  if (!token) return; // no-op if not configured
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PostHog } = require('posthog-node');
    const host = process.env.POSTHOG_HOST || 'https://app.posthog.com';
    posthogServer = new PostHog(token, { host });
    posthogServerReady = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('PostHog server init failed', err);
  }
}

export async function captureServerEvent(args: {
  distinctId: string;
  event: string;
  properties?: AnalyticsEventProps;
}): Promise<void> {
  try {
    ensureServerClient();
    if (!posthogServerReady || !posthogServer) return;
    posthogServer.capture({
      distinctId: args.distinctId,
      event: args.event,
      properties: args.properties || {},
    });
  } catch {}
}

export async function shutdownAnalytics(): Promise<void> {
  try {
    if (posthogServer && posthogServer.flush) {
      await new Promise<void>((resolve) => posthogServer.flush(() => resolve()));
    }
  } catch {}
}
