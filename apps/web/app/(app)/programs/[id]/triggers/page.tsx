import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getProgramAccess, canView } from "@/lib/workspaces";
import { syncCronTriggers, syncFileWatchTriggers } from "@/lib/triggers/event-trigger-sync";
import { TriggerManager } from "./trigger-manager";
import { TriggerEventLog, type TriggerEvent } from "@/components/triggers/trigger-event-log";

type TriggerRow = {
  id: string;
  program_id: string;
  type: string;
  config: Record<string, unknown>;
  is_active: boolean;
  webhook_url: string | null;
  next_run_at: string | null;
  last_fired_at: string | null;
  created_at: string;
};

export default async function TriggersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  // Verify workspace access
  const access = await getProgramAccess(id, user.id);
  if (!access || !canView(access)) notFound();

  const { data: program, error: progError } = await supabase
    .from("programs")
    .select("id, name, schema")
    .eq("id", id)
    .single();

  if (progError || !program) notFound();

  const prog = program as unknown as { id: string; name: string; schema: unknown };

  // Heal any cron trigger nodes in the schema that don't yet have a triggers row.
  // Best-effort: don't block page load on failure.
  const serviceClient = createServiceClient();
  try {
    await syncCronTriggers(serviceClient, id, prog.schema);
    await syncFileWatchTriggers(serviceClient, id, prog.schema);
  } catch (err) {
    console.error("[triggers/page] cron/file_watch trigger sync failed:", err);
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Fetch triggers with enriched columns; fall back to base columns if the
  // phase4 migration (webhook_token / next_run_at / last_fired_at) isn't applied.
  const ENRICHED = "id, program_id, type, config, is_active, webhook_token, next_run_at, last_fired_at, created_at";
  const BASE = "id, program_id, type, config, is_active, created_at";

  const [triggersEnriched, eventsResult] = await Promise.all([
    serviceClient
      .from("triggers")
      .select(ENRICHED)
      .eq("program_id", id)
      .order("created_at", { ascending: false }),
    serviceClient
      .from("trigger_events")
      .select("id, trigger_id, run_id, fired_at, source, status, message, payload")
      .eq("program_id", id)
      .order("fired_at", { ascending: false })
      .limit(50),
  ]);

  let triggersRaw = triggersEnriched.data;
  if (triggersEnriched.error) {
    const fallback = await serviceClient
      .from("triggers")
      .select(BASE)
      .eq("program_id", id)
      .order("created_at", { ascending: false });
    triggersRaw = fallback.data;
  }
  const triggerEvents = (eventsResult.data ?? []) as unknown as TriggerEvent[];

  type RawTrigger = TriggerRow & { webhook_token?: string };
  const triggers: TriggerRow[] = ((triggersRaw ?? []) as unknown as RawTrigger[]).map(
    (t) => ({
      ...t,
      webhook_url:
        t.type === "webhook" && t.webhook_token
          ? `${appUrl}/api/triggers/webhook/${t.webhook_token}`
          : null,
      webhook_token: undefined,
    })
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mb-1">
          <Link href={`/programs/${id}`} className="hover:underline">
            {prog.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Triggers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure how and when this program runs automatically.
        </p>
      </div>

      <TriggerManager
        programId={id}
        initialTriggers={triggers}
      />

      <TriggerEventLog events={triggerEvents} programId={id} />
    </div>
  );
}
