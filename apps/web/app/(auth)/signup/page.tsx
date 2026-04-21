"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
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
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (!signInError) {
        window.location.href = "/dashboard";
      } else {
        setDone(true);
      }
    }
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
              Nexflow
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
            Nexflow
          </Link>

          <div className="w-full max-w-sm">
            <h1 className="mb-6 text-center text-4xl font-semibold tracking-tight sm:text-5xl">
              Create your account
            </h1>

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
