"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  KeyRound,
  PlayCircle,
  Plug,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { friendlyErrorMessage } from "@/lib/friendly-errors";

// ── Data ──────────────────────────────────────────────────────────────────────

const CONNECTORS = [
  { id: "gmail",    label: "Gmail",     hint: "Email triggers & sending" },
  { id: "slack",    label: "Slack",     hint: "Messages & channel posts" },
  { id: "notion",   label: "Notion",    hint: "Pages, databases, blocks" },
  { id: "github",   label: "GitHub",    hint: "Issues, PRs, webhooks" },
  { id: "sheets",   label: "Sheets",    hint: "Read & write rows" },
  { id: "hubspot",  label: "HubSpot",   hint: "Contacts & deals" },
  { id: "asana",    label: "Asana",     hint: "Tasks & projects" },
  { id: "typeform", label: "Typeform",  hint: "Form submission triggers" },
];

const STEP_META = [
  { label: "The basic loop",       sub: "How a Corelyx workflow comes together", time: "About 2 minutes" },
  { label: "Who you are",          sub: "Display name and username",             time: "About 1 minute" },
  { label: "Your workspace",       sub: "Name it and make it yours",             time: "Under a minute" },
  { label: "Connect your tools",   sub: "Apps and API keys",                     time: "About 1 minute" },
  { label: "Build with Genesis",   sub: "Describe it, AI drafts the graph",      time: "About 1 minute" },
] as const;

const LOOP_CARDS = [
  { Icon: Plug,       label: "Connect",  body: "Link the apps and keys your steps need." },
  { Icon: Sparkles,   label: "Draft",    body: "Describe it; Genesis sketches the graph." },
  { Icon: PlayCircle, label: "Test",     body: "Run one clean path and check the output." },
  { Icon: Route,      label: "Activate", body: "Pick a trigger and let it run on its own." },
] as const;

const FEATURE_CALLOUTS = [
  { Icon: Workflow,  text: "Manual, scheduled, or webhook triggers" },
  { Icon: KeyRound,  text: "Keys stay in Connections, not node text" },
  { Icon: ShieldCheck, text: "One job per step keeps runs debuggable" },
] as const;

const GENESIS_STORAGE_KEY = "flowos.genesis.pending";

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
        <div className="h-5 w-5 rounded bg-primary" />
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

// ── Step 0 – Orientation ──────────────────────────────────────────────────────

function StepOrientation() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[2rem] font-black tracking-tight leading-tight text-gray-900">
          A quick map <em className="not-italic font-black italic">before</em> you build.
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Every Corelyx workflow follows the same four moves. Here&apos;s the whole shape on one screen.
        </p>
      </div>

      {/* Loop label */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
          The basic loop
        </p>

        {/* 4 cards */}
        <div className="grid grid-cols-4 gap-0 relative">
          {LOOP_CARDS.map(({ Icon, label, body }, i) => (
            <div key={label} className="relative px-1.5 first:pl-0 last:pr-0">
              <div className="rounded-xl border border-gray-200 bg-white p-4 h-full">
                <div className="flex items-start justify-between mb-3">
                  <Icon className="h-[18px] w-[18px] text-gray-600" />
                  <span className="text-[10px] text-gray-300 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <p className="text-sm font-bold text-gray-900">{label}</p>
                <p className="mt-1 text-[11px] leading-[1.6] text-gray-500">{body}</p>
              </div>
              {i < LOOP_CARDS.length - 1 && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-white border border-gray-200">
                  <ChevronRight className="h-3 w-3 text-gray-400" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Loop note */}
        <div className="mt-3 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] text-gray-500">
            <RefreshCw className="h-3 w-3" />
            Refine and re-test as you go
          </span>
        </div>
      </div>

      {/* Feature callouts */}
      <div className="grid grid-cols-3 gap-2">
        {FEATURE_CALLOUTS.map(({ Icon, text }) => (
          <div
            key={text}
            className="flex items-start gap-2.5 rounded-lg border border-gray-100 bg-gray-50 p-3"
          >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="text-[11px] leading-[1.6] text-gray-500">{text}</span>
          </div>
        ))}
      </div>
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
  const [genesisPrompt, setGenesisPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setStep(1);
    } else if (step === 1) {
      const ok = await saveProfile();
      if (ok) setStep(2);
    } else if (step === 2) {
      const ok = await saveWorkspace();
      if (ok) setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  }

  async function handleSkip() {
    setError(null);
    if (step === 0) {
      setStep(1);
    } else if (step === 1) {
      const defaultHandle = slugify(emailName);
      const ok = await saveProfile(emailName, defaultHandle);
      if (ok) setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else {
      router.push("/dashboard");
    }
  }

  function handleGenerate() {
    const description = genesisPrompt.trim();
    if (!description) {
      router.push("/dashboard");
      return;
    }
    if (description.length < 10) {
      setError("Please describe your workflow in a bit more detail before generating.");
      return;
    }

    try {
      sessionStorage.setItem(GENESIS_STORAGE_KEY, JSON.stringify({
        description,
        connection_ids: [],
        use_platform_key: true,
      }));
    } catch {
      setError("Could not start the build because browser storage is unavailable.");
      return;
    }

    router.push("/programs/new/building");
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
        {step === 0 && (
          <button
            onClick={handleSkip}
            disabled={saving}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2 decoration-gray-300"
          >
            Worth reading once. You can always skip ahead.
          </button>
        )}

        {step > 0 && step < 4 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600"
          >
            {step === 3 ? "Connect later" : "Skip"}
          </Button>
        )}

        {step < 4 ? (
          <Button onClick={handleContinue} disabled={saving} className="gap-2 px-5">
            {saving ? "Saving…" : step === 0 ? "Start guided setup" : "Continue"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/dashboard")}
              disabled={saving}
              className="border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Explore myself
            </Button>
            <Button onClick={handleGenerate} disabled={saving} className="gap-2 px-5">
              <Sparkles className="h-3.5 w-3.5" />
              Generate workflow
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // ── Step content ────────────────────────────────────────────────────────────

  const content = (
    <>
      {step === 0 && <StepOrientation />}

      {/* Step 1: Identity */}
      {step === 1 && (
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

      {/* Step 2: Workspace */}
      {step === 2 && (
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

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {/* Step 3: Connectors */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-[2rem] font-black tracking-tight leading-tight text-gray-900">
              Connect your <em className="not-italic font-black italic">first app.</em>
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Corelyx automates work across the tools you already use.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 max-w-lg">
            {CONNECTORS.map(c => (
              <Link
                key={c.id}
                href="/connections"
                className="group flex flex-col gap-0.5 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-all hover:border-primary/40 hover:shadow-sm"
              >
                <span className="text-sm font-semibold text-gray-900 group-hover:text-primary transition-colors">{c.label}</span>
                <span className="text-[11px] text-gray-400">{c.hint}</span>
              </Link>
            ))}
          </div>

          <p className="text-[11px] text-gray-400">
            Clicking any app opens the connections page to authorise it.
          </p>
        </div>
      )}

      {/* Step 4: First workflow */}
      {step === 4 && (
        <div className="space-y-6 max-w-lg">
          <div>
            <h1 className="text-[2rem] font-black tracking-tight leading-tight text-gray-900">
              Build your <em className="not-italic font-black italic">first workflow.</em>
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Describe what you want to automate — AI will design the graph.
            </p>
          </div>

          <div className="space-y-1.5">
            <Textarea
              placeholder="Every morning, check my Gmail for new emails from customers and log them in a Notion database with a summary…"
              value={genesisPrompt}
              onChange={e => setGenesisPrompt(e.target.value)}
              className="h-28 resize-none border-gray-200 bg-white text-gray-900 placeholder:text-gray-300 focus-visible:ring-primary/30"
              autoFocus
            />
            <p className="text-[11px] text-gray-400">
              The more specific you are, the better the first draft will be.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
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
            <div className="h-4 w-4 rounded bg-primary" />
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
