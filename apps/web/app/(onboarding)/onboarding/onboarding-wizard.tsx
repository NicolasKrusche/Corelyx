"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const CONNECTORS = [
  { id: "gmail",     label: "Gmail",         hint: "Email triggers & sending" },
  { id: "slack",     label: "Slack",         hint: "Messages & channel posts" },
  { id: "notion",    label: "Notion",        hint: "Pages, databases, blocks" },
  { id: "github",    label: "GitHub",        hint: "Issues, PRs, webhooks" },
  { id: "sheets",    label: "Sheets",        hint: "Read & write rows" },
  { id: "hubspot",   label: "HubSpot",       hint: "Contacts & deals" },
  { id: "asana",     label: "Asana",         hint: "Tasks & projects" },
  { id: "typeform",  label: "Typeform",      hint: "Form submission triggers" },
];

const STEPS = ["You", "Workspace", "Connect", "Build"];

function slugify(val: string) {
  return val.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 30);
}

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
      setError(err.message.includes("username") ? "That username is already taken. Try another." : err.message);
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
      setError(data.error ?? "Could not save workspace name.");
      return false;
    }
    return true;
  }

  async function handleContinue() {
    setError(null);
    if (step === 0) {
      const ok = await saveProfile();
      if (ok) setStep(1);
    } else if (step === 1) {
      const ok = await saveWorkspace();
      if (ok) setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }

  async function handleSkip() {
    setError(null);
    if (step === 0) {
      const defaultHandle = slugify(emailName);
      const ok = await saveProfile(emailName, defaultHandle);
      if (ok) setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else {
      router.push("/dashboard");
    }
  }

  function handleGenerate() {
    if (genesisPrompt.trim()) {
      router.push(`/programs/new?prompt=${encodeURIComponent(genesisPrompt.trim())}`);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[520px]">

        {/* Logo */}
        <div className="mb-10 flex items-center gap-2.5">
          <div className="h-6 w-6 rounded-md bg-primary" />
          <span className="text-sm font-semibold tracking-tight">Corelyx</span>
        </div>

        {/* Progress */}
        <div className="mb-8 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                i === step ? "w-10 bg-primary" : i < step ? "w-5 bg-primary/40" : "w-5 bg-white/10"
              )}
            />
          ))}
          <span className="ml-2 text-[11px] text-muted-foreground/50 tabular-nums">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        {/* Card */}
        <div className="rounded-2xl border glass-card p-8">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-primary/70">
            Step {String(step + 1).padStart(2, "0")}
          </p>

          {/* ── Step 0: Identity ── */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">What should we call you?</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  This is how you&apos;ll appear in your workspace and public profile.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="display_name">Display name</Label>
                  <Input
                    id="display_name"
                    placeholder={emailName}
                    value={displayName}
                    onChange={e => {
                      setDisplayName(e.target.value);
                      setUsername(slugify(e.target.value));
                    }}
                    className="border-white/10 bg-white/[0.04]"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <div className="flex">
                    <span className="flex h-9 items-center rounded-l-md border border-r-0 border-white/10 bg-white/[0.02] px-3 text-sm text-muted-foreground select-none">
                      @
                    </span>
                    <Input
                      id="username"
                      placeholder={slugify(displayName || emailName)}
                      value={username}
                      onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))}
                      className="rounded-l-none border-white/10 bg-white/[0.04]"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground/50">
                    Letters, numbers, and underscores only.
                  </p>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

          {/* ── Step 1: Workspace ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Name your workspace.</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Your workspace is where all your workflows and connections live.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="workspace_name">Workspace name</Label>
                <Input
                  id="workspace_name"
                  value={workspaceName}
                  onChange={e => setWorkspaceName(e.target.value)}
                  className="border-white/10 bg-white/[0.04]"
                  autoFocus
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

          {/* ── Step 2: Connectors ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Connect your first app.</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Corelyx automates work across the tools you already use.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {CONNECTORS.map(c => (
                  <a
                    key={c.id}
                    href="/connections"
                    className="group flex flex-col gap-0.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 transition-all hover:border-primary/30 hover:bg-white/[0.05]"
                  >
                    <span className="text-sm font-medium">{c.label}</span>
                    <span className="text-[11px] text-muted-foreground/60">{c.hint}</span>
                  </a>
                ))}
              </div>

              <p className="text-[11px] text-muted-foreground/50 text-center">
                Clicking any app opens the connections page to authorise it.
              </p>
            </div>
          )}

          {/* ── Step 3: First workflow ── */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Build your first workflow.</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Describe what you want to automate — AI will design the graph.
                </p>
              </div>

              <div className="space-y-1.5">
                <Textarea
                  placeholder="Every morning, check my Gmail for new emails from customers and log them in a Notion database with a summary..."
                  value={genesisPrompt}
                  onChange={e => setGenesisPrompt(e.target.value)}
                  className="h-28 resize-none border-white/10 bg-white/[0.04]"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground/50">
                  The more specific you are, the better the first draft will be.
                </p>
              </div>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="mt-8 flex items-center justify-between">
            <div>
              {step > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setError(null); setStep(s => s - 1); }}
                  className="text-muted-foreground"
                  disabled={saving}
                >
                  Back
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {step < 3 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  disabled={saving}
                  className="text-muted-foreground"
                >
                  {step === 2 ? "Connect later" : "Skip"}
                </Button>
              )}

              {step < 3 ? (
                <Button onClick={handleContinue} disabled={saving} className="gap-1.5">
                  {saving ? "Saving…" : "Continue"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")} disabled={saving}>
                    Explore myself
                  </Button>
                  <Button onClick={handleGenerate} disabled={saving} className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate workflow
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground/40">
          GDPR-native · Data never leaves the EU
        </p>
      </div>
    </div>
  );
}
