import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { ensureUserProvisioned } from "@/lib/auth/provisioning";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("id", user.id)
    .single();
  const profile = profileRaw as { display_name: string | null; username: string | null } | null;

  // Already onboarded — send them home
  if (profile?.display_name || profile?.username) redirect("/dashboard");

  // Ensure workspace exists before the wizard tries to rename it
  const provisioned = await ensureUserProvisioned(user).catch(() => null);
  const workspaceId = provisioned?.workspaceId ?? null;

  let defaultWorkspaceName = "My Workspace";
  if (workspaceId) {
    const service = createServiceClient();
    const { data: ws } = await (service as any)
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .single();
    if (ws?.name) defaultWorkspaceName = ws.name;
  }

  return (
    <OnboardingWizard
      userEmail={user.email ?? ""}
      defaultWorkspaceName={defaultWorkspaceName}
      workspaceId={workspaceId}
    />
  );
}
