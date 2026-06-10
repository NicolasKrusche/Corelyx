"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { ArrowRight, Check, Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { friendlyErrorMessage } from "@/lib/friendly-errors";

// ── Data ──────────────────────────────────────────────────────────────────────
// Setup is intentionally short: collect the essentials here, then hand off to
// the interactive product tour on the dashboard, which explains the app
// in-context instead of with static slides.

const STEP_META = [
  { label: "Who you are",   sub: "Display name and username", time: "About 1 minute" },
  { label: "Your workspace", sub: "Name it and make it yours", time: "Under a minute" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(val: string) {
  return val.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 30);
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ step }: { step: number }) {
  return (
    <aside className="hidden lg:flex w-[272px] xl:w-[296px] shrink-0 flex-col bg-[#0f0f11] border-r border-white/[0.07] py-8 px-6">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pictures/logo-no-bg.png" alt="Corelyx" className="h-5 w-5 object-contain" />
        <span className="text-sm font-semibold text-white tracking-tight">
          corelyx<span className="text-primary">•</span>
        </span>
      </div>

      {/* Section header + progress */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
            Getting Started
          </span>
          <span className="text-[10px] text-white/25 tabular-nums">
            {String(step + 1).padStart(2, "0")} / {String(STEP_META.length).padStart(2, "0")}
          </span>
        </div>
        <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${((step + 1) / STEP_META.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step list */}
      <nav className="flex flex-col gap-0.5">
        {STEP_META.map((s, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
              i === step ? "bg-white/[0.07]" : ""
            )}
          >
            {/* Step number / check */}
            <div
              className={cn(
                "mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-colors",
                i < step
                  ? "border-primary bg-primary text-white"
                  : i === step
                  ? "border-primary text-primary"
                  : "border-white/[0.15] text-white/25"
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : String(i + 1).padStart(2, "0")}
            </div>

            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold leading-tight truncate",
                  i === step ? "text-white" : i < step ? "text-white/50" : "text-white/30"
                )}
              >
                {s.label}
              </p>
              <p
                className={cn(
                  "text-[11px] mt-0.5 leading-tight italic",
                  i === step ? "text-white/45" : "text-white/20"
                )}
              >
                {s.sub}
              </p>
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-1" />

      {/* What happens next */}
      <div className="mb-3 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
        <span className="text-[11px] text-white/30 leading-snug">
          Next: a one-minute interactive tour of the app — skippable any time.
        </span>
      </div>

      {/* EU badge */}
      <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary/60" />
        <span className="text-[11px] text-white/30 leading-snug">
          EU-first controls · EU-only mode for eligible workflows
        </span>
      </div>
    </aside>
  );
}

// ── Step header (top of right panel) ─────────────────────────────────────────

function StepHeader({ step }: { step: number }) {
  const meta = STEP_META[step];
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
        Step {String(step + 1).padStart(2, "0")} — {meta.label}
      </span>
      {meta.time && (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] text-gray-400">
          <Clock className="h-3 w-3" />
          {meta.time}
        </span>
      )}
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function OnboardingWizard({
  userEmail,
  defaultWorkspaceName,
  workspaceId,
}: {
  userEmail: string;
  defaultWorkspaceName: string;
  workspaceId: string | null;
}) {
  const router = useRouter();
  const emailName = userEmail.split("@")[0];

  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [workspaceName, setWorkspaceName] = useState(defaultWorkspaceName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goToTour() {
    router.push("/dashboard?tour=1");
  }

  async function saveProfile(nameOverride?: string, handleOverride?: string): Promise<boolean> {
    const name = (nameOverride ?? displayName).trim() || emailName;
    const handle = (handleOverride ?? username).trim() || slugify(name);

    setSaving(true);
    setError(null);

    const supabase = createBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not signed in."); setSaving(false); return false; }

    const { error: err } = await (supabase.from("profiles") as any).upsert(
      { id: user.id, display_name: name, username: handle, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );

    if (err) {
      setError(
        err.message.includes("username")
          ? "That username is already taken. Try another."
          : friendlyErrorMessage(err.message, "We could not save your profile. Please try again.")
      );
      setSaving(false);
      return false;
    }

    setSaving(false);
    return true;
  }

  async function saveWorkspace(): Promise<boolean> {
    if (!workspaceId || !workspaceName.trim()) return true;

    setSaving(true);
    setError(null);

    const res = await fetch("/api/workspaces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", workspace_id: workspaceId, name: workspaceName.trim() }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(friendlyErrorMessage(data.error, "We could not save the workspace name. Please try again."));
      return false;
    }
    return true;
  }

  async function handleContinue() {
    setError(null);
    if (step === 0) {
      if (!username.trim()) {
        setError("Please choose a username to continue.");
        return;
      }
      const ok = await saveProfile();
      if (ok) setStep(1);
    } else {
      const ok = await saveWorkspace();
      if (ok) goToTour();
    }
  }

  async function handleSkip() {
    setError(null);
    if (step === 0) {
      const defaultHandle = slugify(emailName);
      const ok = await saveProfile(emailName, defaultHandle);
      if (ok) setStep(1);
    } else {
      goToTour();
    }
  }

  // ── Footer actions ──────────────────────────────────────────────────────────

  const footer = (
    <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-5">
      <div>
        {step > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setError(null); setStep(s => s - 1); }}
            className="text-gray-400 hover:text-gray-700"
            disabled={saving}
          >
            Back
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSkip}
          disabled={saving}
          className="text-gray-400 hover:text-gray-600"
        >
          Skip
        </Button>

        <Button onClick={handleContinue} disabled={saving} className="gap-2 px-5">
          {saving ? "Saving…" : step === 0 ? "Continue" : "Finish & take the tour"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  // ── Step content ────────────────────────────────────────────────────────────

  const content = (
    <>
      {/* Step 0: Identity */}
      {step === 0 && (
        <div className="space-y-6 max-w-md">
          <div>
            <h1 className="text-[2rem] font-black tracking-tight leading-tight text-gray-900">
              What should we <em className="not-italic font-black italic">call</em> you?
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              This is how you&apos;ll appear in your workspace and public profile.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="display_name" className="text-gray-700">Display name</Label>
              <Input
                id="display_name"
                placeholder={emailName}
                value={displayName}
                onChange={e => {
                  setDisplayName(e.target.value);
                  setUsername(slugify(e.target.value));
                }}
                className="border-gray-200 bg-white text-gray-900 placeholder:text-gray-300 focus-visible:ring-primary/30"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-gray-700">Username</Label>
              <div className="flex">
                <span className="flex h-9 items-center rounded-l-md border border-r-0 border-gray-200 bg-gray-50 px-3 text-sm text-gray-400 select-none">
                  @
                </span>
                <Input
                  id="username"
                  placeholder={slugify(displayName || emailName)}
                  value={username}
                  onChange={e =>
                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))
                  }
                  className="rounded-l-none border-gray-200 bg-white text-gray-900 placeholder:text-gray-300 focus-visible:ring-primary/30"
                />
              </div>
              <p className="text-[11px] text-gray-400">Letters, numbers, and underscores only.</p>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {/* Step 1: Workspace */}
      {step === 1 && (
        <div className="space-y-6 max-w-md">
          <div>
            <h1 className="text-[2rem] font-black tracking-tight leading-tight text-gray-900">
              Name your <em className="not-italic font-black italic">workspace.</em>
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Your workspace is where all your workflows and connections live. After this,
              a one-minute tour shows you around the app itself.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workspace_name" className="text-gray-700">Workspace name</Label>
            <Input
              id="workspace_name"
              value={workspaceName}
              onChange={e => setWorkspaceName(e.target.value)}
              className="border-gray-200 bg-white text-gray-900 focus-visible:ring-primary/30"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </>
  );

  // ── Shell ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen">
      <Sidebar step={step} />

      {/* Right panel */}
      <div className="flex flex-1 flex-col bg-white">
        {/* Mobile progress bar (shown when sidebar is hidden) */}
        <div className="lg:hidden flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pictures/logo-no-bg.png" alt="Corelyx" className="h-4 w-4 object-contain" />
            <span className="text-sm font-semibold text-gray-900 tracking-tight">corelyx</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-24 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${((step + 1) / STEP_META.length) * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-400 tabular-nums">
              {step + 1} / {STEP_META.length}
            </span>
          </div>
        </div>

        {/* Step header */}
        <div className="px-8 pt-8 pb-0 shrink-0">
          <div className="mx-auto w-full max-w-4xl">
            <StepHeader step={step} />
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto w-full max-w-4xl">
            {content}
            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}
