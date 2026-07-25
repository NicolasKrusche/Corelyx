import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { isAdmin } from "@/lib/admin";
import { searchUsersByEmail } from "@/lib/admin-user-lookup";
import { writeAppLog } from "@/lib/app-logs";

const MAX_RESULTS = 8;

// GET /api/admin/users/search?q=email — email autocomplete for the admin UI.
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id, user.email))) return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json({ users: [] });

  const service = createServiceClient();
  const { users, viaRpc } = await searchUsersByEmail(service, q, MAX_RESULTS);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Admin",
    event: "admin.user_search.performed",
    status: "completed",
    message: "Admin searched users.",
    details: {
      // The query is a user email — hash it so the audit trail records that a
      // search happened without copying personal data into the log.
      query_sha256: createHash("sha256").update(q.toLowerCase()).digest("hex"),
      query_length: q.length,
      result_count: users.length,
      strategy: viaRpc ? "rpc" : "admin_api_fallback",
    },
  });

  return NextResponse.json({ users });
}
