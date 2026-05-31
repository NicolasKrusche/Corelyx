"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { authCallbackUrl, completePostLoginSetup } from "@/lib/auth/client";
import { friendlyErrorMessage } from "@/lib/friendly-errors";
import { Loader2 } from "lucide-react";
import { AuthVisualPanel } from "@/components/ui/auth-visual-panel";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  account_setup_failed: "Sign-in worked, but account setup could not finish. Please try again.",
  auth_callback_failed: "Social sign-in could not be completed. Please try again.",
};

type OAuthProvider = "google" | "github";
type Web3Chain = "ethereum" | "solana";

export default function LoginPage() {
  const supabase = createBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) {
      setError(AUTH_ERROR_MESSAGES[code] ?? "Sign-in could not be completed. Please try again.");
    }
  }, []);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(friendlyErrorMessage(error.message, "Sign-in did not work. Check your email and password, then try again."));
      setLoading(false);
    } else {
      try {
        await completePostLoginSetup();
      } catch {
        setError("Signed in, but account setup could not finish. Please try again.");
        setLoading(false);
        return;
      }
      window.location.href = "/dashboard";
    }
  }

  async function handleOAuthLogin(provider: OAuthProvider) {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: authCallbackUrl(), skipBrowserRedirect: true },
    });
    if (error) {
      setError(friendlyErrorMessage(error.message, `${provider === "google" ? "Google" : "GitHub"} sign-in could not be started. Please try again.`));
      setLoading(false);
      return;
    }
    if (!data.url) {
      setError(`${provider === "google" ? "Google" : "GitHub"} sign-in could not be started. Please try again.`);
      setLoading(false);
      return;
    }
    window.location.assign(data.url);
  }

  async function handleWeb3Login(chain: Web3Chain) {
    setLoading(true);
    setError(null);
    const statement = "Sign in to Corelyx and accept the Terms of Service at https://corelyx.app/terms";
    const { error } = chain === "ethereum"
      ? await supabase.auth.signInWithWeb3({ chain: "ethereum", statement })
      : await supabase.auth.signInWithWeb3({ chain: "solana", statement });
    if (error) {
      setError(friendlyErrorMessage(error.message, `${chain === "ethereum" ? "Ethereum" : "Solana"} wallet sign-in could not be completed. Make sure a compatible wallet is installed and try again.`));
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
              Sign in to your account
            </h1>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleOAuthLogin("google")}
                disabled={loading}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
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
                onClick={() => void handleOAuthLogin("github")}
                disabled={loading}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
                  <path d="M12 .7a11.3 11.3 0 0 0-3.6 22c.6.1.8-.2.8-.5v-2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.4-1.3-5.4-5.6 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17 4.8 18 5.1 18 5.1c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.3-5.4 5.6.4.4.8 1.1.8 2.2v3.2c0 .3.2.6.8.5A11.3 11.3 0 0 0 12 .7Z" />
                </svg>
                GitHub
              </button>
            </div>

            <details className="mb-3 text-center">
              <summary className="cursor-pointer text-[10px] text-muted-foreground/60 transition-colors hover:text-muted-foreground">
                More sign-in options
              </summary>
              <div className="mt-2 flex justify-center gap-1.5">
                {(["ethereum", "solana"] as const).map((chain) => (
                  <button
                    key={chain}
                    type="button"
                    onClick={() => void handleWeb3Login(chain)}
                    disabled={loading}
                    className="rounded-md border border-border/60 bg-card/60 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {chain === "ethereum" ? "Ethereum wallet" : "Solana wallet"}
                  </button>
                ))}
              </div>
            </details>

            <form onSubmit={handleEmailLogin} className="space-y-3">
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                placeholder="Email"
              />

              <div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                  placeholder="Password"
                />
                <div className="mt-2 text-right">
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-medium text-foreground hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </section>

        <AuthVisualPanel />
      </div>
    </div>
  );
}
