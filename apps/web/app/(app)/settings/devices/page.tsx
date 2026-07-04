import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces";
import { checkLocalFilesAccess } from "@/lib/limits";
import { DevicesManager } from "@/components/devices/devices-manager";

export const metadata: Metadata = {
  title: "Devices",
};

// Settings → Devices. Pair the Corelyx desktop app and manage the folders each
// device is allowed to touch. Gated to plans with localFiles (Solo+).
export default async function DevicesPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ws = await getActiveWorkspace(user.id);
  const gate = ws
    ? await checkLocalFilesAccess(user.id, ws.workspaceId)
    : { allowed: false as const, upgradeMessage: "No active workspace." };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Devices</h1>
        <p className="text-sm text-muted-foreground">
          Pair the Corelyx desktop app so your workflows and agents can act on local
          files. Files never leave your machine — every access runs inside folders
          you explicitly grant, and is audited.
        </p>
      </div>

      {gate.allowed ? (
        <DevicesManager />
      ) : (
        <div className="rounded-lg border border-border bg-muted/30 p-6 text-sm">
          <p className="font-medium">Corelyx Desktop requires a paid plan.</p>
          <p className="mt-1 text-muted-foreground">
            {gate.upgradeMessage ??
              "Upgrade to Solo or higher to pair a device and run local file workflows."}
          </p>
        </div>
      )}
    </div>
  );
}
