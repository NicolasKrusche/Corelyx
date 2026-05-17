import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { redirect } from "next/navigation";
import { ApprovalCard } from "./approval-card";
import { ApprovalsRealtimeRefresh } from "./realtime-refresh";
import { getTranslations } from "next-intl/server";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalRow = {
  id: string;
  node_execution_id: string;
  user_id: string;
  status: string;
  context: {
    node_label?: string;
    input?: unknown;
    program_id?: string;
  } | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  node_executions: {
    id: string;
    node_id: string;
    run_id: string;
    runs: {
      id: string;
      program_id: string;
      programs: {
        id: string;
        name: string;
      };
    };
  };
};

// ─── Server component ─────────────────────────────────────────────────────────

export default async function ApprovalsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("approvals");
  const serviceClient = createServiceClient();

  const { data: approvalsRaw } = await serviceClient
    .from("approvals")
    .select(
      `id,
       node_execution_id,
       user_id,
       status,
       context,
       decision_note,
       decided_at,
       created_at,
       node_executions (
         id,
         node_id,
         run_id,
         runs (
           id,
           program_id,
           programs (
             id,
             name
           )
         )
       )`
    )
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const approvals = (approvalsRaw ?? []) as unknown as ApprovalRow[];

  return (
    <div className="space-y-6">
      <ApprovalsRealtimeRefresh userId={user.id} />
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("description")}
        </p>
      </div>

      {approvals.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/50 px-8 py-14 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground/40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <p className="text-sm font-semibold">{t("allCaughtUp")}</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            {t("noPendingDesc")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} />
          ))}
        </div>
      )}
    </div>
  );
}
