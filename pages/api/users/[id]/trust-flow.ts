import type { NextApiRequest, NextApiResponse } from "next";
import {
  getCachedTrustFlow,
  calculateAndSaveTrustFlow,
  getTrustFlowColor,
  BASE_TRUST_FLOW,
} from "@/lib/trustFlow";
import { supabaseAdmin } from "@/lib/supabaseServer";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id: userId, recalculate, pushId: pushIdParam } = req.query;

  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "User ID is required" });
  }

  const pushIdRaw = Array.isArray(pushIdParam) ? pushIdParam[0] : pushIdParam;
  const pushId = pushIdRaw !== undefined ? Number(pushIdRaw) : undefined;

  if (
    pushIdRaw !== undefined &&
    (pushId === undefined || Number.isNaN(pushId))
  ) {
    return res.status(400).json({ error: "Invalid pushId" });
  }

  const shouldRecalculate = recalculate === "true";

  try {
    console.log(
      `[Trust Flow API] Request for user ${userId}, recalculate=${recalculate}${pushId !== undefined ? `, pushId=${pushId}` : ""}`,
    );
    // Verify user exists (optional check - if user doesn't exist, return base TF)
    const supabase = supabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    console.log(`[Trust Flow API] Profile check result:`, {
      found: !!profile,
      error: profileError?.message,
    });

    // If user not found (PGRST116 = not found), return base Trust Flow
    if (profileError && profileError.code === "PGRST116") {
      console.log(
        `[Trust Flow API] User ${userId} not found in profiles, returning base TF`,
      );
      const baseTF = BASE_TRUST_FLOW;
      const colorInfo = getTrustFlowColor(baseTF);
      res.setHeader("Cache-Control", "public, max-age=60"); // Cache for 1 minute
      return res.status(200).json({
        trustFlow: baseTF,
        color: colorInfo.color,
        label: colorInfo.label,
        gradient: colorInfo.gradient,
      });
    }

    // Other database errors - log but still try to calculate
    if (profileError) {
      console.warn(
        `[Trust Flow API] Warning checking user ${userId}:`,
        profileError,
      );
      // Continue anyway - user might exist but query failed
    }

    let trustFlow: number;

    // If recalculate=true, force recalculation
    if (shouldRecalculate) {
      console.log(
        `[Trust Flow API] Recalculating Trust Flow for user ${userId}`,
      );
      try {
        // First, check if user has any pushes
        const { count: pushCount, error: pushCountError } = await supabase
          .from("trust_pushes")
          .select("id", { count: "exact", head: true })
          .eq("to_user_id", userId);

        console.log(`[Trust Flow API] Push count check:`, {
          count: pushCount,
          error: pushCountError?.message,
        });

        if (pushCountError) {
          console.error(
            `[Trust Flow API] Error checking push count:`,
            pushCountError,
          );
        }

        const changeReason =
          pushId !== undefined ? "push_created" : "api_recalc";
        trustFlow = await calculateAndSaveTrustFlow(userId, {
          changeReason,
          calculatedBy: "api",
          useCache: false,
          pushId,
          metadata:
            pushId !== undefined
              ? { trigger: "trust_push", pushId }
              : undefined,
        });
        console.log(
          `[Trust Flow API] Recalculation completed, got TF: ${trustFlow.toFixed(2)}`,
        );
      } catch (calcError: any) {
        console.error(
          `[Trust Flow API] Error during recalculation:`,
          calcError,
        );
        console.error(`[Trust Flow API] Error message:`, calcError?.message);
        console.error(`[Trust Flow API] Error stack:`, calcError?.stack);
        // Fall back to base value
        trustFlow = BASE_TRUST_FLOW;
        console.log(
          `[Trust Flow API] Using fallback BASE_TRUST_FLOW: ${trustFlow}`,
        );
      }
    } else {
      // Try to get cached value first
      const cached = await getCachedTrustFlow(userId);

      if (cached !== null) {
        console.log(
          `[Trust Flow API] Found cached value: ${cached.toFixed(2)}`,
        );
        // Check if cached value is base value (5.0) - if so, verify if recalculation is needed
        if (Math.abs(cached - BASE_TRUST_FLOW) < 0.01) {
          console.log(
            `[Trust Flow API] Cached value is base (${cached.toFixed(2)}), checking for pushes...`,
          );
          // Check if user has any pushes - if yes, recalculate to ensure accuracy
          const { count: pushCount, error: pushCountError } = await supabase
            .from("trust_pushes")
            .select("id", { count: "exact", head: true })
            .eq("to_user_id", userId);

          console.log(`[Trust Flow API] Push count check:`, {
            count: pushCount,
            error: pushCountError?.message,
          });

          if (pushCountError) {
            console.error(
              `[Trust Flow API] Error checking push count:`,
              pushCountError,
            );
            // On error, recalculate anyway to be safe
            console.log(
              `[Trust Flow API] Recalculating due to push count check error...`,
            );
            trustFlow = await calculateAndSaveTrustFlow(userId, {
              changeReason: "api_auto_recalc_error",
              calculatedBy: "api",
              useCache: false,
            });
          } else if (pushCount && pushCount > 0) {
            console.log(
              `[Trust Flow API] Cached value is base (${cached.toFixed(2)}), but user has ${pushCount} pushes. Recalculating...`,
            );
            trustFlow = await calculateAndSaveTrustFlow(userId, {
              changeReason: "api_auto_recalc",
              calculatedBy: "api",
              useCache: false,
            });
            console.log(
              `[Trust Flow API] Recalculated TF: ${trustFlow.toFixed(2)}`,
            );
          } else {
            console.log(
              `[Trust Flow API] Using cached TF ${cached.toFixed(2)} for user ${userId} (no pushes)`,
            );
            trustFlow = cached;
          }
        } else {
          console.log(
            `[Trust Flow API] Using cached TF ${cached.toFixed(2)} for user ${userId}`,
          );
          trustFlow = cached;
        }
      } else {
        // No cache, calculate and save
        console.log(
          `[Trust Flow API] No cache found, calculating Trust Flow for user ${userId}`,
        );
        trustFlow = await calculateAndSaveTrustFlow(userId, {
          changeReason: "api_first_load",
          calculatedBy: "api",
          useCache: false,
        });
      }
    }

    const colorInfo = getTrustFlowColor(trustFlow);
    console.log(
      `[Trust Flow API] Final result - TF: ${trustFlow.toFixed(2)}, color: ${colorInfo.color}, label: ${colorInfo.label}`,
    );

    // Cache for 1 minute (TF doesn't change that often)
    res.setHeader(
      "Cache-Control",
      shouldRecalculate
        ? "no-store, no-cache, must-revalidate"
        : "public, max-age=60",
    );

    const response = {
      trustFlow,
      color: colorInfo.color,
      label: colorInfo.label,
      gradient: colorInfo.gradient,
    };

    console.log(
      `[Trust Flow API] Sending response:`,
      JSON.stringify(response, null, 2),
    );

    return res.status(200).json(response);
  } catch (error: any) {
    console.error(
      `[Trust Flow API] Error getting Trust Flow for user ${userId}:`,
      error,
    );
    console.error(`[Trust Flow API] Error stack:`, error?.stack);
    console.error(`[Trust Flow API] Error message:`, error?.message);
    // Return base Trust Flow instead of error
    const baseTF = BASE_TRUST_FLOW;
    const colorInfo = getTrustFlowColor(baseTF);
    res.setHeader("Cache-Control", "public, max-age=60");
    console.log(`[Trust Flow API] Returning error fallback: ${baseTF}`);
    return res.status(200).json({
      trustFlow: baseTF,
      color: colorInfo.color,
      label: colorInfo.label,
      gradient: colorInfo.gradient,
    });
  }
}
