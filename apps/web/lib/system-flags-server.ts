import "server-only";
import { createServiceClient } from "@/lib/api";
import {
  readSystemFlags,
  invalidateSystemFlagsCache,
  type SystemFlags,
} from "@/lib/system-flags";

// `system_settings` isn't in the generated DB types yet, so use an untyped
// view of the service client for this table.
type ServiceDb = { from(t: string): any };

/**
 * Merge a partial patch into the global system flags row and persist it.
 * Service-role only (the table's RLS denies everyone else). Invalidates this
 * isolate's read cache immediately; other isolates pick up the change within
 * the cache TTL.
 */
export async function setSystemFlags(
  patch: Partial<SystemFlags>,
  updatedBy?: string | null
): Promise<SystemFlags> {
  const db = createServiceClient() as unknown as ServiceDb;

  const current = await readSystemFlags(true);
  const next: SystemFlags = { ...current, ...patch };

  const { error } = await db
    .from("system_settings")
    .upsert(
      {
        key: "flags",
        value: next,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy ?? null,
      },
      { onConflict: "key" }
    );
  if (error) throw new Error(`Failed to update system flags: ${error.message}`);

  invalidateSystemFlagsCache();
  return next;
}
