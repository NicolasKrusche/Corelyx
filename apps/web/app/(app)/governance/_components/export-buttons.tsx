"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

const FORMATS = ["json", "csv", "xlsx", "pdf"] as const;
type Format = (typeof FORMATS)[number];

export function ExportButtons() {
  const [loading, setLoading] = useState<Format | null>(null);

  async function handleDownload(fmt: Format) {
    if (loading) return;
    setLoading(fmt);
    try {
      const res = await fetch(`/api/governance/inventory/export?format=${fmt}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `governance-inventory.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — browser will show nothing, same as before
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
