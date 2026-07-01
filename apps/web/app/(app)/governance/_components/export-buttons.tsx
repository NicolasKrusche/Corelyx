"use client";

import { useState } from "react";
import { Download, Loader2, ShieldCheck } from "lucide-react";

const FORMATS = ["json", "csv", "xlsx", "pdf"] as const;
type Format = (typeof FORMATS)[number];
type Busy = Format | "pack" | null;

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButtons() {
  const [loading, setLoading] = useState<Busy>(null);

  async function handleDownload(fmt: Format) {
    if (loading) return;
    setLoading(fmt);
    try {
      const res = await fetch(`/api/governance/inventory/export?format=${fmt}`);
      if (!res.ok) throw new Error("Export failed");
      triggerDownload(await res.blob(), `governance-inventory.${fmt}`);
    } catch {
      // silently fail — browser will show nothing, same as before
    } finally {
      setLoading(null);
    }
  }

  async function handleEvidencePack() {
    if (loading) return;
    setLoading("pack");
    try {
      const res = await fetch("/api/governance/evidence-pack");
      if (!res.ok) throw new Error("Export failed");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const filename = cd.match(/filename="?([^"]+)"?/)?.[1] ?? "corelyx-evidence-pack.zip";
      triggerDownload(await res.blob(), filename);
    } catch {
      // silently fail — consistent with the inventory exports above
    } finally {
      setLoading(null);
    }
  }

  const packBusy = loading === "pack";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {FORMATS.map((fmt) => {
        const busy = loading === fmt;
        return (
          <button
            key={fmt}
            type="button"
            disabled={!!loading}
            onClick={() => void handleDownload(fmt)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {busy ? "Exporting…" : fmt.toUpperCase()}
          </button>
        );
      })}

      {/* Full auditor evidence pack: inventory + agent audits + approvals + integrity manifest. */}
      <button
        type="button"
        disabled={!!loading}
        onClick={() => void handleEvidencePack()}
        title="Download a single ZIP: AI inventory, per-agent action audits, approval history, and a SHA-256 integrity manifest."
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {packBusy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5" />
        )}
        {packBusy ? "Building pack…" : "Evidence Pack (.zip)"}
      </button>
    </div>
  );
}
