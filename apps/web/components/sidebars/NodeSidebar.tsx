"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/credit-packs";
import type { NodeExecutionData } from "@/components/editor/EditorShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type {
  ProgramSchema,
  AgentConfig,
  StepConfig,
  TriggerConfig,
  BranchCondition,
  ConnectionConfig,
  HttpConnectionConfig,
  FileConnectionConfig,
  RetryConfig,
} from "@flowos/schema";
import type { ValidationResult, ValidationError, ValidationWarning } from "@/lib/validation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  OPERATION_PARAM_FIELDS,
  getMissingRequiredParams,
  getUnsatisfiedParamGroups,
  isUnassignedParamValue,
  type ParamField,
} from "@/lib/connectors/operation-params";
import { CONNECTOR_OPERATIONS, OPERATION_SCOPES } from "@/lib/connectors/catalog";
import { friendlyErrorMessage } from "@/lib/friendly-errors";
import { MODEL_PRESETS } from "@/lib/model-presets";
import { PanelResizeHandle } from "@/components/editor/PanelResizeHandle";
import { FieldHelp } from "@/components/ui/field-help";
import { getOperationFieldHelp, type FieldHelpEntry } from "@/lib/field-help";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  provider: string;
}

export interface SidebarConnection {
  id: string;
  name: string;
  provider: string;
  scopes: string[];
}

interface NodeSidebarProps {
  nodeId: string;
  schema: ProgramSchema;
  programId: string;
  apiKeys: ApiKey[];
  connections: SidebarConnection[];
  validationResult?: ValidationResult | null;
  /** Execution data keyed by node_id, populated from the latest run. */
  nodeExecutions?: Record<string, NodeExecutionData>;
  /** The ID of the most recent run, used to build the "View full run" link. */
  lastRunId?: string | null;
  onUpdate: (nodeId: string, config: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
}

// ─── Cron presets ─────────────────────────────────────────────────────────────

const CRON_PRESETS: { label: string; expression: string }[] = [
  { label: "Every minute",    expression: "* * * * *" },
  { label: "Every 5 min",     expression: "*/5 * * * *" },
  { label: "Every 15 min",    expression: "*/15 * * * *" },
  { label: "Hourly",          expression: "0 * * * *" },
  { label: "Daily 8am",       expression: "0 8 * * *" },
  { label: "Daily midnight",  expression: "0 0 * * *" },
  { label: "Weekdays 9am",    expression: "0 9 * * 1-5" },
  { label: "Mon 9am",         expression: "0 9 * * 1" },
  { label: "Monthly 1st",     expression: "0 0 1 * *" },
];

// ─── Model presets per provider ───────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        {title}
      </h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldGroup({
  label,
  htmlFor,
  hint,
  helpKey,
  helpEntry,
  children,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: string;
  helpKey?: string;
  helpEntry?: FieldHelpEntry;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      {label && (
        <Label htmlFor={htmlFor} className="text-xs flex items-center gap-1">
          {label}
          {(helpKey || helpEntry) && <FieldHelp fieldKey={helpKey} entry={helpEntry} />}
        </Label>
      )}
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({
  id,
  checked,
  onChange,
  label,
  helpKey,
  helpEntry,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  helpKey?: string;
  helpEntry?: FieldHelpEntry;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="text-xs cursor-pointer flex items-center gap-1">
        {label}
        {(helpKey || helpEntry) && <FieldHelp fieldKey={helpKey} entry={helpEntry} />}
      </Label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          checked ? "bg-primary" : "bg-input"
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform",
            checked ? "translate-x-4" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}

// ─── Validation summary ───────────────────────────────────────────────────────

function ValidationSummary({
  errors,
  warnings,
}: {
  errors: ValidationError[];
  warnings: ValidationWarning[];
}) {
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {errors.map((e, i) => (
        <div
          key={i}
          className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2"
        >
          <p className="text-xs font-medium text-red-700 dark:text-red-400">{e.message}</p>
          {e.fix_suggestion && (
            <p className="text-[10px] text-red-600/80 dark:text-red-500 mt-0.5">{e.fix_suggestion}</p>
          )}
        </div>
      ))}
      {warnings.map((w, i) => (
        <div
          key={i}
          className="rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 px-3 py-2"
        >
          <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">{w.message}</p>
          {w.fix_suggestion && (
            <p className="text-[10px] text-yellow-600/80 dark:text-yellow-500 mt-0.5">{w.fix_suggestion}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Operation params editor ─────────────────────────────────────────────────

const SENTINEL_VALUE = "__USER_ASSIGNED__";

type ResourceFieldConfig = {
  resourceType: string;
  placeholder: string;
  queryParamKeys?: string[];
  waitForKey?: string;
  waitForLabel?: string;
};

const RESOURCE_FIELD_CONFIG: Record<string, Record<string, ResourceFieldConfig>> = {
  airtable: {
    base_id: { resourceType: "airtable-bases", placeholder: "Choose an Airtable base" },
    table_name: {
      resourceType: "airtable-tables",
      placeholder: "Choose a table",
      queryParamKeys: ["base_id"],
      waitForKey: "base_id",
      waitForLabel: "base",
    },
  },
  asana: {
    workspace_id: { resourceType: "asana-workspaces", placeholder: "Choose a workspace" },
    project_id: {
      resourceType: "asana-projects",
      placeholder: "Choose a project",
      queryParamKeys: ["workspace_id"],
    },
  },
  calendar: {
    calendar_id: { resourceType: "calendars", placeholder: "Choose a calendar" },
  },
  docs: {
    document_id: { resourceType: "documents", placeholder: "Choose a Google Doc" },
  },
  drive: {
    file_id: { resourceType: "drive-files", placeholder: "Choose a Drive file" },
    parent_id: { resourceType: "drive-folders", placeholder: "Choose a parent folder" },
  },
  github: {
    repo: { resourceType: "github-repos", placeholder: "Choose a repository" },
  },
  hubspot: {
    contact_id: { resourceType: "hubspot-contacts", placeholder: "Choose a contact" },
    deal_id: { resourceType: "hubspot-deals", placeholder: "Choose a deal" },
  },
  notion: {
    database_id: { resourceType: "notion-databases", placeholder: "Choose a database" },
    page_id: { resourceType: "notion-pages", placeholder: "Choose a page" },
    parent_id: { resourceType: "notion-parents", placeholder: "Choose a parent page or database" },
  },
  outlook: {
    folder: { resourceType: "outlook-folders", placeholder: "Choose a mail folder" },
    destination_folder: { resourceType: "outlook-folders", placeholder: "Choose destination folder" },
  },
  sheets: {
    spreadsheet_id: { resourceType: "spreadsheets", placeholder: "Choose a spreadsheet" },
  },
  slack: {
    channel: { resourceType: "slack-channels", placeholder: "Choose a channel" },
  },
  typeform: {
    form_id: { resourceType: "typeform-forms", placeholder: "Choose a form" },
  },
};

function getResourceFieldConfig(provider: string, key: string): ResourceFieldConfig | undefined {
  return RESOURCE_FIELD_CONFIG[provider]?.[key];
}

function getResourcePickerValue(provider: string, key: string, value: unknown, params: Record<string, unknown>): string {
  if (provider === "github" && key === "repo" && typeof params.owner === "string" && typeof value === "string") {
    return `${params.owner}/${value}`;
  }

  return String(value ?? "");
}

function buildResourceQuery(config: ResourceFieldConfig, params: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};

  for (const key of config.queryParamKeys ?? []) {
    const value = params[key];
    if (typeof value === "string" && value.trim() && value !== SENTINEL_VALUE) {
      query[key] = value.trim();
    }
  }

  return query;
}

function OperationParamsEditor({
  provider,
  operation,
  params,
  connectionId,
  onChange,
}: {
  provider: string;
  operation: string;
  params: Record<string, unknown>;
  connectionId: string | null;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const fields = OPERATION_PARAM_FIELDS[provider]?.[operation];
  const missingRequired = getMissingRequiredParams(provider, operation, params);
  const unsatisfiedGroups = getUnsatisfiedParamGroups(provider, operation, params);

  // JSON fallback state for JSON-type fields and for unknown operations
  const [jsonFallback, setJsonFallback] = useState(() => JSON.stringify(params, null, 2));
  const [jsonError, setJsonError] = useState(false);

  // Keep json fallback in sync when operation changes
  useEffect(() => {
    setJsonFallback(JSON.stringify(params, null, 2));
    setJsonError(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation]);

  if (!fields) {
    // Unknown operation — raw JSON editor
    return (
      <FieldGroup label="Operation params (JSON)" htmlFor="op-params-raw" helpKey="operation_params_json">
        <Textarea
          id="op-params-raw"
          rows={5}
          className={cn("text-xs font-mono resize-y", jsonError && "border-destructive")}
          value={jsonFallback}
          onChange={(e) => setJsonFallback(e.target.value)}
          onBlur={() => {
            try {
              onChange(JSON.parse(jsonFallback));
              setJsonError(false);
            } catch {
              setJsonError(true);
            }
          }}
          placeholder="{}"
        />
        {jsonError && <p className="text-xs text-destructive">Invalid JSON</p>}
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Use <span className="font-mono">{"{{node_id.field}}"}</span> to reference upstream outputs.
        </p>
      </FieldGroup>
    );
  }

  function update(key: string, value: unknown) {
    const next = { ...params };
    if (value === "" || value === undefined || value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  }

  function updateResourceValue(key: string, value: string) {
    if (provider === "github" && key === "repo" && value.includes("/")) {
      const [owner, repo] = value.split("/");
      onChange({ ...params, owner, repo });
      return;
    }

    update(key, value || undefined);
  }

  return (
    <div className="space-y-3">
      {missingRequired.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          <span className="font-semibold">
            {missingRequired.length === 1
              ? "1 required field needs your input"
              : `${missingRequired.length} required fields need your input`}
          </span>
          <span className="block text-[11px] text-destructive/80 mt-0.5">
            Fill these before running the program.
          </span>
        </div>
      )}
      {unsatisfiedGroups.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          <span className="font-semibold">
            {`Set ${unsatisfiedGroups.join(" and ")}`}
          </span>
          <span className="block text-[11px] text-destructive/80 mt-0.5">
            This operation needs at least one of these before running.
          </span>
        </div>
      )}
      {fields.map((field) => {
        const rawVal = params[field.key];
        const isMissing = missingRequired.includes(field.key);
        const helpEntry = getOperationFieldHelp(provider, operation, field);
        // Hide the sentinel in the input so the user sees an empty, flagged field
        // instead of the literal placeholder string.
        const displayVal = isUnassignedParamValue(rawVal) ? "" : rawVal;
        const labelEl = (
          <span>
            {field.label}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
            {isMissing && (
              <span className="ml-2 text-[10px] font-semibold text-destructive uppercase tracking-wide">
                Required
              </span>
            )}
          </span>
        );
        const inputClass = cn(isMissing && "border-destructive focus-visible:ring-destructive");

        if (field.type === "boolean") {
          return (
            <Toggle
              key={field.key}
              id={`op-${field.key}`}
              checked={Boolean(rawVal)}
              onChange={(v) => update(field.key, v)}
              label={labelEl}
              helpEntry={helpEntry}
            />
          );
        }

        if (field.type === "text") {
          return (
            <FieldGroup
              key={field.key}
              label={labelEl}
              htmlFor={`op-${field.key}`}
              hint={field.hint}
              helpEntry={helpEntry}
            >
              <Textarea
                id={`op-${field.key}`}
                rows={3}
                className={cn("text-xs resize-y", inputClass)}
                placeholder={field.placeholder}
                value={String(displayVal ?? "")}
                onChange={(e) => update(field.key, e.target.value)}
              />
            </FieldGroup>
          );
        }

        if (field.type === "number") {
          return (
            <FieldGroup
              key={field.key}
              label={labelEl}
              htmlFor={`op-${field.key}`}
              hint={field.hint}
              helpEntry={helpEntry}
            >
              <Input
                id={`op-${field.key}`}
                type="number"
                className={inputClass}
                placeholder={field.placeholder}
                value={displayVal !== undefined && displayVal !== "" ? String(displayVal) : ""}
                onChange={(e) => update(field.key, e.target.value ? Number(e.target.value) : undefined)}
              />
            </FieldGroup>
          );
        }

        if (field.type === "array") {
          const arrVal = Array.isArray(rawVal)
            ? (rawVal as string[]).join(", ")
            : isUnassignedParamValue(rawVal)
            ? ""
            : String(rawVal ?? "");
          return (
            <FieldGroup
              key={field.key}
              label={labelEl}
              htmlFor={`op-${field.key}`}
              hint={field.hint ?? "Comma-separated"}
              helpEntry={helpEntry}
            >
              <Input
                id={`op-${field.key}`}
                className={inputClass}
                placeholder={field.placeholder ?? "item1, item2"}
                value={arrVal}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  update(field.key, v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);
                }}
              />
            </FieldGroup>
          );
        }

        if (field.type === "json") {
          const jsonVal = rawVal !== undefined && !isUnassignedParamValue(rawVal)
            ? (typeof rawVal === "string" ? rawVal : JSON.stringify(rawVal, null, 2))
            : "";
          return (
            <JsonField
              key={field.key}
              fieldKey={field.key}
              label={labelEl}
              hint={field.hint}
              helpEntry={helpEntry}
              value={jsonVal}
              invalid={isMissing}
              onCommit={(v) => {
                try {
                  update(field.key, v ? JSON.parse(v) : undefined);
                } catch {
                  // keep old value
                }
              }}
            />
          );
        }

        const resourceConfig = getResourceFieldConfig(provider, field.key);
        const waitingForValue = resourceConfig?.waitForKey ? params[resourceConfig.waitForKey] : undefined;
        const isWaitingForParent =
          resourceConfig?.waitForKey &&
          (typeof waitingForValue !== "string" || !waitingForValue.trim() || waitingForValue === SENTINEL_VALUE);

        if (resourceConfig && connectionId && !isWaitingForParent) {
          const pickerValue = getResourcePickerValue(provider, field.key, displayVal, params);
          return (
            <FieldGroup
              key={field.key}
              label={labelEl}
              htmlFor={`op-${field.key}`}
              hint={field.hint}
              helpEntry={helpEntry}
            >
              <ResourcePicker
                id={`op-${field.key}`}
                connectionId={connectionId}
                resourceType={resourceConfig.resourceType}
                query={buildResourceQuery(resourceConfig, params)}
                value={pickerValue}
                placeholder={resourceConfig.placeholder}
                invalid={isMissing}
                onChange={(v) => updateResourceValue(field.key, v)}
              />
            </FieldGroup>
          );
        }

        if (resourceConfig && !connectionId) {
          return (
            <FieldGroup
              key={field.key}
              label={labelEl}
              htmlFor={`op-${field.key}`}
              hint="Choose a connection above to load saved options, or paste a value manually."
              helpEntry={helpEntry}
            >
              <Input
                id={`op-${field.key}`}
                className={inputClass}
                placeholder={field.placeholder ?? resourceConfig.placeholder}
                value={String(displayVal ?? "")}
                onChange={(e) => update(field.key, e.target.value)}
              />
            </FieldGroup>
          );
        }

        if (resourceConfig && isWaitingForParent) {
          return (
            <FieldGroup
              key={field.key}
              label={labelEl}
              htmlFor={`op-${field.key}`}
              hint={`Choose a ${resourceConfig.waitForLabel ?? resourceConfig.waitForKey} first, or paste a value manually.`}
              helpEntry={helpEntry}
            >
              <Input
                id={`op-${field.key}`}
                className={inputClass}
                placeholder={field.placeholder ?? resourceConfig.placeholder}
                value={String(displayVal ?? "")}
                onChange={(e) => update(field.key, e.target.value)}
              />
            </FieldGroup>
          );
        }

        // Default: string input
        return (
          <FieldGroup
            key={field.key}
            label={labelEl}
            htmlFor={`op-${field.key}`}
            hint={field.hint}
            helpEntry={helpEntry}
          >
            <Input
              id={`op-${field.key}`}
              className={inputClass}
              placeholder={field.placeholder}
              value={String(displayVal ?? "")}
              onChange={(e) => update(field.key, e.target.value)}
            />
          </FieldGroup>
        );
      })}
      <p className="text-[11px] text-muted-foreground pt-1">
        Use <span className="font-mono text-[11px]">{"{{node_id.field}}"}</span> to reference upstream outputs.
      </p>
    </div>
  );
}

// Small controlled JSON textarea that tracks local state independently
function JsonField({
  fieldKey,
  label,
  hint,
  helpEntry,
  value,
  onCommit,
  invalid = false,
}: {
  fieldKey: string;
  label: React.ReactNode;
  hint?: string;
  helpEntry?: FieldHelpEntry;
  value: string;
  onCommit: (v: string) => void;
  invalid?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const [err, setErr] = useState(false);

  useEffect(() => { setLocal(value); setErr(false); }, [value]);

  return (
    <FieldGroup label={label} htmlFor={`op-${fieldKey}`} hint={hint} helpEntry={helpEntry}>
      <Textarea
        id={`op-${fieldKey}`}
        rows={3}
        className={cn("text-xs font-mono resize-y", (err || invalid) && "border-destructive")}
        value={local}
        placeholder="{}"
        onChange={(e) => { setLocal(e.target.value); setErr(false); }}
        onBlur={() => {
          try { JSON.parse(local || "null"); setErr(false); onCommit(local); }
          catch { setErr(true); }
        }}
      />
      {err && <p className="text-xs text-destructive">Invalid JSON</p>}
    </FieldGroup>
  );
}

// ─── Resource picker ──────────────────────────────────────────────────────────
// Dropdown that lists resources from a connection (e.g. spreadsheets the
// authenticated Google account can see) so users don't have to paste IDs by hand.

type PickerResource = { id: string; name: string };

function ResourcePicker({
  id,
  connectionId,
  resourceType,
  query = {},
  value,
  placeholder,
  invalid = false,
  onChange,
}: {
  id?: string;
  connectionId: string;
  resourceType: string;
  query?: Record<string, string>;
  value: string;
  placeholder?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const [resources, setResources] = useState<PickerResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams(query).toString();
    fetch(`/api/connections/${connectionId}/resources/${resourceType}${qs ? `?${qs}` : ""}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(friendlyErrorMessage(body.error, "We could not load those options. Please try again."));
        }
        return res.json();
      })
      .then((data: { resources: PickerResource[] }) => {
        if (!cancelled) setResources(data.resources ?? []);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey is a stable hash of query; re-fetching on query object identity would be noisy
  }, [connectionId, resourceType, queryKey]);

  const selectedKnown = resources?.some((r) => r.id === value) ?? false;
  const borderClass = invalid ? "border-destructive focus-visible:ring-destructive" : "";

  if (manualEntry || error || (resources !== null && resources.length === 0)) {
    return (
      <div className="space-y-1.5">
        <Input
          id={id}
          className={borderClass}
          placeholder={placeholder ?? "Paste ID"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {error && <p className="text-[11px] text-destructive">{error}. Paste the ID manually.</p>}
        {!error && resources && resources.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No {resourceType} found. Paste an ID manually.</p>
        )}
        {!error && resources && resources.length > 0 && (
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={() => setManualEntry(false)}
          >
            Pick from list instead
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Select
        id={id}
        className={borderClass}
        value={selectedKnown ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading || !resources}
      >
        <option value="">
          {loading ? "Loading…" : placeholder ?? "Select…"}
        </option>
        {resources?.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>
      {value && !selectedKnown && !loading && (
        <p className="text-[11px] text-muted-foreground">
          Current ID <span className="font-mono">{value}</span> not in your list.
        </p>
      )}
      <button
        type="button"
        className="text-[11px] text-muted-foreground hover:underline"
        onClick={() => setManualEntry(true)}
      >
        Paste ID manually
      </button>
    </div>
  );
}

// ─── Device picker (desktop Bridge) ───────────────────────────────────────────
// Lists the workspace's paired devices so file nodes / file-watch triggers can
// target one. "Default device" (null) lets the runtime resolve the most-recently
// active device at run time — the right choice when the user has just one.

type DeviceOption = {
  id: string;
  name: string;
  grants?: Array<{ path: string; permission: string }>;
};

function DeviceSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (deviceId: string | null) => void;
}) {
  const [devices, setDevices] = useState<DeviceOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/devices")
      .then((r) => (r.ok ? (r.json() as Promise<{ devices?: DeviceOption[] }>) : null))
      .then((data) => {
        if (!cancelled) setDevices(data?.devices ?? []);
      })
      .catch(() => {
        if (!cancelled) setDevices([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <FieldGroup
      label="Device"
      htmlFor="file-device"
      hint="Which paired desktop runs this. Default = your most-recently-active device."
      helpKey="device_id"
    >
      <Select
        id="file-device"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Default device</option>
        {devices?.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
      {devices !== null && devices.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No devices paired yet. Open Corelyx Desktop and sign in, then grant a folder in
          Settings → Devices.
        </p>
      )}
    </FieldGroup>
  );
}

// ─── Corelyx platform key panel ──────────────────────────────────────────────

type CreditData = {
  availableIncluded: number | null;
  availablePurchased: number;
  total: number | null;
};

function CorelyxKeyPanel() {
  const [credits, setCredits] = useState<CreditData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/credits/balance")
      .then((r) => r.ok ? r.json() as Promise<CreditData> : null)
      .then((data) => { setCredits(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const total = credits?.total;
  const isUnlimited = total === null;
  const isLow = !isUnlimited && typeof total === "number" && total < 1_000;
  const isEmpty = !isUnlimited && typeof total === "number" && total <= 0;

  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-2.5 text-xs",
      isEmpty
        ? "border-destructive/40 bg-destructive/5"
        : isLow
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-primary/20 bg-primary/5"
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">Corelyx Platform Key</span>
        <a
          href="/plan"
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground hover:opacity-90"
        >
          Buy credits
        </a>
      </div>

      <div className="space-y-1 text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Available balance</span>
          <span className={cn("font-medium tabular-nums", isEmpty ? "text-destructive" : "text-foreground")}>
            {loading ? "..." : isUnlimited ? "Unlimited" : `${formatCredits(total as number)} credits`}
          </span>
        </div>
        {credits && !isUnlimited && (credits.availablePurchased ?? 0) > 0 && (
          <div className="flex items-center justify-between">
            <span>Purchased</span>
            <span className="tabular-nums">{formatCredits(credits.availablePurchased)}</span>
          </div>
        )}
      </div>

      {isEmpty && (
        <p className="text-destructive font-medium">Credits exhausted — this node won&apos;t run.</p>
      )}
      {isLow && !isEmpty && (
        <p className="text-amber-600 dark:text-amber-400">Running low. Top up to avoid interruptions.</p>
      )}

      <p className="text-muted-foreground/70 leading-relaxed">
        All providers supported (OpenAI, Anthropic, Groq, Google, and more) via a single key.
        Credits reset monthly with your plan.
      </p>
    </div>
  );
}

// ─── Agent sidebar ────────────────────────────────────────────────────────────

type AgentTab = "model" | "prompt" | "retry";

function AgentSidebar({
  config,
  apiKeys,
  onUpdate,
}: {
  config: AgentConfig;
  apiKeys: ApiKey[];
  onUpdate: (patch: Partial<AgentConfig>) => void;
}) {
  const [tab, setTab] = useState<AgentTab>("model");

  const isPlatformKey = config.api_key_ref === "platform";
  const selectedKey = isPlatformKey ? null : apiKeys.find((k) => k.id === config.api_key_ref);
  const providerPresets = isPlatformKey
    ? (MODEL_PRESETS["openrouter"] ?? [])
    : (MODEL_PRESETS[selectedKey?.provider ?? ""] ?? []);
  const datalistId = "agent-model-presets";

  const tabs: { id: AgentTab; label: string }[] = [
    { id: "model", label: "Model" },
    { id: "prompt", label: "Prompt" },
    { id: "retry", label: "Retry" },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-border mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Model tab */}
      {tab === "model" && (
        <div className="space-y-3">
          <FieldGroup label="API Key" htmlFor="agent-apikey" helpKey="api_key_ref">
            <Select
              id="agent-apikey"
              value={config.api_key_ref === "__USER_ASSIGNED__" ? "" : config.api_key_ref}
              onChange={(e) => {
                const keyId = e.target.value || "__USER_ASSIGNED__";
                const updates: Partial<AgentConfig> = { api_key_ref: keyId };
                if (config.model === "__USER_ASSIGNED__" && keyId !== "__USER_ASSIGNED__") {
                  const presets = keyId === "platform"
                    ? (MODEL_PRESETS["openrouter"] ?? [])
                    : (MODEL_PRESETS[apiKeys.find((k) => k.id === keyId)?.provider ?? ""] ?? []);
                  if (presets.length > 0) updates.model = presets[0];
                }
                onUpdate(updates);
              }}
            >
              <option value="">— Select API Key —</option>
              <option value="platform">Corelyx Platform Key (credits)</option>
              {apiKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.provider})
                </option>
              ))}
            </Select>
          </FieldGroup>

          {isPlatformKey && <CorelyxKeyPanel />}

          <FieldGroup label="Model" htmlFor="agent-model" helpKey="model">
            {providerPresets.length > 0 && (
              <datalist id={datalistId}>
                {providerPresets.map((m) => <option key={m} value={m} />)}
              </datalist>
            )}
            <Input
              id="agent-model"
              list={providerPresets.length > 0 ? datalistId : undefined}
              placeholder="e.g. claude-sonnet-4-6"
              value={config.model === "__USER_ASSIGNED__" ? "" : config.model}
              onChange={(e) => onUpdate({ model: e.target.value || "__USER_ASSIGNED__" })}
            />
            {providerPresets.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {providerPresets.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onUpdate({ model: m })}
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                      config.model === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {m.split("/").pop()}
                  </button>
                ))}
              </div>
            )}
          </FieldGroup>

          <FieldGroup label="Scope access" htmlFor="agent-scope" helpKey="scope_access">
            <Select
              id="agent-scope"
              value={config.scope_access}
              onChange={(e) =>
                onUpdate({ scope_access: e.target.value as AgentConfig["scope_access"] })
              }
            >
              <option value="read">Read</option>
              <option value="write">Write</option>
              <option value="read_write">Read + Write</option>
            </Select>
          </FieldGroup>
        </div>
      )}

      {/* Prompt tab */}
      {tab === "prompt" && (
        <div className="space-y-3">
          <FieldGroup label="System prompt" htmlFor="agent-prompt" helpKey="system_prompt">
            <Textarea
              id="agent-prompt"
              rows={8}
              placeholder="Describe what this agent should do..."
              value={config.system_prompt}
              onChange={(e) => onUpdate({ system_prompt: e.target.value })}
              className="text-xs resize-none"
            />
          </FieldGroup>

          <Toggle
            id="agent-approval"
            checked={config.requires_approval}
            onChange={(v) => onUpdate({ requires_approval: v })}
            label="Requires human approval"
            helpKey="requires_approval"
          />

          {config.requires_approval && (
            <FieldGroup label="Approval timeout (hours)" htmlFor="agent-approval-timeout" helpKey="approval_timeout_hours">
              <Input
                id="agent-approval-timeout"
                type="number"
                min={0}
                value={config.approval_timeout_hours}
                onChange={(e) =>
                  onUpdate({ approval_timeout_hours: Number(e.target.value) })
                }
              />
            </FieldGroup>
          )}
        </div>
      )}

      {/* Retry tab */}
      {tab === "retry" && (
        <div className="space-y-3">
          <FieldGroup label="Max attempts (1–5)" htmlFor="retry-attempts" helpKey="retry.max_attempts">
            <Input
              id="retry-attempts"
              type="number"
              min={1}
              max={5}
              value={config.retry.max_attempts}
              onChange={(e) =>
                onUpdate({
                  retry: { ...config.retry, max_attempts: Math.min(5, Math.max(1, Number(e.target.value))) },
                })
              }
            />
          </FieldGroup>

          <FieldGroup label="Backoff strategy" htmlFor="retry-backoff" helpKey="retry.backoff">
            <Select
              id="retry-backoff"
              value={config.retry.backoff}
              onChange={(e) =>
                onUpdate({
                  retry: { ...config.retry, backoff: e.target.value as RetryConfig["backoff"] },
                })
              }
            >
              <option value="none">None</option>
              <option value="linear">Linear</option>
              <option value="exponential">Exponential</option>
            </Select>
          </FieldGroup>

          {config.retry.backoff !== "none" && (
            <FieldGroup label="Base seconds" htmlFor="retry-base" helpKey="retry.backoff_base_seconds">
              <Input
                id="retry-base"
                type="number"
                min={0}
                value={config.retry.backoff_base_seconds}
                onChange={(e) =>
                  onUpdate({
                    retry: { ...config.retry, backoff_base_seconds: Number(e.target.value) },
                  })
                }
              />
            </FieldGroup>
          )}

          <Toggle
            id="retry-fail"
            checked={config.retry.fail_program_on_exhaust}
            onChange={(v) =>
              onUpdate({ retry: { ...config.retry, fail_program_on_exhaust: v } })
            }
            label="Fail program when retries exhausted"
            helpKey="retry.fail_program_on_exhaust"
          />
        </div>
      )}
    </div>
  );
}

// ─── Trigger sidebar ──────────────────────────────────────────────────────────

function TriggerSidebar({
  config,
  onUpdate,
}: {
  config: TriggerConfig;
  onUpdate: (patch: Partial<TriggerConfig>) => void;
}) {
  const [showPresets, setShowPresets] = useState(false);

  return (
    <div className="space-y-3">
      <FieldGroup label="Trigger type" htmlFor="trigger-type" helpKey="trigger_type">
        <Select
          id="trigger-type"
          value={config.trigger_type}
          onChange={(e) => {
            const t = e.target.value as TriggerConfig["trigger_type"];
            if (t === "manual")         onUpdate({ trigger_type: "manual" } as TriggerConfig);
            else if (t === "cron")      onUpdate({ trigger_type: "cron", expression: "", timezone: "UTC" } as TriggerConfig);
            else if (t === "webhook")   onUpdate({ trigger_type: "webhook", endpoint_id: "", method: "POST" } as TriggerConfig);
            else if (t === "event")     onUpdate({ trigger_type: "event", source: "", event: "", filter: null } as TriggerConfig);
            else if (t === "program_output") onUpdate({ trigger_type: "program_output", source_program_id: "", on_status: ["success"] } as TriggerConfig);
            else if (t === "file_watch") onUpdate({ trigger_type: "file_watch", device_id: null, path: "", events: ["created"], patterns: [] } as TriggerConfig);
          }}
        >
          <option value="manual">Manual</option>
          <option value="cron">Cron schedule</option>
          <option value="webhook">Webhook</option>
          <option value="event">Event</option>
          <option value="program_output">Program output</option>
          <option value="file_watch">File watch (desktop)</option>
        </Select>
      </FieldGroup>

      {config.trigger_type === "cron" && (
        <>
          <FieldGroup label="Cron expression" htmlFor="cron-expr" helpKey="expression">
            <Input
              id="cron-expr"
              placeholder="0 9 * * 1-5"
              value={config.expression}
              onChange={(e) => onUpdate({ ...config, expression: e.target.value })}
            />
          </FieldGroup>

          {/* Presets */}
          <div>
            <button
              type="button"
              onClick={() => setShowPresets((v) => !v)}
              className="text-[11px] text-primary hover:underline"
            >
              {showPresets ? "Hide presets" : "Quick presets"}
            </button>
            {showPresets && (
              <div className="flex flex-wrap gap-1 mt-2">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.expression}
                    type="button"
                    onClick={() => onUpdate({ ...config, expression: p.expression })}
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                      config.expression === p.expression
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <FieldGroup label="Timezone" htmlFor="cron-tz" helpKey="timezone">
            <Input
              id="cron-tz"
              placeholder="UTC"
              value={config.timezone}
              onChange={(e) => onUpdate({ ...config, timezone: e.target.value })}
            />
          </FieldGroup>
        </>
      )}

      {config.trigger_type === "webhook" && (
        <>
          <FieldGroup label="HTTP method" htmlFor="webhook-method" helpKey="method">
            <Select
              id="webhook-method"
              value={config.method}
              onChange={(e) =>
                onUpdate({ ...config, method: e.target.value as "POST" | "GET" })
              }
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </Select>
          </FieldGroup>
          {config.endpoint_id && (
            <div className="rounded-md bg-muted px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Endpoint ID</p>
              <p className="text-xs font-mono mt-0.5 break-all">{config.endpoint_id}</p>
            </div>
          )}
        </>
      )}

      {config.trigger_type === "event" && (
        <>
          <FieldGroup label="Source" htmlFor="event-source" helpKey="source">
            <Input
              id="event-source"
              placeholder="e.g. gmail"
              value={config.source}
              onChange={(e) => onUpdate({ ...config, source: e.target.value })}
            />
          </FieldGroup>
          <FieldGroup label="Event name" htmlFor="event-name" helpKey="event">
            <Input
              id="event-name"
              placeholder="e.g. message.received"
              value={config.event}
              onChange={(e) => onUpdate({ ...config, event: e.target.value })}
            />
          </FieldGroup>
        </>
      )}

      {config.trigger_type === "program_output" && (
        <>
          <FieldGroup label="Source program ID" htmlFor="prog-source" helpKey="source_program_id">
            <Input
              id="prog-source"
              placeholder="Program UUID"
              value={config.source_program_id}
              onChange={(e) => onUpdate({ ...config, source_program_id: e.target.value })}
            />
          </FieldGroup>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label className="text-xs">Fire on status</Label>
              <FieldHelp fieldKey="on_status" />
            </div>
            {(["success", "failed", "partial"] as const).map((s) => {
              const active = config.on_status.includes(s);
              return (
                <Toggle
                  key={s}
                  id={`on-status-${s}`}
                  checked={active}
                  onChange={(v) => {
                    const next = v
                      ? [...config.on_status, s]
                      : config.on_status.filter((x) => x !== s);
                    onUpdate({ ...config, on_status: next });
                  }}
                  label={s.charAt(0).toUpperCase() + s.slice(1)}
                />
              );
            })}
          </div>
        </>
      )}

      {config.trigger_type === "file_watch" && (
        <>
          <div className="rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
            Watches a folder on your paired desktop device and fires when files change.
            Watching happens locally — file contents never leave your machine.
          </div>
          <DeviceSelect
            value={config.device_id}
            onChange={(deviceId) => onUpdate({ ...config, device_id: deviceId })}
          />
          <FieldGroup
            label="Folder to watch"
            htmlFor="fw-path"
            hint="Absolute path of a granted folder, e.g. C:\Users\you\Invoices"
            helpKey="path"
          >
            <Input
              id="fw-path"
              placeholder="C:\Users\you\Invoices"
              value={config.path}
              onChange={(e) => onUpdate({ ...config, path: e.target.value })}
            />
          </FieldGroup>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label className="text-xs">Fire on</Label>
              <FieldHelp fieldKey="events" />
            </div>
            {(["created", "modified", "deleted"] as const).map((ev) => {
              const active = config.events.includes(ev);
              return (
                <Toggle
                  key={ev}
                  id={`fw-ev-${ev}`}
                  checked={active}
                  onChange={(v) => {
                    const next = v
                      ? [...config.events, ev]
                      : config.events.filter((x) => x !== ev);
                    // Always keep at least one event kind selected.
                    onUpdate({ ...config, events: next.length > 0 ? next : config.events });
                  }}
                  label={ev.charAt(0).toUpperCase() + ev.slice(1)}
                />
              );
            })}
          </div>
          <FieldGroup
            label="Name patterns"
            htmlFor="fw-patterns"
            hint="Comma-separated globs, e.g. *.pdf, invoice-*.csv. Empty = any file."
            helpKey="patterns"
          >
            <Input
              id="fw-patterns"
              placeholder="*.pdf, *.csv"
              value={config.patterns.join(", ")}
              onChange={(e) => {
                const v = e.target.value.trim();
                onUpdate({
                  ...config,
                  patterns: v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [],
                });
              }}
            />
          </FieldGroup>
        </>
      )}
    </div>
  );
}

// ─── Step sidebar ─────────────────────────────────────────────────────────────

const LOGIC_TYPE_OPTIONS: { value: StepConfig["logic_type"]; label: string; group: string }[] = [
  { value: "transform",   label: "Transform",   group: "Data" },
  { value: "filter",      label: "Filter",      group: "Data" },
  { value: "format",      label: "Format",      group: "Data" },
  { value: "parse",       label: "Parse",       group: "Data" },
  { value: "deduplicate", label: "Deduplicate", group: "Data" },
  { value: "sort",        label: "Sort",        group: "Data" },
  { value: "branch",      label: "Branch",      group: "Flow" },
  { value: "loop",        label: "Loop",        group: "Flow" },
  { value: "delay",       label: "Delay",       group: "Flow" },
];

function makeDefaultStepConfig(t: StepConfig["logic_type"]): StepConfig {
  switch (t) {
    case "transform":   return { logic_type: "transform", transformation: "", input_schema: null, output_schema: null };
    case "filter":      return { logic_type: "filter", condition: "", pass_schema: null };
    case "branch":      return { logic_type: "branch", conditions: [], default_branch: "" };
    case "delay":       return { logic_type: "delay", seconds: 5 };
    case "loop":        return { logic_type: "loop", over: "input.items", item_var: "item" };
    case "format":      return { logic_type: "format", template: "", output_key: "text" };
    case "parse":       return { logic_type: "parse", input_key: "text", format: "json" };
    case "deduplicate": return { logic_type: "deduplicate", key: "id" };
    case "sort":        return { logic_type: "sort", key: "id", order: "asc" };
  }
}

function StepSidebar({
  config,
  onUpdate,
}: {
  config: StepConfig;
  onUpdate: (patch: Partial<StepConfig>) => void;
}) {
  const [newCondition, setNewCondition] = useState("");
  const [newCondTarget, setNewCondTarget] = useState("");

  // Group options for the select
  const groupedOptions: Record<string, typeof LOGIC_TYPE_OPTIONS> = {};
  LOGIC_TYPE_OPTIONS.forEach((o) => {
    (groupedOptions[o.group] ??= []).push(o);
  });

  return (
    <div className="space-y-3">
      <FieldGroup label="Operation" htmlFor="step-logic" helpKey="logic_type">
        <Select
          id="step-logic"
          value={config.logic_type}
          onChange={(e) => onUpdate(makeDefaultStepConfig(e.target.value as StepConfig["logic_type"]))}
        >
          {Object.entries(groupedOptions).map(([group, opts]) => (
            <optgroup key={group} label={group}>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </Select>
      </FieldGroup>

      {/* ── Transform ── */}
      {config.logic_type === "transform" && (
        <FieldGroup
          label="Expression" helpKey="transformation"
          htmlFor="step-transform"
          hint="JavaScript. input = upstream data. Return the new value."
        >
          <Textarea
            id="step-transform"
            rows={7}
            placeholder={"input.items.map(item => ({\n  id: item.id,\n  name: item.title,\n}))"}
            value={config.transformation}
            onChange={(e) => onUpdate({ ...config, transformation: e.target.value })}
            className="text-xs resize-y font-mono"
          />
        </FieldGroup>
      )}

      {/* ── Filter ── */}
      {config.logic_type === "filter" && (
        <FieldGroup
          label="Condition" helpKey="condition"
          htmlFor="step-filter"
          hint="True = pass data forward. False = stop execution."
        >
          <Input
            id="step-filter"
            placeholder="input.status === 'active' && input.score > 0.8"
            value={config.condition}
            onChange={(e) => onUpdate({ ...config, condition: e.target.value })}
          />
        </FieldGroup>
      )}

      {/* ── Branch ── */}
      {config.logic_type === "branch" && (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label className="text-xs">Conditions</Label>
              <FieldHelp fieldKey="conditions" />
            </div>
            {config.conditions.map((cond: BranchCondition, i: number) => (
              <div key={i} className="flex gap-1.5 items-start">
                <div className="flex-1 grid gap-2 sm:grid-cols-2">
                  <FieldGroup
                    label="Condition"
                    htmlFor={`step-branch-condition-${i}`}
                    helpKey="conditions[].condition"
                  >
                    <Input
                      id={`step-branch-condition-${i}`}
                      placeholder="input.priority === 'high'"
                      value={cond.condition}
                      onChange={(e) => {
                        const next = [...config.conditions];
                        next[i] = { ...next[i], condition: e.target.value };
                        onUpdate({ ...config, conditions: next });
                      }}
                      className="text-xs"
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Target node ID"
                    htmlFor={`step-branch-target-${i}`}
                    helpKey="conditions[].target_node_id"
                  >
                    <Input
                      id={`step-branch-target-${i}`}
                      placeholder="node-id"
                      value={cond.target_node_id}
                      onChange={(e) => {
                        const next = [...config.conditions];
                        next[i] = { ...next[i], target_node_id: e.target.value };
                        onUpdate({ ...config, conditions: next });
                      }}
                      className="text-xs"
                    />
                  </FieldGroup>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-0.5 h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => onUpdate({ ...config, conditions: config.conditions.filter((_, j) => j !== i) })}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                </Button>
              </div>
            ))}
            <div className="grid gap-2 pt-1 sm:grid-cols-2">
              <FieldGroup
                label="New condition"
                htmlFor="step-branch-new-condition"
                helpKey="conditions[].condition"
              >
                <Input
                  id="step-branch-new-condition"
                  placeholder="Condition"
                  value={newCondition}
                  onChange={(e) => setNewCondition(e.target.value)}
                  className="text-xs"
                />
              </FieldGroup>
              <FieldGroup
                label="New target node ID"
                htmlFor="step-branch-new-target"
                helpKey="conditions[].target_node_id"
              >
                <Input
                  id="step-branch-new-target"
                  placeholder="Target node ID"
                  value={newCondTarget}
                  onChange={(e) => setNewCondTarget(e.target.value)}
                  className="text-xs"
                />
              </FieldGroup>
            </div>
            <div className="pt-1">
              <Button
                type="button" variant="outline" size="sm" className="w-full"
                disabled={!newCondition.trim() || !newCondTarget.trim()}
                onClick={() => {
                  onUpdate({ ...config, conditions: [...config.conditions, { condition: newCondition.trim(), target_node_id: newCondTarget.trim() }] });
                  setNewCondition(""); setNewCondTarget("");
                }}
              >+ Add condition</Button>
            </div>
          </div>
          <FieldGroup label="Default branch (node ID)" htmlFor="step-default" helpKey="default_branch">
            <Input id="step-default" placeholder="node-id" value={config.default_branch}
              onChange={(e) => onUpdate({ ...config, default_branch: e.target.value })} />
          </FieldGroup>
        </>
      )}

      {/* ── Delay ── */}
      {config.logic_type === "delay" && (
        <FieldGroup label="Delay (seconds)" htmlFor="step-delay" hint="Max 300s (5 min). Pauses execution before the next node." helpKey="seconds">
          <Input
            id="step-delay"
            type="number"
            min={0}
            max={300}
            value={config.seconds}
            onChange={(e) => onUpdate({ ...config, seconds: Math.min(300, Math.max(0, Number(e.target.value))) })}
          />
        </FieldGroup>
      )}

      {/* ── Loop ── */}
      {config.logic_type === "loop" && (
        <>
          <FieldGroup label="Iterate over" htmlFor="step-loop-over" hint="Expression that resolves to an array. e.g. input.emails" helpKey="over">
            <Input
              id="step-loop-over"
              placeholder="input.items"
              value={config.over}
              onChange={(e) => onUpdate({ ...config, over: e.target.value })}
            />
          </FieldGroup>
          <FieldGroup label="Item variable name" htmlFor="step-loop-var" hint="Name used to reference the current item in downstream nodes." helpKey="item_var">
            <Input
              id="step-loop-var"
              placeholder="item"
              value={config.item_var}
              onChange={(e) => onUpdate({ ...config, item_var: e.target.value })}
            />
          </FieldGroup>
        </>
      )}

      {/* ── Format ── */}
      {config.logic_type === "format" && (
        <>
          <FieldGroup label="Template" htmlFor="step-format-tpl" hint="Python-style str.format_map. Use {field_name} to insert values." helpKey="template">
            <Textarea
              id="step-format-tpl"
              rows={4}
              placeholder={"Hello {name}, your order {order_id} is ready."}
              value={config.template}
              onChange={(e) => onUpdate({ ...config, template: e.target.value })}
              className="text-xs resize-y font-mono"
            />
          </FieldGroup>
          <FieldGroup label="Output key" htmlFor="step-format-key" hint="Key under which the formatted string is stored in output." helpKey="output_key">
            <Input
              id="step-format-key"
              placeholder="text"
              value={config.output_key}
              onChange={(e) => onUpdate({ ...config, output_key: e.target.value })}
            />
          </FieldGroup>
        </>
      )}

      {/* ── Parse ── */}
      {config.logic_type === "parse" && (
        <>
          <FieldGroup label="Input key" htmlFor="step-parse-key" hint="Key in upstream output that contains the raw string to parse." helpKey="input_key">
            <Input
              id="step-parse-key"
              placeholder="text"
              value={config.input_key}
              onChange={(e) => onUpdate({ ...config, input_key: e.target.value })}
            />
          </FieldGroup>
          <FieldGroup label="Format" htmlFor="step-parse-fmt" helpKey="format">
            <Select
              id="step-parse-fmt"
              value={config.format}
              onChange={(e) => onUpdate({ ...config, format: e.target.value as "json" | "csv" | "lines" })}
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="lines">Lines (split by newline)</option>
            </Select>
          </FieldGroup>
          <p className="text-[11px] text-muted-foreground">Result stored as <span className="font-mono">output.parsed</span>.</p>
        </>
      )}

      {/* ── Deduplicate ── */}
      {config.logic_type === "deduplicate" && (
        <FieldGroup label="Key field" htmlFor="step-dedup-key" hint="Field used to identify duplicates in input.items array." helpKey="dedup.key">
          <Input
            id="step-dedup-key"
            placeholder="id"
            value={config.key}
            onChange={(e) => onUpdate({ ...config, key: e.target.value })}
          />
        </FieldGroup>
      )}

      {/* ── Sort ── */}
      {config.logic_type === "sort" && (
        <>
          <FieldGroup label="Sort by field" htmlFor="step-sort-key" hint="Field to sort by in the input.items array." helpKey="sort.key">
            <Input
              id="step-sort-key"
              placeholder="created_at"
              value={config.key}
              onChange={(e) => onUpdate({ ...config, key: e.target.value })}
            />
          </FieldGroup>
          <FieldGroup label="Order" htmlFor="step-sort-order" helpKey="order">
            <Select
              id="step-sort-order"
              value={config.order}
              onChange={(e) => onUpdate({ ...config, order: e.target.value as "asc" | "desc" })}
            >
              <option value="asc">Ascending (A → Z, 0 → 9)</option>
              <option value="desc">Descending (Z → A, 9 → 0)</option>
            </Select>
          </FieldGroup>
        </>
      )}
    </div>
  );
}

// ─── KV list editor ───────────────────────────────────────────────────────────

function KeyValueListEditor({
  label,
  helpKey,
  items,
  onChange,
  emptyKeyPlaceholder,
  emptyValuePlaceholder,
}: {
  label: string;
  helpKey?: string;
  items: Array<{ key: string; value: string }>;
  onChange: (next: Array<{ key: string; value: string }>) => void;
  emptyKeyPlaceholder: string;
  emptyValuePlaceholder: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Label className="text-xs">{label}</Label>
        {helpKey && <FieldHelp fieldKey={helpKey} />}
      </div>
      {items.length === 0 && (
        <p className="text-[11px] text-muted-foreground">No entries yet.</p>
      )}
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Input
            value={item.key}
            placeholder={emptyKeyPlaceholder}
            className="text-xs"
            onChange={(e) => {
              const next = [...items];
              next[index] = { ...next[index], key: e.target.value };
              onChange(next);
            }}
          />
          <Input
            value={item.value}
            placeholder={emptyValuePlaceholder}
            className="text-xs"
            onChange={(e) => {
              const next = [...items];
              next[index] = { ...next[index], value: e.target.value };
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onChange([...items, { key: "", value: "" }])}
      >
        + Add entry
      </Button>
    </div>
  );
}

// ─── Connection sidebar ───────────────────────────────────────────────────────

function isHttpConnectionConfig(config: ConnectionConfig): config is HttpConnectionConfig {
  return config.connector_type === "http";
}

// ─── Local-files (desktop Bridge) connection sidebar ──────────────────────────

const FILE_OPERATIONS: FileConnectionConfig["operation"][] = [
  "read", "write", "append", "list", "stat", "move", "copy", "delete", "mkdir", "search",
];

// Operations that change the filesystem — selecting one nudges scope to "write".
const FILE_WRITE_OPERATIONS = new Set(["write", "append", "move", "copy", "delete", "mkdir"]);

function FileConnectionSidebar({
  config,
  onUpdate,
}: {
  config: FileConnectionConfig;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const params = config.operation_params ?? {};
  const op = config.operation;

  function setParam(key: string, value: unknown) {
    const next = { ...params };
    if (value === "" || value === undefined || value === null) delete next[key];
    else next[key] = value;
    onUpdate({ operation_params: next });
  }

  const needsContent = op === "write" || op === "append";
  const needsDest = op === "move" || op === "copy";
  const isSearch = op === "search";
  const pathLabel = op === "list" || op === "search" || op === "mkdir" ? "Folder path" : "File path";

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
        Runs on your paired desktop device, inside folders you&apos;ve granted in Settings →
        Devices. Files never leave your machine.
      </div>

      <DeviceSelect value={config.device_id} onChange={(deviceId) => onUpdate({ device_id: deviceId })} />

      <FieldGroup label="Operation" htmlFor="file-op" helpKey="operation">
        <Select
          id="file-op"
          value={op}
          onChange={(e) => {
            const next = e.target.value as FileConnectionConfig["operation"];
            const patch: Record<string, unknown> = { operation: next };
            // Auto-raise scope when switching to a write operation from read-only.
            if (FILE_WRITE_OPERATIONS.has(next) && config.scope_access === "read") {
              patch.scope_access = "write";
            }
            onUpdate(patch);
          }}
        >
          {FILE_OPERATIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
      </FieldGroup>

      <FieldGroup
        label={pathLabel}
        htmlFor="file-path"
        hint="Absolute path inside a granted folder. Use {{node_id.field}} for upstream values."
        helpKey="operation_params.path"
      >
        <Input
          id="file-path"
          placeholder={"C:\\Users\\you\\Invoices\\report.pdf"}
          value={String(params.path ?? "")}
          onChange={(e) => setParam("path", e.target.value)}
        />
      </FieldGroup>

      {needsContent && (
        <FieldGroup
          label="Content" helpKey="operation_params.content"
          htmlFor="file-content"
          hint="Text to write. Use {{node_id.field}} to insert upstream output."
        >
          <Textarea
            id="file-content"
            rows={4}
            className="text-xs resize-y font-mono"
            value={String(params.content ?? "")}
            onChange={(e) => setParam("content", e.target.value)}
          />
        </FieldGroup>
      )}

      {needsDest && (
        <FieldGroup
          label="Destination path" helpKey="operation_params.dest"
          htmlFor="file-dest"
          hint="Where to move/copy to — also inside a granted folder."
        >
          <Input
            id="file-dest"
            placeholder={"C:\\Users\\you\\Archive\\report.pdf"}
            value={String(params.dest ?? "")}
            onChange={(e) => setParam("dest", e.target.value)}
          />
        </FieldGroup>
      )}

      {isSearch && (
        <FieldGroup
          label="Search for" helpKey="operation_params.pattern"
          htmlFor="file-pattern"
          hint="File-name substring to match under the folder above, e.g. invoice."
        >
          <Input
            id="file-pattern"
            placeholder="invoice"
            value={String(params.pattern ?? "")}
            onChange={(e) => setParam("pattern", e.target.value)}
          />
        </FieldGroup>
      )}

      <FieldGroup
        label="Scope access"
        htmlFor="file-scope"
        hint="Read = list/read/stat/search. Write covers create/modify. Read + Write also allows delete & move."
        helpKey="conn_scope_access"
      >
        <Select
          id="file-scope"
          value={config.scope_access}
          onChange={(e) =>
            onUpdate({ scope_access: e.target.value as FileConnectionConfig["scope_access"] })
          }
        >
          <option value="read">Read</option>
          <option value="write">Write</option>
          <option value="read_write">Read + Write</option>
        </Select>
      </FieldGroup>
    </div>
  );
}

function ConnectionSidebar({
  config,
  nodeConnection,
  availableConnections,
  onUpdate,
}: {
  config: ConnectionConfig;
  nodeConnection: string | null;
  availableConnections: SidebarConnection[];
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const [newScope, setNewScope] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Local files run on the desktop Bridge — a different model from OAuth/HTTP
  // (folder grants + a fixed operation set, no provider tokens or scopes).
  if (config.connector_type === "file") {
    return <FileConnectionSidebar config={config} onUpdate={onUpdate} />;
  }

  if (!isHttpConnectionConfig(config)) {
    const oauthConfig = config as {
      provider?: string;
      scope_access: "read" | "write" | "read_write";
      scope_required: string[];
      operation?: string;
      operation_params?: Record<string, unknown>;
    };

    // Provider resolved from selected connection, falling back to the hint
    // stored in config when the node was created from the palette.
    const selectedProvider =
      availableConnections.find((c) => c.name === nodeConnection)?.provider ??
      oauthConfig.provider ??
      "";
    const supportedOps = CONNECTOR_OPERATIONS[selectedProvider] ?? [];

    // Only show connections that match the intended provider (if known).
    const filteredConnections = oauthConfig.provider
      ? availableConnections.filter((c) => c.provider === oauthConfig.provider)
      : availableConnections;

    function handleConnectionChange(name: string) {
      const newProvider = availableConnections.find((c) => c.name === name)?.provider ?? "";
      const patch: Record<string, unknown> = { connection: name };
      if (newProvider !== selectedProvider) {
        patch.operation = undefined;
        patch.operation_params = undefined;
      }
      onUpdate(patch);
    }

    return (
      <div className="space-y-3">
        {/* Connection selector */}
        {filteredConnections.length > 0 ? (
          <FieldGroup label="Connection" htmlFor="conn-select" helpKey="connection">
            <Select
              id="conn-select"
              value={nodeConnection ?? ""}
              onChange={(e) => handleConnectionChange(e.target.value)}
            >
              <option value="">— none —</option>
              {filteredConnections.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FieldGroup>
        ) : (
          <div className="rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
            {oauthConfig.provider
              ? `No ${oauthConfig.provider} account connected. Go to Connections to add one.`
              : "No connections linked to this program. Add connections on the program detail page."}
          </div>
        )}

        {/* Operation picker */}
        {supportedOps.length > 0 && (
          <FieldGroup label="Operation" htmlFor="conn-op" helpKey="conn_operation">
            <Select
              id="conn-op"
              value={oauthConfig.operation ?? ""}
              onChange={(e) => {
                const op = e.target.value || undefined;
                const autoScopes = op
                  ? (OPERATION_SCOPES[selectedProvider]?.[op] ?? [])
                  : [];
                onUpdate({
                  operation: op,
                  operation_params: undefined,
                  ...(autoScopes.length > 0 ? { scope_required: autoScopes } : {}),
                });
              }}
            >
              <option value="">— pass token downstream —</option>
              {supportedOps.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </Select>
          </FieldGroup>
        )}

        {/* Structured operation params */}
        {oauthConfig.operation && (
          <div className="rounded-md border border-border p-3 space-y-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {oauthConfig.operation} params
            </p>
            <OperationParamsEditor
              provider={selectedProvider}
              operation={oauthConfig.operation}
              params={oauthConfig.operation_params ?? {}}
              connectionId={
                availableConnections.find((c) => c.name === nodeConnection)?.id ?? null
              }
              onChange={(next) => onUpdate({ operation_params: next })}
            />
          </div>
        )}

        <FieldGroup label="Scope access" htmlFor="conn-scope" helpKey="conn_scope_access">
          <Select
            id="conn-scope"
            value={oauthConfig.scope_access}
            onChange={(e) =>
              onUpdate({ scope_access: e.target.value as "read" | "write" | "read_write" })
            }
          >
            <option value="read">Read</option>
            <option value="write">Write</option>
            <option value="read_write">Read + Write</option>
          </Select>
        </FieldGroup>

        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label className="text-xs">Required scopes</Label>
            <FieldHelp fieldKey="scope_required" />
          </div>
          {oauthConfig.scope_required.map((scope, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="flex-1 rounded-md border border-border bg-muted px-2 py-1 text-xs">
                {scope}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => {
                  onUpdate({ scope_required: oauthConfig.scope_required.filter((_, j) => j !== i) });
                }}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </Button>
            </div>
          ))}
          <div className="flex gap-1.5">
            <Input
              placeholder="e.g. gmail.readonly"
              value={newScope}
              onChange={(e) => setNewScope(e.target.value)}
              className="text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newScope.trim()) {
                  onUpdate({ scope_required: [...oauthConfig.scope_required, newScope.trim()] });
                  setNewScope("");
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!newScope.trim()}
              onClick={() => {
                if (!newScope.trim()) return;
                onUpdate({ scope_required: [...oauthConfig.scope_required, newScope.trim()] });
                setNewScope("");
              }}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── HTTP connection ──────────────────────────────────────────────────────────
  const retryConfig: RetryConfig = config.retry ?? {
    max_attempts: 3,
    backoff: "exponential",
    backoff_base_seconds: 5,
    fail_program_on_exhaust: false,
  };

  return (
    <div className="space-y-3">
      <FieldGroup label="Method" htmlFor="http-method" helpKey="http_method">
        <Select
          id="http-method"
          value={config.method}
          onChange={(e) => onUpdate({ method: e.target.value as HttpConnectionConfig["method"] })}
        >
          {["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
      </FieldGroup>

      <FieldGroup label="URL" htmlFor="http-url" helpKey="url">
        <Input
          id="http-url"
          placeholder="https://api.example.com/v1/resource"
          value={config.url}
          onChange={(e) => onUpdate({ url: e.target.value })}
        />
      </FieldGroup>

      <FieldGroup label="Auth type" htmlFor="http-auth-type" helpKey="auth_type">
        <Select
          id="http-auth-type"
          value={config.auth_type}
          onChange={(e) =>
            onUpdate({
              auth_type: e.target.value as HttpConnectionConfig["auth_type"],
              auth_value: e.target.value === "none" ? null : config.auth_value,
            })
          }
        >
          <option value="none">None</option>
          <option value="bearer">Bearer token</option>
          <option value="basic">Basic (username:password)</option>
          <option value="api_key_header">API key (header)</option>
          <option value="api_key_query">API key (query param)</option>
        </Select>
      </FieldGroup>

      {config.auth_type !== "none" && (
        <FieldGroup label="Auth value" htmlFor="http-auth-value" helpKey="auth_value">
          <Input
            id="http-auth-value"
            placeholder={config.auth_type === "basic" ? "username:password" : "token-or-api-key"}
            value={config.auth_value ?? ""}
            onChange={(e) => onUpdate({ auth_value: e.target.value || null })}
          />
        </FieldGroup>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "Hide advanced" : "Advanced options"}
      </Button>

      {showAdvanced && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <KeyValueListEditor
            label="Query params"
            helpKey="query_params"
            items={config.query_params}
            onChange={(next) => onUpdate({ query_params: next })}
            emptyKeyPlaceholder="key"
            emptyValuePlaceholder="value"
          />
          <KeyValueListEditor
            label="Headers"
            helpKey="headers"
            items={config.headers}
            onChange={(next) => onUpdate({ headers: next })}
            emptyKeyPlaceholder="Header-Name"
            emptyValuePlaceholder="Header value"
          />
          <FieldGroup label="Body" htmlFor="http-body" helpKey="body">
            <Textarea
              id="http-body"
              rows={5}
              placeholder='{"example": "value"}'
              value={config.body ?? ""}
              onChange={(e) => onUpdate({ body: e.target.value || null })}
              className="text-xs font-mono resize-none"
            />
          </FieldGroup>
          <Toggle
            id="http-parse-response"
            checked={config.parse_response}
            onChange={(v) => onUpdate({ parse_response: v })}
            label="Parse response as JSON"
            helpKey="parse_response"
          />
          <FieldGroup label="Timeout (seconds)" htmlFor="http-timeout" helpKey="timeout_seconds">
            <Input
              id="http-timeout"
              type="number"
              min={1}
              placeholder="Default: 30"
              value={config.timeout_seconds ?? ""}
              onChange={(e) =>
                onUpdate({ timeout_seconds: e.target.value ? Number(e.target.value) : null })
              }
            />
          </FieldGroup>
          <Toggle
            id="http-enable-retry"
            checked={config.retry !== null}
            onChange={(enabled) => onUpdate({ retry: enabled ? retryConfig : null })}
            label="Enable retries"
            helpKey="http_retry"
          />
          {config.retry !== null && (
            <div className="space-y-3 rounded-md border border-border p-2.5">
              <FieldGroup label="Max attempts (1-5)" htmlFor="http-retry-attempts" helpKey="retry.max_attempts">
                <Input
                  id="http-retry-attempts"
                  type="number"
                  min={1}
                  max={5}
                  value={retryConfig.max_attempts}
                  onChange={(e) =>
                    onUpdate({ retry: { ...retryConfig, max_attempts: Math.min(5, Math.max(1, Number(e.target.value))) } })
                  }
                />
              </FieldGroup>
              <FieldGroup label="Backoff strategy" htmlFor="http-retry-backoff" helpKey="retry.backoff">
                <Select
                  id="http-retry-backoff"
                  value={retryConfig.backoff}
                  onChange={(e) =>
                    onUpdate({ retry: { ...retryConfig, backoff: e.target.value as RetryConfig["backoff"] } })
                  }
                >
                  <option value="none">None</option>
                  <option value="linear">Linear</option>
                  <option value="exponential">Exponential</option>
                </Select>
              </FieldGroup>
              {retryConfig.backoff !== "none" && (
                <FieldGroup label="Backoff base seconds" htmlFor="http-retry-base" helpKey="retry.backoff_base_seconds">
                  <Input
                    id="http-retry-base"
                    type="number"
                    min={0}
                    value={retryConfig.backoff_base_seconds}
                    onChange={(e) =>
                      onUpdate({ retry: { ...retryConfig, backoff_base_seconds: Number(e.target.value) } })
                    }
                  />
                </FieldGroup>
              )}
              <Toggle
                id="http-retry-fail"
                checked={retryConfig.fail_program_on_exhaust}
                onChange={(v) => onUpdate({ retry: { ...retryConfig, fail_program_on_exhaust: v } })}
                label="Fail program when retries exhausted"
                helpKey="retry.fail_program_on_exhaust"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Last Run Panel ───────────────────────────────────────────────────────────

const STATUS_BADGE_CLASS: Record<string, string> = {
  running:  "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
  success:  "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
  failed:   "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  idle:     "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  pending:  "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400",
  skipped:  "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
  waiting_approval: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
};

function formatDuration(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function CollapsibleJson({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  const [expanded, setExpanded] = useState(false);
  const raw = value == null ? "null" : JSON.stringify(value, null, 2);
  const preview = raw.length > 300 ? raw.slice(0, 300) + "…" : raw;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")}
        >
          <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
      {expanded && (
        <pre className="rounded-md bg-muted px-2.5 py-2 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
          {raw}
        </pre>
      )}
      {!expanded && (
        <pre className="rounded-md bg-muted px-2.5 py-2 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed line-clamp-4">
          {preview}
        </pre>
      )}
    </div>
  );
}

function LastRunPanel({
  execution,
  programId,
  lastRunId,
}: {
  execution: NodeExecutionData | undefined;
  programId: string;
  lastRunId: string | null | undefined;
}) {
  const [open, setOpen] = useState(true);
  const [copiedError, setCopiedError] = useState(false);

  const duration = execution
    ? formatDuration(execution.started_at, execution.completed_at)
    : null;

  return (
    <div className="border-t border-border pt-4 mt-2">
      {/* Section toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 hover:text-foreground transition-colors"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
        >
          <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Last run
      </button>

      {open && (
        <div className="space-y-3">
          {!execution ? (
            <p className="text-[11px] text-muted-foreground">
              No run data yet. Run the program to see execution details here.
            </p>
          ) : (
            <>
              {/* Status + duration */}
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                    STATUS_BADGE_CLASS[execution.status] ?? STATUS_BADGE_CLASS["idle"]
                  )}
                >
                  {execution.status.replace(/_/g, " ")}
                </span>
                {duration && (
                  <span className="text-[11px] text-muted-foreground">{duration}</span>
                )}
              </div>

              {/* Input payload */}
              <CollapsibleJson label="Input" value={execution.input_payload} />

              {/* Output payload */}
              <CollapsibleJson label="Output" value={execution.output_payload} />

              {/* Error block */}
              {execution.error_message && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold text-destructive uppercase tracking-wide">
                      Error
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(execution.error_message ?? "");
                        setCopiedError(true);
                        setTimeout(() => setCopiedError(false), 2000);
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy error message"
                    >
                      {copiedError ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-[11px] text-foreground font-mono break-all leading-relaxed">
                    {execution.error_message}
                  </p>
                </div>
              )}

              {/* View full run link */}
              {lastRunId && (
                <Link
                  href={`/programs/${programId}/runs/${lastRunId}`}
                  className="text-[11px] text-primary underline underline-offset-2 hover:opacity-80"
                >
                  View full run →
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NodeSidebar ──────────────────────────────────────────────────────────────

export function NodeSidebar({
  nodeId,
  schema,
  programId,
  apiKeys,
  connections,
  validationResult,
  nodeExecutions,
  lastRunId,
  onUpdate,
  onClose,
  onDelete,
}: NodeSidebarProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const node = schema.nodes.find((n) => n.id === nodeId);

  const [label, setLabel] = useState(node?.label ?? "");
  const [description, setDescription] = useState(node?.description ?? "");

  useEffect(() => {
    setLabel(node?.label ?? "");
    setDescription(node?.description ?? "");
  }, [nodeId, node?.label, node?.description]);

  if (!node) return null;

  // Filter validation issues to this node only
  const nodeErrors = validationResult?.errors.filter((e) => e.node_id === nodeId) ?? [];
  const nodeWarnings = validationResult?.warnings.filter((w) => w.node_id === nodeId) ?? [];

  function commitLabel() {
    if (label !== node?.label) onUpdate(nodeId, { label });
  }

  function commitDescription() {
    if (description !== node?.description) onUpdate(nodeId, { description });
  }

  function handleConfigUpdate(patch: Record<string, unknown>) {
    onUpdate(nodeId, patch);
  }

  const NODE_TYPE_LABEL: Record<string, string> = {
    trigger: "Trigger",
    agent: "Agent",
    step: "Step",
    connection: "Connection",
    note: "Note",
    group: "Group",
  };

  return (
    <aside
      className={cn(
        "fixed top-0 right-0 bottom-0 z-30 w-80",
        "bg-background border-l border-border shadow-xl",
        "flex flex-col",
        "transition-transform duration-200"
      )}
      style={{ top: 56 }}
    >
      <PanelResizeHandle edge="left" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              node.type === "trigger"    && "bg-green-500/15 text-green-700 dark:text-green-400",
              node.type === "agent"      && "bg-purple-500/15 text-purple-700 dark:text-purple-400",
              node.type === "step"       && "bg-blue-500/15 text-blue-700 dark:text-blue-400",
              node.type === "connection" && "bg-slate-500/15 text-slate-700 dark:text-slate-300",
              node.type === "note"       && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
              node.type === "group"      && "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300"
            )}
          >
            {NODE_TYPE_LABEL[node.type]}
          </span>
          <span className="text-sm font-medium text-foreground truncate max-w-[160px]">
            {node.label}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close sidebar"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Per-node validation */}
        <ValidationSummary errors={nodeErrors} warnings={nodeWarnings} />

        {/* Label & Description */}
        <SidebarSection title="Identity">
          <FieldGroup label="Label" htmlFor="node-label" helpKey="label">
            <Input
              id="node-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => e.key === "Enter" && commitLabel()}
            />
          </FieldGroup>
          <FieldGroup label="Description" htmlFor="node-desc" helpKey="description">
            <Textarea
              id="node-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commitDescription}
              className="text-xs resize-none"
            />
          </FieldGroup>
        </SidebarSection>

        {/* Type-specific config */}
        <SidebarSection title="Configuration">
          {node.type === "agent" && (
            <AgentSidebar
              config={node.config as AgentConfig}
              apiKeys={apiKeys}
              onUpdate={(patch) => handleConfigUpdate(patch as Record<string, unknown>)}
            />
          )}
          {node.type === "trigger" && (
            <TriggerSidebar
              config={node.config as TriggerConfig}
              onUpdate={(patch) => handleConfigUpdate(patch as Record<string, unknown>)}
            />
          )}
          {node.type === "step" && (
            <StepSidebar
              config={node.config as StepConfig}
              onUpdate={(patch) => handleConfigUpdate(patch as Record<string, unknown>)}
            />
          )}
          {node.type === "connection" && (
            <ConnectionSidebar
              config={node.config as ConnectionConfig}
              nodeConnection={node.connection}
              availableConnections={connections}
              onUpdate={handleConfigUpdate}
            />
          )}
        </SidebarSection>

        {/* Last run inspector */}
        <LastRunPanel
          execution={nodeExecutions?.[nodeId]}
          programId={programId}
          lastRunId={lastRunId}
        />
      </div>

      {/* Footer — delete */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive transition-colors w-full"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 4h11M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011 1V4m2 0v9a1 1 0 01-1 1h-7a1 1 0 01-1-1V4h9z" />
          </svg>
          Delete node
        </button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete node?"
        description={`"${node?.label}" and all its connected edges will be removed. You can undo this.`}
        confirmLabel="Delete"
        onConfirm={() => { setDeleteOpen(false); onDelete(nodeId); }}
        onCancel={() => setDeleteOpen(false)}
      />
    </aside>
  );
}
