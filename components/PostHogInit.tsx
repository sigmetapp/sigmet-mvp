"use client";

import { useEffect } from "react";
import { initPostHog } from "@/lib/analytics.client";

export default function PostHogInit() {
  useEffect(() => {
    initPostHog();
  }, []);
  return null;
}
