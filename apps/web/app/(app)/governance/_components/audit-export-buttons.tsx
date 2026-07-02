"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";

type Format = "csv" | "pdf";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV / PDF download buttons for the run-level audit log. */
export function AuditExportButtons() {
  const [loading, setLoading] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(format: Format) {
    if (loading) return;
    setLoading(format);
    setError(null);
    try {
      const res = await fetch(`/api/governance/audit-log/export?format=${format}`);
      if (!res.ok) throw new Error("Export failed");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const filename = cd.match(/filename="?([^"]+)"?/)?.[1] ?? `corelyx-audit-log.${format}`;
      triggerDownload(await res.blob(), filename);
    } catch {
      setError("The export could not be prepared. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["csv", "pdf"] as const).map((format) => {
        const busy = loading === format;
        return (
          <button
            key={format}
            type="button"
            disabled={!!loading}
            onClick={() => void handleDownload(format)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : format === "csv" ? (
              <Download className="h-3.5 w-3.5" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {busy ? "Exporting…" : `Download ${format.toUpperCase()}`}
          </button>
        );
      })}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
