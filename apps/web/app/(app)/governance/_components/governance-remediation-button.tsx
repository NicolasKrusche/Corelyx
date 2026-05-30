"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type RemediationKind =
  | "suspend"
  | "require-oversight"
  | "require-transparency"
  | "require-documentation";

const REMEDIATIONS: Record<
  RemediationKind,
  { endpoint: "program" | "settings"; patch: Record<string, boolean> }
> = {
  suspend: { endpoint: "program", patch: { is_active: false } },
  "require-oversight": {
    endpoint: "settings",
    patch: { human_oversight_required: true },
  },
  "require-transparency": {
    endpoint: "settings",
    patch: { transparency_notice_required: true },
  },
  "require-documentation": {
    endpoint: "settings",
    patch: { high_risk_documentation_required: true },
  },
};

export function GovernanceRemediationButton({
  programId,
  kind,
  label,
  doneLabel,
  confirmMessage,
  destructive = false,
}: {
  programId: string;
  kind: RemediationKind;
  label: string;
  doneLabel: string;
  confirmMessage?: string;
  destructive?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const remediation = REMEDIATIONS[kind];
    const path =
      remediation.endpoint === "program"
        ? `/api/programs/${programId}`
        : `/api/programs/${programId}/settings`;

    setLoading(true);
    setError(false);
    try {
      const response = await fetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remediation.patch),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setDone(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        {doneLabel}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      title={error ? "We could not apply this change. Please try again." : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-1 text-left text-[11px] font-medium transition-colors disabled:opacity-50",
        destructive
          ? "border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300"
          : "border-border bg-card text-foreground hover:bg-accent",
        error && "border-red-500/50 text-red-700 dark:text-red-300"
      )}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldAlert className="h-3 w-3" />}
      {error ? "Try again" : label}
    </button>
  );
}
