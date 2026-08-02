import { createServiceClient } from "@/lib/api";

export type DayUsage = {
  /** ISO date string "YYYY-MM-DD" */
  date: string;
  runs: number;
  failed: number;
  cost_usd: number;
};

/**
 * Returns 30 days of aggregated run history for the user's workspace.
 * Always returns exactly 30 entries (zeroed for days with no activity).
 */
export async function getUsageHistory(
  userId: string,
  workspaceId: string | null,
): Promise<DayUsage[]> {
  const db = createServiceClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Resolve program IDs scoped to this workspace (or the user's personal programs)
  const programQuery = workspaceId
    ? db.from("programs").select("id").eq("workspace_id", workspaceId)
    : db.from("programs").select("id").eq("user_id", userId);

  const { data: programRows } = await programQuery;
  const programIds = (programRows ?? []).map((p: { id: string }) => p.id);

  if (programIds.length === 0) return buildEmptyDays();

  const { data: runRows } = await db
    .from("runs")
    .select("started_at, status, billed_cost_usd")
    .in("program_id", programIds)
    .gte("started_at", thirtyDaysAgo)
    .not("started_at", "is", null);

  if (!runRows || runRows.length === 0) return buildEmptyDays();

  // Aggregate by calendar day (UTC)
  const byDay = new Map<string, DayUsage>();
  for (const row of runRows as Array<{
    started_at: string;
    status: string;
    billed_cost_usd: number | string | null;
  }>) {
    const day = row.started_at.slice(0, 10);
    const entry = byDay.get(day) ?? { date: day, runs: 0, failed: 0, cost_usd: 0 };
    entry.runs++;
    if (row.status === "failed") entry.failed++;
    entry.cost_usd += Number(row.billed_cost_usd ?? 0);
    byDay.set(day, entry);
  }

  return buildEmptyDays(byDay);
}

/** Build a fully-populated 30-entry array, zeroing missing days. */
function buildEmptyDays(map?: Map<string, DayUsage>): DayUsage[] {
  const days: DayUsage[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push(map?.get(key) ?? { date: key, runs: 0, failed: 0, cost_usd: 0 });
  }
  return days;
}
