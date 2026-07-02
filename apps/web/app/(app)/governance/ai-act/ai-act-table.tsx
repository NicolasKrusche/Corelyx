"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { friendlyResponseMessage } from "@/lib/friendly-errors";
import { Pill, statusClass } from "../_components/ui";

export type AiActRow = {
  id: string;
  name: string;
  ai_use_case_category: string | null;
  ai_act_risk_level: string;
  human_oversight_required: boolean;
  transparency_notice_required: boolean;
  reviewer: string | null;
  reviewed_at: string | null;
  ai_act_notes: string | null;
  /** Derived, display-only. */
  sensitive_data: "Yes" | "No" | "Unknown";
  has_approval_gate: boolean;
};

const RISK_LABELS: Record<string, string> = {
  prohibited: "Potentially prohibited",
  high_risk: "High risk",
  transparency: "Limited risk — needs a notice",
  gpai_related: "Limited risk — general-purpose AI",
  limited_or_minimal: "Minimal risk",
  unknown: "Not classified yet",
};

const USE_CASE_SUGGESTIONS = [
  "Customer support automation",
  "Marketing content generation",
  "Sales/CRM updates",
  "Internal reporting",
  "Employment/recruitment",
  "Education assessment",
  "Creditworthiness",
  "Medical or safety-critical use",
];

function reviewStatus(row: AiActRow): { label: string; tone: string } {
  if (!row.reviewed_at) return { label: "Never reviewed", tone: "missing" };
  const days = (Date.now() - new Date(row.reviewed_at).getTime()) / 86_400_000;
  if (Number.isNaN(days) || days >= 180) return { label: "Review due", tone: "review" };
  return { label: `Reviewed ${new Date(row.reviewed_at).toLocaleDateString("en-GB")}`, tone: "completed" };
}

function RowEditor({
  row,
  onSaved,
}: {
  row: AiActRow;
  onSaved: (next: AiActRow) => void;
}) {
  const [draft, setDraft] = useState(row);
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function patch(fields: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/programs/${row.id}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus({
        type: "error",
        message: friendlyResponseMessage(body as { error?: string }, "The checkpoint could not be saved."),
      });
      return false;
    }
    return true;
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    const ok = await patch({
      ai_use_case_category: draft.ai_use_case_category?.trim() || null,
      ai_act_risk_level: draft.ai_act_risk_level,
      human_oversight_required: draft.human_oversight_required,
      transparency_notice_required: draft.transparency_notice_required,
      reviewer: draft.reviewer?.trim() || null,
      ai_act_notes: draft.ai_act_notes?.trim() || null,
    });
    if (ok) {
      setStatus({ type: "success", message: "Checkpoint saved." });
      onSaved(draft);
    }
    setSaving(false);
  }

  async function handleMarkReviewed() {
    setMarking(true);
    setStatus(null);
    const reviewedAt = new Date().toISOString();
    const ok = await patch({ reviewed_at: reviewedAt, reviewer: draft.reviewer?.trim() || null });
    if (ok) {
      const next = { ...draft, reviewed_at: reviewedAt };
      setDraft(next);
      setStatus({ type: "success", message: "Marked as reviewed today." });
      onSaved(next);
    }
    setMarking(false);
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40";

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background/40 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block font-semibold">What is this AI used for?</span>
          <input
            list={`use-cases-${row.id}`}
            value={draft.ai_use_case_category ?? ""}
            onChange={(e) => setDraft({ ...draft, ai_use_case_category: e.target.value })}
            placeholder="e.g. Customer support automation"
            className={inputCls}
          />
          <datalist id={`use-cases-${row.id}`}>
            {USE_CASE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold">Risk classification</span>
          <select
            value={draft.ai_act_risk_level}
            onChange={(e) => setDraft({ ...draft, ai_act_risk_level: e.target.value })}
            className={inputCls}
          >
            {Object.entries(RISK_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-5 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.human_oversight_required}
            onChange={(e) => setDraft({ ...draft, human_oversight_required: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span>A person must review before sensitive actions</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.transparency_notice_required}
            onChange={(e) => setDraft({ ...draft, transparency_notice_required: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span>People must be told they are interacting with AI</span>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block font-semibold">Reviewer (name or role)</span>
          <input
            value={draft.reviewer ?? ""}
            onChange={(e) => setDraft({ ...draft, reviewer: e.target.value })}
            placeholder="e.g. Jane Doe, Compliance Lead"
            className={inputCls}
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold">Notes</span>
          <input
            value={draft.ai_act_notes ?? ""}
            onChange={(e) => setDraft({ ...draft, ai_act_notes: e.target.value })}
            placeholder="Anything a reviewer should know"
            className={inputCls}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || marking}
          className="rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save checkpoint"}
        </button>
        <button
          type="button"
          onClick={() => void handleMarkReviewed()}
          disabled={saving || marking}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-50"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          {marking ? "Marking…" : "Mark reviewed today"}
        </button>
        <Link
          href={`/programs/${row.id}/settings`}
          className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Full workflow settings →
        </Link>
        {status && (
          <p className={`text-xs ${status.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}

export function AiActTable({ rows: initialRows, highlight }: { rows: AiActRow[]; highlight?: string }) {
  const [rows, setRows] = useState(initialRows);
  const [open, setOpen] = useState<string | null>(
    highlight && initialRows.some((r) => r.id === highlight) ? highlight : null
  );

  function updateRow(next: AiActRow) {
    setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No workflows yet. Create a workflow and its AI Act checkpoint appears here automatically.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const review = reviewStatus(row);
        const expanded = open === row.id;
        return (
          <div key={row.id} className={cn("rounded-xl border", expanded ? "border-primary/40" : "border-border")}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : row.id)}
              className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
            >
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.name}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Pill className={statusClass(RISK_LABELS[row.ai_act_risk_level] ?? "unknown")}>
                  {RISK_LABELS[row.ai_act_risk_level] ?? row.ai_act_risk_level}
                </Pill>
                {row.human_oversight_required && (
                  <Pill className={statusClass(row.has_approval_gate ? "completed" : "missing")}>
                    {row.has_approval_gate ? "Approval gate in place" : "Approval gate missing"}
                  </Pill>
                )}
                {row.sensitive_data === "Yes" && (
                  <Pill className={statusClass("high risk")}>Sensitive data</Pill>
                )}
                <Pill className={statusClass(review.tone)}>{review.label}</Pill>
              </span>
            </button>
            {expanded && (
              <div className="px-4 pb-4">
                <RowEditor row={rows.find((r) => r.id === row.id) ?? row} onSaved={updateRow} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
