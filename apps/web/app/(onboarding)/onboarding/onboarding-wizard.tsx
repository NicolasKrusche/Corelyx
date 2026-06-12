"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { ArrowRight, Check, Clock, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { friendlyErrorMessage } from "@/lib/friendly-errors";
import {
  ACCOUNT_TYPES,
  INDUSTRIES,
  ROLES,
  TEAM_SIZES,
  TOOL_OPTIONS,
  goalsForAccountType,
  type AccountType,
} from "@/lib/onboarding/options";
import type { WorkflowSuggestion } from "@/lib/onboarding/profile";

// ── Data ──────────────────────────────────────────────────────────────────────
// The wizard collects the essentials (identity, workspace), then a short
// personalization interview (account type → adaptive follow-ups → processes &
// tools → privacy choice). It ends with personalized workflow suggestions and
// hands off to the interactive product tour on the dashboard.

const STEP_META = [
  { label: "Who you are",      sub: "Display name and username",      time: "About 1 minute" },
  { label: "Your workspace",   sub: "Name it and make it yours",      time: "Under a minute" },
  { label: "How you'll use it", sub: "Personal, startup, business…",  time: "One click" },
  { label: "About you",        sub: "A few quick follow-ups",         time: "Under a minute" },
  { label: "Your processes",   sub: "What you run and want to automate", time: "1–2 minutes" },
  { label: "Privacy & finish", sub: "You decide what we keep",        time: "Under a minute" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(val: string) {
  return val.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 30);
}

function toggleInList(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
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
            {String(Math.min(step + 1, STEP_META.length)).padStart(2, "0")} / {String(STEP_META.length).padStart(2, "0")}
          </span>
        </div>
        <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${(Math.min(step + 1, STEP_META.length) / STEP_META.length) * 100}%` }}
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
          Next: personalized workflow ideas, then a one-minute interactive tour — skippable any time.
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
  if (!meta) return null;
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

// ── Shared option controls ────────────────────────────────────────────────────

function OptionCard({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border p-4 text-left transition-all",
        selected
          ? "border-primary bg-primary/[0.06] ring-1 ring-primary/40"
          : "border-gray-200 bg-white hover:border-gray-300"
      )}
    >
      <p className={cn("text-sm font-semibold", selected ? "text-gray-900" : "text-gray-700")}>
        {title}
      </p>
      {description && <p className="mt-1 text-xs leading-5 text-gray-400">{description}</p>}
    </button>
  );
}

function Chip({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        selected
          ? "border-primary bg-primary/[0.08] text-primary"
          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700"
      )}
    >
      {label}
    </button>
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
  const [phase, setPhase] = useState<"steps" | "suggestions">("steps");

  // Step 0/1 — identity + workspace
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [workspaceName, setWorkspaceName] = useState(defaultWorkspaceName);

  // Step 2 — account type
  const [accountType, setAccountType] = useState<AccountType | null>(null);

  // Step 3 — adaptive follow-ups
  const [teamSize, setTeamSize] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [goals, setGoals] = useState<string[]>([]);

  // Step 4 — processes & tools
  const [currentProcesses, setCurrentProcesses] = useState("");
  const [automationWishes, setAutomationWishes] = useState("");
  const [tools, setTools] = useState<string[]>([]);

  // Step 5 — privacy choice
  const [consent, setConsent] = useState(true);

  const [suggestions, setSuggestions] = useState<WorkflowSuggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTeamAccount = accountType === "startup" || accountType === "business" || accountType === "agency";
  const goalCatalog = goalsForAccountType(accountType);

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

  // Persist the personalization interview and fetch suggestions. With consent
  // off, the server stores categorical answers only and discards free text.
  async function saveOnboardingProfile(): Promise<boolean> {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_type: accountType,
        team_size: teamSize,
        industry,
        role,
        goals,
        tools,
        current_processes: currentProcesses.trim() || null,
        automation_wishes: automationWishes.trim() || null,
        profile_consent: consent,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(friendlyErrorMessage(data.error, "We could not save your answers. Please try again."));
      return false;
    }
    const data = await res.json().catch(() => ({ suggestions: [] }));
    setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
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
    } else if (step === 1) {
      const ok = await saveWorkspace();
      if (ok) setStep(2);
    } else if (step === 2) {
      if (!accountType) {
        setError("Pick the option that fits best — you can change everything later.");
        return;
      }
      setStep(3);
    } else if (step === 3 || step === 4) {
      setStep(step + 1);
    } else {
      const ok = await saveOnboardingProfile();
      if (ok) setPhase("suggestions");
    }
  }

  async function handleSkip() {
    setError(null);
    if (step === 0) {
      const defaultHandle = slugify(emailName);
      const ok = await saveProfile(emailName, defaultHandle);
      if (ok) setStep(1);
    } else if (step >= 1 && step <= 4) {
      setStep(step + 1);
    } else {
      // Skipping the final step stores nothing from the interview.
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
          {step === 5 ? "Skip — don't save" : "Skip"}
        </Button>

        <Button onClick={handleContinue} disabled={saving} className="gap-2 px-5">
          {saving ? "Saving…" : step === 5 ? "Finish & see my suggestions" : "Continue"}
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
              Your workspace is where all your workflows and connections live.
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
        </div>
      )}

      {/* Step 2: Account type */}
      {step === 2 && (
        <div className="space-y-6 max-w-2xl">
          <div>
            <h1 className="text-[2rem] font-black tracking-tight leading-tight text-gray-900">
              How will you <em className="not-italic font-black italic">use</em> Corelyx?
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              This tailors the next questions and your workflow suggestions. You can change it later.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {ACCOUNT_TYPES.map((t) => (
              <OptionCard
                key={t.id}
                selected={accountType === t.id}
                onClick={() => setAccountType(t.id)}
                title={t.label}
                description={t.description}
              />
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Adaptive follow-ups */}
      {step === 3 && (
        <div className="space-y-7 max-w-2xl">
          <div>
            <h1 className="text-[2rem] font-black tracking-tight leading-tight text-gray-900">
              {accountType === "personal"
                ? <>What are you <em className="not-italic font-black italic">hoping</em> to do?</>
                : accountType === "agency"
                ? <>Tell us about your <em className="not-italic font-black italic">agency.</em></>
                : isTeamAccount
                ? <>Tell us about your <em className="not-italic font-black italic">team.</em></>
                : <>What matters <em className="not-italic font-black italic">most</em> to you?</>}
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Everything here is optional — each answer makes your suggestions and AI agents smarter.
            </p>
          </div>

          {isTeamAccount && (
            <>
              <div className="space-y-2.5">
                <Label className="text-gray-700">
                  {accountType === "agency" ? "Agency size" : "Team size"}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {TEAM_SIZES.map((s) => (
                    <Chip
                      key={s.id}
                      selected={teamSize === s.id}
                      onClick={() => setTeamSize(teamSize === s.id ? null : s.id)}
                      label={s.label}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <Label className="text-gray-700">
                  {accountType === "agency" ? "Your clients' main industry" : "Industry"}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {INDUSTRIES.map((i) => (
                    <Chip
                      key={i.id}
                      selected={industry === i.id}
                      onClick={() => setIndustry(industry === i.id ? null : i.id)}
                      label={i.label}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <Label className="text-gray-700">Your role</Label>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => (
                    <Chip
                      key={r.id}
                      selected={role === r.id}
                      onClick={() => setRole(role === r.id ? null : r.id)}
                      label={r.label}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="space-y-2.5">
            <Label className="text-gray-700">
              {accountType === "personal" ? "Your goals" : "What should automation do for you?"}
            </Label>
            <div className="flex flex-wrap gap-2">
              {goalCatalog.map((g) => (
                <Chip
                  key={g.id}
                  selected={goals.includes(g.id)}
                  onClick={() => setGoals(toggleInList(goals, g.id))}
                  label={g.label}
                />
              ))}
            </div>
            <p className="text-[11px] text-gray-400">Pick as many as you like.</p>
          </div>
        </div>
      )}

      {/* Step 4: Processes, automation wishes, tools */}
      {step === 4 && (
        <div className="space-y-7 max-w-2xl">
          <div>
            <h1 className="text-[2rem] font-black tracking-tight leading-tight text-gray-900">
              What do you <em className="not-italic font-black italic">run</em> today?
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Describe your recurring processes and what you wish ran itself — this is what your
              suggestions are built from. All of it is optional.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="current_processes" className="text-gray-700">
              Processes you already run
            </Label>
            <Textarea
              id="current_processes"
              placeholder="e.g. Every Monday I compile a status report from our project tool; support emails get sorted by hand; invoices are copied into a spreadsheet…"
              value={currentProcesses}
              onChange={(e) => setCurrentProcesses(e.target.value.slice(0, 2000))}
              rows={4}
              className="border-gray-200 bg-white text-gray-900 placeholder:text-gray-300 focus-visible:ring-primary/30"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="automation_wishes" className="text-gray-700">
              What would you love to automate?
            </Label>
            <Textarea
              id="automation_wishes"
              placeholder="e.g. Answering common customer questions automatically, a weekly revenue summary, syncing leads into our CRM…"
              value={automationWishes}
              onChange={(e) => setAutomationWishes(e.target.value.slice(0, 2000))}
              rows={4}
              className="border-gray-200 bg-white text-gray-900 placeholder:text-gray-300 focus-visible:ring-primary/30"
            />
          </div>

          <div className="space-y-2.5">
            <Label className="text-gray-700">Tools you already use</Label>
            <div className="flex flex-wrap gap-2">
              {TOOL_OPTIONS.map((t) => (
                <Chip
                  key={t.id}
                  selected={tools.includes(t.id)}
                  onClick={() => setTools(toggleInList(tools, t.id))}
                  label={t.label}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Privacy & consent */}
      {step === 5 && (
        <div className="space-y-6 max-w-2xl">
          <div>
            <h1 className="text-[2rem] font-black tracking-tight leading-tight text-gray-900">
              You decide what we <em className="not-italic font-black italic">keep.</em>
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Your answers can power a private background profile that helps the AI build better
              workflows and brief your agents. It is never shown publicly, never used for
              advertising, and you can delete it at any time in Settings or via data export/erasure.
            </p>
          </div>

          <div className="grid gap-3">
            <OptionCard
              selected={consent}
              onClick={() => setConsent(true)}
              title="Personalized (recommended)"
              description="Store all my answers, including the free-text ones, and use them as background context for AI features and agents. Consent under GDPR Art. 6(1)(a) — revocable anytime."
            />
            <OptionCard
              selected={!consent}
              onClick={() => setConsent(false)}
              title="Anonymized only"
              description="Keep only category answers (account type, industry, team size, selected goals and tools). Free-text answers are discarded and AI features see categories only — never personal text."
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-gray-100 bg-gray-50 px-3.5 py-3">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <p className="text-[11px] leading-5 text-gray-400">
              Either way: free-text answers are scrubbed of emails, phone numbers, and secrets before
              any AI summary is derived, nothing here is shared with third parties, and your choice is
              enforced server-side and in the database itself. Details in our{" "}
              <Link href="/privacy" className="underline hover:text-gray-600">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      )}
    </>
  );

  // ── Suggestions (final phase, after the interview is saved) ─────────────────

  const suggestionsView = (
    <div className="space-y-6 max-w-2xl">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/[0.08] px-3 py-1 text-[11px] font-semibold text-primary">
          <Sparkles className="h-3 w-3" />
          Built from your answers
        </span>
        <h1 className="mt-3 text-[2rem] font-black tracking-tight leading-tight text-gray-900">
          Here&apos;s where we&apos;d <em className="not-italic font-black italic">start.</em>
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Each idea opens in Genesis with the description pre-filled — the AI designs the workflow,
          you review and tune it. Or skip straight to the tour and explore on your own.
        </p>
      </div>

      <div className="grid gap-3">
        {suggestions.map((s, i) => (
          <div
            key={i}
            className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{s.title}</p>
              <p className="mt-1 text-xs leading-5 text-gray-400">{s.description}</p>
            </div>
            <Link
              href={`/programs/new?prompt=${encodeURIComponent(s.prompt)}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              Build this
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end border-t border-gray-100 pt-5">
        <Button onClick={goToTour} className="gap-2 px-5">
          Finish & take the tour
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  // ── Shell ───────────────────────────────────────────────────────────────────

  const showingSteps = phase === "steps";

  return (
    <div className="flex min-h-screen">
      <Sidebar step={showingSteps ? step : STEP_META.length} />

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
                style={{ width: `${(Math.min((showingSteps ? step : STEP_META.length) + 1, STEP_META.length) / STEP_META.length) * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-400 tabular-nums">
              {Math.min((showingSteps ? step : STEP_META.length - 1) + 1, STEP_META.length)} / {STEP_META.length}
            </span>
          </div>
        </div>

        {/* Step header */}
        {showingSteps && (
          <div className="px-8 pt-8 pb-0 shrink-0">
            <div className="mx-auto w-full max-w-4xl">
              <StepHeader step={step} />
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto w-full max-w-4xl">
            {showingSteps ? (
              <>
                {content}
                {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
                {footer}
              </>
            ) : (
              suggestionsView
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
