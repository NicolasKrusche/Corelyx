import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getUserTier } from "@/lib/limits";
import { getEntitlements } from "@/lib/entitlements";
import { AgentsUpsell } from "../_upsell";
import { KnowledgeManager } from "./knowledge-manager";

export const metadata = {
  title: "Agent knowledge",
  robots: { index: false, follow: false },
};

export default async function AgentKnowledgePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ws = await getActiveWorkspace(user.id);
  const tier = await getUserTier(user.id, ws?.workspaceId ?? null);
  if (!getEntitlements(tier).agents) {
    return <AgentsUpsell showBack />;
  }

  return <KnowledgeManager />;
}
