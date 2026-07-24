"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";

// ─── Icons ──────────────────────────────────────────────────────────────────

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-3.5 w-3.5"
    >
      <path
        d="M8 2v8M4 8l4 4 4-4M2 13h12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── ExportButton ────────────────────────────────────────────────────────────

interface ExportButtonProps {
  programId: string;
  programName: string;
  className?: string;
}

export function ExportButton({
  programId,
  programName,
  className,
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const response = await fetch(`/api/programs/${programId}/export`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error ?? `Export failed (${response.status})`
        );
      }

      const exportData = await response.json();

      // Trigger file download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = programName
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase();
      link.href = url;
      link.download = `corelyx-${safeName || "program"}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Export failed:", err);
      alert(
        err instanceof Error ? `Export failed: ${err.message}` : "Export failed"
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
      className={`gap-1.5 ${className ?? ""}`}
      title="Export workflow as JSON"
    >
      <DownloadIcon />
      {isExporting ? "Exporting…" : "Export"}
    </Button>
  );
}
