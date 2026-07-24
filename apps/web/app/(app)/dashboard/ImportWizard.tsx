"use client";

import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// ─── Types ──────────────────────────────────────────────────────────────────

type ImportFormat = "corelyx" | "n8n";

interface ConversionWarning {
  message: string;
}

interface ImportResult {
  program: {
    id: string;
    name: string;
  };
  validation?: {
    valid: boolean;
    errors?: string[];
  };
  conversion_warnings?: string[];
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-5 w-5"
    >
      <path
        d="M8 10V2M4 6l4-4 4 4M2 13h12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-4 w-4 shrink-0 text-muted-foreground"
    >
      <path
        d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 1v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-4 w-4 shrink-0 text-amber-500"
    >
      <path
        d="M7.13 2.86a1 1 0 011.74 0l5.87 10.17A1 1 0 0113.87 14H2.13a1 1 0 01-.87-1.5L7.13 2.86z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 6v3M8 11.5v.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── ImportWizard ───────────────────────────────────────────────────────────

export function ImportWizard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [format, setFormat] = useState<ImportFormat>("corelyx");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<unknown>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setSelectedFile(file);
      setImportResult(null);
      setImportError(null);

      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        setFileContent(content);

        try {
          const parsed = JSON.parse(content);
          setParsedPreview(parsed);
          setParseError(null);
        } catch {
          setParsedPreview(null);
          setParseError("Invalid JSON — could not parse the file.");
        }
      };
      reader.readAsText(file);
    },
    []
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files?.[0];
      if (!file) return;

      // Simulate file input change
      const fakeEvent = {
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(fakeEvent);
    },
    [handleFileChange]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleImport = useCallback(async () => {
    if (!fileContent || isImporting) return;

    setIsImporting(true);
    setImportResult(null);
    setImportError(null);

    try {
      let endpoint: string;
      let body: Record<string, unknown>;

      if (format === "n8n") {
        endpoint = "/api/programs/import/n8n";
        body = { json: fileContent };
      } else {
        endpoint = "/api/programs/import";
        body = { json: fileContent };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setImportError(
          data.message || data.error || `Import failed (${response.status})`
        );
        return;
      }

      setImportResult(data);
    } catch (err) {
      setImportError(
        err instanceof Error ? `Import failed: ${err.message}` : "Import failed"
      );
    } finally {
      setIsImporting(false);
    }
  }, [fileContent, format, isImporting]);

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setFileContent(null);
    setParsedPreview(null);
    setParseError(null);
    setImportResult(null);
    setImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // If import succeeded, show success state
  if (importResult) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-950/30">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4 text-green-600 dark:text-green-400"
            >
              <path
                d="M3 8.5l3.5 3.5L13 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-green-800 dark:text-green-200">
              Import successful
            </h3>
            <p className="mt-1 text-sm text-green-700 dark:text-green-300">
              &ldquo;{importResult.program.name}&rdquo; has been imported.
            </p>
            {importResult.conversion_warnings &&
              importResult.conversion_warnings.length > 0 && (
                <div className="mt-3 space-y-1">
                  {importResult.conversion_warnings.map((warning, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300"
                    >
                      <WarningIcon />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  router.push(`/programs/${importResult.program.id}`)
                }
                className="bg-green-600 text-white hover:bg-green-700"
              >
                Open in editor
              </Button>
              <Button size="sm" variant="outline" onClick={handleReset}>
                Import another
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">
        Import a workflow
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Upload a Corelyx JSON export or an n8n workflow file.
      </p>

      {/* Format selection */}
      <div className="mt-4 flex gap-2">
        {(["corelyx", "n8n"] as const).map((fmt) => (
          <button
            key={fmt}
            type="button"
            onClick={() => {
              setFormat(fmt);
              handleReset();
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              format === fmt
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {fmt === "corelyx" ? "Corelyx JSON" : "n8n JSON"}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        className={`mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors ${
          selectedFile
            ? "border-primary/40 bg-primary/5"
            : "border-border hover:border-primary/30 hover:bg-accent/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
        {selectedFile ? (
          <>
            <FileIcon />
            <span className="text-xs font-medium text-foreground">
              {selectedFile.name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </span>
          </>
        ) : (
          <>
            <UploadIcon />
            <span className="text-xs text-muted-foreground">
              Drop a .json file or click to browse
            </span>
          </>
        )}
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {parseError}
        </div>
      )}

      {/* Import error */}
      {importError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {importError}
        </div>
      )}

      {/* Preview */}
      {parsedPreview && !parseError && (
        <div className="mt-4">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Preview
          </p>
          <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-[11px] text-foreground">
            {JSON.stringify(parsedPreview, null, 2).slice(0, 2000)}
            {JSON.stringify(parsedPreview, null, 2).length > 2000 && "\n… (truncated)"}
          </pre>
        </div>
      )}

      {/* Import button */}
      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          onClick={handleImport}
          disabled={!selectedFile || !!parseError || isImporting || !fileContent}
          className="gap-1.5"
        >
          {isImporting ? "Importing…" : "Import workflow"}
        </Button>
      </div>
    </div>
  );
}
