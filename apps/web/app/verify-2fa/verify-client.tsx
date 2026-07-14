"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

type Mode = "loading" | "push" | "email";
type Method = "auto" | "push" | "email";

export function VerifyTwoFactorClient({ email }: { email: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("loading");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<{ type: "error" | "info"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const requestedOnce = useRef(false);

  // Ask the server to issue a challenge. `auto` uses push if a 2FA phone is
  // registered, otherwise email. Returns which channel was chosen.
  const requestChallenge = useCallback(async (method: Method, isResend = false) => {
    if (isResend) setResending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/auth/two-factor/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        channel?: "push" | "email";
        challenge_id?: string;
        error?: string;
      };
      if (!res.ok) {
        setStatus({ type: "error", message: body.error ?? "Could not start verification. Try again." });
        setMode("email");
        return;
      }
      if (body.channel === "push" && body.challenge_id) {
        setChallengeId(body.challenge_id);
        setMode("push");
      } else {
        setMode("email");
        if (isResend) setStatus({ type: "info", message: "A new code has been sent." });
      }
    } catch {
      setStatus({ type: "error", message: "Could not start verification. Try again." });
      setMode("email");
    } finally {
      if (isResend) setResending(false);
    }
  }, []);

  useEffect(() => {
    if (requestedOnce.current) return;
    requestedOnce.current = true;
    void requestChallenge("auto");
  }, [requestChallenge]);

  // While a push challenge is outstanding, poll for the phone's decision. The
  // approved response mints the trust cookie, so we can go straight to the app.
  useEffect(() => {
    if (mode !== "push" || !challengeId) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/auth/two-factor/status?challenge=${encodeURIComponent(challengeId)}`);
        const body = (await res.json().catch(() => ({}))) as { status?: string };
        if (!active) return;
        if (body.status === "approved") {
          router.replace("/dashboard");
        } else if (body.status === "denied") {
          setStatus({ type: "error", message: "This sign-in was denied on your phone." });
          setMode("email");
        } else if (body.status === "expired") {
          setStatus({ type: "error", message: "The request expired. Send a new one." });
          setMode("email");
        }
      } catch {
        /* transient — keep polling */
      }
    };
    const id = setInterval(poll, 2000);
    void poll();
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [mode, challengeId, router]);

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

  const card = "w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm";

  // ── Deciding channel ────────────────────────────────────────────────────────
  if (mode === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className={card}>
          <p className="text-center text-sm text-muted-foreground">Starting verification…</p>
        </div>
      </div>
    );
  }

  // ── Push: waiting for the phone ─────────────────────────────────────────────
  if (mode === "push") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className={card}>
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
          </div>
          <h1 className="text-center text-2xl font-bold tracking-tight">Check your phone</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            We sent an approval request to Corelyx Guard on your phone. Approve it there to finish signing in.
          </p>

          {status && (
            <p role="alert" className="mt-4 text-center text-sm text-destructive">
              {status.message}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 text-sm">
            <button
              type="button"
              onClick={() => void requestChallenge("email", true)}
              disabled={resending}
              className="w-full rounded-lg border border-border py-2.5 font-semibold transition-colors hover:bg-muted/40 disabled:opacity-50"
            >
              {resending ? "Sending…" : "Use an email code instead"}
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

  // ── Email: enter the 6-digit code (also the loading placeholder) ────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className={card}>
        <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. Enter it below to
          finish signing in.
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
            onClick={() => void requestChallenge("email", true)}
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
