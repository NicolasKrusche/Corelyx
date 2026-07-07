"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Lazy-load the modal (it pulls in React Flow + the real node components) so the
// app-wide gate mounted in the layout doesn't bundle React Flow onto every page.
export const GenesisV2ReleaseModal = dynamic(
  () => import("./genesis-v2-release-modal").then((m) => m.GenesisV2ReleaseModal),
  { ssr: false }
);

const SEEN_KEY = "corelyx-genesis-v2-release";

// App-wide gate: shows the announcement once per version when published.
export function GenesisV2ReleaseGate() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(1);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/genesis/release", { cache: "no-store" });
        if (!res.ok) return;
        const state = (await res.json()) as { active?: boolean; version?: number };
        if (cancelled || state.active !== true) return;
        const v = typeof state.version === "number" ? state.version : 1;
        let seen: string | null = null;
        try { seen = localStorage.getItem(SEEN_KEY); } catch {}
        if (seen === String(v)) return;
        setVersion(v);
        setOpen(true);
      } catch {
        // Never block the app on the announcement.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, String(version)); } catch {}
    setOpen(false);
  }, [version]);

  if (!open) return null;
  return <GenesisV2ReleaseModal onClose={dismiss} />;
}
