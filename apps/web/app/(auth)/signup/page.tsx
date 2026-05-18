"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { authCallbackUrl, completePostLoginSetup } from "@/lib/auth/client";
import { Loader2 } from "lucide-react";
import { AuthVisualPanel } from "@/components/ui/auth-visual-panel";

export default function SignupPage() {
  const supabase = createBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Create account server-side (admin API, no Supabase SMTP required)
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Could not create account. Please try again.");
      setLoading(false);
      return;
    }

    // Account is pre-confirmed — sign in immediately
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Account created! Please sign in to continue.");
      setLoading(false);
      return;
    }

    try {
      await completePostLoginSetup();
    } catch {
      setError("Signed in, but account setup could not finish. Please try again.");
      setLoading(false);
      return;
    }
    window.location.href = "/dashboard";
  }

  async function handleGoogleSignup() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authCallbackUrl(), skipBrowserRedirect: true },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    if (!data.url) {
      setError("Google sign-up could not be started. Please try again.");
      setLoading(false);
      return;
    }
    window.location.assign(data.url);
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="grid min-h-screen lg:grid-cols-2">
          <section className="relative flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
            <Link
              href="/"
              className="absolute left-6 top-6 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:left-10 lg:left-16"
            >
              Corelyx
            </Link>

            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-xl sm:p-8">
              <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-green-500/30 bg-green-500/10 text-green-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">Check your inbox</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
                <br />Click it to activate your account.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-block text-sm font-medium text-foreground transition-colors hover:text-primary hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          </section>

          <AuthVisualPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
          <Link
            href="/"
            className="absolute left-6 top-6 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:left-10 lg:left-16"
          >
            Corelyx
          </Link>

          <div className="w-full max-w-sm">
            <h1 className="mb-6 text-center text-4xl font-semibold tracking-tight sm:text-5xl">
              Create your account
            </h1>

            <button
              type="button"
              onClick={handleGoogleSignup}
              disabled={loading}
              className="mb-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              )}
              Continue with Google
            </button>

            <form onSubmit={handleSignup} className="space-y-3">
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                placeholder="Email"
              />

              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                placeholder="Password (min. 8 chars)"
              />

              {error && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Creating account..." : "Create account"}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-muted-foreground">
              By signing up, you agree to our terms and privacy policy.
            </p>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-foreground hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </section>

        <AuthVisualPanel />
      </div>
    </div>
  );
}
