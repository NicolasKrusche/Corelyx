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
  if (error) {
    // The most common cause is the migration not being applied yet.
    const missingTable =
      error.code === "42P01" || // undefined_table
      error.code === "PGRST205" || // PostgREST: relation not found in schema cache
      /system_settings/i.test(error.message ?? "");
    if (missingTable) {
      throw new Error(
        "The system_settings table doesn't exist yet. Apply migration " +
          "20260606140000_system_settings.sql to the database, then try again."
      );
    }
    throw new Error(`Failed to update system flags: ${error.message}`);
  }

  invalidateSystemFlagsCache();
  return next;
}
