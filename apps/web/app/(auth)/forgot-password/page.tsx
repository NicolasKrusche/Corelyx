"use client";

import { useState } from "react";
import Link from "next/link";
import { authCallbackUrl } from "@/lib/auth/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, redirectTo: authCallbackUrl("/update-password") }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };

    if (!res.ok) {
      setError(json.error ?? "Something went wrong. Please try again.");
      setLoading(false);
    } else {
      setDone(true);
    }
  }

  return (
    <div className="auth-page-bg min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
          {/* Logo + heading */}
          <div className="flex flex-col items-center gap-4 mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pictures/logo-no-bg.png" alt="Corelyx" className="h-11 w-11 object-contain" />
            <div className="text-center">
              {done ? (
                <>
                  <h1 className="text-xl font-bold tracking-tight">Check your email</h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    We sent a reset link to <strong>{email}</strong>
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-xl font-bold tracking-tight">Reset password</h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Enter your email and we&apos;ll send a reset link.
                  </p>
                </>
              )}
            </div>
          </div>

          {!done && (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring transition-shadow"
                  placeholder="you@example.com"
                />
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">
              ← Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
