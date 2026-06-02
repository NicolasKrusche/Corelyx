"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { authCallbackUrl, completePostLoginSetup } from "@/lib/auth/client";
import { signInWithBrowserWallet, type Web3Chain } from "@/lib/auth/web3";
import { friendlyErrorMessage } from "@/lib/friendly-errors";
import { Loader2 } from "lucide-react";
import { AuthVisualPanel } from "@/components/ui/auth-visual-panel";

type OAuthProvider = "google" | "github";
export default function SignupPage() {
  const supabase = createBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [tosChecked, setTosChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };

    if (!res.ok || !json.ok) {
      setError(friendlyErrorMessage(json.error, "We could not create your account. Please try again."));
      setLoading(false);
      return;
    }

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

  async function handleOAuthSignup(provider: OAuthProvider) {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: authCallbackUrl(), skipBrowserRedirect: true },
    });
    if (error) {
      setError(friendlyErrorMessage(error.message, `${provider === "google" ? "Google" : "GitHub"} sign-up could not be started. Please try again.`));
      setLoading(false);
      return;
    }
    if (!data.url) {
      setError(`${provider === "google" ? "Google" : "GitHub"} sign-up could not be started. Please try again.`);
      setLoading(false);
      return;
    }
    window.location.assign(data.url);
  }

  async function handleWeb3Signup(chain: Web3Chain) {
    setLoading(true);
    setError(null);
    const statement = "Create a Corelyx account and accept the Terms of Service at https://corelyx.app/terms";
    try {
      const { error } = await signInWithBrowserWallet(supabase, chain, statement);
      if (error) throw error;
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      setError(friendlyErrorMessage(message, `${chain === "ethereum" ? "Ethereum" : "Solana"} wallet sign-up could not be completed. Make sure a compatible wallet is installed and try again.`));
      setLoading(false);
      return;
    }
    try {
      await completePostLoginSetup();
    } catch {
      setError("Signed up, but account setup could not finish. Please try again.");
      setLoading(false);
      return;
    }
    window.location.href = "/dashboard";
  }

  // ── Email confirmation screen ────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="grid min-h-screen lg:grid-cols-2">
          <section className="relative flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
            <Link href="/" className="absolute left-6 top-6 flex items-center gap-2 sm:left-10 lg:left-16">
              <img src="/pictures/logo-no-bg.png" alt="" className="h-6 w-6 object-contain" aria-hidden />
              <span className="text-sm font-semibold text-foreground/80 transition-colors hover:text-foreground">Corelyx</span>
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
              <Link href="/login" className="mt-4 inline-block text-sm font-medium text-foreground transition-colors hover:text-primary hover:underline">
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

        {/* ── Left panel ──────────────────────────────────────────── */}
        <section className="relative flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
          {/* Subtle radial glow */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
          </div>

          {/* Brand mark */}
          <Link href="/" className="absolute left-6 top-6 flex items-center gap-2 sm:left-10 lg:left-16">
            <img src="/pictures/logo-no-bg.png" alt="" className="h-6 w-6 object-contain" aria-hidden />
            <span className="text-sm font-semibold text-foreground/80 transition-colors hover:text-foreground">Corelyx</span>
          </Link>

          <div className="relative w-full max-w-sm">
            {/* Heading */}
            <div className="mb-7 text-center">
              <h1 className="text-3xl font-semibold tracking-tight">Create an account</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Start building AI workflows for free
              </p>
            </div>

            {/* OAuth buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleOAuthSignup("google")}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </button>
              <button
                type="button"
                onClick={() => void handleOAuthSignup("github")}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
                  <path d="M12 .7a11.3 11.3 0 0 0-3.6 22c.6.1.8-.2.8-.5v-2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.4-1.3-5.4-5.6 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17 4.8 18 5.1 18 5.1c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.3-5.4 5.6.4.4.8 1.1.8 2.2v3.2c0 .3.2.6.8.5A11.3 11.3 0 0 0 12 .7Z" />
                </svg>
                GitHub
              </button>
            </div>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                or continue with email
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Email + password form */}
            <form onSubmit={handleSignup} className="space-y-3">
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                placeholder="Email"
              />
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                placeholder="Password (min. 8 characters)"
              />

              {error && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}

              {/* Consent checkboxes */}
              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tosChecked}
                    onChange={(e) => setTosChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary cursor-pointer"
                  />
                  <span className="text-[11px] leading-relaxed text-muted-foreground/70">
                    I have read and agree to the{" "}
                    <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-primary underline underline-offset-2 transition-colors">
                      Terms of Service
                    </Link>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privacyChecked}
                    onChange={(e) => setPrivacyChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary cursor-pointer"
                  />
                  <span className="text-[11px] leading-relaxed text-muted-foreground/70">
                    I have read and accept the{" "}
                    <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-primary underline underline-offset-2 transition-colors">
                      Privacy Policy
                    </Link>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading || !tosChecked || !privacyChecked}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>

            {/* Sign in */}
            <p className="mt-5 text-center text-sm text-muted-foreground">
              Have an account?{" "}
              <Link href="/login" className="font-medium text-foreground hover:underline">
                Sign in
              </Link>
            </p>

            <details className="mt-4 text-center">
              <summary className="cursor-pointer text-[10px] text-muted-foreground/50 transition-colors hover:text-muted-foreground">
                More sign-up options
              </summary>
              <div className="mt-2 flex justify-center gap-1.5">
                {(["ethereum", "solana"] as const).map((chain) => (
                  <button
                    key={chain}
                    type="button"
                    onClick={() => void handleWeb3Signup(chain)}
                    disabled={loading}
                    className="rounded-md border border-border/50 bg-card/40 px-2 py-1 text-[10px] font-medium text-muted-foreground/70 transition-colors hover:border-border hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {chain === "ethereum" ? "Ethereum" : "Solana"} wallet
                  </button>
                ))}
              </div>
            </details>
          </div>
        </section>

        <AuthVisualPanel />
      </div>
    </div>
  );
}
