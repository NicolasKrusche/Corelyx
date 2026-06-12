"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

export function VerifyTwoFactorClient({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<{ type: "error" | "info"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const sentOnce = useRef(false);

  const requestCode = useCallback(async (isResend: boolean) => {
    if (isResend) setResending(true);
    try {
      const res = await fetch("/api/auth/two-factor/challenge", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({ type: "error", message: body.error ?? "Could not send the code. Try again." });
      } else if (isResend) {
        setStatus({ type: "info", message: "A new code has been sent." });
      }
    } catch {
      setStatus({ type: "error", message: "Could not send the code. Try again." });
    } finally {
      if (isResend) setResending(false);
    }
  }, []);

  useEffect(() => {
    // Send the first code automatically when the page loads (guard against
    // React strict-mode double-invocation so we don't burn the rate limit).
    if (sentOnce.current) return;
    sentOnce.current = true;
    void requestCode(false);
  }, [requestCode]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setStatus({ type: "error", message: "Enter the 6-digit code from your email." });
      return;
    }
    setLoading(true);
    setStatus(null);
    const res = await fetch("/api/auth/two-factor/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      router.replace("/dashboard");
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setStatus({ type: "error", message: body.error ?? "That code is incorrect or has expired." });
    setLoading(false);
  }

  async function handleSwitchAccount() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
          Enter it below to finish signing in.
        </p>

        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          <div>
            <label htmlFor="2fa-code" className="mb-1.5 block text-sm font-medium">
              Verification code
            </label>
            <input
              id="2fa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-center font-mono text-xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>

          {status && (
            <p
              role="alert"
              className={`text-sm ${status.type === "error" ? "text-destructive" : "text-muted-foreground"}`}
            >
              {status.message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => void requestCode(true)}
            disabled={resending}
            className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
          >
            Send a new code
          </button>
          <button
            type="button"
            onClick={() => void handleSwitchAccount()}
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
