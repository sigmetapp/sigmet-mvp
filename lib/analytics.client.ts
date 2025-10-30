"use client";

import posthog from "posthog-js";

let inited = false;

export function initPostHog() {
  if (inited) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // soft-fail without key
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
    capture_pageview: true,
  });
  inited = true;
}

export const ph = {
  capture: (event: string, props?: Record<string, any>) => {
    if (!inited) initPostHog();
    posthog.capture(event, props);
  },
  identify: (distinctId: string, props?: Record<string, any>) => {
    if (!inited) initPostHog();
    posthog.identify(distinctId, props);
  },
  reset: () => posthog.reset(),
};
