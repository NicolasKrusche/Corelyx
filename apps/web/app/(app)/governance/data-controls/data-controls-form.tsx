"use client";

import { useState } from "react";
import { friendlyResponseMessage } from "@/lib/friendly-errors";

export type DataControlSettings = {
  compliance_mode: "standard" | "eu_only";
  pii_mode: "auto" | "standard" | "strict";
  execution_log_retention_days: number;
  prompt_retention_days: number;
  output_retention_days: number;
  approval_record_retention_days: number;
  store_full_prompts: boolean;
  store_full_outputs: boolean;
  data_region: string;
};

function FieldRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-t border-border/60 py-5 first:border-t-0 first:pt-0 lg:grid-cols-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="lg:col-span-2">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </button>
      <span>{label}</span>
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  disabled,
  suffix = "days",
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="number"
        min={min}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
      />
      <span className="text-xs text-muted-foreground">{suffix}</span>
    </span>
  );
}

export function DataControlsForm({
  workspaceId,
  initial,
  canManage,
}: {
  workspaceId: string;
  initial: DataControlSettings;
  canManage: boolean;
}) {
  const [settings, setSettings] = useState<DataControlSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function set<K extends keyof DataControlSettings>(key: K, value: DataControlSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setStatus(null);
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_settings",
          workspace_id: workspaceId,
          compliance_mode: settings.compliance_mode,
          pii_mode: settings.pii_mode,
          execution_log_retention_days: settings.execution_log_retention_days,
          prompt_retention_days: settings.prompt_retention_days,
          output_retention_days: settings.output_retention_days,
          approval_record_retention_days: settings.approval_record_retention_days,
          store_full_prompts: settings.store_full_prompts,
          store_full_outputs: settings.store_full_outputs,
          data_region: settings.data_region,
        }),
      });
      if (res.ok) {
        setStatus({ type: "success", message: "Data controls saved. They apply to all workflows in this workspace." });
      } else {
        const body = await res.json().catch(() => ({}));
        setStatus({
          type: "error",
          message: friendlyResponseMessage(body as { error?: string }, "The settings could not be saved. Please try again."),
        });
      }
    } catch {
      setStatus({ type: "error", message: "We could not connect. Check your internet connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {!canManage && (
        <p className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Only workspace owners and admins can change these settings. You can view the current
          configuration below.
        </p>
      )}

      <FieldRow
        label="Store full prompts"
        description="Off by default (data minimisation): only a fingerprint of each prompt is kept, not its content. Turn on only if you need the full text for reviews."
      >
        <Toggle
          checked={settings.store_full_prompts}
          onChange={(v) => set("store_full_prompts", v)}
          label={settings.store_full_prompts ? "Full prompt text is stored" : "Only fingerprints are stored (recommended)"}
          disabled={!canManage}
        />
      </FieldRow>

      <FieldRow
        label="Store full outputs"
        description="Off by default (data minimisation): only a fingerprint of each AI output is kept. Connector data passes through and is not retained beyond run evidence."
      >
        <Toggle
          checked={settings.store_full_outputs}
          onChange={(v) => set("store_full_outputs", v)}
          label={settings.store_full_outputs ? "Full output text is stored" : "Only fingerprints are stored (recommended)"}
          disabled={!canManage}
        />
      </FieldRow>

      <FieldRow
        label="Personal-data screening"
        description="How strictly runs screen for personal data before it is sent to AI providers."
      >
        <select
          value={settings.pii_mode}
          disabled={!canManage}
          onChange={(e) => set("pii_mode", e.target.value as DataControlSettings["pii_mode"])}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="auto">Automatic (based on workflow risk)</option>
          <option value="standard">Standard</option>
          <option value="strict">Strict</option>
        </select>
      </FieldRow>

      <FieldRow
        label="Run history retention"
        description="How long execution records are kept before they are cleaned up. High-risk AI workflows should keep at least 183 days (6 months)."
      >
        <NumberInput
          value={settings.execution_log_retention_days}
          onChange={(v) => set("execution_log_retention_days", v)}
          min={1}
          disabled={!canManage}
        />
      </FieldRow>

      <FieldRow
        label="Prompt retention"
        description="How long stored prompt content is kept. 0 means prompt content is removed as soon as the run finishes."
      >
        <NumberInput
          value={settings.prompt_retention_days}
          onChange={(v) => set("prompt_retention_days", v)}
          min={0}
          disabled={!canManage}
        />
      </FieldRow>

      <FieldRow
        label="Output retention"
        description="How long stored AI output content is kept. 0 means output content is removed as soon as the run finishes."
      >
        <NumberInput
          value={settings.output_retention_days}
          onChange={(v) => set("output_retention_days", v)}
          min={0}
          disabled={!canManage}
        />
      </FieldRow>

      <FieldRow
        label="Approval record retention"
        description="How long human approval decisions are kept as evidence. Keep these long enough to satisfy your audit obligations."
      >
        <NumberInput
          value={settings.approval_record_retention_days}
          onChange={(v) => set("approval_record_retention_days", v)}
          min={1}
          disabled={!canManage}
        />
      </FieldRow>

      <FieldRow
        label="Region and provider policy"
        description="EU-only mode blocks runs that would send data to AI providers without an EU-appropriate data processing agreement."
      >
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={settings.compliance_mode}
            disabled={!canManage}
            onChange={(e) => set("compliance_mode", e.target.value as DataControlSettings["compliance_mode"])}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="standard">Standard</option>
            <option value="eu_only">EU-only providers</option>
          </select>
          <span className="text-xs text-muted-foreground">
            Data region: <span className="font-mono">{settings.data_region}</span>
          </span>
        </div>
      </FieldRow>

      <div className="mt-5 flex items-center gap-3 border-t border-border/60 pt-5">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canManage || saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save data controls"}
        </button>
        {status && (
          <p className={`text-xs ${status.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}
