"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SeedApprovalButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function seed() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/seed-approval", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
        console.error("[seed-approval] failed:", body);
        setError(msg);
      } else {
        console.log("[seed-approval] created:", body);
        window.dispatchEvent(new CustomEvent("approval-changed"));
        router.refresh();
      }
    } catch (e) {
      console.error("[seed-approval] network error:", e);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={seed}
        disabled={loading}
        className="gap-1.5 border-dashed border-white/20 text-muted-foreground hover:text-foreground"
      >
        <FlaskConical className="h-3.5 w-3.5" />
        {loading ? "Seeding…" : "Seed test approval"}
      </Button>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
