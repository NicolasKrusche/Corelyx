import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getUserTier } from "@/lib/limits";
import { getEntitlements } from "@/lib/entitlements";
import { AgentsUpsell } from "../_upsell";
import { NewAgentForm } from "./new-agent-form";

export const metadata = {
  title: "New agent",
  robots: { index: false, follow: false },
};

export default async function NewAgentPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ws = await getActiveWorkspace(user.id);

  // Agents are a Solo+ feature — block building one on Free with the upsell so
  // the user never hits the AGENTS_REQUIRE_UPGRADE error from the build API.
  const tier = await getUserTier(user.id, ws?.workspaceId ?? null);
  if (!getEntitlements(tier).agents) {
    return <AgentsUpsell showBack />;
  }

  return <NewAgentForm />;
}
