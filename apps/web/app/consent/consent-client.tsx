"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shield } from "lucide-react";

export function ConsentClient() {
  const router = useRouter();
  const [tosChecked, setTosChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = tosChecked && privacyChecked;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/settings/consent", { method: "POST" });
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      router.replace("/dashboard");
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">We updated our policies</h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            We have updated our Terms of Service and Privacy Policy. Please review and accept them to continue using Corelyx.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 space-y-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={tosChecked}
              onChange={(e) => setTosChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            />
            <span className="text-sm leading-relaxed">
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="font-medium text-primary hover:underline underline-offset-2">
                Terms of Service
              </Link>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={privacyChecked}
              onChange={(e) => setPrivacyChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            />
            <span className="text-sm leading-relaxed">
              I have read and understood the{" "}
              <Link href="/privacy" target="_blank" className="font-medium text-primary hover:underline underline-offset-2">
                Privacy Policy
              </Link>
            </span>
          </label>

          {error && (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || isPending}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {isPending ? "Saving…" : "Accept and continue"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          You can review our policies any time under{" "}
          <Link href="/settings#data-rights" className="underline underline-offset-2 hover:text-foreground">
            Settings → Data Rights
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
