"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { friendlyResponseMessage } from "@/lib/friendly-errors";

type Program = {
  id: string;
  name: string;
  description: string | null;
  execution_mode: "autonomous" | "supervised" | "manual";
  conflict_policy: "queue" | "skip" | "fail";
  schema?: {
    metadata?: Record<string, unknown>;
  };
  ai_use_case_category?: string | null;
  ai_act_risk_level?: "prohibited" | "high_risk" | "transparency" | "gpai_related" | "limited_or_minimal" | "unknown";
  customer_role?: "provider" | "deployer" | "distributor" | "importer" | "product_manufacturer" | "unknown";
  human_oversight_required?: boolean;
  transparency_notice_required?: boolean;
  high_risk_documentation_required?: boolean;
  prohibited_reason?: string | null;
  reviewer?: string | null;
  reviewed_at?: string | null;
  ai_act_notes?: string | null;
  legal_review_override?: boolean;
};

const AI_ACT_NOTICE_TEXT =
  "You are interacting with an AI-assisted system. Outputs may be inaccurate and may be reviewed by authorised staff.";

const HIGH_IMPACT_USE_CASES = [
  "Employment/recruitment",
  "Education assessment",
  "Creditworthiness",
  "Insurance eligibility/pricing",
  "Essential public/private services",
  "Law enforcement",
  "Migration/asylum/border control",
  "Biometric identification/categorisation",
  "Medical or safety-critical use",
  "Legal decision support",
];

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 py-6 border-t border-border/60 first:border-t-0 first:pt-0">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>}
      </div>
      <div className="lg:col-span-2">{children}</div>
    </div>
  );
}

export default function ProgramSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [executionMode, setExecutionMode] = useState<Program["execution_mode"]>("supervised");
  const [conflictPolicy, setConflictPolicy] = useState<Program["conflict_policy"]>("queue");
  const [aiUseCaseCategory, setAiUseCaseCategory] = useState("");
  const [aiActRiskLevel, setAiActRiskLevel] = useState<NonNullable<Program["ai_act_risk_level"]>>("unknown");
  const [customerRole, setCustomerRole] = useState<NonNullable<Program["customer_role"]>>("unknown");
  const [humanOversightRequired, setHumanOversightRequired] = useState(false);
  const [transparencyNoticeRequired, setTransparencyNoticeRequired] = useState(false);
  const [highRiskDocumentationRequired, setHighRiskDocumentationRequired] = useState(false);
  const [prohibitedReason, setProhibitedReason] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [reviewedAt, setReviewedAt] = useState("");
  const [aiActNotes, setAiActNotes] = useState("");
  const [legalReviewOverride, setLegalReviewOverride] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/programs/${id}`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as Program;
      setProgram(data);
      setName(data.name);
      setDescription(data.description ?? "");
      setExecutionMode(data.execution_mode);
      setConflictPolicy(data.conflict_policy);
      const metadata = data.schema?.metadata ?? {};
      setAiUseCaseCategory(data.ai_use_case_category ?? (metadata.ai_use_case_category as string | undefined) ?? "");
      setAiActRiskLevel(data.ai_act_risk_level ?? (metadata.ai_act_risk_level as NonNullable<Program["ai_act_risk_level"]> | undefined) ?? "unknown");
      setCustomerRole(data.customer_role ?? (metadata.customer_role as NonNullable<Program["customer_role"]> | undefined) ?? "unknown");
      setHumanOversightRequired(data.human_oversight_required ?? Boolean(metadata.human_oversight_required));
      setTransparencyNoticeRequired(data.transparency_notice_required ?? Boolean(metadata.transparency_notice_required));
      setHighRiskDocumentationRequired(data.high_risk_documentation_required ?? Boolean(metadata.high_risk_documentation_required));
      setProhibitedReason(data.prohibited_reason ?? (metadata.prohibited_reason as string | undefined) ?? "");
      setReviewer(data.reviewer ?? (metadata.reviewer as string | undefined) ?? "");
      setReviewedAt((data.reviewed_at ?? (metadata.reviewed_at as string | undefined) ?? "").slice(0, 16));
      setAiActNotes(data.ai_act_notes ?? (metadata.ai_act_notes as string | undefined) ?? "");
      setLegalReviewOverride(data.legal_review_override ?? Boolean(metadata.legal_review_override));
      setLoading(false);
    }
    void load();
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus(null);

    const res = await fetch(`/api/programs/${id}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || null,
        execution_mode: executionMode,
        conflict_policy: conflictPolicy,
        ai_use_case_category: aiUseCaseCategory.trim() || null,
        ai_act_risk_level: aiActRiskLevel,
        customer_role: customerRole,
        human_oversight_required: humanOversightRequired,
        transparency_notice_required: transparencyNoticeRequired,
        high_risk_documentation_required: highRiskDocumentationRequired,
        prohibited_reason: prohibitedReason.trim() || null,
        reviewer: reviewer.trim() || null,
        reviewed_at: reviewedAt ? new Date(reviewedAt).toISOString() : null,
        ai_act_notes: aiActNotes.trim() || null,
        legal_review_override: legalReviewOverride,
      }),
    });

    setSaveStatus(res.ok
      ? { type: "success", message: "Settings saved." }
      : { type: "error", message: "We could not save these settings. Please try again." }
    );
    setSaving(false);
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (deleteConfirm !== program?.name) return;
    setDeleting(true);
    setDeleteError(null);

    const res = await fetch(`/api/programs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setDeleteError(friendlyResponseMessage(body, "We could not delete this workflow. Please try again."));
      setDeleting(false);
      return;
    }
    router.push("/dashboard");
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  if (!program) {
    return <div className="text-sm text-muted-foreground">Program not found.</div>;
  }

  return (
    <div className="max-w-3xl space-y-0">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link href={`/programs/${id}`} className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors mb-2 inline-block">
            ← Back to program
          </Link>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Program settings</h1>
          <p className="text-sm text-muted-foreground mt-1">{program.name}</p>
        </div>
      </div>

      {/* Name */}
      <form onSubmit={handleSave}>
        <Field label="Name" description="A short, descriptive name for this program.">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
          />
        </Field>

        <Field label="Description" description="Optional notes about what this program does.">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
            placeholder="Optional description…"
          />
        </Field>

        <Field label="Execution mode" description="Controls how much human oversight is required during a run.">
          <div className="space-y-2">
            {(["autonomous", "supervised", "manual"] as const).map((mode) => (
              <label key={mode} className="flex items-start gap-3 rounded-lg border glass-card px-4 py-3 cursor-pointer hover:bg-accent transition-colors">
                <input
                  type="radio"
                  name="execution_mode"
                  value={mode}
                  checked={executionMode === mode}
                  onChange={() => setExecutionMode(mode)}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium capitalize">{mode}</p>
                  <p className="text-xs text-muted-foreground">
                    {mode === "autonomous" && "Runs without any interruptions."}
                    {mode === "supervised" && "Pauses at approval nodes for human sign-off."}
                    {mode === "manual" && "Only runs when triggered manually."}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Conflict policy" description="What to do when a run is triggered while another run of this program is already active.">
          <div className="space-y-2">
            {(["queue", "skip", "fail"] as const).map((policy) => (
              <label key={policy} className="flex items-start gap-3 rounded-lg border glass-card px-4 py-3 cursor-pointer hover:bg-accent transition-colors">
                <input
                  type="radio"
                  name="conflict_policy"
                  value={policy}
                  checked={conflictPolicy === policy}
                  onChange={() => setConflictPolicy(policy)}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium capitalize">{policy}</p>
                  <p className="text-xs text-muted-foreground">
                    {policy === "queue" && "New run waits until the current one finishes."}
                    {policy === "skip" && "New run is silently dropped."}
                    {policy === "fail" && "New run fails immediately with a conflict error."}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="AI Act risk review"
          description="Classify the workflow before production use. Final obligations depend on use case, configuration, and customer role. This record is also editable under Governance → AI Act Checkpoints. Storage and retention for this workflow follow the workspace Data Controls."
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Use-case category</label>
                <input
                  value={aiUseCaseCategory}
                  onChange={(e) => setAiUseCaseCategory(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="e.g. Legal decision support"
                  list="ai-use-case-warnings"
                />
                <datalist id="ai-use-case-warnings">
                  {HIGH_IMPACT_USE_CASES.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Risk level</label>
                <select
                  value={aiActRiskLevel}
                  onChange={(e) => setAiActRiskLevel(e.target.value as NonNullable<Program["ai_act_risk_level"]>)}
                  className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="unknown">Unknown</option>
                  <option value="limited_or_minimal">Limited or minimal</option>
                  <option value="transparency">Transparency obligation</option>
                  <option value="gpai_related">GPAI related</option>
                  <option value="high_risk">High risk</option>
                  <option value="prohibited">Prohibited</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Customer role</label>
              <select
                value={customerRole}
                onChange={(e) => setCustomerRole(e.target.value as NonNullable<Program["customer_role"]>)}
                className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="unknown">Unknown</option>
                <option value="provider">Provider</option>
                <option value="deployer">Deployer</option>
                <option value="distributor">Distributor</option>
                <option value="importer">Importer</option>
                <option value="product_manufacturer">Product manufacturer</option>
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Human oversight required", humanOversightRequired, setHumanOversightRequired],
                ["Transparency notice required", transparencyNoticeRequired, setTransparencyNoticeRequired],
                ["High-risk documentation required", highRiskDocumentationRequired, setHighRiskDocumentationRequired],
                ["Admin-only legal-review override for testing", legalReviewOverride, setLegalReviewOverride],
              ].map(([label, checked, setter]) => (
                <label key={label as string} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/60 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={checked as boolean}
                    onChange={(e) => (setter as (next: boolean) => void)(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border"
                  />
                  <span className="text-sm">{label as string}</span>
                </label>
              ))}
            </div>

            {aiActRiskLevel === "prohibited" && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                This workflow may fall under prohibited AI practices. Do not deploy without legal review.
              </p>
            )}
            {aiActRiskLevel === "high_risk" && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                High-risk workflows require human oversight gates, documentation export, explicit reviewer approval, and audit logging before publish.
              </p>
            )}
            {transparencyNoticeRequired && (
              <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Notice text: {AI_ACT_NOTICE_TEXT}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Reviewer</label>
                <input
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="Name or email"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Reviewed at</label>
                <input
                  type="datetime-local"
                  value={reviewedAt}
                  onChange={(e) => setReviewedAt(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Prohibited-risk reason</label>
              <textarea
                rows={2}
                value={prohibitedReason}
                onChange={(e) => setProhibitedReason(e.target.value)}
                className="w-full resize-none rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="Required if this is marked prohibited or under legal review."
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Risk and DPIA notes</label>
              <textarea
                rows={4}
                value={aiActNotes}
                onChange={(e) => setAiActNotes(e.target.value)}
                className="w-full resize-none rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="Document classification rationale, safeguards, DPIA notes, and residual risks."
              />
            </div>
          </div>
        </Field>

        {saveStatus && (
          <div className={`rounded-lg px-3 py-2 text-xs border mb-4 ${
            saveStatus.type === "success"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : "bg-destructive/10 text-destructive border-destructive/20"
          }`}>
            {saveStatus.message}
          </div>
        )}

        <div className="pt-2 border-t border-border/60">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {/* Danger zone */}
      <div className="pt-8 border-t border-border/60 mt-8">
        <h2 className="text-sm font-semibold mb-1">Danger zone</h2>
        <p className="text-xs text-muted-foreground mb-4">Permanently delete this program, all its runs, and all execution history. This cannot be undone.</p>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-4">
          <form onSubmit={handleDelete} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Type <span className="font-mono text-foreground">{program.name}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                autoComplete="off"
                className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-destructive/50 focus:border-destructive/40 transition-all"
                placeholder={program.name}
              />
            </div>

            {deleteError && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{deleteError}</p>
            )}

            <button
              type="submit"
              disabled={deleting || deleteConfirm !== program.name}
              className="rounded-lg bg-destructive text-destructive-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {deleting ? "Deleting…" : "Delete program"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
