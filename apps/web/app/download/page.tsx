"use client";

import { useEffect, useState } from "react";

type OS = "windows" | "macos" | "linux" | "unknown";

const LABEL: Record<OS, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  unknown: "your computer",
};

const ALL: Exclude<OS, "unknown">[] = ["windows", "macos", "linux"];

function detectOS(): OS {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return "unknown";
}

export default function DownloadPage() {
  const [os, setOs] = useState<OS>("unknown");
  useEffect(() => setOs(detectOS()), []);

  const primary = os === "unknown" ? "windows" : os;
  const others = ALL.filter((o) => o !== primary);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-16 dark:bg-gray-950">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-950/50">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-indigo-600 dark:text-indigo-400">
            <rect x="3" y="4" width="18" height="12" rx="1.5" />
            <path d="M2 20h20" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Corelyx Desktop</h1>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Run your workflows and agents on local files — securely, on your machine.
          Sign in once and it pairs automatically; it auto-updates from here on.
        </p>

        <a
          href={`/api/desktop/download?os=${primary}`}
          className="mt-8 inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Download for {LABEL[primary]}
        </a>

        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          {others.map((o) => (
            <a key={o} href={`/api/desktop/download?os=${o}`} className="underline-offset-4 hover:text-gray-700 hover:underline dark:hover:text-gray-200">
              {LABEL[o]}
            </a>
          ))}
        </div>

        <p className="mt-8 text-[11px] text-gray-400">
          Requires a Solo plan or higher. After installing, open it and sign in with
          your Corelyx account.
        </p>
      </div>
    </main>
  );
}
