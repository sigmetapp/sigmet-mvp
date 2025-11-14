import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin, isServiceRoleConfigured } from "@/lib/supabaseServer";

const ADMIN_EMAILS = new Set<string>(["seosasha@gmail.com"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Get current user from session
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = supabaseAdmin({ accessToken: token });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const email = user.email || "";
  const isAdmin = ADMIN_EMAILS.has(email);

  if (req.method === "GET") {
    try {
      const { data: weights, error } = await supabase
        .from("sw_weights")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      // If weights not found, return default values instead of error
      if (error && error.code === "PGRST116") {
        console.warn("[SW Weights API] Weights not found, returning defaults");
        return res.status(200).json({
          weights: null,
          sw_levels: null,
        });
      }

      if (error) {
        console.error("[SW Weights API] Error loading weights:", error);
        return res
          .status(500)
          .json({ error: error.message || "Failed to load weights" });
      }

      if (!weights) {
        console.warn("[SW Weights API] Weights not found, returning defaults");
        return res.status(200).json({
          weights: null,
          sw_levels: null,
        });
      }

      // Return weights with sw_levels at top level for easier access
      const response: any = { weights };
      if (weights?.sw_levels) {
        try {
          response.sw_levels =
            typeof weights.sw_levels === "string"
              ? JSON.parse(weights.sw_levels)
              : weights.sw_levels;
        } catch (parseError) {
          console.error(
            "[SW Weights API] Error parsing sw_levels:",
            parseError,
          );
          response.sw_levels = null;
        }
      }
      return res.status(200).json(response);
    } catch (error: any) {
      console.error("[SW Weights API] Unexpected error:", error);
      return res
        .status(500)
        .json({ error: error.message || "Unexpected error" });
    }
  }

  if (req.method === "POST" || req.method === "PUT") {
    if (!isAdmin) {
      return res
        .status(403)
        .json({ error: "Forbidden: Admin access required" });
    }

    try {
      const {
        registration_points,
        profile_complete_points,
        growth_total_points_multiplier,
        follower_points,
        connection_first_points,
        connection_repeat_points,
        post_points,
        comment_points,
        reaction_points,
        daily_inflation_rate,
        user_growth_inflation_rate,
        min_inflation_rate,
        invite_points,
        growth_bonus_percentage,
        cache_duration_minutes,
        sw_levels,
      } = req.body;

      if (!isServiceRoleConfigured()) {
        return res.status(503).json({
          error:
            "Supabase service role key is not configured; cannot update weights",
        });
      }

      const serviceSupabase = supabaseAdmin({ requireServiceRole: true });

      const updateData: any = {
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };

      // Update only provided fields
      if (registration_points !== undefined)
        updateData.registration_points = registration_points;
      if (profile_complete_points !== undefined)
        updateData.profile_complete_points = profile_complete_points;
      if (growth_total_points_multiplier !== undefined)
        updateData.growth_total_points_multiplier =
          growth_total_points_multiplier;
      if (follower_points !== undefined)
        updateData.follower_points = follower_points;
      if (connection_first_points !== undefined)
        updateData.connection_first_points = connection_first_points;
      if (connection_repeat_points !== undefined)
        updateData.connection_repeat_points = connection_repeat_points;
      if (post_points !== undefined) updateData.post_points = post_points;
      if (comment_points !== undefined)
        updateData.comment_points = comment_points;
      if (reaction_points !== undefined)
        updateData.reaction_points = reaction_points;
      if (daily_inflation_rate !== undefined)
        updateData.daily_inflation_rate = daily_inflation_rate;
      if (user_growth_inflation_rate !== undefined)
        updateData.user_growth_inflation_rate = user_growth_inflation_rate;
      if (min_inflation_rate !== undefined)
        updateData.min_inflation_rate = min_inflation_rate;
      if (invite_points !== undefined) updateData.invite_points = invite_points;
      if (growth_bonus_percentage !== undefined)
        updateData.growth_bonus_percentage = growth_bonus_percentage;
      if (cache_duration_minutes !== undefined)
        updateData.cache_duration_minutes = cache_duration_minutes;
      if (sw_levels !== undefined) updateData.sw_levels = sw_levels;

      const { data: weights, error } = await serviceSupabase
        .from("sw_weights")
        .update(updateData)
        .eq("id", 1)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      // Return weights with sw_levels at top level for easier access
      const response: any = { weights };
      if (weights?.sw_levels) {
        response.sw_levels =
          typeof weights.sw_levels === "string"
            ? JSON.parse(weights.sw_levels)
            : weights.sw_levels;
      }
      return res.status(200).json(response);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
