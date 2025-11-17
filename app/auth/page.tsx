"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useSiteSettings } from "@/components/SiteSettingsContext";

export default function AuthPage() {
  const { invites_only } = useSiteSettings();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [showForgot, setShowForgot] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [forgotPending, setForgotPending] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg(undefined);
    try {
      if (mode === "signup") {
        // Check if invite-only registration is enabled
        if (invites_only && (!inviteCode || !inviteCode.trim())) {
          setMsg(
            "An invite code is required to register. Please enter a valid invite code.",
          );
          setPending(false);
          return;
        }

        let normalizedInviteCode: string | null = null;

        // Validate invite code (required when invite-only mode is active, optional otherwise)
        if (inviteCode && inviteCode.trim()) {
          const normalizedCode = inviteCode.trim().toUpperCase();
          console.log("Validating invite code:", normalizedCode);

          const { data: isValid, error: validateErr } = await supabase.rpc(
            "validate_invite_code",
            {
              invite_code: normalizedCode,
            },
          );

          console.log("Validation result:", {
            isValid,
            error: validateErr,
            type: typeof isValid,
          });

          if (validateErr) {
            console.error("Invite code validation error:", validateErr);
            throw new Error(
              validateErr.message ||
                "Failed to validate invite code. Please try again.",
            );
          }

          // Explicitly check for false or null/undefined
          // Supabase RPC may return the value directly, so check both data and isValid
          const isActuallyValid =
            isValid === true ||
            isValid === "true" ||
            (typeof isValid === "boolean" && isValid);

          if (!isActuallyValid) {
            console.error("Invite code validation failed:", {
              code: normalizedCode,
              isValid,
              type: typeof isValid,
              isActuallyValid,
              stringValue: String(isValid),
            });
            throw new Error(
              "Invalid or expired invite code. Registration requires a valid invite code.",
            );
          }

          console.log("Invite code validated successfully");
          normalizedInviteCode = normalizedCode;
        }

        const origin =
          process.env.NEXT_PUBLIC_REDIRECT_ORIGIN || window.location.origin;
        const metadata: Record<string, any> = {};
        if (normalizedInviteCode) {
          metadata.invite_code = normalizedInviteCode;
        }

          const { data: signData, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${origin}/auth/callback`,
              data: metadata,
            },
          });
          if (error) throw error;

          let inviteAccepted = false;
          const canAcceptImmediately = Boolean(signData?.session?.access_token);

          if (normalizedInviteCode && signData?.user) {
            if (canAcceptImmediately) {
              try {
                const { data: inviteId, error: acceptErr } = await supabase.rpc(
                  "accept_invite_by_code",
                  {
                    invite_code: normalizedInviteCode,
                  },
                );

                if (!acceptErr && inviteId) {
                  inviteAccepted = true;
                  const { trackInviteAccepted } = await import(
                    "@/lib/invite-tracking"
                  );
                  await trackInviteAccepted(inviteId, signData.user.id);
                } else if (acceptErr) {
                  console.warn("Invite acceptance error:", acceptErr);
                }
              } catch (acceptErr) {
                console.warn("Invite acceptance exception:", acceptErr);
              }
            } else {
              try {
                const response = await fetch("/api/invites/accept", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    inviteCode: normalizedInviteCode,
                    userId: signData.user.id,
                  }),
                });
                const result = await response.json();
                if (response.ok && result.success) {
                  inviteAccepted = true;
                } else {
                  console.warn("Server invite accept error:", result?.error);
                }
              } catch (serverErr) {
                console.warn("Server invite accept exception:", serverErr);
              }
            }
          }

          setMsg(
            inviteAccepted
              ? "Invite accepted! Account created. Please confirm your email."
              : normalizedInviteCode && !canAcceptImmediately
                ? "Account created. Your invite will be applied automatically after you sign in."
                : "Account created. Please confirm your email.",
          );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        const { data } = await supabase.auth.getUser();
        const mustChange = Boolean(
          (data.user as any)?.user_metadata?.must_change_password,
        );
        window.location.href = mustChange ? "/auth/reset" : "/";
      }
    } catch (err: any) {
      setMsg(err.message || "Auth error");
    } finally {
      setPending(false);
    }
  }

  async function toggleForgot() {
    setShowForgot((s) => !s);
    setForgotMsg(null);
  }

  async function submitTempPasswordRequest(e: React.FormEvent) {
    e.preventDefault();
    setForgotMsg(null);
    const value = identifier.trim();
    if (!value) {
      setForgotMsg("Please enter your email.");
      return;
    }
    if (!value.includes("@")) {
      setForgotMsg("Please enter the email associated with your account.");
      return;
    }
    setForgotPending(true);
    try {
      const origin =
        process.env.NEXT_PUBLIC_REDIRECT_ORIGIN || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(value, {
        redirectTo: `${origin}/auth/reset`,
      });
      if (error) throw error;
      setForgotMsg("If the account exists, a reset link has been sent.");
    } catch (err: any) {
      setForgotMsg(err?.message || "Failed to send reset link");
    } finally {
      setForgotPending(false);
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-10 bg-sigmet">
        <Link href="/" className="text-white/90 text-xl font-semibold">
          Sigmet
        </Link>
        <div>
          <h1 className="text-white text-4xl font-semibold mb-4">
            Welcome back
          </h1>
          <p className="text-white/70">
            Sign in with email and password. Magic links are disabled.
          </p>
        </div>
        <div className="text-white/40 text-xs">
          © {new Date().getFullYear()} Sigmet
        </div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12 bg-base.bg">
        <div className="w-full max-w-md">
          <div className="flex gap-2 bg-white/5 p-1 rounded-xl mb-6">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 rounded-lg text-sm ${mode === "signin" ? "bg-white text-black" : "text-white/80"}`}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 rounded-lg text-sm ${mode === "signup" ? "bg-white text-black" : "text-white/80"}`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={onSubmit} className="card p-6 space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Minimum 6 characters"
              />
            </div>

            {mode === "signup" && (
              <div>
                <label className="label">
                  Invite Code{" "}
                  {!invites_only && (
                    <span className="text-white/50 text-xs">(optional)</span>
                  )}
                  {invites_only && (
                    <span className="text-red-400 text-xs">(required)</span>
                  )}
                </label>
                <input
                  className="input"
                  type="text"
                  value={inviteCode}
                  onChange={(e) =>
                    setInviteCode(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                    )
                  }
                  placeholder="ABCD1234"
                  maxLength={8}
                  required={invites_only}
                  style={{
                    textTransform: "uppercase",
                    fontFamily: "monospace",
                    letterSpacing: "2px",
                  }}
                />
                <p className="text-white/50 text-xs mt-1">
                  {invites_only
                    ? "Registration is currently invite-only. Please enter a valid invite code to create an account."
                    : "If you have an invite code from a friend, enter it here."}
                </p>
              </div>
            )}

            {msg && <div className="text-white/80 text-sm">{msg}</div>}

            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary w-full disabled:opacity-60"
            >
              {pending
                ? "Please wait"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>

            <button
              type="button"
              onClick={toggleForgot}
              className="w-full text-white/70 text-sm hover:text-white mt-2"
            >
              Forgot password
            </button>
          </form>
          {showForgot && (
            <form
              onSubmit={submitTempPasswordRequest}
              className="card p-6 mt-4 space-y-3"
            >
              <div>
                <label className="label">Email or username</label>
                <input
                  className="input"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com or your_nickname"
                />
              </div>
              {forgotMsg && (
                <div className="text-white/80 text-sm">{forgotMsg}</div>
              )}
              <button
                type="submit"
                disabled={forgotPending}
                className="btn btn-primary w-full disabled:opacity-60"
              >
                {forgotPending ? "Sending..." : "Reset Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
